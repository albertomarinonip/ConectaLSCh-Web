import fs from 'node:fs';
import {matchMultimodal} from '../temporal-multimodal.js';
import {MotionEventSegmenter} from '../motion-event.js';
import {sequenceQuality} from '../multimodal-frame.js';
import {SignGate} from '../recognition-state.js';
import {validSamples} from '../sample-store.js';
const data=JSON.parse(fs.readFileSync(process.argv[2],'utf8').replace(/^\uFEFF/,''));
if(!validSamples(data.samples))throw Error('Dataset incompatible con captura/reconocimiento');
const rows=data.samples.map((s,i)=>{
 const templates=data.samples.filter((_,j)=>i!==j);
 const match=matchMultimodal(s.observations,templates,{eventComplete:true,diagnostics:true});
 const m=new MotionEventSegmenter(),gate=new SignGate();let starts=0,ends=0,segmentedMatch=null,confirmed=false;
 for(let j=0;j<s.observations.length;j++){
  const o=s.observations[j],out=m.push({time:o.time,feature:s.seq[j],hands:s.landmarks[j],multimodal:o,aspectRatio:o.aspectRatio});
  if(out.state==='MOVING'&&m.event.length===m.pre.length)starts++;
  if(out.completed){
   ends++;
   segmentedMatch=matchMultimodal(out.completed.frames.map(f=>f.multimodal),templates,{eventComplete:true,diagnostics:true});
   confirmed=!!gate.step({now:o.time,hands:true,pose:s.seq[j],match:{...segmentedMatch,eventId:out.completed.id}}).speak;
  }
 }
 return {index:i,label:s.label,quality:sequenceQuality(s.observations),starts,ends,match,segmentedMatch,confirmed};
});
const summary=Object.fromEntries([...new Set(rows.map(r=>r.label))].map(label=>[label,{accepted:rows.filter(r=>r.label===label&&r.match.kind==='candidate').length,rejected:rows.filter(r=>r.label===label&&r.match.kind!=='candidate').length}]));
const result={summary,rows};
if(process.argv[3])fs.writeFileSync(process.argv[3],JSON.stringify(result,null,2));
console.log(JSON.stringify({summary,events:rows.map(r=>[r.index,r.starts,r.ends]),reasons:rows.map(r=>[r.index,r.match.reason])},null,2));
