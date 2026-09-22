import assert from 'node:assert/strict';
import {SignGate,chooseSign} from '../recognition-state.js';
const pose=Array(126).fill(0),other=Array(126).fill(.5);
const candidate=label=>({kind:'candidate',label});
let checks=0;
function test(name,fn){fn();checks++;console.log('PASS',name)}
test('near ties, weak matches and multiple examples of the same label',()=>{
 assert.equal(chooseSign([{label:'HOLA',d:.04},{label:'NO',d:.05}]).kind,'uncertain');
 assert.equal(chooseSign([{label:'HOLA',d:.18},{label:'NO',d:.3}]).kind,'uncertain');
 assert.equal(chooseSign([{label:'HOLA',d:.04},{label:'HOLA',d:.041},{label:'NO',d:.3}]).label,'HOLA');
 assert.equal(chooseSign([{label:'HOLA',d:NaN}]).kind,'waiting');
});
test('no hands for minutes never produces a word',()=>{
 const gate=new SignGate();for(let now=0;now<120000;now+=100)assert.equal(gate.step({now,hands:false}).kind,'waiting');
});
test('alternating candidates and interrupted sequences stay silent',()=>{
 const gate=new SignGate();for(let now=0;now<3000;now+=100)assert(!gate.step({now,hands:true,pose,match:candidate(now%200?'HOLA':'NO')}).speak);
 gate.reset();for(let now=0;now<600;now+=100)assert(!gate.step({now,hands:true,pose,match:candidate('HOLA')}).speak);
 gate.step({now:600,hands:true,pose,match:{kind:'uncertain'}});
 for(let now=700;now<1300;now+=100)assert(!gate.step({now,hands:true,pose,match:candidate('HOLA')}).speak);
});
test('long held sign speaks exactly once, no cooldown repeat',()=>{
 const gate=new SignGate();let count=0;for(let now=0;now<60000;now+=100)count+=!!gate.step({now,hands:true,pose,match:candidate('HOLA')}).speak;
 assert.equal(count,1);
});
test('short hand dropout does not repeat; sustained withdrawal allows repetition',()=>{
 const gate=new SignGate();let count=0;
 for(let now=0;now<1000;now+=100)count+=!!gate.step({now,hands:true,pose,match:candidate('HOLA')}).speak;
 for(let now=1000;now<1300;now+=100)gate.step({now,hands:false});
 for(let now=1300;now<2500;now+=100)count+=!!gate.step({now,hands:true,pose,match:candidate('HOLA')}).speak;
 assert.equal(count,1);
 for(let now=2500;now<3200;now+=100)gate.step({now,hands:false});
 for(let now=3200;now<4400;now+=100)count+=!!gate.step({now,hands:true,pose,match:candidate('HOLA')}).speak;
 assert.equal(count,2);
});
test('score ambiguity alone does not unlock voice; sustained physical change does',()=>{
 const gate=new SignGate();const events=[];
 function feed(from,to,p,match){for(let now=from;now<to;now+=100){const o=gate.step({now,hands:true,pose:p,match});if(o.speak)events.push(o.label)}}
 feed(0,1000,pose,candidate('HOLA'));feed(1000,3000,pose,{kind:'uncertain'});feed(3000,5000,pose,candidate('HOLA'));
 assert.deepEqual(events,['HOLA']);
 feed(5000,5800,other,{kind:'uncertain'});feed(5800,7000,pose,candidate('HOLA'));
 feed(7000,9000,other,candidate('FAMILIA'));
 assert.deepEqual(events,['HOLA','HOLA','FAMILIA']);
});
test('long frame gaps and pause never count as observed release',()=>{
 const gate=new SignGate();for(let now=0;now<1000;now+=100)gate.step({now,hands:true,pose,match:candidate('HOLA')});
 gate.step({now:1000,hands:false});gate.step({now:5000,hands:false});
 assert(!gate.step({now:5100,hands:true,pose,match:candidate('HOLA')}).speak);
 gate.interrupt();for(let now=10000;now<12000;now+=100)assert(!gate.step({now,hands:true,pose,match:candidate('HOLA')}).speak);
});
console.log(`${checks} stability scenarios passed`);

