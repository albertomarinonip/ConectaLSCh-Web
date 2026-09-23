import {feature} from './recognition-math.js';
import {ObservationClock} from './recognition-clock.js';
import {recordedSample,matchWindow} from './temporal-sequence.js';
import {visionContext,handModel} from './visual-provider.js';
import {VisualTracking,drawVisualTracking} from './visual-tracking.js';
import { SignGate, LIMITS } from "./recognition-state.js";
import { validSamples, loadSamples, saveSamples, removePersonalLabel } from "./sample-store.js";
import {observation,drawHands} from './hand-overlay.js';
import {initNotes} from './notes-ui.js';
import {getSignSettings,putSignSettings} from './content-store.js';
const $=s=>document.querySelector(s), camera=$("#camera"), resultEl=$("#signResult"), confEl=$("#confidence"), status=$("#modelStatus");
let stream=null,facing="user",videoHands=null,templates=[],recognizing=false,liveBuffer=[],lastVideoTime=-1;
let signVoiceEnabled=true;
const observationClock=new ObservationClock();
let lastCompletedAt=0,bufferTimes=[],diagnosticEnabled=false,lastDiagnostic={};
const signGate=new SignGate();
let loopId=0,rafId=null,lastSampleAt=0,startingRecognition=false;
let trainingLoadError='';
let latestDetection=null,overlayEnabled=false,cameraBusy=false,cameraRequest=0,signSettings={},settingsReady=false,activeTab='signs';

async function vision(){videoHands=await handModel()}
const visualTracking=new VisualTracking(visionContext);
const cameraBtn=$("#toggleCamera"), cameraStatus=$("#cameraStatus"), flipBtn=$("#flipCamera");

const signVoiceBtn=$("#toggleSignVoice"), signVoiceStatus=$("#signVoiceStatus");
function setSignVoiceUI(){signVoiceBtn.setAttribute("aria-pressed",String(signVoiceEnabled));signVoiceBtn.textContent=signVoiceEnabled?"🔊 Voz ON":"🔇 Voz OFF";signVoiceStatus.textContent=signVoiceEnabled?"🟢 Voz de señas activa":"⚫ Voz de señas desactivada"}
function speakSign(label){
 if(!signVoiceEnabled||!label||!('speechSynthesis' in window))return;
 speechSynthesis.cancel(); const u=new SpeechSynthesisUtterance(label.charAt(0)+label.slice(1).toLowerCase()); u.lang="es-CL"; speechSynthesis.speak(u);
}
signVoiceBtn.onclick=()=>{signVoiceEnabled=!signVoiceEnabled;if(!signVoiceEnabled)window.speechSynthesis?.cancel();setSignVoiceUI()};setSignVoiceUI();

