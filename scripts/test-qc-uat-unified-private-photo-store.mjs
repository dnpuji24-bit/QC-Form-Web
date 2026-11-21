// 11D.5c.3b.2a — offline private Supabase SDK test double, NO UAT writes.
import assert from 'node:assert/strict'
import {prepareOperationalPhotoManifest} from '../src/qcOperationalPhotoManifest.mjs'
import {guardUnifiedPhotoStorage,unifiedPhotoPath,unifiedStorageAllowedUrl,createUnifiedPrivatePhotoStore,unifiedPhotoOrigin,unifiedPhotoBucket,unifiedPhotoMaxBytes} from '../server/qc-photo-access/uat-unified-private-photo-store.mjs'
const run='a'.repeat(32),uid='uat-field',id='qc-v2-uat-'+run+'-one'
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFElEQVR4nGM0atryn4GBgYGJAQoAJCYCa4s7a6wAAAAASUVORK5CYII=','base64')
const env={QC_UAT_MODE:'unified-lab',GCLOUD_PROJECT:'demo-qc-uat-unified-role-planning',FIRESTORE_EMULATOR_HOST:'127.0.0.1:9285',FIREBASE_AUTH_EMULATOR_HOST:'127.0.0.1:10099',QC_UAT_STORAGE_ORIGIN:unifiedPhotoOrigin,QC_UAT_STORAGE_WRITE:'synthetic-only',QC_UAT_STORAGE_SECRET:'sb_secret_synthetic_offline_only'}
const photoRef=async()=>{
 const x=await prepareOperationalPhotoManifest({recordId:id,uploaderUid:uid,bucket:unifiedPhotoBucket,changes:[{action:'replace',kind:'main',dataUrl:'data:image/png;base64,'+png.toString('base64')}]})
 return x.manifest.main
}
function fakeSdk(policy={},missingStatus='404'){
 const objects=new Map(),stats={upload:0,download:0,removed:0,options:null}
 let failure='',corrupt=null
 const storage={
  async upload(path,bytes,opts){
   stats.upload++;stats.options=opts
   if(failure==='before')return {data:null,error:{statusCode:'503',message:'timeout'}}
   if(objects.has(path))return {data:null,error:{statusCode:'409',message:'exists'}}
   objects.set(path,Buffer.from(corrupt??bytes))
   return failure==='after'?{data:null,error:{statusCode:'503',message:'timeout'}}:{data:{path},error:null}
  },
  async download(path){
   stats.download++;return objects.has(path)?
    {data:new Blob([objects.get(path)]),error:null}:
    {data:null,error:{statusCode:missingStatus,message:missingStatus==='400'?'The resource cannot be downloaded':'not found'}}
  },
  async remove(){stats.removed++;throw Error('MUST_NOT_DELETE')}
 }
 const client={storage:{
  getBucket:async()=>({data:{id:unifiedPhotoBucket,public:false,file_size_limit:unifiedPhotoMaxBytes,allowed_mime_types:['image/jpeg','image/png','image/webp'],...policy},error:null}),
  from:b=>{assert.equal(b,unifiedPhotoBucket);return storage}
 }}
 return {client,objects,stats,fail:v=>failure=v,tamper:v=>corrupt=v}
}
let n=0
async function check(name,fn){await fn();n++;console.log('PASS: '+name)}
await check('only unified emulator identity and explicit synthetic Supabase credential',()=>{
 assert.equal(guardUnifiedPhotoStorage(env),unifiedPhotoOrigin)
 for(const x of [{GCLOUD_PROJECT:'form-qc-unm'},{QC_UAT_MODE:'production'},{QC_UAT_STORAGE_ORIGIN:'https://example.com'},{QC_UAT_STORAGE_WRITE:'production'},{QC_UAT_STORAGE_SECRET:'sb_publishable_test'},{FIREBASE_PROJECT_ID:'form-qc-unm'}])assert.throws(()=>guardUnifiedPhotoStorage({...env,...x}))
})
await check('bucket must remain private, 2 MiB and JPEG PNG WebP',async()=>{
 await createUnifiedPrivatePhotoStore({runId:run,actorUid:uid,client:fakeSdk().client,env})
 for(const delta of [{public:true},{file_size_limit:6000000},{allowed_mime_types:['image/png','image/svg+xml']}])
 await assert.rejects(()=>createUnifiedPrivatePhotoStore({runId:run,actorUid:uid,client:fakeSdk(delta).client,env}),{message:'PHOTO_UAT_BUCKET_POLICY_CHANGED'})
})
await check('run UID record MIME path and SHA are immutable',async()=>{
 const ref=await photoRef()
 assert.equal(unifiedPhotoPath(run,uid,ref),ref.objectPath)
 for(const bad of [{...ref,objectPath:'../'+ref.objectPath},{...ref,uploaderUid:'uat-other'},{...ref,bucket:'qc-photos'},{...ref,objectPath:ref.objectPath.replace(run,'b'.repeat(32))},{...ref,contentType:'image/svg+xml'},{...ref,size:2097153},{...ref,sha256:'b'.repeat(64)}])assert.throws(()=>unifiedPhotoPath(run,uid,bad))
})
await check('outgoing URL cannot leave fixed UAT Supabase storage origin',()=>{
 assert.equal(unifiedStorageAllowedUrl(unifiedPhotoOrigin+'/storage/v1/object/qc').origin,unifiedPhotoOrigin)
 for(const u of ['https://example.com/storage/v1/a',unifiedPhotoOrigin+'/rest/v1/users',unifiedPhotoOrigin+'/auth/v1/refresh',unifiedPhotoOrigin+'/storage/v1/a#fragment'])assert.throws(()=>unifiedStorageAllowedUrl(u))
})
await check('first upload is no-upsert and exact verified-byte readback',async()=>{
 const fake=fakeSdk(),store=await createUnifiedPrivatePhotoStore({runId:run,actorUid:uid,client:fake.client,env}),ref=await photoRef()
 await store.putImmutable(ref,png)
 assert.deepEqual(fake.stats.options,{contentType:'image/png',cacheControl:'0',upsert:false})
 assert.deepEqual(await store.read(ref),png)
 assert.equal(store.stats.puts,1);assert.equal(fake.stats.upload,1);assert.equal(fake.stats.removed,0)
})
await check('missing-object GET returning HTTP 400 cannot block first immutable upload',async()=>{
 const fake=fakeSdk({},'400'),store=await createUnifiedPrivatePhotoStore({runId:run,actorUid:uid,client:fake.client,env}),ref=await photoRef()
 await store.putImmutable(ref,png)
 assert.deepEqual(await store.read(ref),png)
 assert.equal(fake.stats.upload,1)
 assert.equal(fake.stats.download,2,'only successful post-upload download and explicit read allowed')
 assert.equal(fake.objects.size,1)
})
await check('same-process and new-process retries never overwrite immutable bytes',async()=>{
 const fake=fakeSdk(),ref=await photoRef()
 const first=await createUnifiedPrivatePhotoStore({runId:run,actorUid:uid,client:fake.client,env})
 await first.putImmutable(ref,png);await first.putImmutable(ref,png)
 const next=await createUnifiedPrivatePhotoStore({runId:run,actorUid:uid,client:fake.client,env})
 await next.putImmutable(ref,png)
 assert.equal(fake.stats.upload,3);assert.equal(fake.objects.size,1);assert.equal(first.stats.reuses,1);assert.equal(next.stats.reuses,1)
})
await check('mismatched bytes cannot be uploaded or overwrite original',async()=>{
 const fake=fakeSdk(),ref=await photoRef(),store=await createUnifiedPrivatePhotoStore({runId:run,actorUid:uid,client:fake.client,env})
 await assert.rejects(()=>store.putImmutable(ref,Buffer.from('tampered')),{message:'PHOTO_UAT_READBACK_MISMATCH'})
 await store.putImmutable(ref,png)
 fake.objects.set(ref.objectPath,Buffer.from('corrupted'))
 await assert.rejects(()=>store.putImmutable(ref,png),{message:'PHOTO_UAT_IMMUTABLE_CONFLICT'})
 await assert.rejects(()=>store.read(ref),{message:'PHOTO_UAT_READBACK_MISMATCH'})
 assert.equal(fake.stats.upload,2);assert.equal(fake.stats.removed,0)
})
await check('lost successful upload response recovers by readback only',async()=>{
 const fake=fakeSdk(),ref=await photoRef(),store=await createUnifiedPrivatePhotoStore({runId:run,actorUid:uid,client:fake.client,env})
 fake.fail('after');await store.putImmutable(ref,png)
 assert.deepEqual(await store.read(ref),png)
 assert.equal(store.stats.ambiguous,1);assert.equal(store.stats.reuses,1)
})
await check('failed write leaves explicit touched path without any deletion',async()=>{
 const fake=fakeSdk(),ref=await photoRef(),store=await createUnifiedPrivatePhotoStore({runId:run,actorUid:uid,client:fake.client,env})
 fake.fail('before')
 await assert.rejects(()=>store.putImmutable(ref,png),{message:'PHOTO_UAT_UPLOAD_AMBIGUOUS'})
 assert.deepEqual(store.inspectTouched(),[ref.objectPath])
 assert.deepEqual(store.inspectOwned(),[]);assert.equal(fake.stats.removed,0)
})
await check('revoked UAT mode rejects existing store operations before any network',async()=>{
 const fake=fakeSdk(),mutable={...env},store=await createUnifiedPrivatePhotoStore({runId:run,actorUid:uid,client:fake.client,env:mutable}),ref=await photoRef()
 mutable.QC_UAT_STORAGE_WRITE='production'
 await assert.rejects(()=>store.putImmutable(ref,png),{message:'PHOTO_UAT_WRITE_OPT_IN_REQUIRED'})
 assert.equal(fake.stats.upload,0)
})
console.log('SUCCESS: '+n+' strict private Supabase UAT object adapter checks passed (FAKE SDK, no live upload or QC commit)')
