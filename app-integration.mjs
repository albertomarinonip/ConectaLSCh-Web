// Executes the real app modules with a minimal UI/camera fixture and a virtual clock.
// It checks wiring, storage and speech events, not browser rendering or real vision.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
let now=0,nextId=0;const frames=new Map(),timers=new Map(),elements=new Map(),downloads=[],spoken=[];
class Element {
  constructor(tag='div'){this.tagName=tag;this.children=[];this._text='';this.value='';this.hidden=false;this.disabled=false;this.checked=false;this.dataset={};this.style={};this.attrs={};this.scrollHeight=0;
    const classes=new Set();this.classList={add:x=>classes.add(x),remove:x=>classes.delete(x),contains:x=>classes.has(x),toggle:(x,on)=>{if(on??!classes.has(x)){classes.add(x);return true}classes.delete(x);return false}};
  }
  get textContent(){return this._text+this.children.map(c=>c.textContent).join('')}
  set textContent(t){this._text=String(t);this.children=[]}
  set innerHTML(t){this.textContent=t.replace(/<[^>]+>/g,'')}
  append(...xs){this.children.push(...xs);if(this.tagName==='select'&&!this.value)this.value=xs[0]?.value||''}
  appendChild(x){this.append(x);return x}
  replaceChildren(...xs){this._text='';this.children=[];this.append(...xs)}
  get options(){return this.children}
  setAttribute(k,v){this.attrs[k]=v}
  addEventListener(){}
  focus(){}
  getContext(){return {clearRect(){},beginPath(){},moveTo(){},lineTo(){},stroke(){},arc(){},fill(){}}}
  async play(){}
  click(){if(this.download)downloads.push({name:this.download,blob:urls.get(this.href)});else return this.onclick?.()}
}
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
for(const match of html.matchAll(/<([\w-]+)\b([^>]*\bid="([^"]+)"[^>]*)>/g)){
  const e=new Element(match[1]);e.value=match[2].match(/\bvalue="([^"]*)"/)?.[1]||'';e.hidden=/\bhidden\b/.test(match[2]);e.disabled=/\bdisabled\b/.test(match[2]);elements.set('#'+match[3],e);
}
elements.get('#captureMode').value='dynamic';
for(const selector of ['.videoWrap','.main-nav'])elements.set(selector,new Element());
for(const id of ['#camera','#trainingCamera'])Object.assign(elements.get(id),{videoWidth:640,videoHeight:480,readyState:4});
Object.defineProperty(elements.get('#camera'),'currentTime',{get:()=>now/1000});
const storage=new Map([['conectalsch-personal-v1','[]']]);
const store={getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,String(v)),removeItem:k=>storage.delete(k)};
const urls=new Map();
class Url extends URL{}
Url.createObjectURL=b=>{const u='blob:qa-'+(++nextId);urls.set(u,b);return u};Url.revokeObjectURL=()=>{};
const control={side:'Right',motionAt:null,mode:'present',auto:false,stageActive:false};
function landmarks(){
  const active=elements.get('#captureStage').dataset.kind==='recording';
  if(control.auto&&active&&!control.stageActive){control.motionAt=now+200;control.stageActive=true}
  if(!active)control.stageActive=false;
  const progress=control.motionAt===null?0:Math.max(0,Math.min(1,(now-control.motionAt)/900));
  const h=Array.from({length:21},(_,i)=>({x:.35+progress*.16+(i%4)*.012*(control.side==='Left'?-1:1),y:.42-Math.floor(i/4)*.012,z:i*.0008}));
  if(control.mode==='unknown')h.forEach((p,i)=>{p.x=.5+Math.sin(i)*.14;p.y=.5+Math.cos(i)*.14;p.z=.1*Math.sin(i)});
  return {landmarks:control.mode==='none'?[]:[h],handednesses:control.mode==='none'?[]:[[{categoryName:control.side,score:.99}]]};
}
const c={console,crypto:webcrypto,Blob,URL:Url,performance:{now:()=>now},localStorage:store,sessionStorage:store,
  document:{querySelector:s=>{if(!elements.has(s))throw Error('Missing UI element '+s);return elements.get(s)},createElement:t=>new Element(t),addEventListener(){},hidden:false},
  navigator:{mediaDevices:{getUserMedia:async()=>({getTracks:()=>[{stop(){}}]})}},
  speechSynthesis:{cancel(){},speak:u=>spoken.push(u.text)},SpeechSynthesisUtterance:class{constructor(t){this.text=t}},
  SpeechRecognition:class{constructor(){c.testRec=this}start(){this.onstart?.()}stop(){this.onend?.()}},
  MutationObserver:class{observe(){}},confirm:()=>true,scrollTo(){},
  setTimeout:(fn,ms)=>{const id=++nextId;timers.set(id,{fn,due:now+ms});return id},clearTimeout:id=>timers.delete(id),
  requestAnimationFrame:fn=>{const id=++nextId;frames.set(id,fn);return id},cancelAnimationFrame:id=>frames.delete(id)};
