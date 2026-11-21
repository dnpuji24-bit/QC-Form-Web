// 11D.5c.3b.2a — private Supabase UAT *server-side* photo object adapter.
// Synthetic run-scoped objects only. Never use the existing production-bound Edge Functions.
// This module creates no HTTP route and does not commit QC/Actual.
import {createHash} from 'node:crypto'
import {unifiedGuard} from './uat-unified-identity-guard.mjs'

export const unifiedPhotoOrigin='https://tcmtqgbpafwciaflgsaa.supabase.co'
export const unifiedPhotoBucket='qc-photos-uat'
export const unifiedPhotoMaxBytes=2097152
const digest=v=>createHash('sha256').update(v).digest('hex')
const need=(v,code)=>{if(!v)throw Error(code)}
const sid=v=>typeof v==='string'&&/^uat-[a-z0-9-]{1,60}$/.test(v)
const mimeExtensions=Object.freeze({'image/jpeg':'jpg','image/png':'png','image/webp':'webp'})
const objectRef=v=>v&&Object.getPrototypeOf(v)===Object.prototype
const isRunId=v=>typeof v==='string'&&/^[a-f0-9]{32}$/.test(v)

export function guardUnifiedPhotoStorage(e=process.env){
 unifiedGuard(e)
 need(e.QC_UAT_STORAGE_ORIGIN===unifiedPhotoOrigin,'PHOTO_UAT_ORIGIN_REQUIRED')
 need(e.QC_UAT_STORAGE_WRITE==='synthetic-only','PHOTO_UAT_WRITE_OPT_IN_REQUIRED')
 need(/^sb_secret_[A-Za-z0-9_-]{10,}$/.test(e.QC_UAT_STORAGE_SECRET??''),'PHOTO_UAT_SECRET_REQUIRED')
 return unifiedPhotoOrigin
}
export function unifiedPhotoPath(runId,actorUid,ref){
 need(isRunId(runId)&&sid(actorUid),'PHOTO_UAT_SCOPE_DENIED')
 need(objectRef(ref)&&ref.provider==='supabase'&&ref.bucket===unifiedPhotoBucket&&
  ref.uploaderUid===actorUid,'PHOTO_UAT_SCOPE_DENIED')
 need(typeof ref.photoId==='string'&&/^[0-9a-f]{24}_[0-9a-f]{64}$/.test(ref.photoId)&&
  typeof ref.sha256==='string'&&ref.photoId.endsWith('_'+ref.sha256),'PHOTO_UAT_HASH_SCOPE_DENIED')
 const ext=mimeExtensions[ref.contentType]
 need(!!ext&&Number.isSafeInteger(ref.size)&&ref.size>0&&ref.size<=unifiedPhotoMaxBytes,'PHOTO_UAT_FILE_DENIED')
 const expected=new RegExp('^'+actorUid+'/qc/qc-v2-uat-'+runId+'-[a-z0-9]{1,16}/'+ref.photoId+'\\.'+ext+'$')
 need(typeof ref.objectPath==='string'&&expected.test(ref.objectPath),'PHOTO_UAT_PATH_DENIED')
 return ref.objectPath
}
export function unifiedStorageAllowedUrl(input){
 const value=typeof input==='string'||input instanceof URL?input:input?.url
 const u=new URL(value)
 need(u.origin===unifiedPhotoOrigin&&u.username===''&&u.password===''&&
  u.pathname.startsWith('/storage/v1/')&&!u.hash,'PHOTO_UAT_NETWORK_DENIED')
 return u
}
export function createUnifiedPhotoSafeFetch(){
 return (input,init={})=>{
  unifiedStorageAllowedUrl(input)
  return fetch(input,{...init,redirect:'error',signal:AbortSignal.timeout(30000)})
 }
}
const api=(result,code)=>{if(result?.error||result?.data==null)throw Error(code);return result.data}
const missing=result=>result?.error&&(String(result.error.statusCode??result.error.status??'')==='404'||
 /not found/i.test(String(result.error.message??'')))
