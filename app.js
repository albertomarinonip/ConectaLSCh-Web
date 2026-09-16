const $=s=>document.querySelector(s);
const captions=$('#captions'),statusEl=$('#status'),listen=$('#listen'),reply=$('#reply'),speak=$('#speak'),test=$('#test'),diag=$('#diag');
const SR=window.SpeechRecognition||window.webkitSpeechRecognition; let rec,listening=false,finalText="";
if(SR){rec=new SR();rec.lang='es-CL';rec.continuous=true;rec.interimResults=true;
rec.onresult=e=>{let interim="";for(let i=e.resultIndex;i<e.results.length;i++){let t=e.results[i][0].transcript.trim();if(e.results[i].isFinal){if(t&&!finalText.endsWith(t))finalText+=(finalText?" ":"")+t}else interim=t}captions.textContent=(finalText+(interim?" "+interim:"")).trim()||"…"};
rec.onend=()=>{if(listening)setTimeout(()=>{try{rec.start()}catch(e){}},250);else{statusEl.textContent="Listo";listen.textContent="🎙️ Escuchar"}};
rec.onerror=e=>statusEl.textContent="Micrófono: "+e.error;}
else statusEl.textContent="Reconocimiento de voz no disponible.";
listen.onclick=()=>{if(!rec)return;if(!listening){listening=true;finalText="";statusEl.textContent="Escuchando…";listen.textContent="⏹️ Detener";try{rec.start()}catch(e){}}else{listening=false;try{rec.stop()}catch(e){}}};

function voices(){return ('speechSynthesis'in window)?speechSynthesis.getVoices():[]}
function refreshDiag(extra=""){let vs=voices(),es=vs.filter(v=>v.lang&&v.lang.toLowerCase().startsWith("es"));
diag.textContent=`speechSynthesis: ${'speechSynthesis'in window?'SÍ':'NO'}\nVoces totales: ${vs.length}\nVoces español: ${es.length}\n${es.slice(0,5).map(v=>v.name+" ("+v.lang+")").join("\\n")}${extra? "\\n"+extra:""}`;}
if('speechSynthesis'in window){speechSynthesis.getVoices();speechSynthesis.onvoiceschanged=()=>refreshDiag()} refreshDiag();

function say(text){if(!('speechSynthesis'in window)){refreshDiag("ERROR: API no disponible");return}
let vs=voices(),v=vs.find(x=>x.lang?.toLowerCase()==='es-cl')||vs.find(x=>x.lang?.toLowerCase().startsWith('es'))||null;
speechSynthesis.cancel();let u=new SpeechSynthesisUtterance(text);u.lang=v?.lang||'es-CL';if(v)u.voice=v;u.rate=.9;u.volume=1;
u.onstart=()=>refreshDiag("ESTADO: hablando");
u.onend=()=>refreshDiag("ESTADO: terminó correctamente");
u.onerror=e=>refreshDiag("ERROR voz: "+(e.error||"desconocido"));
speechSynthesis.speak(u);
setTimeout(()=>{if(speechSynthesis.paused)speechSynthesis.resume();refreshDiag(`pending=${speechSynthesis.pending}, speaking=${speechSynthesis.speaking}, paused=${speechSynthesis.paused}`)},300);
}
speak.onclick=()=>{let t=reply.value.trim();if(!t){refreshDiag("Escribe un mensaje primero.");return}say(t)};
test.onclick=()=>say("Hola Alberto. Esta es una prueba de voz de SeñaLink.");
if('serviceWorker'in navigator)navigator.serviceWorker.register('./sw.js');