function updateHands(result){
 const valid=(result.landmarks||[]).filter(h=>h.length===21&&h.every(p=>[p.x,p.y,p.z].every(Number.isFinite)));
 const channels=observation({...result,landmarks:valid},performance.now());
 Object.assign(channels,visualTracking.snapshot(performance.now()));
 $('#handsStatus').textContent=valid.length?`🟢 Manos detectadas · ${valid.length}`:'⚫ No se detectan manos';
 drawHands($('#handCanvas'),camera,channels,overlayEnabled);
 if(overlayEnabled)drawVisualTracking($('#handCanvas'),channels);
 $('#visualStatus').textContent=visualTracking.status;
}
$('#toggleOverlay').onclick=()=>{overlayEnabled=!overlayEnabled;$('#toggleOverlay').setAttribute('aria-checked',String(overlayEnabled));$('#toggleOverlay').textContent=overlayEnabled?'ON':'OFF';updateHands(latestDetection?.result||{landmarks:[]})};
function stopCamera(){
 cameraRequest++;visualTracking.clear();cancelCapture();visualTracking.clear();pauseRecognition();loopId++;if(rafId!==null)cancelAnimationFrame(rafId);rafId=null;latestDetection=null;lastVideoTime=-1;lastSampleAt=0;lastCompletedAt=0;bufferTimes=[];observationClock.reset();
 if(stream){stream.getTracks().forEach(t=>t.stop());stream=null}camera.srcObject=null;
 cameraBtn.textContent='📷 Cámara ON';cameraStatus.textContent='⚫ Cámara desactivada';flipBtn.disabled=true;$('#cameraEmpty').hidden=false;$('.videoWrap').classList.add('idle');updateHands({landmarks:[]});
}
async function startCamera(){
 if(cameraBusy)return false;cameraBusy=true;cameraBtn.disabled=true;const request=++cameraRequest;let opened=null;
 try{
 pauseRecognition();loopId++;if(rafId!==null)cancelAnimationFrame(rafId);latestDetection=null;lastVideoTime=-1;lastSampleAt=0;lastCompletedAt=0;bufferTimes=[];observationClock.reset();
 if(stream)stream.getTracks().forEach(t=>t.stop());stream=null;
 opened=await navigator.mediaDevices.getUserMedia({video:{facingMode:facing},audio:false});
 if(request!==cameraRequest){opened.getTracks().forEach(t=>t.stop());return false}
 stream=opened;camera.srcObject=stream;await camera.play();if(request!==cameraRequest||!stream)return false;cameraBtn.disabled=false;$('#cameraEmpty').hidden=true;$('.videoWrap').classList.remove('idle');fitCamera();$('.videoWrap').classList.toggle('rear',facing==='environment');
 cameraBtn.textContent='⏹ Cámara OFF';cameraStatus.textContent='🟢 Cámara activa';flipBtn.disabled=false;$('#handsStatus').textContent='Preparando detección…';
 await vision();if(request!==cameraRequest||!stream)return false;
 const id=++loopId;rafId=requestAnimationFrame(()=>loop(id));return true;
 }catch(e){opened?.getTracks().forEach(t=>t.stop());stopCamera();confEl.textContent='No se pudo iniciar la cámara o el detector. Revisa permisos y conexión.';return false}
 finally{cameraBusy=false;cameraBtn.disabled=false}
}
cameraBtn.onclick=()=>stream?stopCamera():startCamera();
flipBtn.onclick=async()=>{if(!stream||cameraBusy)return;cancelCapture();facing=facing==='user'?'environment':'user';await startCamera()};
let previousVideoAspect=null;
function fitCamera(){if(camera.videoWidth&&camera.videoHeight){const aspect=camera.videoWidth/camera.videoHeight;if(previousVideoAspect&&Math.abs(aspect-previousVideoAspect)>.001){visualTracking.clear();liveBuffer=[];bufferTimes=[];signGate.interrupt();cancelCapture()}previousVideoAspect=aspect;$('.videoWrap').style.aspectRatio=camera.videoWidth+'/'+camera.videoHeight}}
camera.addEventListener('resize',fitCamera);
function showRecognition(out,match={},hands=null){
 resultEl.classList.toggle('empty',!templates.length);
 if(!trainingReady){resultEl.textContent=trainingLoadError?'No se pudieron cargar Mis señas':'Cargando Mis señas…';confEl.textContent=trainingLoadError;return}
 if(!templates.length){resultEl.textContent=personalSamples.length?'Tus señas están desactivadas':'Aún no tienes señas entrenadas.';confEl.textContent=personalSamples.length?'Actívalas desde Mis señas.':'Agrega una desde Mis señas.';return}
 resultEl.textContent=hands===false?'No se detectan manos':out.kind==='confirmed'?out.label:out.kind==='uncertain'?'No estoy seguro':'Esperando seña…';
 confEl.textContent=out.kind==='uncertain'?'Confianza experimental: insuficiente.':out.kind==='confirmed'?'Confianza experimental: alta · seña estable.':hands===false?'Sin seña confirmada.':'Confianza experimental: esperando confirmación.';
 if(out.speak)speakSign(out.label);
}
function renderDiagnostic(){
 if(!diagnosticEnabled)return;const x=lastDiagnostic,m=x.match||{};
 const rows=[['Candidato',m.best?.label||'—'],['DTW',Number.isFinite(m.best?.d)?m.best.d.toFixed(4):'—'],['Segundo',m.second?m.second.label+' · '+m.second.d.toFixed(4):'—'],['Diferencia',Number.isFinite(m.margin)?m.margin.toFixed(4):m.best?'Solo una seña comparable':'—'],['Confianza experimental',x.kind==='confirmed'?'alta · estable':m.kind==='candidate'?'coincidencia pendiente de estabilidad':'insuficiente'],['Frames válidos',String(liveBuffer.length)+' / mínimo 8'],['Manos detectadas',String(latestDetection?.result.landmarks?.length||0)],['Duración de secuencia',bufferTimes.length>1?((bufferTimes.at(-1)-bufferTimes[0])/1000).toFixed(2)+' s':'0 s'],['Estado',x.reason||'Reconocimiento detenido'],['Estabilidad',signGate.count+' / '+LIMITS.stableFrames+' observaciones; mínimo '+LIMITS.stableMs+' ms activos'],['Inferencia',x.inferenceMs?x.inferenceMs.toFixed(0)+' ms':'—'],['Video',camera.videoWidth?camera.videoWidth+' × '+camera.videoHeight:'—'],['Muestras',personalSamples.length+' personales · '+templates.length+' activas'],['Formato',templates.filter(t=>t.aspectRatio).length+' muestras con proporción conocida; las anteriores usan modo compatible'],['Origen','Solo Mis señas'],['Canales de reconocimiento','Manos; rostro/cuerpo no intervienen']];
 const list=$('#diagnosticValues');list.replaceChildren();for(const [key,value] of rows){const dt=document.createElement('dt'),dd=document.createElement('dd');dt.textContent=key;dd.textContent=value;list.append(dt,dd)}
}
$('#toggleDiagnostics').onclick=()=>{diagnosticEnabled=!diagnosticEnabled;$('#toggleDiagnostics').setAttribute('aria-checked',String(diagnosticEnabled));$('#toggleDiagnostics').textContent=diagnosticEnabled?'ON':'OFF';$('#diagnosticValues').hidden=!diagnosticEnabled;renderDiagnostic()};

