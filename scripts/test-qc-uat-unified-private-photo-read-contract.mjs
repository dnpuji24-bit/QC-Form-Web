// 11D.5c.3b.2d — no Firebase, no Supabase network or real credentials.
import assert from 'node:assert/strict'
import {prepareOperationalPhotoManifest} from '../src/qcOperationalPhotoManifest.mjs'
import {parseUnifiedPhotoRead,resolveUnifiedPhotoRead,createUnifiedUatPhotoSigner} from '../server/qc-photo-access/uat-unified-private-photo-read.mjs'
import {unifiedPhotoBucket,unifiedPhotoOrigin} from '../server/qc-photo-access/uat-unified-private-photo-store.mjs'

const run='a'.repeat(32),uid='uat-field',viewer='uat-viewer',id='qc-v2-uat-'+run+'-one',cid=id.slice('qc-v2-'.length)
const png='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFElEQVR4nGM0atryn4GBgYGJAQoAJCYCa4s7a6wAAAAASUVORK5CYII='
const photo=(kind='main')=>({action:'replace',kind,dataUrl:png})
const scope={recordId:id}
const {manifest}=await prepareOperationalPhotoManifest({recordId:id,uploaderUid:uid,changes:[photo()],bucket:unifiedPhotoBucket})
const photoId=manifest.main.photoId
const request={...scope,photoId}
const qc={testOnly:true,id:cid,ownerUid:uid,inputtedBy:uid,firestoreSaveState:'confirmed',formType:'spray',clientRevision:'uat-r1',dailyPlanId:'uat-ds',operationalSaveId:'uat-job'}
const full={testOnly:true,canonicalQcId:cid,fullRecordId:id,ownerUid:uid,clientRevision:'uat-r1',jobId:'uat-job',source:{dailyPlanId:'uat-ds'},form:{id,ownerUid:uid,formType:'spray',clientRevision:'uat-r1',dailyPlanId:'uat-ds',holdIntervals:[]}}
const ledger={testOnly:true,recordId:cid,fullRecordId:id,ownerUid:uid,formType:'spray',clientRevision:'uat-r1',jobId:'uat-job',
 dailyPlanId:'uat-ds',storageMode:'supabase-private-uat',bucket:unifiedPhotoBucket,manifestSha256:'f'.repeat(64),manifest}
const rows={qc,full,fullAudit:structuredClone(full),ledger,audit:structuredClone(ledger)}
const marker=(role)=>({enabled:true,role})
const owner={uid,marker:marker('asisten'),permissions:{qc_spraying:'edit',qc_records:'none'}}
const allowed={uid:viewer,marker:marker('pengunjung'),permissions:{qc_records:'view'}}
const denied={uid:viewer,marker:marker('pengunjung'),permissions:{qc_records:'none'}}
let n=0
const check=async(label,fn)=>{await fn();n++;console.log('PASS: '+label)}
const reject=(body,code)=>assert.throws(body,{message:code})

