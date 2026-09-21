import { TRAINING_FRAMES } from "./training-data.js";
import { SignGate, chooseSign } from "./recognition-state.js";
import { validSamples, loadSamples, saveSamples } from "./sample-store.js";
const $=s=>document.querySelector(s), camera=$("#camera"), resultEl=$("#signResult"), confEl=$("#confidence"), status=$("#modelStatus");
let stream=null,facing="user",imageHands=null,videoHands=null,templates=[],recognizing=false,liveBuffer=[],lastVideoTime=-1;
let signVoiceEnabled=true;
const signGate=new SignGate();
let loopId=0,rafId=null,lastSampleAt=0,startingRecognition=false;

function feature(r){
 if(!r.landmarks?.length)return null;
 let hands=r.landmarks.map(lm=>{const w=lm[0];let sc=.001;for(const p of lm)sc=Math.max(sc,Math.hypot(p.x-w.x,p.y-w.y));let v=[];for(const p of lm)v.push((p.x-w.x)/sc,(p.y-w.y)/sc,(p.z-w.z)/sc);return{x:w.x,v}}).sort((a,b)=>a.x-b.x);
 const z=new Array(63).fill(0);return [...(hands[0]?.v||z),...(hands[1]?.v||z)];
}
function resample(s,n=9){if(s.length<2)return s;return Array.from({length:n},(_,i)=>s[Math.round(i*(s.length-1)/(n-1))])}
function d(a,b){let x=0;for(let i=0;i<a.length;i++){let q=a[i]-b[i];x+=q*q}return Math.sqrt(x/a.length)}
function dtw(A,B){let n=A.length,m=B.length,D=Array.from({length:n+1},()=>new Float32Array(m+1).fill(Infinity));D[0][0]=0;for(let i=1;i<=n;i++)for(let j=1;j<=m;j++){let c=d(A[i-1],B[j-1]);D[i][j]=c+Math.min(D[i-1][j],D[i][j-1],D[i-1][j-1])}return D[n][m]/(n+m)}
function loadImg(src){return new Promise((ok,no)=>{let im=new Image();im.onload=()=>ok(im);im.onerror=()=>no(new Error("No cargó "+src));im.src=src})}
let visionPromise=null;
async function vision(){
 if(videoHands&&imageHands)return;
 if(visionPromise)return visionPromise;
 visionPromise=(async()=>{
 const {FilesetResolver,HandLandmarker}=await import("https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.22-rc.20250304/+esm");
 const files=await FilesetResolver.forVisionTasks("https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.22-rc.20250304/wasm");
 const base={baseOptions:{modelAssetPath:"https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task"},numHands:2,minHandDetectionConfidence:.4,minTrackingConfidence:.4};
 imageHands=await HandLandmarker.createFromOptions(files,{...base,runningMode:"IMAGE"});
 videoHands=await HandLandmarker.createFromOptions(files,{...base,runningMode:"VIDEO"});
 })();
 try{await visionPromise}catch(e){visionPromise=null;throw e}
}
async function prepare(){
 try{
   let saved=localStorage.getItem("conectalsch-v10-templates") || localStorage.getItem("senalink-v09-templates");
   if(saved){const parsed=JSON.parse(saved);if(!validSamples(parsed))throw Error("Muestras iniciales guardadas inválidas; conserva un respaldo.");baseTemplates=parsed;status.textContent=`✅ Modelo listo: ${baseTemplates.length} muestras`;resultEl.textContent="Listo 🤟";$("#startRecognition").disabled=false;return}
   await vision();
   const samples=TRAINING_FRAMES;
   let k=0;
   for(const s of samples){let seq=[];status.textContent=`Preparando ${s.label}… ${++k}/${samples.length}`;
     for(const f of s.frames){let im=await loadImg(f);let x=feature(imageHands.detect(im));if(x)seq.push(x)}
     if(seq.length>=2)baseTemplates.push({label:s.label,seq:resample(seq)});
     await new Promise(r=>setTimeout(r,0));
   }
   try{localStorage.setItem("conectalsch-v10-templates",JSON.stringify(baseTemplates))}catch{ /* recognition remains available in memory */ }
   status.textContent=`✅ Modelo listo: ${baseTemplates.length}/${samples.length} muestras útiles`;resultEl.textContent="Listo para reconocer 🤟";$("#startRecognition").disabled=baseTemplates.length<8;
 }catch(e){console.error(e);basePreparationError=e?.message||String(e);status.textContent="❌ Error al cargar modelo: "+basePreparationError;resultEl.textContent="Modelo no disponible"}
}


const cameraBtn=$("#toggleCamera"), cameraStatus=$("#cameraStatus"), flipBtn=$("#flipCamera");

