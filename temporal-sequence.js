import {resample,scoreTemplates,motionDistance,motionAmount,trimMotionLandmarks} from './recognition-math.js';
import {chooseSign} from './recognition-state.js';
// Keep original captured landmarks and timing. Only comparison is resampled.
export function recordedSample(label,frames,aspectRatio){
 const first=frames[0].time;
 return {label,sampleVersion:2,featureVersion:'hands-relative-v1',aspectRatio,
 seq:frames.map(f=>f.feature),timestamps:frames.map(f=>f.time-first),
 landmarks:frames.map(f=>f.hands.map(h=>h.map(p=>({x:p.x,y:p.y,z:p.z})))),
 channels:{recognition:['hands'],face:null,expression:null,pose:null}};
}
export function matchWindow(frames,times,templates,aspectRatio,landmarkFrames=[]){
 if(!templates.length)return {kind:'waiting',reason:'No hay señas personales activas'};
 if(frames.length<8)return {kind:'waiting',reason:'Reuniendo fotogramas válidos (mínimo 8)'};
 const elapsed=times.at(-1)-times[0];
 // Do not wait for the longest sign in the whole library. Each personal example
 // becomes comparable as soon as the live buffer contains enough time for it.
 const comparable=templates.filter(t=>t.sampleVersion!==2||!t.timestamps?.length||elapsed>=Math.max(250,t.timestamps.at(-1)*0.72));
 if(!comparable.length)return {kind:'waiting',reason:'Reuniendo el movimiento de la seña'};
 const scores=comparable.map(t=>{
 if(t.sampleVersion!==2)return scoreTemplates(resample(frames.slice(-18)),[t],aspectRatio)[0];
 const duration=t.timestamps.at(-1);
 // Natural signing speed varies. Compare a slightly wider recent window and let
 // DTW/resampling align the motion instead of demanding the exact training duration.
 const liveDuration=Math.min(elapsed,Math.max(duration*1.30,duration+220));
 const start=times.at(-1)-liveDuration;
 let index=times.findIndex(time=>time>=start);if(index>0)index--;
 const from=Math.max(0,index),query=resample(frames.slice(from),18);
 const base=scoreTemplates(query,[{...t,seq:resample(t.seq,18)}],aspectRatio)[0];
 // Hand shape alone cannot distinguish a real dynamic sign from an accidental
 // similar pose (for example touching the hair). Compare wrist trajectory too.
 const liveLm=landmarkFrames.slice(from);
 const templateLm=Array.isArray(t.landmarks)?t.landmarks:[];
 const rawTemplateMotion=motionAmount(templateLm,t.aspectRatio||aspectRatio);
 const dynamic=rawTemplateMotion>=0.35;
 // For dynamic signs compare the active movement, not preparation/held ending.
 // This makes natural signing work even when training and live pauses differ.
 const liveMotionLm=dynamic?trimMotionLandmarks(liveLm,aspectRatio):liveLm;
 const templateMotionLm=dynamic?trimMotionLandmarks(templateLm,t.aspectRatio||aspectRatio):templateLm;
 const motionD=(liveMotionLm.length>=2&&templateMotionLm.length>=2)?motionDistance(liveMotionLm,templateMotionLm,aspectRatio,t.aspectRatio||aspectRatio):0;
 const liveMotion=motionAmount(liveMotionLm,aspectRatio),templateMotion=motionAmount(templateMotionLm,t.aspectRatio||aspectRatio);
 // Personal examples are temporal signs. Do not accept a held pose when the
 // recorded example contains real travel. Natural speed/size may vary, so use
 // a conservative fraction of the example rather than exact displacement.
 const requiredMotion=dynamic?Math.max(0.10,templateMotion*0.18):0;
 const motionComplete=requiredMotion===0||liveMotion>=requiredMotion;
 // Keep shape and motion as separate channels. A weighted normalized score avoids
 // rejecting a valid sign merely because natural wrist travel differs slightly.
 // Motion still contributes enough to reject a static look-alike.
 const motionClamped=Math.min(motionD,0.60);
 // Dynamic signs prioritize the temporal path. Static signs remain shape-led.
 const combined=dynamic?base.d*0.55+motionClamped*0.45:base.d;
 return {...base,shapeD:base.d,motionD,d:combined,liveMotion,templateMotion,requiredMotion,motionComplete,dynamic};
 });
 return chooseSign(scores);
}
