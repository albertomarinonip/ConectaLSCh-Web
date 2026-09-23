import {resample,scoreTemplates,motionDistance} from './recognition-math.js';
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
 const required=Math.max(0,...templates.map(t=>t.sampleVersion===2?t.timestamps.at(-1):0));
 if(times.at(-1)-times[0]<required)return {kind:'waiting',reason:'Secuencia incompleta: necesita '+(required/1000).toFixed(1)+' s'};
 const scores=templates.map(t=>{
 if(t.sampleVersion!==2)return scoreTemplates(resample(frames.slice(-18)),[t],aspectRatio)[0];
 const duration=t.timestamps.at(-1),start=times.at(-1)-duration;
 let index=times.findIndex(time=>time>=start);if(index>0)index--;
 const from=Math.max(0,index),query=resample(frames.slice(from),18);
 const base=scoreTemplates(query,[{...t,seq:resample(t.seq,18)}],aspectRatio)[0];
 // Hand shape alone cannot distinguish a real dynamic sign from an accidental
 // similar pose (for example touching the hair). Compare wrist trajectory too.
 const liveLm=landmarkFrames.slice(from);
 const motionD=(liveLm.length>=2&&Array.isArray(t.landmarks))?motionDistance(liveLm,t.landmarks,aspectRatio,t.aspectRatio||aspectRatio):0;
 // Keep shape and motion as separate channels. A weighted normalized score avoids
 // rejecting a valid sign merely because natural wrist travel differs slightly.
 // Motion still contributes enough to reject a static look-alike.
 const motionClamped=Math.min(motionD,0.60);
 const combined=base.d*0.72+motionClamped*0.28;
 return {...base,shapeD:base.d,motionD,d:combined};
 });
 return chooseSign(scores);
}