const signVoiceBtn=$("#toggleSignVoice"), signVoiceStatus=$("#signVoiceStatus");
function setSignVoiceUI(){signVoiceBtn.textContent=signVoiceEnabled?"🔇 Desactivar voz de señas":"🔊 Activar voz de señas";signVoiceStatus.textContent=signVoiceEnabled?"🟢 Voz de señas activa":"⚫ Voz de señas desactivada"}
function speakSign(label){
 if(!signVoiceEnabled||!label||!('speechSynthesis' in window))return;
 speechSynthesis.cancel(); const u=new SpeechSynthesisUtterance(label.charAt(0)+label.slice(1).toLowerCase()); u.lang="es-CL"; speechSynthesis.speak(u);
}
signVoiceBtn.onclick=()=>{signVoiceEnabled=!signVoiceEnabled;if(!signVoiceEnabled)window.speechSynthesis?.cancel();setSignVoiceUI()};setSignVoiceUI();

function stopCamera(){
 cancelCapture();
 pauseRecognition();
 $("#startRecognition").textContent="🤟 Iniciar reconocimiento";
 if(stream){stream.getTracks().forEach(t=>t.stop());stream=null}
 camera.srcObject=null;cameraBtn.textContent="📷 Activar cámara";cameraStatus.textContent="⚫ Cámara desactivada";flipBtn.disabled=true;
 resultEl.textContent=templates.length?"Cámara desactivada":"Cargando modelo…";confEl.textContent="";
}
async function startCamera(){
 try{pauseRecognition();if(stream)stream.getTracks().forEach(t=>t.stop());stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:facing},audio:false});camera.srcObject=stream;await camera.play();cameraBtn.textContent="⏹️ Desactivar cámara";cameraStatus.textContent="🟢 Cámara activa";flipBtn.disabled=false;if(templates.length)resultEl.textContent="Esperando seña…"}
 catch(e){stream=null;cameraBtn.textContent="📷 Activar cámara";cameraStatus.textContent="⚫ Cámara desactivada";flipBtn.disabled=true;resultEl.textContent="No pude activar la cámara"}
}
cameraBtn.onclick=()=>stream?stopCamera():startCamera();
flipBtn.onclick=async()=>{if(!stream)return;cancelCapture();facing=facing==="user"?"environment":"user";await startCamera()};
function showRecognition(out){
 resultEl.textContent=out.kind==='confirmed'?out.label:out.kind==='uncertain'?'No estoy seguro':'Esperando seña…';
 confEl.textContent=out.kind==='uncertain'?'La seña no es clara o se parece a otra.':out.kind==='confirmed'?'Seña confirmada':'Mantén las manos visibles y realiza la seña completa.';
 if(out.speak)speakSign(out.label);
}
function pauseRecognition(){
 recognizing=false;loopId++;if(rafId!==null)cancelAnimationFrame(rafId);rafId=null;
 liveBuffer=[];lastVideoTime=-1;lastSampleAt=0;signGate.interrupt();
 window.speechSynthesis?.cancel();
 $('#startRecognition').textContent='🤟 Iniciar reconocimiento';
 showRecognition({kind:'waiting'});
}
$('#startRecognition').onclick=async()=>{
 if(startingRecognition||capturing)return;
 if(recognizing){pauseRecognition();return}
 if(!stream){resultEl.textContent='Primero activa la cámara';return}
 const requestId=loopId;startingRecognition=true;$('#startRecognition').disabled=true;
 try{
 await vision();if(!stream||capturing||requestId!==loopId)return;
 recognizing=true;liveBuffer=[];lastVideoTime=-1;lastSampleAt=0;signGate.interrupt();
 $('#startRecognition').textContent='⏹️ Parar reconocimiento';showRecognition({kind:'waiting'});
 const id=++loopId;rafId=requestAnimationFrame(()=>loop(id));
 }catch(e){resultEl.textContent='No se pudo iniciar el reconocimiento';confEl.textContent=e.message}
 finally{startingRecognition=false;$('#startRecognition').disabled=capturing||!templates.length}
};
function loop(id){
 if(!recognizing||id!==loopId)return;
 try{
 const now=performance.now();
 if(now-lastSampleAt>350&&lastSampleAt){liveBuffer=[];signGate.interrupt();showRecognition({kind:'waiting'})}
 // Fixed cadence: stability is measured in time, not monitor refresh rate.
 if(now-lastSampleAt>=100&&camera.readyState>=2&&camera.currentTime!==lastVideoTime){
 lastSampleAt=now;lastVideoTime=camera.currentTime;
 const f=feature(videoHands.detectForVideo(camera,now));
 let match={kind:'waiting'};
 if(!f){liveBuffer=[]}else{
 liveBuffer.push(f);if(liveBuffer.length>18)liveBuffer.shift();
 if(liveBuffer.length>=8){const q=resample(liveBuffer);match=chooseSign(templates.map(t=>({label:t.label,d:dtw(q,t.seq)})))}
 }
 const out=signGate.step({now,hands:!!f,pose:f,match});
 if(out.clearBuffer)liveBuffer=[];
 showRecognition(out);
 }
 }catch(e){pauseRecognition();resultEl.textContent='Reconocimiento detenido';confEl.textContent=e.message;return}
 rafId=requestAnimationFrame(()=>loop(id));
}

