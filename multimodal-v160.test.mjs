import test from 'node:test';
import assert from 'node:assert/strict';
import {HandIdentityTracker} from '../hand-tracker.js';
import {multimodalFrame,frameVector,recordedMultimodalSample,trainingDataset,resampleTimed,FEATURE_SIZE} from '../multimodal-frame.js';
import {MotionEventSegmenter} from '../motion-event.js';
import {matchMultimodal,matchPersonalWindow} from '../temporal-multimodal.js';
import {validSamples} from '../sample-store.js';
import {feature} from '../recognition-math.js';
import {SignGate} from '../recognition-state.js';
import {checkCapture} from '../capture-session.js';
import {VisualTracking} from '../visual-tracking.js';

function hand(x,y=.42,flip=1){return Array.from({length:21},(_,i)=>({x:x+flip*(i%4)*.012,y:y-Math.floor(i/4)*.012,z:i*.0008}))}
function channels(offset=0,brow=.1){return {
  pose:{points:{11:{x:.32,y:.55},12:{x:.68,y:.55},13:{x:.26,y:.7},14:{x:.74,y:.7},15:{x:.25,y:.5},16:{x:.75,y:.5}}},
  face:{points:{1:{x:.5,y:.24+offset},33:{x:.44,y:.19+offset},263:{x:.56,y:.19+offset},152:{x:.5,y:.34+offset},13:{x:.5,y:.3+offset},14:{x:.5,y:.31+offset}},expressionEstimated:{browInnerUp:brow}}};}
function frames({side=1,reverse=false,y=.42,staticPose=false,faceOffset=0,brow=.1}={}){
  return Array.from({length:30},(_,i)=>{
    const progress=reverse?(29-i)/29:i/29,slots=[null,null];slots[side]=hand(.35+(staticPose?0:progress*.16),y,side===0?-1:1);
    const os=multimodalFrame({slots,identityConfidence:[.99,.99]},channels(faceOffset,brow),i*50,4/3),hands=slots.filter(Boolean);
    return {time:i*50,hands,feature:feature({landmarks:hands}),multimodal:os};
  });
}
const sample=(label,fs,mode='dynamic',extra={})=>recordedMultimodalSample(label,fs,4/3,{captureMode:mode,variant:'principal',signerId:'P-test',sessionId:'S-test',requiredChannels:[],...extra});
test('face and pose fall back to CPU and concurrent enables reuse the loading job',async()=>{
  let calls=0;
  const Model={createFromOptions:async(files,options)=>{calls++;if(options.baseOptions.delegate==='GPU')throw Error('No GPU');return {close(){}}}};
  const tracking=new VisualTracking(async()=>({files:{},lib:{FaceLandmarker:Model,PoseLandmarker:Model}}));
  await Promise.all([tracking.enable(),tracking.enable()]);assert(tracking.enabled);assert.equal(calls,4);tracking.disable();
});

