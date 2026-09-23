const CACHE='conectalsch-v126-personal-'+encodeURIComponent(self.registration.scope);
const CORE=['./','./index.html','./style.css','./app.js','./recognition-math.js','./recognition-clock.js','./temporal-sequence.js','./visual-provider.js','./visual-tracking.js','./recognition-state.js','./sample-store.js','./manifest.webmanifest','./icon.svg','./hand-overlay.js','./content-store.js','./notes-ui.js','./icon-192.png','./icon-512.png','./apple-touch-icon.png'];
const urls=new Set(CORE.map(path=>new URL(path,self.registration.scope).href));
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(CORE.map(path=>new Request(new URL(path,self.registration.scope),{cache:'reload'}))))));
// Finish existing sessions before activating a complete new version.
self.addEventListener('activate',event=>event.waitUntil(self.clients.claim()));
self.addEventListener('message',event=>{if(event.data?.type==='ACTIVATE_UPDATE')event.waitUntil(self.skipWaiting())});
self.addEventListener('fetch',event=>{
 if(event.request.method!=='GET')return;
 const url=new URL(event.request.url);url.search='';
 if(!urls.has(url.href))return;
 event.respondWith(caches.open(CACHE).then(async cache=>(await cache.match(url.href))||fetch(event.request)));
});