function pauseRecognition(){recognizing=false;liveBuffer=[];bufferTimes=[];lastDiagnostic={reason:'Reconocimiento detenido'};renderDiagnostic();signGate.interrupt();window.speechSynthesis?.cancel();$('#startRecognition').textContent='🤟 Iniciar reconocimiento';showRecognition({kind:'waiting'})}
$('#startRecognition').onclick=()=>{
 if(capturing||cameraBusy)return;if(!templates.length){showRecognition({kind:'waiting'});return}if(recognizing){pauseRecognition();return}
 if(!stream||!videoHands){confEl.textContent='Primero activa la cámara y espera el detector.';return}
 recognizing=true;liveBuffer=[];bufferTimes=[];signGate.interrupt();$('#startRecognition').textContent='⏹ Parar reconocimiento';showRecognition({kind:'waiting'});
};
function loop(id){
 if(!stream||id!==loopId)return;
 try{
 const now=performance.now();
 if(lastCompletedAt&&now-lastCompletedAt>LIMITS.maxGapMs){visualTracking.clear();liveBuffer=[];bufferTimes=[];latestDetection=null;signGate.interrupt();updateHands({landmarks:[]});lastDiagnostic={reason:'Interrupción de fotogramas; esperando una secuencia nueva'};renderDiagnostic();if(recognizing)showRecognition({kind:'waiting'})}
 if(now-lastSampleAt>=100&&camera.readyState>=2&&camera.currentTime!==lastVideoTime){
 lastSampleAt=now;lastVideoTime=camera.currentTime;
 const result=videoHands.detectForVideo(camera,now),completed=performance.now();
 const clock=observationClock.observe(now,completed);lastCompletedAt=completed;
 if(clock.interrupted){liveBuffer=[];bufferTimes=[];signGate.interrupt()}
 latestDetection={result,time:completed};
 visualTracking.process(camera,now,{enabled:overlayEnabled&&!capturing,handMs:completed-now});updateHands(result);
 if(recognizing){const f=feature(result);let match={kind:'waiting',reason:'Reuniendo fotogramas válidos (mínimo 8)'};
 if(!f){liveBuffer=[];bufferTimes=[];match.reason='No se detectan manos'}else{liveBuffer.push(f);bufferTimes.push(now);if(liveBuffer.length>120){liveBuffer.shift();bufferTimes.shift()}match=matchWindow(liveBuffer,bufferTimes,templates,camera.videoWidth/camera.videoHeight)}
 const out=signGate.step({now:clock.time,hands:!!f,pose:f,match});
 lastDiagnostic={match,kind:out.kind,inferenceMs:completed-now,reason:!f?'No se detectan manos':out.speak?'Seña confirmada':out.kind==='confirmed'?'Confirmada; voz ya emitida':signGate.latched?'Voz bloqueada hasta retirar o cambiar la mano':match.kind==='candidate'?'Pendiente de estabilidad':match.reason};
 if(out.clearBuffer){liveBuffer=[];bufferTimes=[];lastDiagnostic.reason='Cambio de manos; reuniendo una nueva secuencia'}showRecognition(out,match,!!f);
 }else lastDiagnostic={reason:'Reconocimiento detenido',inferenceMs:completed-now};
 renderDiagnostic();lastCompletedAt=performance.now();observationClock.finish(lastCompletedAt);
 }
 }catch(e){stopCamera();confEl.textContent='El seguimiento se detuvo. Vuelve a activar la cámara.';return}
 rafId=requestAnimationFrame(()=>loop(id));
}

