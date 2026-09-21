const CACHE='conectalsch-v111-'+encodeURIComponent(self.registration.scope);
const CORE=['./','./index.html','./style.css','./app.js','./recognition-state.js','./sample-store.js','./training-data.js','./manifest.webmanifest','./icon.svg'];
const urls=new Set(CORE.map(path=>new URL(path,self.registration.scope).href));
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(CORE))));
// Finish existing sessions before activating a complete new version.
self.addEventListener('activate',event=>event.waitUntil(self.clients.claim()));
self.addEventListener('fetch',event=>{
 if(event.request.method!=='GET')return;
 const url=new URL(event.request.url);url.search='';
 if(!urls.has(url.href))return;
 event.respondWith(caches.open(CACHE).then(async cache=>(await cache.match(url.href))||fetch(event.request)));
});
