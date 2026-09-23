import assert from 'node:assert/strict';
import {chooseSign} from '../recognition-state.js';
const dyn=(label,d,shapeD,motionD)=>({label,d,shapeD,motionD,dynamic:true,motionComplete:true,motionSimilar:true,motionRatio:true});
// An everyday movement that accidentally resembles only one recording must stay unknown.
let r=chooseSign([
 dyn('HOLA',.06,.07,.05),dyn('HOLA',.22,.20,.24),dyn('HOLA',.24,.22,.25),dyn('HOLA',.27,.24,.29),dyn('HOLA',.30,.27,.31),
 dyn('GRACIAS',.20,.18,.22),dyn('GRACIAS',.23,.20,.25),dyn('GRACIAS',.26,.24,.27),dyn('GRACIAS',.29,.25,.30),dyn('GRACIAS',.31,.28,.32)
]);
assert.equal(r.kind,'uncertain');
// A real sign supported by multiple strong personal examples may become a candidate.
r=chooseSign([
 dyn('HOLA',.07,.08,.06),dyn('HOLA',.08,.09,.07),dyn('HOLA',.09,.10,.08),dyn('HOLA',.21,.19,.23),dyn('HOLA',.24,.21,.25),
 dyn('GRACIAS',.22,.20,.24),dyn('GRACIAS',.25,.22,.26),dyn('GRACIAS',.27,.24,.29)
]);
assert.equal(r.kind,'candidate');assert.equal(r.label,'HOLA');assert.equal(r.best.voteCount,3);assert.equal(r.best.requiredVotes,3);
console.log('PASS v1.3 open-set consensus rejects a one-template false positive and accepts multi-example agreement');
