// Increment this version whenever the application shell changes.
const VERSION='1.2.1-cloud';
const PREFIX=`freshleaf-shell:${self.registration.scope}:`;
const CACHE=PREFIX+VERSION;
const ASSETS=['./','index.html','styles.css','manifest.webmanifest','js/app.js','js/store.js','js/repository.js','js/commands.js','js/cloud-repository.js','js/cloud-config.js','js/icons.js','js/images.js','js/pwa.js','assets/favicon.svg','assets/icon-192.png','assets/icon-512.png','assets/icon-maskable-512.png'];
const shellURLs=new Set(ASSETS.map(path=>new URL(path,self.registration.scope).href));
self.addEventListener('install',event=>{
  event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(ASSETS)));
});
self.addEventListener('activate',event=>{
  event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith(PREFIX)&&key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim()));
});
self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET')return;
  const url=new URL(event.request.url),scope=new URL(self.registration.scope);
  if(url.origin!==scope.origin||!url.pathname.startsWith(scope.pathname))return;
  const isEntry=event.request.mode==='navigate'&&(url.pathname===scope.pathname||url.pathname===scope.pathname+'index.html');
  if(!isEntry&&!shellURLs.has(url.href))return;
  event.respondWith(caches.open(CACHE).then(async cache=>{
    const response=await cache.match(isEntry?new URL('index.html',scope).href:event.request);
    return response||fetch(event.request);
  }));
});
