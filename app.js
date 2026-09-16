const captions=document.querySelector('#captions');
const statusEl=document.querySelector('#status');
const listen=document.querySelector('#listen');
const reply=document.querySelector('#reply');
const speak=document.querySelector('#speak');
const voiceStatus=document.querySelector('#voiceStatus');

const SR=window.SpeechRecognition||window.webkitSpeechRecognition;
let rec=null,listening=false,finalText="";

if(SR){
  rec=new SR(); rec.lang='es-CL'; rec.continuous=true; rec.interimResults=true;
  rec.onresult=e=>{
    let interim="";
    for(let i=e.resultIndex;i<e.results.length;i++){
      const text=e.results[i][0].transcript.trim();
      if(e.results[i].isFinal){
        if(text && !finalText.endsWith(text)) finalText+=(finalText?" ":"")+text;
      } else interim=text;
    }
    captions.textContent=(finalText+(interim?" "+interim:"")).trim()||"La conversación aparecerá aquí…";
  };
  rec.onerror=e=>{statusEl.textContent='Micrófono: '+e.error};
  rec.onend=()=>{
    if(listening){setTimeout(()=>{try{rec.start()}catch(_){}},250)}
    else{statusEl.textContent='Listo';listen.textContent='🎙️ Escuchar'}
  };
}else statusEl.textContent='Reconocimiento de voz no disponible en este navegador.';

listen.onclick=()=>{
  if(!rec)return;
  if(!listening){
    listening=true; finalText="";
    captions.textContent="Escuchando…"; statusEl.textContent='Escuchando…';
    listen.textContent='⏹️ Detener';
    try{rec.start()}catch(_){}
  }else{
    listening=false; statusEl.textContent='Deteniendo…';
    try{rec.stop()}catch(_){}
  }
};

function spanishVoice(){
  const voices=speechSynthesis.getVoices();
  return voices.find(v=>v.lang.toLowerCase()==='es-cl')
      || voices.find(v=>v.lang.toLowerCase().startsWith('es-'))
      || voices.find(v=>v.lang.toLowerCase().startsWith('es'))
      || null;
}
speechSynthesis.getVoices();
if('onvoiceschanged' in speechSynthesis) speechSynthesis.onvoiceschanged=()=>speechSynthesis.getVoices();

speak.onclick=()=>{
  const text=reply.value.trim();
  if(!text){voiceStatus.textContent='Escribe un mensaje primero.';return;}
  if(!('speechSynthesis' in window)){voiceStatus.textContent='Voz no disponible en este navegador.';return;}
  speechSynthesis.cancel();
  const u=new SpeechSynthesisUtterance(text);
  u.lang='es-CL'; const v=spanishVoice(); if(v)u.voice=v;
  u.rate=0.92; u.pitch=1; u.volume=1;
  u.onstart=()=>{voiceStatus.textContent='🔊 Hablando…';speak.textContent='🔊 Hablando…'};
  u.onend=()=>{voiceStatus.textContent='Listo';speak.textContent='🔊 Hablar'};
  u.onerror=()=>{voiceStatus.textContent='No se pudo reproducir la voz.';speak.textContent='🔊 Hablar'};
  // iOS: invocation remains directly inside the user tap handler.
  speechSynthesis.speak(u);
};

if('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js');
