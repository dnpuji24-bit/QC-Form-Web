/* Generated build config replaces the following marker. */
/* BUILD_CONFIG */

self.addEventListener('install',event=>{
 event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(APP_SHELL)).then(()=>self.skipWaiting()))
})
self.addEventListener('activate',event=>{
 event.waitUntil((async()=>{
  // Preserve one prior app-shell version for tabs still using old chunks.
  const old=(await caches.keys()).filter(key=>key.startsWith('qc-react-')&&key!==CACHE)
  await Promise.all(old.slice(0,Math.max(0,old.length-1)).map(key=>caches.delete(key)))
  await self.clients.claim()
 })())
})
const shellPaths=new Set(APP_SHELL)
async function navigation(request){
 // Do not replace a cached build's index with HTML from a different deployment.
 // The next installed service worker will cache that deployment atomically.
 const controller=new AbortController()
 const timeout=setTimeout(()=>controller.abort(),5000)
 try{
  const response=await fetch(request,{cache:'no-store',signal:controller.signal})
  if(response.ok)return response
  const cached=await (await caches.open(CACHE)).match('/react/')
  return cached||response
 }catch{
  const cached=await (await caches.open(CACHE)).match('/react/')
  if(cached)return cached
  return new Response('Aplikasi belum disiapkan untuk offline. Buka saat internet tersedia.',{status:503,headers:{'Content-Type':'text/plain; charset=utf-8'}})
 }finally{clearTimeout(timeout)}
}
self.addEventListener('fetch',event=>{
 const request=event.request
 if(request.method!=='GET')return
 const url=new URL(request.url)
 if(url.origin!==self.location.origin||!url.pathname.startsWith('/react/'))return
 if(request.mode==='navigate'){event.respondWith(navigation(request));return}
 // Cache only emitted, static build files. Never cache API/profile/photo responses.
 if(shellPaths.has(url.pathname)&&url.pathname!=='/react/'){
  event.respondWith((async()=>{
   const cache=await caches.open(CACHE)
   return await cache.match(url.pathname)||fetch(request)
  })())
  return
 }
 if(url.pathname.startsWith('/react/assets/')){
  event.respondWith(fetch(request).catch(async()=>{
   const cached=await caches.match(request)
   if(cached)return cached
   return new Response('',{status:503})
  }))
 }
})
