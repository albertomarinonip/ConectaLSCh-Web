import { FilesetResolver, HandLandmarker } from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.22-rc.20250304/+esm";

const $=s=>document.querySelector(s);
const camera=$("#camera"), resultEl=$("#signResult"), confEl=$("#confidence"), trainStatus=$("#trainStatus");
let stream=null, facing="user", handLandmarker=null, templates=[], recognizing=false, liveBuffer=[], lastVideoTime=-1;

async function initHands(){
  if(handLandmarker) return;
  trainStatus.textContent="Cargando detector de manos…";
  const vision=await FilesetResolver.forVisionTasks("https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.22-rc.20250304/wasm");
  handLandmarker=await HandLandmarker.createFromOptions(vision,{
    baseOptions:{modelAssetPath:"https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task"},
    runningMode:"VIDEO",numHands:2,minHandDetectionConfidence:.45,minTrackingConfidence:.45
  });
}

function handFeature(r){
  if(!r.landmarks || !r.landmarks.length) return null;
  let hands=r.landmarks.map(lm=>{
    const wrist=lm[0];
    let scale=0;
    for(const p of lm) scale=Math.max(scale,Math.hypot(p.x-wrist.x,p.y-wrist.y));
    scale=Math.max(scale,.001);
    const v=[];
    for(const p of lm){v.push((p.x-wrist.x)/scale,(p.y-wrist.y)/scale,(p.z-wrist.z)/scale)}
    return {x:wrist.x,v};
  }).sort((a,b)=>a.x-b.x);
  const z=new Array(63).fill(0);
  return [...(hands[0]?.v||z),...(hands[1]?.v||z)];
}
function dist(a,b){let s=0;for(let i=0;i<a.length;i++){let d=a[i]-b[i];s+=d*d}return Math.sqrt(s/a.length)}
function dtw(A,B){
  const n=A.length,m=B.length, D=Array.from({length:n+1},()=>new Float32Array(m+1).fill(Infinity));D[0][0]=0;
  for(let i=1;i<=n;i++)for(let j=1;j<=m;j++){let c=dist(A[i-1],B[j-1]);D[i][j]=c+Math.min(D[i-1][j],D[i][j-1],D[i-1][j-1])}
  return D[n][m]/(n+m);
}
function resample(seq,n=18){
  if(seq.length<=1)return seq;
  return Array.from({length:n},(_,i)=>seq[Math.round(i*(seq.length-1)/(n-1))]);
}
async function extractVideo(url){
  const v=document.createElement("video");v.muted=true;v.playsInline=true;v.src=url;v.preload="auto";
  await new Promise((ok,no)=>{v.onloadedmetadata=ok;v.onerror=no});
  const seq=[], steps=22;
  for(let i=0;i<steps;i++){
    v.currentTime=(v.duration*.08)+(v.duration*.84*i/(steps-1));
    await new Promise(ok=>v.onseeked=ok);
    const r=handLandmarker.detectForVideo(v,performance.now()+i);
    const f=handFeature(r);if(f)seq.push(f);
  }
  v.remove(); return resample(seq);
}
$("#trainModel").onclick=async()=>{
  try{
    $("#trainModel").disabled=true; await initHands();
    const items=await (await fetch("training.json",{cache:"no-store"})).json(); templates=[];
    let done=0;
    for(const it of items){
      trainStatus.textContent=`Entrenando ${it.label}… ${done+1}/${items.length}`;
      const seq=await extractVideo(it.file);
      if(seq.length>=6) templates.push({label:it.label,seq});
      done++;
    }
    localStorage.setItem("senalinkTemplates",JSON.stringify(templates));
    trainStatus.textContent=`✅ Modelo preparado: ${templates.length}/${items.length} muestras útiles`;
    resultEl.textContent="Listo para reconocer 🤟"; $("#startRecognition").disabled=templates.length<10;
  }catch(e){trainStatus.textContent="❌ No pude entrenar: "+e.message;$("#trainModel").disabled=false}
};
try{templates=JSON.parse(localStorage.getItem("senalinkTemplates")||"[]");if(templates.length){trainStatus.textContent=`✅ Modelo guardado: ${templates.length} muestras`;$("#startRecognition").disabled=false;resultEl.textContent="Modelo listo";}}catch{}

$("#openCamera").onclick=async()=>{
  if(stream)stream.getTracks().forEach(t=>t.stop());
  stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:facing},audio:false});camera.srcObject=stream;await camera.play();resultEl.textContent="Cámara lista";
};
$("#flipCamera").onclick=async()=>{facing=facing==="user"?"environment":"user";$("#openCamera").click()};

$("#startRecognition").onclick=async()=>{
  if(!stream){resultEl.textContent="Primero abre la cámara";return}
  await initHands();recognizing=!recognizing;$("#startRecognition").textContent=recognizing?"⏹️ Parar reconocimiento":"🤟 Iniciar reconocimiento";
  liveBuffer=[];if(recognizing)requestAnimationFrame(loop);
};
function loop(){
  if(!recognizing)return;
  if(camera.readyState>=2 && camera.currentTime!==lastVideoTime){
    lastVideoTime=camera.currentTime;
    const r=handLandmarker.detectForVideo(camera,performance.now()), f=handFeature(r);
    if(f){liveBuffer.push(f);if(liveBuffer.length>24)liveBuffer.shift()}
    if(liveBuffer.length>=14 && templates.length){
      const seq=resample(liveBuffer,18);let best={d:Infinity,label:""};
      for(const t of templates){const d=dtw(seq,t.seq);if(d<best.d)best={d,label:t.label}}
      // Empirical confidence: deliberately conservative.
      const confidence=Math.max(0,Math.min(99,Math.round(100*(1-best.d/0.55))));
      if(confidence>=58){resultEl.textContent=best.label;confEl.textContent=`Confianza experimental: ${confidence}%`}
      else{resultEl.textContent="No estoy seguro";confEl.textContent="Haz la seña completa y mantén las manos visibles"}
    }
  }
  requestAnimationFrame(loop);
}

// Speech to text
const SR=window.SpeechRecognition||window.webkitSpeechRecognition;let rec=null;
if(SR){rec=new SR();rec.lang="es-CL";rec.continuous=true;rec.interimResults=true;rec.onresult=e=>{let s="";for(let i=e.resultIndex;i<e.results.length;i++)s+=e.results[i][0].transcript;$("#subtitles").textContent=s||"…"}}
$("#startListening").onclick=()=>{if(rec)try{rec.start()}catch{}else $("#subtitles").textContent="Reconocimiento de voz no disponible"};
$("#stopListening").onclick=()=>rec?.stop();
$("#speakReply").onclick=()=>{speechSynthesis.cancel();const u=new SpeechSynthesisUtterance($("#replyText").value);u.lang="es-CL";speechSynthesis.speak(u)};