const SR=window.SpeechRecognition||window.webkitSpeechRecognition;let rec=null,listening=false;const listenBtn=$("#toggleListening"),listenStatus=$("#listeningStatus");
function setListeningUI(on){listening=on;listenBtn.textContent=on?"⏹️ Desactivar escucha":"🎙️ Activar escucha";listenStatus.textContent=on?"🟢 Escucha activa":"⚫ Escucha desactivada"}
const subtitlePanel=$("#subtitles"), subtitleHistory=$("#subtitleHistory"), subtitleInterim=$("#subtitleInterim");
let hasSubtitleHistory=false;
function appendSubtitle(text){text=text.trim();if(!text)return;if(!hasSubtitleHistory){subtitleHistory.innerHTML="";hasSubtitleHistory=true}const line=document.createElement("span");line.className="subtitleLine";line.textContent=text;subtitleHistory.appendChild(line);subtitlePanel.scrollTop=subtitlePanel.scrollHeight}
function showSubtitleMessage(text){if(!hasSubtitleHistory)subtitleHistory.innerHTML=`<span class="subtitlePlaceholder">${text}</span>`}
if(SR){rec=new SR();rec.lang="es-CL";rec.continuous=true;rec.interimResults=true;rec.onstart=()=>setListeningUI(true);rec.onresult=e=>{let interim="";for(let i=e.resultIndex;i<e.results.length;i++){const text=e.results[i][0].transcript;if(e.results[i].isFinal)appendSubtitle(text);else interim+=text}subtitleInterim.textContent=interim;subtitlePanel.scrollTop=subtitlePanel.scrollHeight};rec.onend=()=>{subtitleInterim.textContent="";if(listening){try{rec.start()}catch{setListeningUI(false)}}else setListeningUI(false)};rec.onerror=e=>{if(e.error==="not-allowed"||e.error==="service-not-allowed"){setListeningUI(false);showSubtitleMessage("Permiso de micrófono no disponible")}}}
listenBtn.onclick=()=>{if(!rec){showSubtitleMessage("Reconocimiento de voz no disponible");return}if(listening){listening=false;rec.stop();setListeningUI(false)}else{try{rec.start()}catch{}}};
$("#clearSubtitles").onclick=()=>{hasSubtitleHistory=false;subtitleHistory.innerHTML='<span class="subtitlePlaceholder">Esperando voz…</span>';subtitleInterim.textContent="";subtitlePanel.scrollTop=0};
$("#speakReply").onclick=()=>{speechSynthesis.cancel();let u=new SpeechSynthesisUtterance($("#replyText").value);u.lang="es-CL";speechSynthesis.speak(u)};

if("serviceWorker" in navigator) navigator.serviceWorker.register("./sw.js").catch(()=>{});

