import assert from 'node:assert/strict';
import {MotionEventSegmenter} from '../motion-event.js';
function feat(v=0){return Array(126).fill(v)}
function hands(x){return [[...Array(21)].map((_,i)=>({x:x+(i%4)*.01,y:.4+Math.floor(i/4)*.01,z:0}))]}
const m=new MotionEventSegmenter();let completed=null,t=0;
for(let i=0;i<4;i++){completed=m.push({feature:feat(),hands:hands(.30),time:t+=100,aspectRatio:.75}).completed}
assert.equal(completed,null,'quiet pose must not create event');
for(const x of [.31,.34,.39,.45,.51,.55,.56,.56,.56,.56,.56]){const r=m.push({feature:feat(x/10),hands:hands(x),time:t+=100,aspectRatio:.75});if(r.completed)completed=r.completed}
assert.ok(completed,'movement followed by settling should complete');
assert.ok(completed.frames.length>=6);
console.log('motion-event tests ok');
