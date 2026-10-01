import test from 'node:test';
import assert from 'node:assert/strict';
import {multimodalFrame,movementExtent} from '../multimodal-frame.js';
import {matchMultimodal} from '../temporal-multimodal.js';
import {SignGate} from '../recognition-state.js';
const hand=x=>Array.from({length:21},(_,i)=>({x:x+(i%4)*.012,y:.4-Math.floor(i/4)*.012,z:0}));
const sequence=()=>Array.from({length:30},(_,i)=>multimodalFrame({slots:[hand(.3+.12*i/29),null],identityConfidence:[.99,.99]},null,i*50,1));
const templates=os=>[0,1].map(id=>({id:String(id),label:'MOVIMIENTO',metadata:{captureMode:'dynamic'},observations:os,timestamps:os.map(o=>o.time)}));
test('transient nonparticipating hand cannot change one-hand comparison or movement extent',()=>{
 const os=sequence(),extra=structuredClone(os);
 extra[4].slots[1]=hand(.05);extra[5].slots[1]=hand(.95);
 const a=matchMultimodal(os,templates(os),{eventComplete:true});
 const b=matchMultimodal(extra,templates(os),{eventComplete:true});
 assert.equal(a.kind,'candidate');assert.equal(b.kind,a.kind);assert.equal(b.d,a.d);
 assert.equal(movementExtent(extra),movementExtent(os));
 const still=os.map(o=>({...o,slots:[hand(.3),null]}));
 still[4].slots[1]=hand(.05);still[5].slots[1]=hand(.95);
 assert.equal(movementExtent(still),0);
 assert.equal(matchMultimodal(still,templates(os),{eventComplete:true}).kind,'uncertain');
});
test('consumed completed event cannot speak again after hands are withdrawn',()=>{
 const gate=new SignGate(),match={kind:'candidate',label:'HOLA',dynamic:true,eventComplete:true,eventId:'one'};
 assert(gate.step({now:0,hands:true,match}).speak);
 gate.step({now:400,hands:false});gate.step({now:650,hands:false});gate.step({now:900,hands:false});
 assert(!gate.step({now:1000,hands:true,match}).speak);
 assert(gate.step({now:1100,hands:true,match:{...match,eventId:'two'}}).speak);
});
