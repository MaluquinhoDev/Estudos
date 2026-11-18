const PREFIX="estudos-ava-",VERSION="v6",CACHE=PREFIX+VERSION;
const SHELL=["./","./index.html","./styles.css","./app.js","./powersync.js","./manifest.webmanifest","./icons/icon.svg"];
self.addEventListener("install",e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(SHELL))));
self.addEventListener("activate",e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith(PREFIX)&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener("message",e=>{if(e.data?.type==="SKIP_WAITING")self.skipWaiting()});
self.addEventListener("fetch",e=>{const r=e.request,u=new URL(r.url);if(r.method!=="GET"||u.origin!==self.location.origin)return;if(r.mode==="navigate"){e.respondWith(fetch(r).then(res=>{if(res.ok){const copy=res.clone();caches.open(CACHE).then(c=>c.put("./index.html",copy))}return res}).catch(async()=>await caches.match("./index.html")||Response.error()));return}e.respondWith(caches.match(r).then(hit=>hit||fetch(r).then(res=>{if(res.ok&&res.type==="basic"){const copy=res.clone();caches.open(CACHE).then(c=>c.put(r,copy))}return res})))});