await check('canonical record+photo request is exact and synthetic-run scoped',async()=>{
 assert.equal(parseUnifiedPhotoRead(request).canonicalId,cid)
 for(const q of [{...request,objectPath:'forged'},{recordId:'qc-v2-prod',photoId},{recordId:id,photoId:'bad'},'garbage',null])
  assert.throws(()=>parseUnifiedPhotoRead(q))
})
await check('owner with current QC edit can read own photo without QC Records grant',async()=>{
 assert.equal(resolveUnifiedPhotoRead(request,rows,owner).ref.objectPath,manifest.main.objectPath)
})
await check('cross-user visitor with QC Records view can read committed private photo',async()=>{
 assert.equal(resolveUnifiedPhotoRead(request,rows,allowed).contentType,'image/png')
})
await check('none permission or disabled role denied before storage signing',async()=>{
 reject(()=>resolveUnifiedPhotoRead(request,rows,denied),'PHOTO_READ_ACCESS_DENIED')
 reject(()=>resolveUnifiedPhotoRead(request,rows,{...allowed,marker:{...allowed.marker,enabled:false}}),'PHOTO_READ_ACCESS_DENIED')
})
await check('mandor cannot read another uploader solely with QC Records view',async()=>{
 reject(()=>resolveUnifiedPhotoRead(request,rows,{...allowed,marker:marker('mandor_spraying')}),'PHOTO_READ_ACCESS_DENIED')
})
await check('missing manifest, audit or uncommitted QC cannot mint a URL',async()=>{
 for(const changed of [{ledger:null},{audit:null},{qc:null},{full:null},{fullAudit:null},{qc:{...qc,testOnly:false}}])
  reject(()=>resolveUnifiedPhotoRead(request,{...rows,...changed},allowed),'PHOTO_READ_LEDGER_INVALID')
})
await check('immutable ledger mismatch and mismatched full revision denied',async()=>{
 reject(()=>resolveUnifiedPhotoRead(request,{...rows,audit:{...ledger,jobId:'uat-other'}},allowed),'PHOTO_READ_LEDGER_INVALID')
 reject(()=>resolveUnifiedPhotoRead(request,{...rows,full:{...full,clientRevision:'uat-r2'}},allowed),'PHOTO_READ_LEDGER_INVALID')
 reject(()=>resolveUnifiedPhotoRead(request,{...rows,fullAudit:{...full,jobId:'uat-other'}},allowed),'PHOTO_READ_LEDGER_INVALID')
 reject(()=>resolveUnifiedPhotoRead(request,{...rows,qc:{...qc,operationalSaveId:'uat-wrong'}},allowed),'PHOTO_READ_LEDGER_INVALID')
})
await check('only a unique requested slot may be signed, not arbitrary object path',async()=>{
 reject(()=>resolveUnifiedPhotoRead({...request,photoId:'a'.repeat(24)+'_'+'b'.repeat(64)},rows,allowed),'PHOTO_READ_NOT_IN_MANIFEST')
 const wrong={...manifest.main,objectPath:'uat-other/qc/'+id+'/'+photoId+'.png'}
 reject(()=>resolveUnifiedPhotoRead(request,{...rows,ledger:{...ledger,manifest:{main:wrong}},audit:{...ledger,manifest:{main:wrong}}},allowed),'PHOTO_READ_REFERENCE_INVALID')
})
await check('tampered bucket, MIME or SHA forbidden even with matching ledger audit',async()=>{
 for(const change of [{bucket:'qc-photos'},{contentType:'image/svg+xml'},{sha256:'0'.repeat(64)}]){
  const l={...ledger,manifest:{main:{...manifest.main,...change}}}
  reject(()=>resolveUnifiedPhotoRead(request,{...rows,ledger:l,audit:structuredClone(l)},allowed),'PHOTO_READ_REFERENCE_INVALID')
 }
})
await check('Fertilizer scan is allowed but Spray scan is not',async()=>{
 const f={...qc,formType:'fertilizer'}
 const form={...full,form:{...full.form,formType:'fertilizer'}}
 const image=(await prepareOperationalPhotoManifest({recordId:id,uploaderUid:uid,changes:[photo('scan')],bucket:unifiedPhotoBucket})).manifest.scan
 const l={...ledger,formType:'fertilizer',manifest:{scan:image}}
 assert.equal(resolveUnifiedPhotoRead({...scope,photoId:image.photoId},{qc:f,full:form,fullAudit:structuredClone(form),ledger:l,audit:structuredClone(l)},allowed).ref.kind,'scan')
 const ls={...l,formType:'spray'}
 reject(()=>resolveUnifiedPhotoRead({...scope,photoId:image.photoId},{qc,full,fullAudit:structuredClone(full),ledger:ls,audit:structuredClone(ls)},allowed),'PHOTO_READ_REFERENCE_INVALID')
})
await check('signer fixes a 60-second private URL and refuses other origin or paths',async()=>{
 const env={QC_UAT_MODE:'unified-lab',GCLOUD_PROJECT:'demo-qc-uat-unified-role-planning',FIRESTORE_EMULATOR_HOST:'127.0.0.1:9285',
  FIREBASE_AUTH_EMULATOR_HOST:'127.0.0.1:10099',QC_UAT_STORAGE_ORIGIN:unifiedPhotoOrigin,QC_UAT_STORAGE_WRITE:'synthetic-only',
  QC_UAT_STORAGE_SECRET:'sb_secret_synthetic_offline_only'}
 let count=0,ttl=0,invalid=false
 const client={storage:{from:(bucket)=>{
  assert.equal(bucket,unifiedPhotoBucket)
  return {createSignedUrl:async(path,n)=>{count++;ttl=n;return{data:{signedUrl:(invalid?'https://other.example':'https://tcmtqgbpafwciaflgsaa.supabase.co')+
   '/storage/v1/object/sign/'+bucket+'/'+path+'?token=synthetic'},error:null}}}
 }}}
 const signer=await createUnifiedUatPhotoSigner({client,env})
 const url=await signer.sign(manifest.main,run,uid)
 assert.ok(url.startsWith(unifiedPhotoOrigin+'/storage/v1/object/sign/'))
 assert.equal(ttl,60);assert.equal(count,1)
 await assert.rejects(()=>signer.sign({...manifest.main,objectPath:'uat-other/secret'},run,uid),{message:'PHOTO_UAT_PATH_DENIED'})
 invalid=true
 await assert.rejects(()=>signer.sign(manifest.main,run,uid),{message:'PHOTO_READ_SIGN_FAILED'})
})
console.log('SUCCESS: '+n+' private signed-photo authorization contracts passed (OFFLINE, NO upload)')
