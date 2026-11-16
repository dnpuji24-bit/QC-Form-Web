// Actual private Supabase UAT storage ONLY. No production or arbitrary endpoint.
import assert from 'node:assert/strict'
import {createHash} from 'node:crypto'
export const origin='https://tcmtqgbpafwciaflgsaa.supabase.co',bucket='qc-photos-uat'
const digest=b=>createHash('sha256').update(b).digest('hex')
export function guardStorage(e){
 assert.equal(e.QC_UAT_STORAGE_ORIGIN,origin,'UAT_ORIGIN_REQUIRED')
 assert.equal(e.QC_UAT_STORAGE_WRITE,'synthetic-only','EXPLICIT_UAT_WRITE_REQUIRED')
 assert.ok(/^sb_secret_[A-Za-z0-9_-]+$/.test(e.QC_UAT_STORAGE_SECRET??''),'UAT_SECRET_REQUIRED')
}
export function scopePath(runId,path){
 assert.match(runId,/^[a-f0-9]{32}$/)
 assert.ok(typeof path==='string'&&new RegExp('^uat-fertilizer/qc/qc-v2-uat-'+runId+'-[a-z0-9]{1,16}/[a-f0-9]{24}_[a-f0-9]{64}\\.(png|jpg|webp)$').test(path),'STORAGE_SCOPE_DENIED')
 return path
}
export function allowedURL(input){
 const u=new URL(typeof input==='string'||input instanceof URL?input:input.url)
 assert.equal(u.origin,origin,'UAT_ORIGIN_REQUIRED')
 assert.ok(!u.username&&!u.password&&u.pathname.startsWith('/storage/v1/'),'UAT_STORAGE_ONLY')
 return u
}
export function signedURL(input,path){
 const u=allowedURL(input)
 assert.equal(u.pathname,'/storage/v1/object/sign/'+bucket+'/'+path,'SIGNED_PATH_MISMATCH')
 assert.ok(u.searchParams.get('token'),'SIGNED_TOKEN_MISSING')
 return u
}
const data=(r,code)=>{if(r.error||r.data==null)throw Error(code);return r.data}
export async function createRealFertilizerStore(runId){
 guardStorage(process.env)
 assert.match(runId,/^[a-f0-9]{32}$/)
 const {createClient}=await import('@supabase/supabase-js')
 const safeFetch=(input,init={})=>{allowedURL(input);return fetch(input,{...init,redirect:'error',signal:AbortSignal.timeout(30000)})}
 const client=createClient(origin,process.env.QC_UAT_STORAGE_SECRET,{auth:{autoRefreshToken:false,persistSession:false,detectSessionInUrl:false},global:{fetch:safeFetch}})
 const storage=client.storage.from(bucket),owned=new Set(),folders=new Set()
 const b=data(await client.storage.getBucket(bucket),'BUCKET_LOOKUP_FAILED')
 assert.equal(b.id,bucket);assert.equal(b.public,false);assert.equal(Number(b.file_size_limit),2097152);assert.deepEqual([...b.allowed_mime_types].sort(),['image/jpeg','image/png','image/webp'])
 const pathFor=ref=>{assert.equal(ref.bucket,bucket);assert.equal(ref.uploaderUid,'uat-fertilizer');return scopePath(runId,ref.objectPath)}
 const list=async folder=>{const rows=data(await storage.list(folder,{limit:100,offset:0}),'STORAGE_LIST_FAILED');assert.ok(Array.isArray(rows));return rows}
 const download=async p=>Buffer.from(await data(await storage.download(p),'STORAGE_DOWNLOAD_FAILED').arrayBuffer())
 const read=async ref=>{const p=pathFor(ref);assert.ok(owned.has(p),'OBJECT_NOT_OWNED_BY_RUN');return download(p)}
 const signedGet=u=>safeFetch(u,{method:'GET',cache:'no-store',headers:{'Cache-Control':'no-cache'}})
 return {
  stats:{puts:0,signs:0},owned,
  async putImmutable(ref,bytes){
   const p=pathFor(ref),folder=p.slice(0,p.lastIndexOf('/'))
   assert.equal(bytes.length,ref.size);assert.equal(digest(bytes),ref.sha256)
   if(!folders.has(folder)){assert.equal((await list(folder)).length,0,'FOLDER_NOT_FRESH');folders.add(folder)}
   if(!owned.has(p)){
    data(await storage.upload(p,bytes,{contentType:ref.contentType,cacheControl:'0',upsert:false}),'STORAGE_UPLOAD_FAILED')
    owned.add(p);this.stats.puts++
   }
   assert.deepEqual(await download(p),Buffer.from(bytes),'IMMUTABLE_BYTES_MISMATCH')
  },
  read,
  async sign(ref,ttl){
   const p=pathFor(ref);assert.ok(owned.has(p),'OBJECT_NOT_OWNED_BY_RUN');assert.ok([3,30].includes(ttl))
   const bytes=await read(ref);assert.equal(bytes.length,ref.size);assert.equal(digest(bytes),ref.sha256)
   const u=signedURL(data(await storage.createSignedUrl(p,ttl),'SIGN_FAILED').signedUrl,p)
   this.stats.signs++;return u.toString()
  },
  async signedBytes(url,ref){
   const response=await signedGet(signedURL(url,pathFor(ref)));assert.ok(response.ok,'SIGNED_GET_FAILED')
   return Buffer.from(await response.arrayBuffer())
  },
  async assertDenied(url){const response=await signedGet(url);assert.ok([400,401,403,404].includes(response.status),'EXPECTED_DENIAL');await response.body?.cancel()},
  async assertNoOverwrite(ref,bytes){
   const p=pathFor(ref);assert.ok(owned.has(p))
   const result=await storage.upload(p,bytes,{contentType:ref.contentType,cacheControl:'0',upsert:false})
   assert.ok(result.error,'OVERWRITE_UNEXPECTEDLY_ALLOWED')
   assert.equal(digest(await download(p)),ref.sha256)
  },
  async cleanup(){
   const paths=[...owned];for(const p of paths)scopePath(runId,p)
   if(paths.length){const removed=data(await storage.remove(paths),'CLEANUP_REMOVE_FAILED');assert.ok(Array.isArray(removed))}
   for(const f of folders)assert.equal((await list(f)).length,0,'CLEANUP_OBJECTS_REMAIN')
  }
 }
}
