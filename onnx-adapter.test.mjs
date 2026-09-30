import test from 'node:test';
import assert from 'node:assert/strict';
import {OnnxRecognizer} from '../adapters/onnx-recognizer.js';
import {multimodalFrame,FEATURE_VERSION} from '../multimodal-frame.js';
const m={format:'conectalsch-model-v1',featureVersion:FEATURE_VERSION,featureSize:216,timeSteps:48,labels:['HOLA','GRACIAS','__UNKNOWN__'],unknownLabel:'__UNKNOWN__',threshold:.8,margin:.2,inputName:'features',outputName:'logits',deploymentStatus:'experimental'};
const hand=Array.from({length:21},(_,i)=>({x:.4+(i%4)*.01,y:.4-Math.floor(i/4)*.01,z:0}));
const os=Array.from({length:20},(_,i)=>multimodalFrame({slots:[null,hand],identityConfidence:[0,.99]},null,i*50,1));
const runtime=(logits)=>({Tensor:class{constructor(type,data,dims){assert.deepEqual(dims,[1,48,216]);assert.equal(data.length,48*216)}},InferenceSession:{create:async()=>({run:async()=>({logits:{data:logits}}),release:async()=>{}})}});
test('experimental and incompatible models are blocked by default',async()=>{
  await assert.rejects(OnnxRecognizer.load(runtime([5,0,-1]),new Uint8Array(),m),/validación/);
  await assert.rejects(OnnxRecognizer.load(runtime([5,0,-1]),new Uint8Array(),{...m,featureSize:9},{allowExperimental:true}),/contrato/);
});
test('complete model results respect unknown and ambiguity thresholds',async()=>{
  const r=await OnnxRecognizer.load(runtime([6,0,-1]),new Uint8Array(),m,{allowExperimental:true});
  assert.equal((await r.predict(os)).kind,'waiting');
  assert.equal((await r.predict(os,{eventComplete:true,eventId:'1'})).label,'HOLA');
  for(const logits of [[0,0,6],[5,5,0]]){
    const u=await OnnxRecognizer.load(runtime(logits),new Uint8Array(),m,{allowExperimental:true});
    assert.equal((await u.predict(os,{eventComplete:true})).kind,'uncertain');
  }
});
test('trained model cannot accept a face-required sign with the face missing',async()=>{
  const r=await OnnxRecognizer.load(runtime([6,0,-1]),new Uint8Array(),{...m,requiredChannels:{HOLA:['face']}},{allowExperimental:true});
  assert.equal((await r.predict(os,{eventComplete:true})).kind,'uncertain');
});