const SR=window.SpeechRecognition||window.webkitSpeechRecognition;let rec=null,listening=false,wantListening=false,listenRestart=null;const listenBtn=$("#toggleListening"),listenStatus=$("#listeningStatus");
function setListeningUI(on){listening=on;listenBtn.textContent=on?"⏹️ Desactivar escucha":"🎙️ Activar escucha";listenStatus.textContent=on?"🟢 Escucha activa":"⚫ Escucha desactivada"}
const subtitlePanel=$("#subtitles"), subtitleHistory=$("#subtitleHistory"), subtitleInterim=$("#subtitleInterim");
let hasSubtitleHistory=false;
const subtitleSegments=[];
let restoringTranscript=false;
function persistTranscript(){if(restoringTranscript)return;try{localStorage.setItem('conectalsch-current-transcript-v1',JSON.stringify(subtitleSegments))}catch{$('#noteStatus').textContent='No se pudo conservar el borrador. Guarda una nota antes de cerrar.'}}
function appendSubtitle(text,at=new Date().toISOString()){text=text.trim();if(!text)return;subtitleSegments.push({text,at});persistTranscript();if(!hasSubtitleHistory){subtitleHistory.innerHTML="";hasSubtitleHistory=true}const line=document.createElement("span");line.className="subtitleLine";line.textContent=text;subtitleHistory.appendChild(line);subtitlePanel.scrollTop=subtitlePanel.scrollHeight}
function showSubtitleMessage(text){if(!hasSubtitleHistory)subtitleHistory.innerHTML=`<span class="subtitlePlaceholder">${text}</span>`}
if(SR){rec=new SR();rec.lang='es-CL';rec.continuous=true;rec.interimResults=true;
 rec.onstart=()=>{if(!wantListening){try{rec.stop()}catch{}return}setListeningUI(true)};
 rec.onresult=e=>{if(!wantListening)return;let interim='';for(let i=e.resultIndex;i<e.results.length;i++){const text=e.results[i][0].transcript;if(e.results[i].isFinal)appendSubtitle(text);else interim+=text}subtitleInterim.textContent=interim;subtitlePanel.scrollTop=subtitlePanel.scrollHeight};
 rec.onend=()=>{subtitleInterim.textContent='';clearTimeout(listenRestart);if(wantListening){listenRestart=setTimeout(()=>{if(wantListening)try{rec.start()}catch{stopListening()}},400)}else setListeningUI(false)};
 rec.onerror=e=>{if(['not-allowed','service-not-allowed','audio-capture','network','language-not-supported'].includes(e.error)){stopListening();listenStatus.textContent=e.error==='network'?'Error de conexión de voz':'Micrófono o servicio de voz no disponible';showSubtitleMessage('No se pudo iniciar la escucha. Revisa permisos y conexión.')}};
}
listenBtn.onclick=()=>{if(!rec){showSubtitleMessage('Reconocimiento de voz no disponible');return}if(wantListening){stopListening()}else{wantListening=true;listenBtn.textContent='⏹ Detener escucha';try{rec.start()}catch{stopListening()}}};

