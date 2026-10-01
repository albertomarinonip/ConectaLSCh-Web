import test from 'node:test';import assert from 'node:assert/strict';
import {multimodalFrame,recordedMultimodalSample} from '../multimodal-frame.js';
import {matchMultimodal} from '../temporal-multimodal.js';import {SignGate} from '../recognition-state.js';
const observations=Array.from({length:20},(_,i)=>multimodalFrame({slots:[null,Array.from({length:21},(_,j)=>({x:.3+i*.006+(j%4)*.012,y:.4-Math.floor(j/4)*.012,z:0}))],identityConfidence:[0,.99]},null,i*50,1));
const frames=observations.map(multimodal=>({time:multimodal.time,multimodal,hands:multimodal.slots.filter(Boolean),feature:Array(126).fill(0)}));
const templates=['one','two'].map(id=>({...recordedMultimodalSample('HOLA',frames,1,{captureMode:'dynamic',variant:'principal',signerId:'P',sessionId:'S',requiredChannels:[]}),id}));
test('rejected nearest example remains diagnostic evidence and cannot speak',()=>{
 const r=matchMultimodal(observations,templates,{eventComplete:false});
 assert.equal(r.kind,'uncertain');assert.equal(r.diagnosticOnly,true);assert.equal(r.best.label,'HOLA');assert.match(r.reason,/movimiento incompleto/);
 const gate=new SignGate();for(let i=0;i<30;i++)assert.notEqual(gate.step({now:i*50,hands:true,pose:Array(126).fill(0),match:r}).speak,true);
});
test('completed supported movement still admits the same label',()=>{
 const r=matchMultimodal(observations,templates,{eventComplete:true});assert.equal(r.kind,'candidate');assert.equal(r.label,'HOLA');
});