c.window=c;const context=vm.createContext(c),modules=new Map();
const visionSource=`export function handModel(){return Promise.resolve({detectForVideo:()=>detect()})}
export async function visionContext(){return {files:{},lib:{FaceLandmarker:{createFromOptions:async()=>({close(){},detectForVideo:()=>({faceLandmarks:[]})})},PoseLandmarker:{createFromOptions:async()=>({close(){},detectForVideo:()=>({landmarks:[]})})}}}}`;
c.detect=landmarks;
async function load(file){
  if(modules.has(file))return modules.get(file);
  const source=path.basename(file)==='visual-provider.js'?visionSource:fs.readFileSync(file,'utf8');
  const m=new vm.SourceTextModule(source,{context,identifier:file});modules.set(file,m);
  return m;
}
const entry=await load(path.join(root,'app.js'));
await entry.link((specifier,parent)=>load(path.resolve(path.dirname(parent.identifier),specifier)));
await entry.evaluate();
async function tick(){
  now+=50;
  for(const [id,t] of [...timers])if(t.due<=now){timers.delete(id);t.fn()}
  const pending=[...frames.values()];frames.clear();for(const fn of pending)fn(now);
  await new Promise(resolve=>setImmediate(resolve));
}
async function until(fn,limit=400){for(let i=0;i<limit;i++){if(fn())return;await tick()}throw Error('Timed out: '+elements.get('#trainingStatus').textContent+' / '+elements.get('#confidence').textContent)}
await until(()=>elements.get('#recordSample').disabled===false);
elements.get('#tab-samples').click();
async function capture(label,mode,side='Right'){
  elements.get('#signName').value=label;elements.get('#captureMode').value=mode;
  control.side=side;control.motionAt=null;control.auto=mode==='dynamic';control.mode=mode==='background'?'none':'present';
  elements.get('#recordSample').click();
  await until(()=>!elements.get('#captureReview').hidden||elements.get('#captureStage').dataset.kind==='error');
  assert.equal(elements.get('#captureStage').dataset.kind,'done',elements.get('#trainingStatus').textContent);
  await elements.get('#saveCapture').click();
}
await capture('HOLA','dynamic');await capture('HOLA','dynamic');
await capture('HOLA','dynamic','Left');await capture('HOLA','dynamic','Left');
await capture('POSTURA','static');await capture('POSTURA','static');
await capture('REPOSO','background');
console.log('PASS real app capture pipeline: two dynamic samples per hand, two static samples and a no-hand negative');
const saved=JSON.parse(storage.get('conectalsch-personal-v1'));
assert.equal(saved.length,7);assert(saved.every(s=>s.sampleVersion===4&&s.observations[0].vector.length===216));
assert(saved.at(-1).observations.some(o=>o.slots.every(h=>h===null)));
elements.get('#exportDataset').click();const dataset=JSON.parse(await downloads.at(-1).blob.text());assert.equal(dataset.samples.length,7);
elements.get('#exportSamples').click();const backup=JSON.parse(await downloads.at(-1).blob.text());assert.equal(backup.version,3);
if(process.env.CONNECTA_QA_DATASET)fs.writeFileSync(process.env.CONNECTA_QA_DATASET,JSON.stringify(dataset));
console.log('PASS v4 sample storage and dataset/backup export through the actual UI handlers');
elements.get('#tab-signs').click();if(elements.get('#cameraStatus').textContent.includes('desactivada'))await elements.get('#toggleCamera').click();control.auto=false;control.motionAt=null;control.mode='present';
elements.get('#startRecognition').click();
elements.get('#toggleDiagnostics').click();
for(const side of ['Right','Left']){
  const before=spoken.length;control.side=side;control.motionAt=now+250;
  await until(()=>spoken.length>before);
  assert.equal(spoken.at(-1),'Hola');
}
function diagnosticValue(label){const cs=elements.get('#diagnosticValues').children;const index=cs.findIndex(e=>e.textContent===label);return cs[index+1]?.textContent}
const retainedAttempt=diagnosticValue('Último intento');assert(retainedAttempt&&!retainedAttempt.includes('Todavía no'));
control.mode='none';for(let i=0;i<20;i++)await tick();
assert.equal(diagnosticValue('Último intento'),retainedAttempt,'last completed attempt survives waiting/no hands');
console.log('PASS last completed diagnostic survives subsequent idle frames');
const before=spoken.length;control.mode='unknown';control.motionAt=now+250;for(let i=0;i<50;i++)await tick();assert.equal(spoken.length,before);
control.mode='none';for(let i=0;i<20;i++)await tick();assert.match(elements.get('#signResult').textContent,/HOLA/);
elements.get('#tab-listen').click();elements.get('#toggleListening').click();const phrase=[{transcript:'Prueba de voz.'}];phrase.isFinal=true;c.testRec.onresult({resultIndex:0,results:[phrase]});assert.match(elements.get('#subtitleHistory').textContent,/Prueba de voz/);
console.log('PASS main camera loop: each hand variant recognized; unknown silent; transcript retained; voice input intact');
