// Current app integration tests with synthetic landmarks. They do not measure LSCh accuracy.
const {chromium}=require('playwright');
const fs=require('fs'),http=require('http'),path=require('path'),assert=require('assert');
const root=path.resolve(__dirname,'..');
const server=http.createServer((req,res)=>{
  const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname),file=path.join(root,pathname==='/'?'index.html':pathname);
  try{res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':file.endsWith('.json')?'application/json':'text/html');res.end(fs.readFileSync(file))}catch{res.statusCode=404;res.end()}
});
async function setup(context){
  await context.route('https://cdn.jsdelivr.net/**',r=>r.fulfill({contentType:'text/javascript',body:`
    export const FilesetResolver={forVisionTasks:async()=>({})};
    export const HandLandmarker={createFromOptions:async()=>({detectForVideo(){
      const p=window.motionAt===null?0:Math.max(0,Math.min(1,(performance.now()-window.motionAt)/900));
      const hand=Array.from({length:21},(_,i)=>({x:.35+p*.16+(i%4)*.012*(window.side==='Left'?-1:1),y:.42-Math.floor(i/4)*.012,z:i*.0008}));
      if(window.mode==='unknown')hand.forEach((q,i)=>{q.x=.5+Math.sin(i)*.14;q.y=.5+Math.cos(i)*.14;q.z=.1*Math.sin(i)});
      window.inferences++;return {landmarks:window.mode==='none'?[]:[hand],handednesses:window.mode==='none'?[]:[[{categoryName:window.side,score:.99}]]};
    }})};
    export const FaceLandmarker={createFromOptions:async()=>({close(){},detectForVideo(){
      const f=Array.from({length:478},()=>({x:.5,y:.25,z:0}));
      Object.assign(f[33],{x:.44,y:.19});Object.assign(f[263],{x:.56,y:.19});Object.assign(f[1],{y:.24});Object.assign(f[152],{y:.34});Object.assign(f[13],{y:.3});Object.assign(f[14],{y:.31});
      return {faceLandmarks:[f],faceBlendshapes:[{categories:[{categoryName:'browInnerUp',score:.1}]}]};
    }})};
    export const PoseLandmarker={createFromOptions:async()=>({close(){},detectForVideo(){
      const f=Array.from({length:33},()=>({x:.5,y:.55,z:0,visibility:.99}));
      for(const [i,x,y] of [[11,.32,.55],[12,.68,.55],[13,.26,.7],[14,.74,.7],[15,.25,.5],[16,.75,.5]])Object.assign(f[i],{x,y});
      return {landmarks:[f]};
    }})};
  `}));
  await context.addInitScript(()=>{
    window.mode='present';window.side='Right';window.motionAt=null;window.inferences=0;window.spoken=[];
    navigator.mediaDevices.getUserMedia=async()=>({getTracks:()=>[{stop(){}}]});
    Object.defineProperty(HTMLMediaElement.prototype,'srcObject',{set(){},get(){return null}});HTMLMediaElement.prototype.play=async()=>{};
    Object.defineProperty(HTMLMediaElement.prototype,'readyState',{get:()=>4});Object.defineProperty(HTMLMediaElement.prototype,'currentTime',{get:()=>performance.now()/1000});
    Object.defineProperty(HTMLVideoElement.prototype,'videoWidth',{get:()=>640});Object.defineProperty(HTMLVideoElement.prototype,'videoHeight',{get:()=>480});
    Object.defineProperty(window,'speechSynthesis',{value:{cancel(){},speak(u){window.spoken.push(u.text)}}});window.SpeechSynthesisUtterance=class{constructor(t){this.text=t}};
    window.SpeechRecognition=class{constructor(){window.testRec=this}start(){this.onstart?.()}stop(){this.onend?.()}};
  });
}
(async()=>{
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const browser=await chromium.launch({headless:true});
  const context=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block'});
  try{
    await setup(context);const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto('http://127.0.0.1:'+server.address().port);
    await page.waitForFunction(()=>document.querySelector('#signResult').textContent.includes('Aún no tienes'));
    assert(await page.locator('#startRecognition').isDisabled());
    await page.click('#tab-samples');await page.locator('#trainingDetails summary').click();
    async function capture(label,mode='dynamic',side='Right'){
      await page.fill('#signName',label);await page.selectOption('#captureMode',mode);
      await page.evaluate(side=>{window.side=side;window.mode='present';window.motionAt=null},side);
      await page.click('#recordSample');
      await page.waitForFunction(()=>document.querySelector('#captureStage').dataset.kind==='recording',{},{timeout:10000});
      if(mode==='dynamic')await page.evaluate(()=>{window.motionAt=performance.now()+200});
      await page.waitForFunction(()=>!document.querySelector('#captureReview').hidden||document.querySelector('#captureStage').dataset.kind==='error',{},{timeout:10000});
      assert.equal(await page.locator('#captureStage').getAttribute('data-kind'),'done',await page.locator('#trainingStatus').innerText());
      await page.click('#saveCapture');await page.waitForFunction(()=>document.querySelector('#captureStage').textContent.includes('GUARDADO'));
    }
    await capture('HOLA');await capture('HOLA');await capture('HOLA','dynamic','Left');await capture('HOLA','dynamic','Left');
    await capture('POSTURA','static');await capture('POSTURA','static');
    console.log('PASS capture/save: two dynamic examples per hand and two static examples');
    const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('conectalsch-personal-v1')));
    assert.equal(saved.length,6);assert(saved.every(s=>s.sampleVersion===4&&s.observations.length===s.seq.length&&s.observations[0].vector.length===216));
    assert(saved.every(s=>s.quality.identityCoverage>=.8));
    const download=page.waitForEvent('download');await page.click('#exportDataset');
    const file=await (await download).path(),dataset=JSON.parse(fs.readFileSync(file,'utf8'));
    assert.equal(dataset.format,'conectalsch-dataset');assert.equal(dataset.samples.length,6);
    if(process.env.CONNECTA_QA_DATASET)fs.copyFileSync(file,process.env.CONNECTA_QA_DATASET);
    const backupPending=page.waitForEvent('download');await page.click('#exportSamples');
    const backup=fs.readFileSync(await (await backupPending).path(),'utf8');assert.equal(JSON.parse(backup).version,3);
    await page.setInputFiles('#samplesFile',{name:'backup.json',mimeType:'application/json',buffer:Buffer.from(backup)});
    await page.waitForFunction(()=>document.querySelector('#trainingStatus').textContent.includes('0 ejemplos nuevos'));
    console.log('PASS dataset export, validated v4 storage and backup v3 deduplication');
    await page.click('#tab-signs');if((await page.locator('#cameraStatus').innerText()).includes('desactivada'))await page.click('#toggleCamera');await page.waitForFunction(()=>document.querySelector('#handsStatus').textContent.includes('1'));
    await page.click('#startRecognition');
    async function sign(side){
      const before=await page.evaluate(()=>window.spoken.length);
      await page.evaluate(side=>{window.side=side;window.mode='present';window.motionAt=performance.now()+250},side);
      await page.waitForFunction(n=>window.spoken.length>n,before,{timeout:10000});
      assert.equal(await page.evaluate(()=>window.spoken.at(-1)),'Hola');
    }
    await sign('Right');await sign('Left');
    const before=await page.evaluate(()=>window.spoken.length);
    await page.evaluate(()=>{window.mode='unknown';window.motionAt=performance.now()});await page.waitForTimeout(1800);
    assert.equal(await page.evaluate(()=>window.spoken.length),before);
    await page.evaluate(()=>{window.mode='none'});await page.waitForTimeout(800);
    assert.match(await page.locator('#signResult').innerText(),/HOLA/);
    console.log('PASS camera loop recognizes recorded motion on each hand; unknown is silent; transcript persists');
    await page.reload();await page.waitForFunction(()=>document.querySelector('#signDictionary').textContent.includes('HOLA'));
    assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('conectalsch-personal-v1')).length),6);
    await page.click('#tab-listen');await page.click('#toggleListening');
    await page.evaluate(()=>{const r=[{transcript:'Prueba de voz.'}];r.isFinal=true;window.testRec.onresult({resultIndex:0,results:[r]})});
    assert.match(await page.locator('#subtitleHistory').innerText(),/Prueba de voz/);
    for(const [width,height] of [[320,568],[390,844],[844,390],[1440,900]]){
      await page.setViewportSize({width,height});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    }
    if(process.env.CONNECTA_QA_SCREENSHOT){await page.setViewportSize({width:390,height:844});await page.click('#tab-samples');await page.locator('#trainingDetails summary').click();await page.screenshot({path:process.env.CONNECTA_QA_SCREENSHOT,fullPage:true})}
    assert.deepEqual(errors,[]);console.log('PASS reload persistence, speech smoke test, four viewports and no JS errors');
  }finally{await context.close();await browser.close();server.close()}
})().catch(e=>{console.error(e);server.close();process.exitCode=1});
