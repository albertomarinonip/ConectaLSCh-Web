import assert from 'node:assert/strict';
import {ObservationClock} from '../recognition-clock.js';
import {SignGate,chooseSign,LIMITS} from '../recognition-state.js';
const pose=Array(126).fill(.1),candidate={kind:'candidate',label:'HOLA'};
const old=new SignGate(),fixed=new SignGate(),clock=new ObservationClock();let before=0,after=0;
for(let i=0;i<30;i++){const start=i*516,end=start+500;before+=!!old.step({now:start,hands:true,pose,match:candidate}).speak;const sample=clock.observe(start,end);if(sample.interrupted)fixed.interrupt();after+=!!fixed.step({now:sample.time,hands:true,pose,match:candidate}).speak}
assert.equal(before,0);assert.equal(after,1);
// No observation during a long interruption can release the spoken-sign latch.
const gap=clock.observe(30000,30500);assert(gap.interrupted);fixed.interrupt();assert(!fixed.step({now:gap.time,hands:false}).speak);
const next=clock.observe(30516,31016);assert(!fixed.step({now:next.time,hands:true,pose,match:candidate}).speak);
const fresh=new ObservationClock(),gate=new SignGate();for(let i=0;i<7;i++){const t=fresh.observe(i*516,i*516+500);assert(!gate.step({now:t.time,hands:true,pose,match:candidate}).speak)}
assert(gate.step({now:fresh.observe(7*516,7*516+500).time,hands:true,pose,match:candidate}).speak);
console.log('PASS reproduced slow-inference stability failure; fixed without counting CPU time as stability or relaxing thresholds');
assert.match(chooseSign([{label:'HOLA',d:.18},{label:'NO',d:.5}]).reason,/Distancia/);
assert.match(chooseSign([{label:'HOLA',d:.08},{label:'NO',d:.09}]).reason,/Ambigüedad/);
assert.equal(chooseSign([{label:'HOLA',d:.01},{label:'NO',d:.4}]).kind,'candidate');
assert.equal(LIMITS.maxDistance,.16);assert.equal(LIMITS.stableMs,650);assert.equal(LIMITS.stableFrames,6);
console.log('PASS rejection diagnostics retain closest candidate and distinguish distance versus ambiguity');
import {feature,resample,dtw,adaptAspect,scoreTemplates} from '../recognition-math.js';
import {validSamples} from '../sample-store.js';
// Same physical landmark geometry, represented in different camera aspect ratios.
const landmarks=[Array.from({length:21},(_,i)=>({x:.3+Math.sin(i*.4)*.15,y:.4+i*.012,z:i*.002}))];
const template=feature({landmarks}),sourceAspect=270/480,liveAspect=4/3;
const projected=landmarks.map(h=>h.map(p=>({x:.5+(p.x-.5)*sourceAspect/liveAspect,y:p.y,z:p.z*sourceAspect/liveAspect})));
const live=feature({landmarks:projected}),corrected=adaptAspect(live,liveAspect/sourceAspect);
assert(dtw([template],[live])>.01);assert(dtw([template],[corrected])<1e-7);
const originals=[{label:'HOLA',seq:resample([template,template]),aspectRatio:sourceAspect}];
assert(scoreTemplates(resample([live,live]),originals,liveAspect)[0].d<1e-7);
const legacy=[{label:'HOLA',seq:originals[0].seq}];assert.equal(scoreTemplates([live],legacy,liveAspect)[0].d,dtw([live],legacy[0].seq));
assert(validSamples(originals));assert(validSamples(legacy));assert(!validSamples([{...originals[0],aspectRatio:NaN}]));
console.log('PASS aspect correction restores the same geometry; legacy personal examples keep original comparison; optional metadata validated');
