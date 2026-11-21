// Stage 22 — new-photo trusted HTTP contract delta; no real network or live upload.
// Uses the same manifest and upload helper as the production-bound React adapter.
import assert from 'node:assert/strict'
import {prepareOperationalPhotoManifest,stripOperationalPhotoPayload} from '../src/qcOperationalPhotoManifest.mjs'
import {postVerifiedOperationalPhoto,operationalPhotoUploadDestinations as destinations} from '../src/qcOperationalPhotoHttp.mjs'
let count=0
async function check(label,fn){await fn();count++;console.log('PASS: '+label)}
const png='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jR1sAAAAASUVORK5CYII='
const id='qc-v2-uat-photo-contract-1',uid='uat-photo-operator',clientRevision='uat-revision-one'
const m=await prepareOperationalPhotoManifest({recordId:id,uploaderUid:uid,
 changes:[{kind:'main',action:'replace',dataUrl:png}]})
const ref=m.uploads[0].reference,bytes=m.uploads[0].bytes
const input={
 endpoint:destinations.production.endpoint,bucket:destinations.production.bucket,
 token:'test-only-firebase-token',recordId:id,formType:'spray',
 baseRevision:null,clientRevision,uploaderUid:uid,reference:ref,bytes
}
const receipt={photoId:ref.photoId,objectPath:ref.objectPath,sha256:ref.sha256,size:ref.size,bucket:ref.bucket}
await check('new PNG photo body carries canonical bytes, revision and Firebase authorization',async()=>{
 let called=0
 const ok=await postVerifiedOperationalPhoto({...input,fetchImpl:async (url,options)=>{
  called++
  assert.equal(url,destinations.production.endpoint)
  assert.equal(options.method,'POST')
  assert.equal(options.cache,'no-store')
  assert.equal(options.headers.Authorization,'Bearer test-only-firebase-token')
  const body=JSON.parse(options.body)
  assert.deepEqual(Object.keys(body).sort(),['recordId','formType','baseRevision','clientRevision','kind','contentType','base64'].sort())
  assert.equal(body.recordId,id)
  assert.equal(body.formType,'spray')
  assert.equal(body.clientRevision,clientRevision)
  assert.equal(body.kind,'main')
  assert.equal(body.contentType,'image/png')
  assert.deepEqual(Uint8Array.from(atob(body.base64),v=>v.charCodeAt(0)),bytes)
  return new Response(JSON.stringify(receipt),{status:200,headers:{'Content-Type':'application/json'}})
 }})
 assert.equal(called,1)
 assert.equal(ok,true)
})
await check('invalid destination, Drive URL, tampered object bytes and unsafe receipts fail closed',async()=>{
 let calls=0
 const fetchImpl=async()=>{calls++;return new Response(JSON.stringify(receipt),{status:200})}
 for(const endpoint of [
  'https://drive.google.com/file/d/legacy-123/view',
  'https://mcfwnstdfhhtcbksgrlj.supabase.co/functions/v1/qc-photo-live-pilot-upload',
  'https://mcfwnstdfhhtcbksgrlj.supabase.co/functions/v1/qc-photo-upload?redirect=1'
 ]){
  await assert.rejects(postVerifiedOperationalPhoto({...input,endpoint,fetchImpl}),/QC_PHOTO_BACKEND_NOT_APPROVED/)
 }
 assert.equal(calls,0)
 await assert.rejects(postVerifiedOperationalPhoto({...input,
  reference:{...ref,objectPath:'another-user/qc/'+id+'/wrong.png'},fetchImpl}),/QC_PHOTO_REFERENCE_MISMATCH/)
 await assert.rejects(postVerifiedOperationalPhoto({...input,
  reference:{...ref,sha256:'0'.repeat(64)},fetchImpl}),/QC_PHOTO_REFERENCE_MISMATCH/)
 assert.equal(calls,0)
 await assert.rejects(postVerifiedOperationalPhoto({...input,fetchImpl:async()=>new Response(JSON.stringify({...receipt,size:ref.size+1}),{status:200})}),/QC_PHOTO_VERIFICATION_MISMATCH/)
 await assert.rejects(postVerifiedOperationalPhoto({...input,fetchImpl:async()=>new Response('Forbidden',{status:403})}),/QC photo upload HTTP 403/)
})
await check('UAT and old Google Drive photo references remain isolated from new-photo upload',async()=>{
 const clean=stripOperationalPhotoPayload({
  photoDriveUrl:'https://drive.google.com/file/d/historical_main/view',
  scanReportDriveUrl:'https://drive.google.com/file/d/historical_scan/view',
  holdIntervals:[{holdId:'hold-legacy',photoDriveUrl:'https://drive.google.com/file/d/historical_hold/view'}],
  photoBase64:png
 })
 assert.equal(clean.photoBase64,undefined)
 assert.equal(clean.photoDriveUrl,'https://drive.google.com/file/d/historical_main/view')
 assert.equal(clean.scanReportDriveUrl,'https://drive.google.com/file/d/historical_scan/view')
 assert.equal(clean.holdIntervals[0].photoDriveUrl,'https://drive.google.com/file/d/historical_hold/view')
 assert.notEqual(destinations.production.endpoint,destinations.uat.endpoint)
 assert.equal(destinations.production.bucket,'qc-photos')
 assert.equal(destinations.uat.bucket,'qc-photos-uat')
 let called=0
 const newUat=await prepareOperationalPhotoManifest({recordId:id,uploaderUid:uid,bucket:'qc-photos-uat',
  changes:[{kind:'main',action:'replace',dataUrl:png}]})
 const ok=await postVerifiedOperationalPhoto({...input,
  endpoint:destinations.uat.endpoint,bucket:'qc-photos-uat',
  reference:newUat.uploads[0].reference,bytes:newUat.uploads[0].bytes,
  fetchImpl:async(url)=>{
   called++
   assert.equal(url,destinations.uat.endpoint)
   const r=newUat.uploads[0].reference
   return new Response(JSON.stringify({photoId:r.photoId,objectPath:r.objectPath,sha256:r.sha256,size:r.size,bucket:r.bucket}),{status:200})
  }})
 assert.equal(ok,true)
 assert.equal(called,1)
})
console.log('SUCCESS: '+count+' isolated operational photo HTTP delta contracts passed (MOCK ONLY, NO Supabase upload)')
console.log('RELEASE_STATUS: BLOCKED — operational Supabase Edge Functions must be deployed and verified separately')
