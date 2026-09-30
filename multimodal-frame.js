// This is the shared training/inference contract. Missing observations have masks.
// A hand's z is wrist-relative, NOT a global 3D body coordinate.
export const FEATURE_VERSION='hands-body-face-v2';
export const FEATURE_SIZE=216;
export const TIME_STEPS=48;
export const POSE_IDS=[11,12,13,14,15,16];
export const FACE_IDS=[1,152,33,263,13,14];
export const EXPRESSION_KEYS=['browInnerUp','browDownLeft','browDownRight','browOuterUpLeft','browOuterUpRight','eyeWideLeft','eyeWideRight','eyeBlinkLeft','eyeBlinkRight','eyeSquintLeft','eyeSquintRight','jawOpen','mouthFunnel','mouthPucker','mouthSmileLeft','mouthSmileRight'];
export function handScale(hand,aspect=1){
  if(!hand)return null;
  const w=hand[0];return Math.max(.015,...hand.map(p=>Math.hypot((p.x-w.x)*aspect,p.y-w.y)));
}
export function handShape(hand,aspect=1){
  if(!hand)return null;
  const w=hand[0],scale=handScale(hand,aspect);
  return hand.flatMap(p=>[(p.x-w.x)*aspect/scale,(p.y-w.y)/scale,(p.z-w.z)*aspect/scale]);
}
export function anchors(o){
  const p=o.pose?.points,f=o.face?.points,aspect=o.aspectRatio;
  const body=p?.[11]&&p?.[12]?{x:(p[11].x+p[12].x)*aspect/2,y:(p[11].y+p[12].y)/2,scale:Math.hypot((p[11].x-p[12].x)*aspect,p[11].y-p[12].y)}:null;
  const face=f?.[1]&&f?.[33]&&f?.[263]?{x:f[1].x*aspect,y:f[1].y,scale:Math.hypot((f[33].x-f[263].x)*aspect,f[33].y-f[263].y)}:null;
  return {body:body?.scale>=.04?body:null,face:face?.scale>=.025?face:null};
}
export const relative=(p,a,aspect)=>p&&a?[(p.x*aspect-a.x)/a.scale,(p.y-a.y)/a.scale]:null;
export function frameVector(o){
  const {body,face}=anchors(o),v=[];
  for(let i=0;i<2;i++){
    const h=o.slots[i],bp=relative(h?.[0],body,o.aspectRatio),fp=relative(h?.[0],face,o.aspectRatio);
    v.push(...(handShape(h,o.aspectRatio)||Array(63).fill(0)),h?h[0].x-.5:0,h?h[0].y-.5:0,
      ...(bp||[0,0]),...(fp||[0,0]),h?1:0,bp?1:0,fp?1:0,h?(o.identityConfidence[i]||0):0);
  }
  for(const id of POSE_IDS){const p=relative(o.pose?.points[id],body,o.aspectRatio);v.push(...(p||[0,0]),p?1:0)}
  for(const id of FACE_IDS){const p=relative(o.face?.points[id],face,o.aspectRatio);v.push(...(p||[0,0]),p?1:0)}
  for(const key of EXPRESSION_KEYS){const x=o.expression?.[key];v.push(Number.isFinite(x)?x:0,Number.isFinite(x)?1:0)}
  v.push(body?1:0,face?1:0);
  if(v.length!==FEATURE_SIZE||!v.every(Number.isFinite))throw Error('Contrato multimodal inválido');
  return v;
}
export function multimodalFrame(tracked,channels,time,aspectRatio){
  const o={time,aspectRatio,slots:tracked.slots,identityConfidence:tracked.identityConfidence,
    pose:channels?.pose||null,face:channels?.face||null,
    expression:channels?.face?.expressionEstimated||channels?.expression||null,
    channelTimes:channels?.channelTimes||{face:null,pose:null}};
  o.vector=frameVector(o);return o;
}
// Time-based nearest observation, not frame-index sampling. Masks are never blended.
export function resampleTimed(observations,n=TIME_STEPS){
  if(!observations.length)return [];
  const first=observations[0].time,last=observations.at(-1).time;let j=0;
  return Array.from({length:n},(_,i)=>{
    const t=first+(last-first)*i/(n-1);
    while(j+1<observations.length&&Math.abs(observations[j+1].time-t)<Math.abs(observations[j].time-t))j++;
    return observations[j];
  });
}
export function sequenceQuality(observations){
  const n=observations.length||1;
  return {handCoverage:observations.filter(o=>o.slots.some(Boolean)).length/n,
    handSlotCoverage:[0,1].map(i=>observations.filter(o=>o.slots[i]).length/n),
    identityCoverage:observations.filter(o=>o.slots.some(Boolean)&&o.slots.every((h,i)=>!h||o.identityConfidence[i]>=.7)).length/n,
    poseCoverage:observations.filter(o=>anchors(o).body).length/n,
    faceCoverage:observations.filter(o=>anchors(o).face).length/n};
}
export function movementExtent(observations){
  let extent=0;
  for(let i=0;i<2;i++){
    const os=observations.filter(o=>o.slots[i]);if(os.length<2)continue;
    const first=os[0],h=first.slots[i],scale=handScale(h,first.aspectRatio);
    // Finger-only signs and palm rotation can have a stationary wrist.
    for(const o of os)for(const joint of [0,4,8,12,16,20]){
      const p=o.slots[i][joint],b=h[joint];
      extent=Math.max(extent,Math.hypot((p.x-b.x)*first.aspectRatio,p.y-b.y,(p.z-b.z)*first.aspectRatio)/scale);
    }
  }
  return extent;
}
export function recordedMultimodalSample(label,frames,aspectRatio,metadata){
  const first=frames[0].time,observations=frames.map(f=>({...f.multimodal,time:f.time-first,
    channelTimes:{face:f.multimodal.channelTimes?.face===null?null:f.multimodal.channelTimes?.face-first,
      pose:f.multimodal.channelTimes?.pose===null?null:f.multimodal.channelTimes?.pose-first}}));
  return {id:globalThis.crypto?.randomUUID?.()||'sample-'+Date.now()+'-'+Math.random().toString(36).slice(2),
    label,sampleVersion:4,featureVersion:FEATURE_VERSION,aspectRatio,metadata:{...metadata},
    timestamps:observations.map(o=>o.time),observations,
    seq:frames.map(f=>f.feature||Array(126).fill(0)),landmarks:frames.map(f=>f.hands||[]),
    quality:sequenceQuality(observations),createdAt:new Date().toISOString()};
}
export function trainingDataset(samples){
  return {format:'conectalsch-dataset',schemaVersion:1,featureVersion:FEATURE_VERSION,
    featureSize:FEATURE_SIZE,timeSteps:TIME_STEPS,createdAt:new Date().toISOString(),
    excludedLegacy:samples.filter(s=>s.sampleVersion!==4).length,
    samples:samples.filter(s=>s.sampleVersion===4)};
}
