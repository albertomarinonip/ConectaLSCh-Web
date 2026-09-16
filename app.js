import { TRAINING_FRAMES } from "./training-data.js";
import { FilesetResolver, HandLandmarker } from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.22-rc.20250304/+esm";
const $=s=>document.querySelector(s), camera=$("#camera"), resultEl=$("#signResult"), confEl=$("#confidence"), status=$("#modelStatus");
let stream=null,facing="user",imageHands=null,videoHands=null,templates=[],recognizing=false,liveBuffer=[],lastVideoTime=-1;

function feature(r){
 if(!r.landmarks?.length)return null;
 let hands=r.landmarks.map(lm=>{const w=lm[0];let sc=.001;for(const p of lm)sc=Math.max(sc,Math.hypot(p.x-w.x,p.y-w.y));let v=[];for(const p of lm)v.push((p.x-w.x)/sc,(p.y-w.y)/sc,(p.z-w.z)/sc);return{x:w.x,v}}).sort((a,b)=>a.x-b.x);
 const z=new Array(63).fill(0);return [...(hands[0]?.v||z),...(hands[1]?.v||z)];
}
function resample(s,n=9){if(s.length<2)return s;return Array.from({length:n},(_,i)=>s[Math.round(i*(s.length-1)/(n-1))])}
function d(a,b){let x=0;for(let i=0;i<a.length;i++){let q=a[i]-b[i];x+=q*q}return Math.sqrt(x/a.length)}
function dtw(A,B){let n=A.length,m=B.length,D=Array.from({length:n+1},()=>new Float32Array(m+1).fill(Infinity));D[0][0]=0;for(let i=1;i<=n;i++)for(let j=1;j<=m;j++){let c=d(A[i-1],B[j-1]);D[i][j]=c+Math.min(D[i-1][j],D[i][j-1],D[i-1][j-1])}return D[n][m]/(n+m)}
function loadImg(src){return new Promise((ok,no)=>{let im=new Image();im.onload=()=>ok(im);im.onerror=()=>no(new Error("No cargó "+src));im.src=src})}
async function vision(){
 const files=await FilesetResolver.forVisionTasks("https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.22-rc.20250304/wasm");
 const base={baseOptions:{modelAssetPath:"https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task"},numHands:2,minHandDetectionConfidence:.4,minTrackingConfidence:.4};
 imageHands=await HandLandmarker.createFromOptions(files,{...base,runningMode:"IMAGE"});
 videoHands=await HandLandmarker.createFromOptions(files,{...base,runningMode:"VIDEO"});
}
async function prepare(){
 try{
   let saved=localStorage.getItem("senalink-v09-templates");
   if(saved){templates=JSON.parse(saved);status.textContent=`✅ Modelo listo: ${templates.length} muestras`;resultEl.textContent="Listo 🤟";$("#startRecognition").disabled=false;return}
   await vision();
   const samples=TRAINING_FRAMES;
   let k=0;
   for(const s of samples){let seq=[];status.textContent=`Preparando ${s.label}… ${++k}/${samples.length}`;
     for(const f of s.frames){let im=await loadImg(f);let x=feature(imageHands.detect(im));if(x)seq.push(x)}
     if(seq.length>=2)templates.push({label:s.label,seq:resample(seq)});
     await new Promise(r=>setTimeout(r,0));
   }
   localStorage.setItem("senalink-v09-templates",JSON.stringify(templates));
   status.textContent=`✅ Modelo listo: ${templates.length}/${samples.length} muestras útiles`;resultEl.textContent="Listo para reconocer 🤟";$("#startRecognition").disabled=templates.length<8;
 }catch(e){console.error(e);status.textContent="❌ Error al cargar modelo: "+(e?.message||e);resultEl.textContent="Modelo no disponible"}
}
prepare();

$("#openCamera").onclick=async()=>{try{if(stream)stream.getTracks().forEach(t=>t.stop());stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:facing},audio:false});camera.srcObject=stream;await camera.play();if(templates.length)resultEl.textContent="Cámara lista 🤟"}catch(e){resultEl.textContent="No pude abrir la cámara"}};
$("#flipCamera").onclick=()=>{facing=facing==="user"?"environment":"user";$("#openCamera").click()};
$("#startRecognition").onclick=async()=>{if(!stream){resultEl.textContent="Primero abre la cámara";return}if(!videoHands)await vision();recognizing=!recognizing;$("#startRecognition").textContent=recognizing?"⏹️ Parar reconocimiento":"🤟 Iniciar reconocimiento";liveBuffer=[];if(recognizing)requestAnimationFrame(loop)};
function loop(){if(!recognizing)return;if(camera.readyState>=2&&camera.currentTime!==lastVideoTime){lastVideoTime=camera.currentTime;let f=feature(videoHands.detectForVideo(camera,performance.now()));if(f){liveBuffer.push(f);if(liveBuffer.length>18)liveBuffer.shift()}if(liveBuffer.length>=8){let q=resample(liveBuffer),best={d:1e9,label:""};for(const t of templates){let x=dtw(q,t.seq);if(x<best.d)best={d:x,label:t.label}}let c=Math.max(0,Math.min(99,Math.round(100*(1-best.d/.55))));if(c>=55){resultEl.textContent=best.label;confEl.textContent=`Confianza experimental: ${c}%`}else{resultEl.textContent="No estoy seguro";confEl.textContent="Haz la seña completa con las manos visibles"}}}requestAnimationFrame(loop)}

const SR=window.SpeechRecognition||window.webkitSpeechRecognition;let rec=null;if(SR){rec=new SR();rec.lang="es-CL";rec.continuous=true;rec.interimResults=true;rec.onresult=e=>{let s="";for(let i=e.resultIndex;i<e.results.length;i++)s+=e.results[i][0].transcript;$("#subtitles").textContent=s||"…"}}
$("#startListening").onclick=()=>{if(rec)try{rec.start()}catch{}else $("#subtitles").textContent="Reconocimiento de voz no disponible"};$("#stopListening").onclick=()=>rec?.stop();
$("#speakReply").onclick=()=>{speechSynthesis.cancel();let u=new SpeechSynthesisUtterance($("#replyText").value);u.lang="es-CL";speechSynthesis.speak(u)};
