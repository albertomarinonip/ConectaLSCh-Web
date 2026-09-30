import test from 'node:test';
import assert from 'node:assert/strict';
import {MotionEventSegmenter} from '../motion-event.js';
const hand=x=>Array.from({length:21},(_,i)=>({x:x+(i%4)*.012,y:.4-Math.floor(i/4)*.012,z:0}));
const push=(m,time,x)=>m.push({feature:Array(126).fill(0),hands:[hand(x)],time});
test('two rapid moving frames cannot initiate a sign',()=>{
 const m=new MotionEventSegmenter();push(m,0,.3);push(m,16,.32);
 assert.equal(push(m,32,.34).state,'READY');
 assert.equal(push(m,48,.34).state,'READY');
});
test('movement and lead-in work at 10, 20 and 60 frames per second',()=>{
 for(const dt of [100,50,1000/60]){
  const m=new MotionEventSegmenter();let completed;
  for(let t=0;t<1500;t+=dt){const x=.3+.18*Math.max(0,Math.min(1,(t-300)/500));const out=push(m,t,x);if(out.completed)completed=out.completed}
  assert.ok(completed,`completion at ${1000/dt} fps`);
  assert.ok(completed.frames[0].time<=400,'lead-in contains onset');
 }
});
