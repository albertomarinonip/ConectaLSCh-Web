import {feature} from './recognition-math.js';
import {ObservationClock} from './recognition-clock.js';
import {isDynamicTemplate} from './temporal-sequence.js';
import {MotionEventSegmenter} from './motion-event.js';
import {visionContext,handModel} from './visual-provider.js';
import {VisualTracking,drawVisualTracking} from './visual-tracking.js';
import { SignGate, LIMITS } from "./recognition-state.js";
import { validSamples, loadSamples, saveSamples, removePersonalLabel } from "./sample-store.js";
import {observation,drawHands} from './hand-overlay.js';
import {visualDescriptor} from './multimodal.js';
import {getSignSettings,putSignSettings} from './content-store.js';
import {HandIdentityTracker} from './hand-tracker.js';
import {multimodalFrame,recordedMultimodalSample,trainingDataset,sequenceQuality} from './multimodal-frame.js';
import {matchPersonalWindow} from './temporal-multimodal.js';
import {collectCapture,checkCapture} from './capture-session.js';
const $=s=>document.querySelector(s), camera=$("#camera"), resultEl=$("#signResult"), confEl=$("#confidence"), status=$("#modelStatus");
let stream=null,facing="user",videoHands=null,templates=[],recognizing=false,liveBuffer=[],liveLandmarksBuffer=[],lastVideoTime=-1;
function hasSignTemplates(){return templates.some(t=>t.metadata?.captureMode!=='background')}
const motionEvent=new MotionEventSegmenter();
const handTracker=new HandIdentityTracker();
let liveObservations=[];
let signVoiceEnabled=true;
const signTranscript=[];
const observationClock=new ObservationClock();
let lastCompletedAt=0,bufferTimes=[],diagnosticEnabled=false,lastDiagnostic={},lastAttempt=null;
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
 cameraRequest++;visualTracking.clear();cancelCapture();visualTracking.clear();pauseRecognition();loopId++;if(rafId!==null)cancelAnimationFrame(rafId);rafId=null;latestDetection=null;lastVideoTime=-1;lastSampleAt=0;lastCompletedAt=0;bufferTimes=[];liveLandmarksBuffer=[];liveObservations=[];observationClock.reset();handTracker.reset();
 if(stream){stream.getTracks().forEach(t=>t.stop());stream=null}camera.srcObject=null;
 cameraBtn.textContent='📷 Cámara ON';cameraStatus.textContent='⚫ Cámara desactivada';flipBtn.disabled=true;$('#cameraEmpty').hidden=false;$('.videoWrap').classList.add('idle');updateHands({landmarks:[]});
}
async function startCamera(){
 if(cameraBusy)return false;cameraBusy=true;cameraBtn.disabled=true;const request=++cameraRequest;let opened=null;
 try{
 pauseRecognition();loopId++;if(rafId!==null)cancelAnimationFrame(rafId);latestDetection=null;lastVideoTime=-1;lastSampleAt=0;lastCompletedAt=0;bufferTimes=[];liveLandmarksBuffer=[];liveObservations=[];observationClock.reset();handTracker.reset();
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
function fitCamera(){if(camera.videoWidth&&camera.videoHeight){const aspect=camera.videoWidth/camera.videoHeight;if(previousVideoAspect&&Math.abs(aspect-previousVideoAspect)>.001){visualTracking.clear();handTracker.reset();liveBuffer=[];bufferTimes=[];liveLandmarksBuffer=[];liveObservations=[];signGate.interrupt();cancelCapture()}previousVideoAspect=aspect;$('.videoWrap').style.aspectRatio=camera.videoWidth+'/'+camera.videoHeight}}
camera.addEventListener('resize',fitCamera);
function renderSignTranscript(){
 if(!signTranscript.length){resultEl.textContent='Esperando seña…';return}
 resultEl.replaceChildren();for(const label of signTranscript){const line=document.createElement('div');line.className='signTranscriptLine';line.textContent=label;resultEl.appendChild(line)}
 resultEl.scrollTop=resultEl.scrollHeight;
}
function appendRecognizedSign(label){if(!label)return;signTranscript.push(label);renderSignTranscript()}
$('#clearSigns').onclick=()=>{signTranscript.length=0;renderSignTranscript();confEl.textContent='Transcripción de señas limpia.'};
function showRecognition(out,match={},hands=null){
 resultEl.classList.toggle('empty',!hasSignTemplates());
 if(!trainingReady){resultEl.textContent=trainingLoadError?'No se pudieron cargar Mis señas':'Cargando Mis señas…';confEl.textContent=trainingLoadError;return}
 if(!hasSignTemplates()){resultEl.textContent=personalSamples.length?'Tus señas están desactivadas':'Aún no tienes señas entrenadas.';confEl.textContent=personalSamples.length?'Actívalas desde Mis señas.':'Agrega una desde Mis señas.';return}
 if(out.speak){appendRecognizedSign(out.label);speakSign(out.label)}else if(!signTranscript.length)renderSignTranscript();
 // Detection uncertainty belongs in the small status only; never overwrite a
 // confirmed transcription with 'No estoy seguro' or 'No se detectan manos'.
 confEl.textContent=out.kind==='confirmed'?'Seña reconocida.':hands===false?'Esperando la siguiente seña.':out.kind==='uncertain'?(match.reason||'No estoy seguro; repite la seña.'):'Reconociendo…';
}
function renderDiagnostic(){
 if(!diagnosticEnabled)return;const x=lastDiagnostic,m=x.match||{};
 const rows=[['Último intento',lastAttempt?lastAttempt.reason:'Todavía no hay un intento completo'],['Última comparación',lastAttempt?.match?.best?lastAttempt.match.best.label+' · '+lastAttempt.match.best.d.toFixed(4)+' · '+(lastAttempt.match.best.voteCount??0)+' coincidencias':'—'],['Candidato',m.best?.label||'—'],['Distancia total',Number.isFinite(m.best?.d)?m.best.d.toFixed(4):'—'],['Forma',Number.isFinite(m.best?.shapeD)?m.best.shapeD.toFixed(4):'—'],['Movimiento',Number.isFinite(m.best?.motionD)?m.best.motionD.toFixed(4):'—'],['Trayectoria',Number.isFinite(m.best?.pathD)?m.best.pathD.toFixed(4):'—'],['Cinemática mano',Number.isFinite(m.best?.kineticD)?m.best.kineticD.toFixed(4):'—'],['Límite personal trayectoria',Number.isFinite(m.best?.envelope?.path)?m.best.envelope.path.toFixed(4):'—'],['Recorrido en vivo',Number.isFinite(m.best?.liveMotion)?m.best.liveMotion.toFixed(3):'—'],['Recorrido mínimo',Number.isFinite(m.best?.requiredMotion)?m.best.requiredMotion.toFixed(3):'—'],['Segundo',m.second?m.second.label+' · '+m.second.d.toFixed(4):'—'],['Diferencia',Number.isFinite(m.margin)?m.margin.toFixed(4):m.best?'Solo una seña comparable':'—'],['Resultado experimental',x.kind==='confirmed'?'secuencia aceptada':m.kind==='candidate'?'coincidencia pendiente de estabilidad':'insuficiente'],['Frames válidos',String(liveBuffer.length)+' / mínimo 8'],['Manos detectadas',String(latestDetection?.result.landmarks?.length||0)],['Duración de secuencia',bufferTimes.length>1?((bufferTimes.at(-1)-bufferTimes[0])/1000).toFixed(2)+' s':'0 s'],['Estado',x.reason||'Reconocimiento detenido'],['Movimiento en vivo',motionEvent.state+' · actividad '+motionEvent.lastActivity.toFixed(3)],['Estabilidad',signGate.count+' / '+LIMITS.stableFrames+' observaciones; mínimo '+LIMITS.stableMs+' ms activos'],['Inferencia manos',x.inferenceMs?x.inferenceMs.toFixed(0)+' ms':'—'],['Video',camera.videoWidth?camera.videoWidth+' × '+camera.videoHeight:'—'],['Muestras',personalSamples.length+' personales · '+templates.length+' activas'],['Formato',templates.filter(t=>t.aspectRatio).length+' muestras con proporción conocida; las anteriores usan modo compatible'],['Origen','Solo Mis señas'],['Canales de reconocimiento','Muestras nuevas: identidad de manos, movimiento de articulaciones, posición relativa a rostro/cuerpo y expresiones disponibles']];
 const list=$('#diagnosticValues');list.replaceChildren();for(const [key,value] of rows){const dt=document.createElement('dt'),dd=document.createElement('dd');dt.textContent=key;dd.textContent=value;list.append(dt,dd)}
}
$('#toggleDiagnostics').onclick=()=>{diagnosticEnabled=!diagnosticEnabled;$('#toggleDiagnostics').setAttribute('aria-checked',String(diagnosticEnabled));$('#toggleDiagnostics').textContent=diagnosticEnabled?'ON':'OFF';$('#diagnosticValues').hidden=!diagnosticEnabled;renderDiagnostic()};

function pauseRecognition(){recognizing=false;liveBuffer=[];bufferTimes=[];liveLandmarksBuffer=[];liveObservations=[];motionEvent.reset();lastDiagnostic={reason:'Reconocimiento detenido'};renderDiagnostic();signGate.interrupt();window.speechSynthesis?.cancel();$('#startRecognition').textContent='🤟 Iniciar reconocimiento';showRecognition({kind:'waiting'})}
$('#startRecognition').onclick=()=>{
 if(capturing||cameraBusy)return;if(!hasSignTemplates()){showRecognition({kind:'waiting'});return}if(recognizing){pauseRecognition();return}
 if(!stream||!videoHands){confEl.textContent='Primero activa la cámara y espera el detector.';return}
 if(!visualTracking.enabled)visualTracking.enable().then(()=>{syncVisualButton();updateHands(latestDetection?.result||{landmarks:[]})});
 recognizing=true;lastAttempt=null;liveBuffer=[];bufferTimes=[];liveLandmarksBuffer=[];liveObservations=[];motionEvent.reset();signGate.interrupt();$('#startRecognition').textContent='⏹ Parar reconocimiento';showRecognition({kind:'waiting'});
};
function loop(id){
 if(!stream||id!==loopId)return;
 try{
 const now=performance.now();
 if(lastCompletedAt&&now-lastCompletedAt>LIMITS.maxGapMs){visualTracking.clear();handTracker.reset();liveBuffer=[];bufferTimes=[];liveLandmarksBuffer=[];liveObservations=[];motionEvent.reset();latestDetection=null;signGate.interrupt();updateHands({landmarks:[]});lastDiagnostic={reason:'Interrupción de fotogramas; esperando una secuencia nueva'};renderDiagnostic();if(recognizing)showRecognition({kind:'waiting'})}
 if(now-lastSampleAt>=50&&camera.readyState>=2&&camera.currentTime!==lastVideoTime){
 lastSampleAt=now;lastVideoTime=camera.currentTime;
 const result=videoHands.detectForVideo(camera,now),completed=performance.now();
 const clock=observationClock.observe(now,completed);lastCompletedAt=completed;
 if(clock.interrupted){liveBuffer=[];bufferTimes=[];liveLandmarksBuffer=[];liveObservations=[];signGate.interrupt()}
 visualTracking.process(camera,now,{enabled:visualTracking.enabled&&(overlayEnabled||recognizing||capturing),handMs:completed-now});
 const tracked=handTracker.update(result,now),snapshot=visualTracking.snapshot(now);
 const observed=multimodalFrame(tracked,snapshot,now,camera.videoWidth/camera.videoHeight),currentFeature=feature(result);
 latestDetection={result,time:now,multimodal:observed,feature:currentFeature};updateHands(result);
 if(recognizing){const f=currentFeature;let match={kind:'waiting',reason:'Esperando el inicio de una seña'};
 const aspect=camera.videoWidth/camera.videoHeight;
 const liveVisual=visualDescriptor(visualTracking.snapshot(performance.now()));
 const event=motionEvent.push({feature:f,hands:result.landmarks,time:now,aspectRatio:aspect,visual:liveVisual,multimodal:observed});
 if(!f){liveBuffer=[];bufferTimes=[];liveLandmarksBuffer=[];liveObservations=[];match.reason='No se detectan manos'}else{
   liveBuffer.push(f);bufferTimes.push(now);liveObservations.push(observed);liveLandmarksBuffer.push(result.landmarks.map(h=>h.map(p=>({x:p.x,y:p.y,z:p.z}))));if(liveBuffer.length>60){liveBuffer.shift();bufferTimes.shift();liveLandmarksBuffer.shift();liveObservations.shift()}
   // Static signs may still use a stable hold. Dynamic signs are classified only
   // when their complete movement event ends, preventing held-pose false positives.
   const staticTemplates=templates.filter(t=>!isDynamicTemplate(t,aspect));
   if(staticTemplates.length)match=matchPersonalWindow(liveBuffer,bufferTimes,staticTemplates,aspect,liveLandmarksBuffer,{observations:liveObservations});
   if(event.state==='MOVING')match={kind:'waiting',reason:'Detectando movimiento…'};
 }
 if(event.completed){
   const ef=event.completed.frames.map(x=>x.feature),et=event.completed.frames.map(x=>x.time),el=event.completed.frames.map(x=>x.hands);
   const dynamicTemplates=templates.filter(t=>isDynamicTemplate(t,aspect)||t.metadata?.captureMode==='background');
   const ev=event.completed.frames.map(x=>x.visual||null);
   match=dynamicTemplates.length?matchPersonalWindow(ef,et,dynamicTemplates,aspect,el,{eventComplete:true,visualFrames:ev,observations:event.completed.frames.map(x=>x.multimodal)}):match;
   liveBuffer=[];bufferTimes=[];liveLandmarksBuffer=[];liveObservations=[];
 }
 if(event.completed)match.eventId=event.completed.id;
 if(event.aborted)match={kind:'uncertain',reason:event.aborted};
 const out=signGate.step({now:clock.time,hands:!!f,pose:f,match});
 lastDiagnostic={match,kind:out.kind,inferenceMs:completed-now,reason:!f?'No se detectan manos':out.speak?'Seña confirmada':out.kind==='confirmed'?'Confirmada; voz ya emitida':signGate.latched?'Voz bloqueada hasta retirar o cambiar la mano':match.kind==='candidate'?'Pendiente de estabilidad':match.reason};
 if(event.completed||event.aborted)lastAttempt={...lastDiagnostic};
 if(out.clearBuffer){liveBuffer=[];bufferTimes=[];liveLandmarksBuffer=[];liveObservations=[];lastDiagnostic.reason='Cambio de manos; reuniendo una nueva secuencia'}showRecognition(out,match,!!f);
 }else lastDiagnostic={reason:'Reconocimiento detenido',inferenceMs:completed-now};
 renderDiagnostic();lastCompletedAt=performance.now();observationClock.finish(lastCompletedAt);
 }
 }catch(e){console.error('ConectaLSCh: fallo de seguimiento',e);stopCamera();confEl.textContent='El seguimiento se detuvo. Vuelve a activar la cámara.';return}
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
 $('#startRecognition').disabled=!hasSignTemplates();
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
 $('#startRecognition').disabled=!hasSignTemplates();
 trainingStatus.textContent='Grabación cancelada. No se guardó el ejemplo.';
}
let pendingSample=null;
async function prepareTrainingCamera(){
 if(!stream&&!await startCamera())return false;
 const preview=$('#trainingCamera');preview.srcObject=stream;try{await preview.play()}catch{}
 $('#trainingCapture').hidden=false;return true;
}
function setCaptureStage(text,kind=''){const el=$('#captureStage');el.textContent=text;el.dataset.kind=kind}
function trainingMonitor({hands=0,activity=0,face=false,pose=false,frames=0,continuity=0,qualityScore=0,state='READY',quality='' }={}){
 const mh=$('#monitorHands'),mm=$('#monitorMotion'),mf=$('#monitorFace'),mfr=$('#monitorFrames'),mq=$('#monitorQuality');
 if(mh)mh.textContent=hands?`🖐️ Manos: ${hands} detectada${hands===1?'':'s'}`:'🖐️ Manos: no detectadas';
 if(mm)mm.textContent=`➜ Movimiento: ${state==='MOVING'?'activo':activity>=.04?'iniciando':'esperando'} · ${activity.toFixed(3)}`;
 if(mf)mf.textContent=`🙂 Rostro: ${face?'detectado (apoyo)':'no disponible'}`;
 const mp=$('#monitorPose'),mc=$('#monitorContinuity'),ms=$('#monitorScore');
 if(mp)mp.textContent=`🧍 Brazos/pose: ${pose?'detectados (apoyo)':'no disponibles'}`;
 if(mc)mc.textContent=`🔗 Continuidad manos: ${Math.round(continuity*100)}%`;
 if(ms)ms.textContent=`🎯 Calidad captura: ${Math.round(qualityScore)} / 100`;
 if(mfr)mfr.textContent=`🎞️ Frames: ${frames}`;
 if(mq)mq.textContent=quality||'La captura se guardará solo si las manos y el movimiento tienen calidad suficiente.';
}
function drawTrainingOverlay(result){
 const canvas=$('#trainingOverlay'),video=$('#trainingCamera');if(!canvas||!video?.videoWidth)return;
 canvas.width=video.videoWidth;canvas.height=video.videoHeight;
 const channels=observation({...result,landmarks:(result?.landmarks||[])},performance.now());Object.assign(channels,visualTracking.snapshot(performance.now()));
 drawHands(canvas,video,channels,true);drawVisualTracking(canvas,channels);
}
async function capturePersonalExample(label){
 if(!await prepareTrainingCamera())return;
 const metadata={extractorVersion:'mediapipe-0.10.22-rc.20250304/separate-v2',captureMode:$('#captureMode').value,signerId:$('#signerId').value.trim(),sessionId:$('#sessionId').value.trim(),variant:$('#signVariant').value.trim()||'principal',requiredChannels:[$('#requireFace').checked?'face':null,$('#requirePose').checked?'pose':null].filter(Boolean)};
 if(!metadata.signerId||!metadata.sessionId){trainingStatus.textContent='Completa el código de persona y sesión para guardar ejemplos.';return}
 pauseRecognition();$('#startRecognition').disabled=true;capturing=true;recordBtn.disabled=true;$('#captureReview').hidden=true;pendingSample=null;const id=++captureId;
 try{
  if(!videoHands)await vision();
  if(!visualTracking.enabled)await visualTracking.enable();syncVisualButton();
  trainingMonitor();
  for(let n=3;n>0;n--){if(id!==captureId)return;setCaptureStage(String(n),'countdown');trainingStatus.textContent=`Prepárate: ${n}… manos, hombros y rostro visibles.`;await new Promise(r=>setTimeout(r,1000))}
  if(id!==captureId)return;
  setCaptureStage(metadata.captureMode==='static'?'MANTÉN LA POSTURA':metadata.captureMode==='background'?'MOVIMIENTO SIN SEÑA':'HAZ LA SEÑA COMPLETA','recording');
  const aspectRatio=camera.videoWidth/camera.videoHeight;
  const frames=await collectCapture({mode:metadata.captureMode,getObservation:()=>latestDetection,isCancelled:()=>id!==captureId||!stream,
   onFrame:({latest,frames,activity,state,progress})=>{
    drawTrainingOverlay(latest.result);$('#captureProgress').style.width=progress+'%';
    const q=sequenceQuality(frames.map(f=>f.multimodal));
    trainingMonitor({hands:latest.result.landmarks.length,activity,face:!!latest.multimodal.face,pose:!!latest.multimodal.pose,frames:frames.length,continuity:q.handCoverage,state,quality:'Capturando la secuencia…'});
    $('#monitorScore').textContent='Identidad manos: '+Math.round(q.identityCoverage*100)+'%';
   }});
  if(id!==captureId||!frames)return;
  const quality=checkCapture(frames,metadata.captureMode,metadata.requiredChannels);
  pendingSample=recordedMultimodalSample(label,frames,aspectRatio,metadata);
  setCaptureStage('✓ LISTA PARA REVISAR','done');
  trainingStatus.textContent=`Captura de ${label}: ${frames.length} fotogramas. Guarda al menos dos ejemplos de cada variante y mano.`;
  trainingMonitor({hands:frames.at(-1).hands.length,frames:frames.length,face:quality.faceCoverage>=.8,pose:quality.poseCoverage>=.8,continuity:quality.handCoverage,state:'COMPLETE',quality:'La captura pasó el control de seguimiento. Aún no mide precisión de reconocimiento.'});
  $('#monitorScore').textContent='Identidad manos: '+Math.round(quality.identityCoverage*100)+'%';$('#captureReview').hidden=false;
 }catch(e){if(id===captureId){setCaptureStage('Repite la captura','error');trainingStatus.textContent=`No se guardó: ${e.message}`;trainingMonitor({quality:e.message})}}
 finally{if(id===captureId){capturing=false;recordBtn.disabled=false;$('#startRecognition').disabled=!hasSignTemplates()}}
}
recordBtn.onclick=async()=>{
 if(capturing||savingSamples||startingRecognition||cameraBusy||!trainingReady)return;
 const label=$('#signName').value.trim().normalize('NFC').toLocaleUpperCase('es-CL');
 if(!label||label.length>60){trainingStatus.textContent='Escribe un nombre de hasta 60 caracteres.';return}
 await capturePersonalExample(label);
};
$('#saveCapture').onclick=async()=>{if(!pendingSample||savingSamples)return;try{const label=pendingSample.label;const stored=await savePersonal([...personalSamples,pendingSample]);pendingSample=null;$('#captureReview').hidden=true;navigator.storage?.persist?.().catch(()=>{});trainingStatus.textContent=`Ejemplo de ${label} guardado. ${stored.warning} Agrega otro ejemplo natural para mejorar el reconocimiento.`;setCaptureStage('✓ GUARDADO','done')}catch(e){trainingStatus.textContent=`No se guardó: ${e.message}`}};
$('#repeatCapture').onclick=async()=>{if(!pendingSample||capturing)return;const label=pendingSample.label;pendingSample=null;$('#captureReview').hidden=true;await capturePersonalExample(label)};
$('#exportSamples').onclick=()=>{if(!trainingReady){trainingStatus.textContent='Espera a que se carguen tus ejemplos antes de descargar el respaldo.';return}downloadJson({format:'conectalsch-personal',version:3,schemaVersion:3,samples:personalSamples,settings:signSettings},'ConectaLSCh-mis-senas.json')};
$('#exportDataset').onclick=()=>{if(!trainingReady)return;const data=trainingDataset(personalSamples);if(!data.samples.length){trainingStatus.textContent='Graba ejemplos nuevos para exportar los datos multimodales.';return}downloadJson(data,'ConectaLSCh-dataset-v1.json');trainingStatus.textContent=`Datos exportados: ${data.samples.length} capturas nuevas; ${data.excludedLegacy} antiguas quedan en el respaldo compatible.`};
$('#importSamples').onclick=()=>{if(capturing||savingSamples||!trainingReady){trainingStatus.textContent='Espera a que termine la preparación o grabación.';return}$('#samplesFile').click()};
$('#samplesFile').onchange=async e=>{
 const file=e.target.files[0];if(!file)return;
 try{
 if(capturing||savingSamples||!trainingReady)throw Error('Espera a que termine la grabación.');
 if(file.size>200000000)throw Error('El archivo supera los 200 MB.');
 const data=JSON.parse(await file.text());
 if(data.format!=='conectalsch-personal'||![1,2,3].includes(data.version)||(data.version>=2&&data.schemaVersion!==data.version)||!validSamples(data.samples))throw Error('El archivo no es un respaldo compatible.');
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
const tabs=['signs','listen','samples'];
function selectTab(name){if(!tabs.includes(name))return;if(activeTab==='signs'&&name!=='signs')stopCamera();if(activeTab==='listen'&&name!=='listen')stopListening();activeTab=name;for(const id of tabs){$('#panel-'+id).hidden=id!==name;const button=$('#tab-'+id);button.setAttribute('aria-selected',String(id===name));button.tabIndex=id===name?0:-1}window.scrollTo(0,0)}
for(const name of tabs)$('#tab-'+name).onclick=()=>selectTab(name);
$('.main-nav').onkeydown=e=>{let i=tabs.indexOf(document.activeElement.id?.replace('tab-',''));if(i<0)return;if(e.key==='ArrowRight')i=(i+1)%tabs.length;else if(e.key==='ArrowLeft')i=(i+tabs.length-1)%tabs.length;else if(e.key==='Home')i=0;else if(e.key==='End')i=tabs.length-1;else return;e.preventDefault();selectTab(tabs[i]);$('#tab-'+tabs[i]).focus()};
$('#trainShortcut').onclick=()=>{selectTab('samples');$('#trainingDetails').open=true;$('#signName').focus()};
new MutationObserver(()=>{$('#captureFeedback').textContent=trainingStatus.textContent}).observe(trainingStatus,{childList:true,subtree:true,characterData:true});
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
 $('#applyUpdate').onclick=()=>{if(!registration?.waiting)return;if(capturing||savingSamples){$('#updateNotice span').textContent='Termina de grabar o guardar antes de actualizar.';return}try{sessionStorage.setItem('conectalsch-update-transcript',JSON.stringify(subtitleSegments))}catch{}stopCamera();stopListening();updating=true;registration.waiting.postMessage({type:'ACTIVATE_UPDATE'})};
 navigator.serviceWorker.addEventListener('controllerchange',()=>{if(updating)location.reload()});
}

function syncVisualButton(){const b=$('#toggleVisual');b.setAttribute('aria-checked',String(visualTracking.enabled));b.textContent=visualTracking.enabled?'ON':'OFF'}
$('#toggleVisual').onclick=async()=>{const button=$('#toggleVisual');if(visualTracking.enabled){visualTracking.disable();button.setAttribute('aria-checked','false');button.textContent='OFF'}else{button.disabled=true;$('#visualStatus').textContent='Cargando seguimiento opcional…';await visualTracking.enable();button.disabled=false;button.setAttribute('aria-checked',String(visualTracking.enabled));button.textContent=visualTracking.enabled?'ON':'OFF'}updateHands(latestDetection?.result||{landmarks:[]})};

try{let id=localStorage.getItem('conectalsch-signer-id');if(!id){id='P-'+crypto.randomUUID().slice(0,8);localStorage.setItem('conectalsch-signer-id',id)}$('#signerId').value=id}catch{$('#signerId').value='P-001'}
$('#sessionId').value=new Date().toISOString().slice(0,10)+'-sesion1';