$("#clearSubtitles").onclick=()=>{hasSubtitleHistory=false;subtitleSegments.length=0;persistTranscript();$("#noteStatus").textContent="Subtítulos limpiados. Tus notas se conservan.";subtitleHistory.innerHTML='<span class="subtitlePlaceholder">Esperando voz…</span>';subtitleInterim.textContent="";subtitlePanel.scrollTop=0};
$("#speakReply").onclick=()=>{speechSynthesis.cancel();let u=new SpeechSynthesisUtterance($("#replyText").value);u.lang="es-CL";speechSynthesis.speak(u)};



// Personal samples use a separate key so original and legacy templates are preserved.
let personalSamples=[],captureId=0,capturing=false,trainingReady=false,savingSamples=false;
const trainingStatus=$('#trainingStatus'),recordBtn=$('#recordSample');
function refreshDictionary(){
 templates=personalSamples.filter(t=>signSettings[t.label]?.enabled!==false).map(t=>({...t,label:signSettings[t.label]?.alias||t.label}));
 const counts=new Map();for(const t of personalSamples)counts.set(t.label,(counts.get(t.label)||0)+1);
 const list=$('#signDictionary');list.replaceChildren();
 for(const [label,count] of [...counts].sort((a,b)=>a[0].localeCompare(b[0],'es'))){const li=document.createElement('li'),button=document.createElement('button'),small=document.createElement('span');button.textContent=signSettings[label]?.alias||label;small.textContent=count+(count===1?' ejemplo':' ejemplos')+(signSettings[label]?.enabled===false?' · personales OFF':'');button.append(small);button.onclick=()=>{$('#signName').value=label;$('#trainingDetails').open=true;$('#signName').focus()};li.append(button);list.append(li)}
 refreshManager();
 renderDiagnostic();
 $('#startRecognition').disabled=!templates.length;
 status.textContent=`Mis señas: ${counts.size} señas · ${templates.length} ejemplos activos. Sin dataset precargado.`;
 if(!recognizing)showRecognition({kind:'waiting'});
}
async function initTraining(){
 try{const restored=await loadSamples();personalSamples=restored.samples;
 trainingStatus.textContent=restored.warning||(personalSamples.length?'Tus muestras están guardadas. Listo para agregar ejemplos.':'Aún no tienes ejemplos. Graba tu primera seña.');
 trainingReady=true;refreshDictionary();recordBtn.disabled=false;
 }catch(e){trainingLoadError=e.message;trainingStatus.textContent=e.message;recordBtn.disabled=true;showRecognition({kind:'waiting'})}
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
 if(capturing||savingSamples||startingRecognition||cameraBusy||!trainingReady)return;
 const label=$('#signName').value.trim().normalize('NFC').toLocaleUpperCase('es-CL');
 if(!label||label.length>60){trainingStatus.textContent='Escribe un nombre de hasta 60 caracteres.';return}
 selectTab('signs');if(!stream&&!await startCamera())return;
 pauseRecognition();
 $('#startRecognition').disabled=true;capturing=true;recordBtn.disabled=true;$('#captureFeedback').hidden=false;const id=++captureId;
 try{
 if(!videoHands)await vision();
 for(let n=3;n>0;n--){if(id!==captureId)return;trainingStatus.textContent=`Prepárate: ${n}…`;await new Promise(r=>setTimeout(r,1000))}
 if(id!==captureId)return;
 const seq=[];const aspectRatio=camera.videoWidth/camera.videoHeight;if(!Number.isFinite(aspectRatio)||aspectRatio<=0)throw Error('La cámara aún no informa su tamaño. Vuelve a activarla e inténtalo de nuevo.');let previous=-1;const started=performance.now();
 await new Promise((resolve,reject)=>{
 function frame(){try{
 if(id!==captureId||!stream){resolve();return}
 const now=performance.now();trainingStatus.textContent=`Haz ${label}: ${Math.max(1,Math.ceil((3000-now+started)/1000))} segundos…`;
 if(latestDetection&&latestDetection.time!==previous&&now-latestDetection.time<350){previous=latestDetection.time;const f=feature(latestDetection.result);if(f)seq.push({feature:f,time:latestDetection.time,hands:latestDetection.result.landmarks})}
 if(now-started>=3000){resolve();return}requestAnimationFrame(frame);
 }catch(e){reject(e)}}requestAnimationFrame(frame);
 });
 if(id!==captureId)return;
 if(seq.length<8)throw Error('No se vieron las manos el tiempo suficiente. Repite con las manos completas dentro de la cámara.');
 const stored=await savePersonal([...personalSamples,recordedSample(label,seq,aspectRatio)]);
 navigator.storage?.persist?.().catch(()=>{});
 trainingStatus.textContent=`Ejemplo de ${label} guardado. ${stored.warning} Repite la seña para agregar otro o inicia el reconocimiento para probarla.`;
 }catch(e){if(id===captureId)trainingStatus.textContent=`No se guardó: ${e.message}`}
 finally{if(id===captureId){capturing=false;recordBtn.disabled=false;$('#startRecognition').disabled=!templates.length}}
};
$('#exportSamples').onclick=()=>{if(!trainingReady){trainingStatus.textContent='Espera a que se carguen tus ejemplos antes de descargar el respaldo.';return}downloadJson({format:'conectalsch-personal',version:2,schemaVersion:2,samples:personalSamples,settings:signSettings},'ConectaLSCh-mis-senas.json')};
$('#importSamples').onclick=()=>{if(capturing||savingSamples||!trainingReady){trainingStatus.textContent='Espera a que termine la preparación o grabación.';return}$('#samplesFile').click()};
$('#samplesFile').onchange=async e=>{
 const file=e.target.files[0];if(!file)return;
 try{
 if(capturing||savingSamples||!trainingReady)throw Error('Espera a que termine la grabación.');
 if(file.size>200000000)throw Error('El archivo supera los 200 MB.');
 const data=JSON.parse(await file.text());
 if(data.format!=='conectalsch-personal'||![1,2].includes(data.version)||(data.version===2&&data.schemaVersion!==2)||!validSamples(data.samples))throw Error('El archivo no es un respaldo compatible.');
 const unique=new Map(personalSamples.map(t=>[JSON.stringify(t),t]));
 for(const t of data.samples){const normalized={...t,label:t.label.trim().normalize('NFC').toLocaleUpperCase('es-CL')};unique.set(JSON.stringify(normalized),normalized)}
 const added=unique.size-personalSamples.length;const stored=await savePersonal([...unique.values()]);
 if(data.settings&&validSettings(data.settings)){try{await putSignSettings({...data.settings,...signSettings});signSettings={...data.settings,...signSettings};refreshDictionary()}catch{trainingStatus.textContent='Ejemplos guardados; no se pudieron importar sus ajustes.';return}}
 trainingStatus.textContent=`Respaldo importado: ${added} ejemplos nuevos. Tus ejemplos anteriores se conservaron. ${stored.warning}`;
 }catch(e){trainingStatus.textContent=`No se importó: ${e.message}`}finally{e.target.value=''}
};


