import assert from "node:assert/strict";
import {validSamples} from "../sample-store.js";
const hand=Array.from({length:21},(_,i)=>({x:.1+i*.001,y:.2+i*.001,z:0}));
const sample={label:"HOLA",sampleVersion:3,featureVersion:"hands-motion-visual-v1",aspectRatio:.75,seq:[],timestamps:[],landmarks:[],visual:[]};
for(let i=0;i<41;i++){sample.seq.push(Array(126).fill(0));sample.timestamps.push(i*50);sample.landmarks.push([hand]);sample.visual.push(null)}
assert.equal(validSamples([sample]),true,"a valid 41-frame v1.5 capture must be storable");
console.log("PASS v1.5.2 accepts professional captures over the old 40-frame ceiling");