test('hand slots survive crossing and detector result reordering',()=>{
  const t=new HandIdentityTracker();
  for(let i=0;i<10;i++){
    const a=hand(.2+i*.06),b=hand(.8-i*.06,.55,-1),swap=i%2;
    const result={landmarks:swap?[b,a]:[a,b],handednesses:(swap?['Right','Left']:['Left','Right']).map(categoryName=>[{categoryName,score:.99}])};
    const {slots}=t.update(result,i*50);assert.equal(slots[0][0].x,a[0].x);assert.equal(slots[1][0].x,b[0].x);
  }
});
test('unknown identity is explicit, rather than an invented anatomical side',()=>{
  const t=new HandIdentityTracker(),r=t.update({landmarks:[hand(.4)]},0);
  assert.equal(Math.max(...r.identityConfidence),0);
  assert.equal(matchMultimodal(frames().map(f=>({...f.multimodal,identityConfidence:[0,0]})),[]).kind,'uncertain');
  const mixed=frames().map(f=>({...f.multimodal,slots:[hand(.2),f.multimodal.slots[1]],identityConfidence:[0,.99]}));
  assert.equal(matchMultimodal(mixed,[]).kind,'uncertain','both visible hands need reliable identity');
});
test('equal opposite hand motion starts an event; losing hands cannot complete it',()=>{
  const m=new MotionEventSegmenter();let state;
  for(let i=0;i<12;i++){
    const slots=[hand(.3+i*.01),hand(.7-i*.01)],hands=slots;
    state=m.push({feature:feature({landmarks:hands}),hands,time:i*50,aspectRatio:4/3,multimodal:{slots}});
  }
  assert.equal(state.state,'MOVING');
  for(const time of [600,650,800]){const out=m.push({feature:null,hands:[],time});assert.equal(out.completed,null)}
  assert.equal(m.state,'READY');
});
test('held pose and motion timeout never create a completed sign',()=>{
  const m=new MotionEventSegmenter();
  for(let i=0;i<100;i++){const hands=[hand(.4)];assert.equal(m.push({feature:feature({landmarks:hands}),hands,time:i*50}).completed,null)}
  for(let i=100;i<230;i++){const hands=[hand(.4+.10*Math.sin(i*.8))];assert.equal(m.push({feature:feature({landmarks:hands}),hands,time:i*50}).completed,null)}
});
test('finger-only movement is captured with a stationary wrist',()=>{
  const fs=frames({staticPose:true}).map((f,i)=>{
    const h=f.hands[0].map(p=>({...p}));h[8].x+=.045*Math.sin(Math.min(i,20)*.45);
    const o=multimodalFrame({slots:[null,h],identityConfidence:[0,.99]},channels(),f.time,4/3);
    return {time:f.time,hands:[h],feature:feature({landmarks:[h]}),multimodal:o};
  });
  checkCapture(fs,'dynamic');
  const m=new MotionEventSegmenter();let completed=null;
  for(const f of fs){const e=m.push({...f,aspectRatio:4/3});if(e.completed)completed=e.completed}
  assert(completed,'finger motion followed by settling must complete');
  const ts=[sample('DEDOS',fs),sample('DEDOS',fs)];
  assert.equal(matchMultimodal(fs.map(f=>f.multimodal),ts,{eventComplete:true}).label,'DEDOS');
});
test('new samples have a validated fixed feature contract and export round trips',()=>{
  const s=sample('HOLA',frames());assert.equal(s.sampleVersion,4);assert(validSamples([s]));assert.equal(s.observations[0].vector.length,FEATURE_SIZE);
  const data=JSON.parse(JSON.stringify(trainingDataset([s,{label:'ANTIGUA'}])));
  assert.equal(data.excludedLegacy,1);assert(validSamples(data.samples));
  const broken=structuredClone(s);broken.observations[0].vector[0]+=1;assert(!validSamples([broken]));
  const missing=multimodalFrame({slots:[null,null],identityConfidence:[0,0]},null,0,1);
  assert(frameVector(missing).every(x=>x===0));assert.equal(missing.face,null);
});
test('sampling uses timestamps and preserves masks through a frame gap',()=>{
  const a={time:0,id:'a'},b={time:10,id:'b'},c={time:1000,id:'c'};
  assert.deepEqual(resampleTimed([a,b,c],3).map(o=>o.id),['a','b','c']);
});
test('right and left variants of one label form separate consensuses',()=>{
  const right=frames(),left=frames({side:0});
  const ts=[sample('GRACIAS',right),sample('GRACIAS',right),sample('GRACIAS',left),sample('GRACIAS',left)];
  for(const fs of [right,left])assert.equal(matchMultimodal(fs.map(f=>f.multimodal),ts,{eventComplete:true}).label,'GRACIAS');
  assert.equal(matchMultimodal(right.map(f=>f.multimodal),[ts[0]],{eventComplete:true}).kind,'uncertain');
  assert.equal(matchMultimodal(right.map(f=>f.multimodal),[ts[0],ts[0]],{eventComplete:true}).kind,'uncertain');
});
test('reversed motion and a fixed lookalike cannot masquerade as a dynamic sign',()=>{
  const fs=frames(),ts=[sample('HOLA',fs),sample('HOLA',fs)];
  assert.equal(matchMultimodal(frames({reverse:true}).map(f=>f.multimodal),ts,{eventComplete:true}).kind,'uncertain');
  assert.equal(matchMultimodal(frames({staticPose:true}).map(f=>f.multimodal),ts,{eventComplete:true}).kind,'uncertain');
  assert.equal(matchMultimodal(fs.map(f=>f.multimodal),ts).kind,'uncertain');
});
test('required face is enforced and recorded negatives veto a close movement',()=>{
  const fs=frames(),ts=[sample('HOLA',fs,'dynamic',{requiredChannels:['face']}),sample('HOLA',fs,'dynamic',{requiredChannels:['face']})];
  assert.equal(matchMultimodal(fs.map(f=>({...f.multimodal,face:null,expression:null})),ts,{eventComplete:true}).kind,'uncertain');
  const r=matchMultimodal(fs.map(f=>f.multimodal),[...ts,sample('TOCAR PELO',fs,'background')],{eventComplete:true});
  assert.equal(r.kind,'uncertain');assert.match(r.reason,/no-seña/);
});
test('matching preserves body-relative location and expression order',()=>{
  const one=frames(),two=frames({y:.7}),ts=[sample('ARRIBA',one),sample('ARRIBA',one),sample('ABAJO',two),sample('ABAJO',two)];
  for(const [label,fs] of [['ARRIBA',one],['ABAJO',two]])assert.equal(matchMultimodal(fs.map(f=>f.multimodal),ts,{eventComplete:true}).label,label);
  const a=frames().map((f,i)=>({...f,multimodal:multimodalFrame({slots:f.multimodal.slots,identityConfidence:[.99,.99]},channels(0,i/29),f.time,4/3)}));
  const b=frames().map((f,i)=>({...f,multimodal:multimodalFrame({slots:f.multimodal.slots,identityConfidence:[.99,.99]},channels(0,1-i/29),f.time,4/3)}));
  const ex=[sample('CEJAS SUBEN',a),sample('CEJAS SUBEN',a),sample('CEJAS BAJAN',b),sample('CEJAS BAJAN',b)];
  assert.equal(matchMultimodal(a.map(f=>f.multimodal),ex,{eventComplete:true}).label,'CEJAS SUBEN');
  assert.equal(matchMultimodal(b.map(f=>f.multimodal),ex,{eventComplete:true}).label,'CEJAS BAJAN');
});
test('static capture works and modern examples take priority over same-label legacy',()=>{
  const fs=frames({staticPose:true});checkCapture(fs,'static');
  const ts=[sample('SÍ',fs,'static'),sample('SÍ',fs,'static')];
  const result=matchPersonalWindow(fs.map(f=>f.feature),fs.map(f=>f.time),[...ts,{label:'SÍ',seq:Array(9).fill(Array(126).fill(0))}],4/3,fs.map(f=>f.hands),{observations:fs.map(f=>f.multimodal)});
  assert.equal(result.label,'SÍ');assert.equal(result.dynamic,false);
});
test('different completed events speak once each even with the same ending pose',()=>{
  const gate=new SignGate(),pose=Array(126).fill(0),match={kind:'candidate',label:'HOLA',dynamic:true,eventComplete:true,eventId:'one'};
  assert(gate.step({now:0,hands:true,pose,match}).speak);
  assert(!gate.step({now:1000,hands:true,pose,match}).speak);
  assert(gate.step({now:1100,hands:true,pose,match:{...match,eventId:'two',label:'GRACIAS'}}).speak);
});