// Personal data is the only recognition source. Never read the retired original caches.
Promise.allSettled([initTraining(),loadSignSettings()]).then(()=>{refreshDictionary()});
document.addEventListener("visibilitychange",()=>{if(document.hidden){stopCamera();stopListening()}});

function stopListening(){wantListening=false;clearTimeout(listenRestart);listening=false;try{rec?.stop()}catch{}setListeningUI(false)}
const tabs=['signs','listen','samples','notes'];
function selectTab(name){if(!tabs.includes(name))return;if(activeTab==='signs'&&name!=='signs')stopCamera();if(activeTab==='listen'&&name!=='listen')stopListening();activeTab=name;for(const id of tabs){$('#panel-'+id).hidden=id!==name;const button=$('#tab-'+id);button.setAttribute('aria-selected',String(id===name));button.tabIndex=id===name?0:-1}if(name==='notes')notes.refresh();window.scrollTo(0,0)}
for(const name of tabs)$('#tab-'+name).onclick=()=>selectTab(name);
$('.main-nav').onkeydown=e=>{let i=tabs.indexOf(document.activeElement.id?.replace('tab-',''));if(i<0)return;if(e.key==='ArrowRight')i=(i+1)%4;else if(e.key==='ArrowLeft')i=(i+3)%4;else if(e.key==='Home')i=0;else if(e.key==='End')i=3;else return;e.preventDefault();selectTab(tabs[i]);$('#tab-'+tabs[i]).focus()};
$('#trainShortcut').onclick=()=>{selectTab('samples');$('#trainingDetails').open=true;$('#signName').focus()};
new MutationObserver(()=>{$('#captureFeedback').textContent=trainingStatus.textContent}).observe(trainingStatus,{childList:true,subtree:true,characterData:true});
const notes=initNotes(()=>({text:subtitleSegments.map(s=>s.text).join('\n'),segments:subtitleSegments}));
function validSettings(values){return values&&typeof values==='object'&&!Array.isArray(values)&&Object.entries(values).every(([key,value])=>key.length>0&&key.length<=60&&value&&typeof value.enabled==='boolean'&&typeof value.alias==='string'&&value.alias.trim().length>0&&value.alias.length<=60)}
async function loadSignSettings(){try{const values=await getSignSettings();if(!validSettings(values))throw Error();signSettings=values;settingsReady=true;refreshDictionary()}catch{$('#settingsStatus').textContent='No se pudieron cargar los ajustes. Tus ejemplos siguen conservados.'}}
function refreshManager(){
 const select=$('#manageSign'),previous=select.value;select.replaceChildren();for(const label of [...new Set(personalSamples.map(t=>t.label))].sort()){const option=document.createElement('option');option.value=label;option.textContent=label;select.append(option)}if([...select.options].some(o=>o.value===previous))select.value=previous;
 $('#saveSignSettings').disabled=!personalSamples.length||!settingsReady;$('#deleteSign').disabled=!personalSamples.length||!trainingReady;showSettings();
}
function showSettings(){const label=$('#manageSign').value;$('#signAlias').value=signSettings[label]?.alias||label;$('#signEnabled').checked=signSettings[label]?.enabled!==false;$('#signAlias').disabled=false}
$('#manageSign').onchange=showSettings;
$('#saveSignSettings').onclick=async()=>{
 const label=$('#manageSign').value;if(!label||!settingsReady)return;
 const alias=($('#signAlias').disabled?label:$('#signAlias').value.trim().normalize('NFC').toLocaleUpperCase('es-CL'));if(!alias||alias.length>60){$('#settingsStatus').textContent='Escribe un nombre de hasta 60 caracteres.';return}
 if(alias!==label&&personalSamples.some(t=>t.label!==label&&(signSettings[t.label]?.alias||t.label)===alias)){$('#settingsStatus').textContent='Ese nombre ya pertenece a otra seña.';return}
 const next={...signSettings,[label]:{alias,enabled:$('#signEnabled').checked}};
 try{await putSignSettings(next);signSettings=next;pauseRecognition();refreshDictionary();$('#settingsStatus').textContent='Ajustes guardados. No se eliminó ningún ejemplo.'}catch{$('#settingsStatus').textContent='No se pudieron guardar los ajustes.'}
};
$('#deleteSign').onclick=async()=>{
 const label=$('#manageSign').value;if(!label||!trainingReady||savingSamples||capturing)return;
 const count=personalSamples.filter(t=>t.label===label).length;
 if(!confirm('¿Eliminar los '+count+' ejemplos personales de '+label+'? Descarga un respaldo si quieres recuperarlos después.'))return;
 savingSamples=true;$('#deleteSign').disabled=true;
 try{personalSamples=await removePersonalLabel(label);pauseRecognition();refreshDictionary();$('#settingsStatus').textContent='Ejemplos personales eliminados de ambas copias.'}catch(e){$('#settingsStatus').textContent=e.message}finally{savingSamples=false;refreshManager()}
};
// Preserve confirmed transcript across an explicit PWA update; notes live in IndexedDB.
try{const pending=sessionStorage.getItem('conectalsch-update-transcript'),draft=pending||localStorage.getItem('conectalsch-current-transcript-v1');if(draft){const value=JSON.parse(draft);if(Array.isArray(value)&&value.every(s=>typeof s.text==='string')){restoringTranscript=true;for(const segment of value)appendSubtitle(segment.text,segment.at);restoringTranscript=false;persistTranscript();if(pending)sessionStorage.removeItem('conectalsch-update-transcript')}}}catch{restoringTranscript=false}

