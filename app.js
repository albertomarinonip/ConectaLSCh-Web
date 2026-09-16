const $=s=>document.querySelector(s);

// CAMERA
const video=$('#camera'), cameraBtn=$('#cameraBtn'), flipBtn=$('#flipBtn');
const cameraStatus=$('#cameraStatus'), cameraBox=document.querySelector('.cameraBox');
let stream=null, facing='user';

async function startCamera(){
  try{
    if(stream) stream.getTracks().forEach(t=>t.stop());
    stream=await navigator.mediaDevices.getUserMedia({
      video:{facingMode:facing,width:{ideal:1280},height:{ideal:720}}, audio:false
    });
    video.srcObject=stream;
    await video.play();
    cameraBox.classList.add('active');
    cameraStatus.textContent='Cámara activa · '+(facing==='user'?'frontal':'trasera');
    cameraBtn.textContent='⏹️ Cerrar cámara';
    flipBtn.disabled=false;
  }catch(e){
    cameraStatus.textContent='No se pudo abrir la cámara: '+(e.name||'permiso');
  }
}
function stopCamera(){
  if(stream) stream.getTracks().forEach(t=>t.stop());
  stream=null; video.srcObject=null; cameraBox.classList.remove('active');
  cameraStatus.textContent='Cámara detenida'; cameraBtn.textContent='📷 Abrir cámara'; flipBtn.disabled=true;
}
cameraBtn.onclick=()=>stream?stopCamera():startCamera();
flipBtn.onclick=async()=>{facing=facing==='user'?'environment':'user';await startCamera()};

// SPEECH TO TEXT
const captions=$('#captions'), statusEl=$('#status'), listen=$('#listen');
const SR=window.SpeechRecognition||window.webkitSpeechRecognition;
let rec=null,listening=false,finalText="";
if(SR){
  rec=new SR();rec.lang='es-CL';rec.continuous=true;rec.interimResults=true;
  rec.onresult=e=>{
    let interim="";
    for(let i=e.resultIndex;i<e.results.length;i++){
      const t=e.results[i][0].transcript.trim();
      if(e.results[i].isFinal){
        if(t && !finalText.endsWith(t)) finalText+=(finalText?" ":"")+t;
      } else interim=t;
    }
    captions.textContent=(finalText+(interim?" "+interim:"")).trim()||"La conversación aparecerá aquí…";
  };
  rec.onerror=e=>statusEl.textContent='Micrófono: '+e.error;
  rec.onend=()=>{if(listening)setTimeout(()=>{try{rec.start()}catch(e){}},250);else{statusEl.textContent='Listo';listen.textContent='🎙️ Escuchar'}};
}else statusEl.textContent='Reconocimiento de voz no disponible.';
listen.onclick=()=>{
  if(!rec)return;
  if(!listening){listening=true;finalText="";statusEl.textContent='Escuchando…';listen.textContent='⏹️ Detener';try{rec.start()}catch(e){}}
  else{listening=false;try{rec.stop()}catch(e){}}
};

// TEXT TO SPEECH
const reply=$('#reply'), speak=$('#speak');
function spanishVoice(){
  const vs=speechSynthesis.getVoices();
  return vs.find(v=>v.lang?.toLowerCase()==='es-cl')||
         vs.find(v=>v.lang?.toLowerCase().startsWith('es'))||null;
}
if('speechSynthesis' in window) speechSynthesis.getVoices();
speak.onclick=()=>{
  const text=reply.value.trim(); if(!text)return;
  if(!('speechSynthesis' in window))return;
  speechSynthesis.cancel();
  const u=new SpeechSynthesisUtterance(text),v=spanishVoice();
  u.lang=v?.lang||'es-CL';if(v)u.voice=v;u.rate=.92;u.volume=1;
  u.onstart=()=>speak.textContent='🔊 Hablando…';
  u.onend=()=>speak.textContent='🔊 Hablar';
  u.onerror=()=>speak.textContent='🔊 Hablar';
  speechSynthesis.speak(u);
};

if('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js');