export async function createUnifiedPrivatePhotoStore({runId,actorUid,client=null,env=process.env}){
 guardUnifiedPhotoStorage(env)
 need(isRunId(runId)&&sid(actorUid),'PHOTO_UAT_SCOPE_DENIED')
 // For real execution only: SDK + secret are loaded in Node, never bundled in a browser.
 if(!client){
  const {createClient}=await import('@supabase/supabase-js')
  client=createClient(unifiedPhotoOrigin,env.QC_UAT_STORAGE_SECRET,{
   auth:{autoRefreshToken:false,persistSession:false,detectSessionInUrl:false},
   global:{fetch:createUnifiedPhotoSafeFetch()}
  })
 }
 need(client?.storage?.getBucket&&client?.storage?.from,'PHOTO_UAT_SDK_REQUIRED')
 const bucketMeta=api(await client.storage.getBucket(unifiedPhotoBucket),'PHOTO_UAT_BUCKET_UNAVAILABLE')
 need(bucketMeta.id===unifiedPhotoBucket&&bucketMeta.public===false&&
  Number(bucketMeta.file_size_limit)===unifiedPhotoMaxBytes&&
  Array.isArray(bucketMeta.allowed_mime_types)&&
  [...bucketMeta.allowed_mime_types].sort().join(',')==='image/jpeg,image/png,image/webp',
  'PHOTO_UAT_BUCKET_POLICY_CHANGED')
 const storage=client.storage.from(unifiedPhotoBucket)
 const touched=new Set(),owned=new Set(),stats={puts:0,reuses:0,reads:0,ambiguous:0}
 const check=ref=>{guardUnifiedPhotoStorage(env);return unifiedPhotoPath(runId,actorUid,ref)}
 const rawRead=async(path)=>{
  const answer=await storage.download(path)
  if(missing(answer))return null
  const blob=api(answer,'PHOTO_UAT_DOWNLOAD_FAILED')
  need(typeof blob.arrayBuffer==='function','PHOTO_UAT_DOWNLOAD_FAILED')
  return Buffer.from(await blob.arrayBuffer())
 }
 const verify=(bytes,ref)=>{need(bytes&&bytes.length===ref.size&&digest(bytes)===ref.sha256,'PHOTO_UAT_READBACK_MISMATCH');return Buffer.from(bytes)}
 return Object.freeze({
  bucket:unifiedPhotoBucket,mode:'supabase-private-uat',runId,actorUid,stats,
  inspectTouched(){return [...touched]},
  inspectOwned(){return [...owned]},
  async putImmutable(ref,bytes){
   const p=check(ref),input=Buffer.from(bytes)
   verify(input,ref)
   touched.add(p)
   const prior=await rawRead(p)
   if(prior){
    need(prior.equals(input),'PHOTO_UAT_IMMUTABLE_CONFLICT')
    owned.add(p);stats.reuses++;return
   }
   const response=await storage.upload(p,input,{contentType:ref.contentType,cacheControl:'0',upsert:false})
   // A storage timeout can mean that the object was written. Read back and compare
   // before deciding whether to retry, but do NOT delete ambiguous objects.
   if(response?.error)stats.ambiguous++
   const stored=await rawRead(p)
   if(!stored){
    need(!response?.error,'PHOTO_UAT_UPLOAD_AMBIGUOUS')
    throw Error('PHOTO_UAT_UPLOAD_MISSING')
   }
   need(stored.equals(input),'PHOTO_UAT_IMMUTABLE_CONFLICT')
   owned.add(p)
   if(!response?.error)stats.puts++
   else stats.reuses++
  },
  async read(ref){
   const p=check(ref)
   need(owned.has(p),'PHOTO_UAT_NOT_OWNED_BY_RUN')
   const bytes=await rawRead(p);stats.reads++
   return bytes?verify(bytes,ref):null
  }
 })
}