if('serviceWorker' in navigator){
 let registration=null,updating=false;
 navigator.serviceWorker.register('./sw.js',{updateViaCache:'none'}).then(r=>{registration=r;const pending=()=>{if(r.waiting)$('#updateNotice').hidden=false};pending();r.addEventListener('updatefound',()=>{const worker=r.installing;worker?.addEventListener('statechange',()=>{if(worker.state==='installed')pending()})});r.update().catch(()=>{})}).catch(()=>{});
 $('#applyUpdate').onclick=()=>{if(!registration?.waiting)return;if(capturing||savingSamples||notes.isSaving()){$('#updateNotice span').textContent='Termina de grabar o guardar antes de actualizar.';return}try{sessionStorage.setItem('conectalsch-update-transcript',JSON.stringify(subtitleSegments))}catch{$('#noteStatus').textContent='Guarda una nota antes de cerrar y actualizar.';selectTab('listen');return}stopCamera();stopListening();updating=true;registration.waiting.postMessage({type:'ACTIVATE_UPDATE'})};
 navigator.serviceWorker.addEventListener('controllerchange',()=>{if(updating)location.reload()});
}

$('#toggleVisual').onclick=async()=>{const button=$('#toggleVisual');if(visualTracking.enabled){visualTracking.disable();button.setAttribute('aria-checked','false');button.textContent='OFF'}else{button.disabled=true;$('#visualStatus').textContent='Cargando seguimiento opcional…';await visualTracking.enable();button.disabled=false;button.setAttribute('aria-checked',String(visualTracking.enabled));button.textContent=visualTracking.enabled?'ON':'OFF'}updateHands(latestDetection?.result||{landmarks:[]})};
