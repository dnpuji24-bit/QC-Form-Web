// Fixture I/O only. No network, Firebase or production storage.
const photos=new Map(),listeners=new Set()
let waiting=null,release=null
const user={uid:'uat-fertilizer',getIdToken:async()=> 'fixture-only'}
export const firebaseAuth={
 currentUser:user,
 onAuthStateChanged(fn){listeners.add(fn);queueMicrotask(()=>{if(listeners.has(fn))fn(firebaseAuth.currentUser)});return()=>listeners.delete(fn)}
}
export const qcLocalUat=true
export const photoSignEndpoint='http://127.0.0.1:4786/unused'
export const operationalPhotoOrigin='http://127.0.0.1:4786'
export const operationalPhotoBucket='qc-photos-uat-mock'
export function localUatPhotoKey(uid,recordId,photoId){return [uid,recordId,photoId].join('/')}
export async function localUatPhotos(){return {match:async key=>{if(waiting)await waiting;const item=photos.get(key);if(!item)return undefined;return new Response(Uint8Array.from(atob(item.base64),c=>c.charCodeAt(0)),{headers:{'Content-Type':item.type}})}}}
export function setPhotos(recordId,items){photos.clear();for(const [photoId,item] of Object.entries(items))photos.set(localUatPhotoKey(user.uid,recordId,photoId),item)}
export function pause(){waiting=new Promise(r=>{release=r})}
export function resume(){const r=release;waiting=null;release=null;r?.()}
export function setSession(active){firebaseAuth.currentUser=active?user:null;for(const fn of listeners)fn(firebaseAuth.currentUser)}
