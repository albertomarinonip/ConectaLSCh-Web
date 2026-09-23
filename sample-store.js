// Version-independent storage, compatible with v1.1. Never delete legacy samples.
export const PERSONAL_KEY='conectalsch-personal-v1';
const DB_NAME='conectalsch-personal', STORE='samples';
function validHand(h){return Array.isArray(h)&&h.length===21&&h.every(p=>p&&[p.x,p.y,p.z].every(Number.isFinite))}
export function validSamples(value){
 return Array.isArray(value)&&value.every(t=>{
 if(!t||typeof t.label!=='string'||!t.label.trim()||t.label.length>60)return false;
 if(t.aspectRatio!==undefined&&(!Number.isFinite(t.aspectRatio)||t.aspectRatio<.1||t.aspectRatio>10))return false;
 if(!Array.isArray(t.seq)||!t.seq.every(f=>Array.isArray(f)&&f.length===126&&f.every(Number.isFinite)))return false;
 if(t.sampleVersion===undefined||t.sampleVersion===1)return t.seq.length===9;
 const temporal=(t.sampleVersion===2&&t.featureVersion==='hands-relative-v1')||(t.sampleVersion===3&&['hands-visual-v1','hands-motion-visual-v1'].includes(t.featureVersion));
 // Faster devices can capture more than 40 valid frames. Recognition resamples later.
 if(!temporal||t.seq.length<8||t.seq.length>180)return false;
 const core=Array.isArray(t.timestamps)&&t.timestamps.length===t.seq.length&&t.timestamps[0]===0&&t.timestamps.every((v,i)=>Number.isFinite(v)&&v>=0&&v<=15000&&(!i||v>t.timestamps[i-1]))&&
 Array.isArray(t.landmarks)&&t.landmarks.length===t.seq.length&&t.landmarks.every(hands=>Array.isArray(hands)&&hands.length>=1&&hands.length<=2&&hands.every(validHand));
 if(!core)return false;if(t.sampleVersion===2)return true;
 return Array.isArray(t.visual)&&t.visual.length===t.seq.length;
 });
}
function openDB(){return new Promise((resolve,reject)=>{
 const request=indexedDB.open(DB_NAME,1);
 request.onupgradeneeded=()=>{if(!request.result.objectStoreNames.contains(STORE))request.result.createObjectStore(STORE)};
 request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);
 request.onblocked=()=>reject(Error('Cierra otras pestañas de ConectaLSCh e inténtalo de nuevo.'));
})}
async function accessDB(mode,value){
 const db=await openDB();
 try{return await new Promise((resolve,reject)=>{
 const tx=db.transaction(STORE,mode),store=tx.objectStore(STORE);
 const req=mode==='readonly'?store.get(PERSONAL_KEY):store.put(value,PERSONAL_KEY);
 tx.oncomplete=()=>resolve(req.result);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||Error('Guardado cancelado'));
 })}finally{db.close()}
}
export async function saveSamples(samples){
 if(!validSamples(samples))throw Error('Uno de los ejemplos tiene datos de captura inválidos. Repite solo esa captura; tus ejemplos guardados no se borraron.');
 let stored=false,mirror=false;
 try{await accessDB('readwrite',samples);stored=true}catch{}
 try{localStorage.setItem(PERSONAL_KEY,JSON.stringify(samples));mirror=true}catch{}
 if(!stored&&!mirror)throw Error('El navegador no permitió guardar. Libera espacio y conserva un respaldo.');
 return {warning:stored&&mirror?'':stored?'Guardado en IndexedDB; el respaldo local está lleno o no disponible. Exporta un JSON.':'Guardado en este navegador; la copia adicional no está disponible.'};
}
export async function loadSamples(){
 let dbValue,localValue,dbError=false,localError=false;
 try{dbValue=await accessDB('readonly');if(dbValue!==undefined&&!validSamples(dbValue))throw Error('Datos inválidos')}catch{dbError=true;dbValue=undefined}
 try{const raw=localStorage.getItem(PERSONAL_KEY);if(raw!==null){localValue=JSON.parse(raw);if(!validSamples(localValue))throw Error('Datos inválidos')}}catch{localError=true;localValue=undefined}
 if(dbValue===undefined&&localValue===undefined&&(dbError||localError))throw Error('No se pudieron leer tus muestras. No se sobrescribieron los datos.');
 // Merge without duplicating samples mirrored across the two stores. Preserve repeated
 // examples within an existing collection; they may be intentional training captures.
 const samples=dbValue?[...dbValue]:localValue?[...localValue]:[];
 if(dbValue&&localValue){const keys=new Set(samples.map(t=>JSON.stringify(t)));for(const t of localValue){const key=JSON.stringify(t);if(!keys.has(key)){samples.push(t);keys.add(key)}}}
 if(!validSamples(samples))throw Error('Hay un ejemplo incompatible o dañado en el almacenamiento. Tus datos no se sobrescribieron.');
 let warning='';
 if(samples.length){try{({warning}=await saveSamples(samples))}catch(e){warning=e.message}}
 return {samples,warning};
}

// Explicit deletion must update both old mirrors or fail, otherwise loadSamples()
// would merge an old local backup and resurrect a deleted example on next launch.
export async function removePersonalLabel(label){
 const {samples}=await loadSamples();
 const next=samples.filter(t=>t.label!==label),previous=localStorage.getItem(PERSONAL_KEY);
 try{localStorage.setItem(PERSONAL_KEY,JSON.stringify(next))}catch{throw Error('No se eliminó: no se pudo actualizar el respaldo local.')}
 try{await accessDB('readwrite',next)}catch{
 try{if(previous===null)localStorage.removeItem(PERSONAL_KEY);else localStorage.setItem(PERSONAL_KEY,previous)}catch{}
 throw Error('No se completó la eliminación en IndexedDB. Tus ejemplos siguen en la base; vuelve a cargar e inténtalo de nuevo.');
 }
 return next;
}