// Personal samples use a separate key so original and legacy templates are preserved.
let personalSamples=[],baseTemplates=[],captureId=0,capturing=false,trainingReady=false,savingSamples=false;
let basePreparationError='';
const trainingStatus=$('#trainingStatus'),recordBtn=$('#recordSample');
function refreshDictionary(){
 templates=[...baseTemplates,...personalSamples];
 const counts=new Map();for(const t of templates)counts.set(t.label,(counts.get(t.label)||0)+1);
 const list=$('#signDictionary');list.replaceChildren();
 for(const [label,count] of [...counts].sort((a,b)=>a[0].localeCompare(b[0],'es'))){const li=document.createElement('li');li.textContent=`${label} — ${count} ejemplos${count<3?' · añade más ejemplos':''}`;list.appendChild(li)}
 $('#startRecognition').disabled=!templates.length;
 status.textContent=`${templates.length?'Modelo listo':'Sin muestras disponibles'}: ${counts.size} señas · ${templates.length} muestras${basePreparationError?' · No se pudieron preparar las muestras iniciales: '+basePreparationError:''}`;
}
async function initTraining(){
 try{const restored=await loadSamples();personalSamples=restored.samples;
 trainingStatus.textContent=restored.warning||'Tus muestras están guardadas. Listo para agregar ejemplos.';
 trainingReady=true;refreshDictionary();recordBtn.disabled=false;
 }catch(e){trainingStatus.textContent=e.message;recordBtn.disabled=true}
}
async function savePersonal(next){
 if(savingSamples)throw Error('Espera a que termine el guardado anterior.');
 savingSamples=true;
 try{const result=await saveSamples(next);personalSamples=next;refreshDictionary();return result}
 finally{savingSamples=false}
}
function downloadJson(data,name){
 const url=URL.createObjectURL(new Blob([JSON.stringify(data)],{type:'application/json'}));
 const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
function cancelCapture(){
 if(!capturing)return;captureId++;capturing=false;recordBtn.disabled=!trainingReady;
 $('#startRecognition').disabled=!templates.length;
 trainingStatus.textContent='Grabación cancelada. No se guardó el ejemplo.';
}
recordBtn.onclick=async()=>{
 if(capturing||savingSamples||startingRecognition||!trainingReady)return;
 const label=$('#signName').value.trim().normalize('NFC').toLocaleUpperCase('es-CL');
 if(!label||label.length>60){trainingStatus.textContent='Escribe un nombre de hasta 60 caracteres.';return}
 if(!stream){trainingStatus.textContent='Primero activa la cámara.';return}
 pauseRecognition();
 $('#startRecognition').disabled=true;capturing=true;recordBtn.disabled=true;const id=++captureId;
 try{
 if(!videoHands)await vision();
 for(let n=3;n>0;n--){if(id!==captureId)return;trainingStatus.textContent=`Prepárate: ${n}…`;await new Promise(r=>setTimeout(r,1000))}
 if(id!==captureId)return;
 const seq=[];let previous=-1;const started=performance.now();
 await new Promise((resolve,reject)=>{
 function frame(){try{
 if(id!==captureId||!stream){resolve();return}
 const now=performance.now();trainingStatus.textContent=`Haz ${label}: ${Math.max(1,Math.ceil((3000-now+started)/1000))} segundos…`;
 if(camera.readyState>=2&&camera.currentTime!==previous){previous=camera.currentTime;const f=feature(videoHands.detectForVideo(camera,now));if(f)seq.push(f)}
 if(now-started>=3000){resolve();return}requestAnimationFrame(frame);
 }catch(e){reject(e)}}requestAnimationFrame(frame);
 });
 if(id!==captureId)return;
 if(seq.length<8)throw Error('No se vieron las manos el tiempo suficiente. Repite con las manos completas dentro de la cámara.');
 const stored=await savePersonal([...personalSamples,{label,seq:resample(seq)}]);
 navigator.storage?.persist?.().catch(()=>{});
 trainingStatus.textContent=`Ejemplo de ${label} guardado. ${stored.warning} Repite la seña para agregar otro o inicia el reconocimiento para probarla.`;
 }catch(e){if(id===captureId)trainingStatus.textContent=`No se guardó: ${e.message}`}
 finally{if(id===captureId){capturing=false;recordBtn.disabled=false;$('#startRecognition').disabled=!templates.length}}
};
$('#exportSamples').onclick=()=>downloadJson({format:'conectalsch-personal',version:1,samples:personalSamples},'ConectaLSCh-mis-senas.json');
$('#importSamples').onclick=()=>{if(capturing||savingSamples||!trainingReady){trainingStatus.textContent='Espera a que termine la preparación o grabación.';return}$('#samplesFile').click()};
$('#samplesFile').onchange=async e=>{
 const file=e.target.files[0];if(!file)return;
 try{
 if(capturing||savingSamples||!trainingReady)throw Error('Espera a que termine la grabación.');
 if(file.size>12000000)throw Error('El archivo supera los 12 MB.');
 const data=JSON.parse(await file.text());
 if(data.format!=='conectalsch-personal'||data.version!==1||!validSamples(data.samples))throw Error('El archivo no es un respaldo compatible.');
 const unique=new Map(personalSamples.map(t=>[JSON.stringify(t),t]));
 for(const t of data.samples){const normalized={label:t.label.trim().normalize('NFC').toLocaleUpperCase('es-CL'),seq:t.seq};unique.set(JSON.stringify(normalized),normalized)}
 const added=unique.size-personalSamples.length;const stored=await savePersonal([...unique.values()]);
 trainingStatus.textContent=`Respaldo importado: ${added} ejemplos nuevos. Tus ejemplos anteriores se conservaron. ${stored.warning}`;
 }catch(e){trainingStatus.textContent=`No se importó: ${e.message}`}finally{e.target.value=''}
};


// Restore personal data independently, even when the remote vision model is unavailable.
Promise.allSettled([prepare(),initTraining()]).then(()=>{refreshDictionary();if(!stream)resultEl.textContent="Esperando seña…"});
document.addEventListener("visibilitychange",()=>{if(document.hidden){cancelCapture();pauseRecognition()}});
