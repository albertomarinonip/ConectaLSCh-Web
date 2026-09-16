const captions=document.querySelector('#captions'),statusEl=document.querySelector('#status'),listen=document.querySelector('#listen'),reply=document.querySelector('#reply'),speak=document.querySelector('#speak');
const SR=window.SpeechRecognition||window.webkitSpeechRecognition;
let rec=null,listening=false;
if(SR){
 rec=new SR(); rec.lang='es-CL'; rec.continuous=true; rec.interimResults=true;
 rec.onresult=e=>{let t='';for(let i=e.resultIndex;i<e.results.length;i++)t+=e.results[i][0].transcript;captions.textContent=t||captions.textContent};
 rec.onerror=e=>{statusEl.textContent='Reconocimiento de voz: '+e.error};
 rec.onend=()=>{if(listening){try{rec.start()}catch(_){}}else{statusEl.textContent='Listo';listen.textContent='🎙️ Escuchar'}};
}else{statusEl.textContent='Este navegador no ofrece reconocimiento de voz web compatible.'}
listen.onclick=()=>{if(!rec)return;if(!listening){listening=true;statusEl.textContent='Escuchando…';listen.textContent='⏹️ Detener';try{rec.start()}catch(_){}}else{listening=false;rec.stop()}};
speak.onclick=()=>{const text=reply.value.trim();if(!text)return;speechSynthesis.cancel();const u=new SpeechSynthesisUtterance(text);u.lang='es-CL';speechSynthesis.speak(u)};
if('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js');
