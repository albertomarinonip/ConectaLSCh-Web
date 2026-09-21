// Version-independent storage, compatible with v1.1. Never delete legacy samples.
export const PERSONAL_KEY='conectalsch-personal-v1';
const DB_NAME='conectalsch-personal', STORE='samples';
export function validSamples(value){
 return Array.isArray(value)&&value.length<=500&&value.every(t=>t&&typeof t.label==='string'&&t.label.trim().length>0&&t.label.length<=60&&
 Array.isArray(t.seq)&&t.seq.length===9&&t.seq.every(f=>Array.isArray(f)&&f.length===126&&f.every(Number.isFinite)));
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
 if(!validSamples(samples))throw Error('Se permiten hasta 500 ejemplos válidos.');
 let stored=false,mirror=false;
 try{await accessDB('readwrite',samples);stored=true}catch{}
 try{localStorage.setItem(PERSONAL_KEY,JSON.stringify(samples));mirror=true}catch{}
 if(!stored&&!mirror)throw Error('El navegador no permitió guardar. Libera espacio y conserva un respaldo.');
 return {warning:stored?'':'Guardado en este navegador; la copia adicional no está disponible.'};
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
 if(!validSamples(samples))throw Error('Tus respaldos combinados superan el límite. Exporta antes de continuar.');
 let warning='';
 if(samples.length){try{({warning}=await saveSamples(samples))}catch(e){warning=e.message}}
 return {samples,warning};
}
