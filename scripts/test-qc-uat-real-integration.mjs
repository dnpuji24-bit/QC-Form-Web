// Dedicated Firebase demo emulators + actual private Supabase UAT storage. No production or deployed endpoint.
import assert from 'node:assert/strict'
import {createHash,randomUUID} from 'node:crypto'
import {createRequire} from 'node:module'
import {readFileSync} from 'node:fs'
import {marker} from '../src/qcUatRolePermissions.mjs'
import {commitSyntheticQc} from '../src/qcUatQcLifecycleContract.mjs'
import {operationalQueueId} from '../src/qcOperationalSaveTransport.mjs'
import {jobPayload,prepareStrictJob,processStrictSyntheticJob} from '../src/qcUatStrictQueueContract.mjs'
import {prepareOperationalPhotoManifest,stripOperationalPhotoPayload} from '../src/qcOperationalPhotoManifest.mjs'
const projectId='demo-qc-uat-real-integration',host='127.0.0.1',port=8785,authPort=9599
const config=JSON.parse(readFileSync(new URL('../firebase.uat-real-integration-emulator.json',import.meta.url),'utf8'))
const rules=readFileSync(new URL('../scripts/firestore.uat-strict-integration-demo.rules',import.meta.url),'utf8')
function guard(e=process.env){
 assert.equal(e.GCLOUD_PROJECT,projectId,'DEMO_PROJECT_REQUIRED')
 assert.equal(e.FIRESTORE_EMULATOR_HOST,host+':'+port,'FIRESTORE_LOOPBACK_REQUIRED')
 assert.equal(e.FIREBASE_AUTH_EMULATOR_HOST,host+':'+authPort,'AUTH_LOOPBACK_REQUIRED')
 for(const k of ['GOOGLE_CLOUD_PROJECT','FIREBASE_PROJECT_ID'])if(e[k])assert.equal(e[k],projectId,'WRONG_PROJECT')
}
const storageOrigin='https://tcmtqgbpafwciaflgsaa.supabase.co',bucket='qc-photos-uat'
function scopedFolder(runId,owner,recordId){
 if(!/^[0-9a-f]{32}$/.test(runId)||!['uat-spray','uat-fert'].includes(owner)||!new RegExp('^uat-'+runId+'-q-[a-z0-9-]{1,16}$').test(recordId))throw Error('STORAGE_SCOPE_DENIED')
 return owner+'/qc/'+recordId
}
function scopedObject(runId,owner,recordId,objectPath){
 const folder=scopedFolder(runId,owner,recordId)
 if(typeof objectPath!=='string'||!objectPath.startsWith(folder+'/')||!/^[0-9a-f]{24}_[0-9a-f]{64}\.(png|jpg|webp)$/.test(objectPath.slice(folder.length+1)))throw Error('STORAGE_SCOPE_DENIED')
 return objectPath
}
function pathCases(){const testRun='0'.repeat(32),testId='uat-'+testRun+'-q-spray',testPath='uat-spray/qc/'+testId+'/'+'a'.repeat(24)+'_'+'b'.repeat(64)+'.png';if(scopedObject(testRun,'uat-spray',testId,testPath)!==testPath)throw Error('PATH_TEST');let n=1;for(const args of [[testRun,'uat-other',testId,testPath],[testRun,'uat-spray','uat-q-spray',testPath],[testRun,'uat-spray',testId,testPath+'/extra'],[testRun,'uat-spray',testId,'../'+testPath],['bad','uat-spray',testId,testPath],[testRun,'uat-spray',testId,testPath.replace('.png','.exe')]]){let error;try{scopedObject(...args)}catch(e){error=e.message}if(error!=='STORAGE_SCOPE_DENIED')throw Error('PATH_TEST');n++}return n}
function storageGuard(e){
 assert.equal(e.QC_UAT_STORAGE_ORIGIN,storageOrigin,'UAT_ORIGIN_REQUIRED')
 assert.equal(e.QC_UAT_STORAGE_WRITE,'synthetic-only','EXPLICIT_UAT_WRITE_REQUIRED')
 assert.ok(/^sb_secret_[A-Za-z0-9_-]+$/.test(e.QC_UAT_STORAGE_SECRET??''),'UAT_SECRET_REQUIRED')
}
function allowedURL(input){
 const u=new URL(typeof input==='string'||input instanceof URL?input:input.url)
 assert.equal(u.origin,storageOrigin,'UAT_ORIGIN_REQUIRED')
 assert.ok(!u.username&&!u.password&&u.pathname.startsWith('/storage/v1/'),'UAT_STORAGE_ONLY')
 return u
}
const valid={GCLOUD_PROJECT:projectId,FIRESTORE_EMULATOR_HOST:host+':'+port,FIREBASE_AUTH_EMULATOR_HOST:host+':'+authPort}
assert.ok(process.argv.length===3&&['--self-test','--uat-write'].includes(process.argv[2]))
guard(valid)
for(const e of [{},{...valid,GCLOUD_PROJECT:'form-qc-unm'},{...valid,FIRESTORE_EMULATOR_HOST:'127.0.0.1:8485'},{...valid,FIREBASE_AUTH_EMULATOR_HOST:'remote:9599'},{...valid,GOOGLE_CLOUD_PROJECT:'form-qc-unm'}])assert.throws(()=>guard(e))
assert.equal(config.firestore.rules,'scripts/firestore.uat-strict-integration-demo.rules')
assert.deepEqual(config.emulators.firestore,{host,port})
assert.deepEqual(config.emulators.auth,{host,port:authPort})
assert.ok(rules.includes("get(p).data == {'testOnly': true, 'baseRevision': base, 'expectedQc': q}"))
assert.ok(rules.includes('qcValid(id,q) && receiptMatches(q,base) && newAudit(q) && pairedActual(q)'))
assert.ok(rules.includes('qcWrite(id,request.resource.data,resource.data.clientRevision)'))
assert.ok(rules.includes('eligible(q) && changedQc(q) && actualMatches(a,q)'))
assert.ok(rules.includes('editForm(q.formType) && changedQc(q) && auditMatches(a,q)'))
const digest=v=>createHash('sha256').update(v).digest('hex')
const syntheticJob=key=>'uat-job-'+digest(key).slice(0,48)
assert.match(syntheticJob(operationalQueueId('uat-spray','uat-q1','uat-r1')), /^uat-[a-z0-9-]{1,60}$/)
assert.notEqual(syntheticJob(operationalQueueId('uat-spray','uat-q1','uat-r1')),syntheticJob(operationalQueueId('uat-spray','uat-q1','uat-r2')))
const validStorage={QC_UAT_STORAGE_ORIGIN:storageOrigin,QC_UAT_STORAGE_WRITE:'synthetic-only',QC_UAT_STORAGE_SECRET:'sb_secret_fake_test_only'}
storageGuard(validStorage)
for(const e of [{},{...validStorage,QC_UAT_STORAGE_ORIGIN:'https://mcfwnstdfhhtcbksgrlj.supabase.co'},{...validStorage,QC_UAT_STORAGE_WRITE:''},{...validStorage,QC_UAT_STORAGE_SECRET:'sb_publishable_fake'}])assert.throws(()=>storageGuard(e))
assert.throws(()=>allowedURL('https://example.com/storage/v1/bucket'))
assert.throws(()=>allowedURL(storageOrigin+'/rest/v1/users'))
console.log('SUCCESS: '+pathCases()+' scoped object path checks; real integration safety guards passed (offline)')
if(process.argv[2]==='--uat-write'){
 guard()
 storageGuard(process.env)
 const {initializeApp,deleteApp}=await import('firebase/app')
 const {initializeAuth,inMemoryPersistence,connectAuthEmulator,signInWithEmailAndPassword,signOut}=await import('firebase/auth')
 const {initializeFirestore,connectFirestoreEmulator,doc,getDocFromServer,setDoc,writeBatch,runTransaction,terminate}=await import('firebase/firestore')
 const require=createRequire(new URL('../server/qc-photo-access/package.json',import.meta.url))
 const {initializeApp:adminInit,deleteApp:adminDelete}=require('firebase-admin/app')
 const {getAuth}=require('firebase-admin/auth')
 const {getFirestore}=require('firebase-admin/firestore')
 const admin=adminInit({projectId},'photo-integration-admin'),authAdmin=getAuth(admin),adb=getFirestore(admin)
 const prefix='qc_uat_workspaces/cutover',clients=[],objects=new Set(),folders=new Set()
 const runId=randomUUID().replaceAll('-','')
 const {createClient}=require('@supabase/supabase-js')
 const safeFetch=(input,init={})=>{allowedURL(input);return fetch(input,{...init,redirect:'error',signal:AbortSignal.timeout(30000)})}
 const client=createClient(storageOrigin,process.env.QC_UAT_STORAGE_SECRET,{auth:{autoRefreshToken:false,persistSession:false,detectSessionInUrl:false},global:{fetch:safeFetch}})
 const storage=client.storage.from(bucket)
 const storageData=(r,stage)=>{if(r.error||r.data==null)throw Error(stage);return r.data}
 const list=async folder=>{const data=storageData(await storage.list(folder,{limit:100,offset:0}),'STORAGE_LIST_FAILED');assert.ok(Array.isArray(data),'STORAGE_LIST_INVALID');return data}
 const download=async p=>Buffer.from(await storageData(await storage.download(p),'STORAGE_DOWNLOAD_FAILED').arrayBuffer())
 const ownPath=(r,record)=>scopedObject(runId,record.ownerUid,record.id,r.objectPath)
 async function uploadObject(r,bytes,record){
  const p=ownPath(r,record),folder=scopedFolder(runId,record.ownerUid,record.id)
  if(!folders.has(folder)){assert.equal((await list(folder)).length,0,'STORAGE_FOLDER_NOT_FRESH');folders.add(folder)}
  if(!objects.has(p)){
   storageData(await storage.upload(p,bytes,{contentType:r.contentType,cacheControl:'0',upsert:false}),'STORAGE_UPLOAD_FAILED')
   objects.add(p)
  }
  assert.deepEqual(await download(p),bytes,'STORAGE_IMMUTABLE_CONFLICT')
 }
 async function cleanup(){
  for(const p of objects){
   const [owner,,recordId]=p.split('/')
   scopedObject(runId,owner,recordId,p)
   assert.ok(folders.has(scopedFolder(runId,owner,recordId)),'CLEANUP_SCOPE_DENIED')
  }
  if(objects.size){const result=storageData(await storage.remove([...objects]),'STORAGE_CLEANUP_REMOVE_FAILED');assert.ok(Array.isArray(result),'STORAGE_CLEANUP_INVALID')}
  for(const folder of folders)assert.equal((await list(folder)).length,0,'STORAGE_CLEANUP_REMAINS')
 }
 const uid=k=>'uat-'+k
 const email=k=>k+'@qc-photo-integration.example.test'
 const password=k=>'Synthetic-photo-integration-'+k+'-2026'
 const markRef=k=>adb.doc('qc_uat_identities/'+k)
 const ref=(c,id)=>adb.doc(prefix+'/'+c+'/'+id)
 const read=async(c,id)=>{const s=await ref(c,id).get();return s.exists?s.data():null}
 const path=(c,col,id)=>doc(c.db,'qc_uat_workspaces','cutover',col,id)
 const get=async(c,col,id)=>{const s=await getDocFromServer(path(c,col,id));return s.exists()?s.data():null}
 const denied=fn=>assert.rejects(fn,{code:'permission-denied'})
 const png='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jR1sAAAAASUVORK5CYII='
 const qc=(k='spray',kind='spray',id='uat-q-'+k,rev='uat-r1',area=250)=>({testOnly:true,id:'uat-'+runId+'-'+id.slice(4),ownerUid:uid(k),inputtedBy:uid(k),formType:kind,clientRevision:rev,saveType:'ready',dailyPlanId:'uat-d-'+kind,monthlyPlanLineId:'uat-m-'+kind,pid:'uat-pid',date:'2026-11-12',shift:'2',foreman:'uat-foreman',actualArea100:area,sessionId:'uat-session'})
 const daily=r=>({testOnly:true,dailyPlanId:r.dailyPlanId,monthlyPlanLineId:r.monthlyPlanLineId,pid:r.pid,date:r.date,shift:r.shift,foreman:r.foreman,formType:r.formType,area100:300})
 const webp='data:image/webp;base64,UklGRh4AAABXRUJQVlA4TBEAAAAvAAAAAAdQsmZUpv+BiOh/AAA='
 const changes=[{kind:'main',action:'replace',dataUrl:png},{kind:'hold',holdId:'uat-h1',action:'replace',dataUrl:webp},{kind:'scan',action:'replace',dataUrl:png}]
 const job=(r,baseRevision=null,edits=changes)=>({testOnly:true,scope:'uat-strict',record:{...r,photoBase64:png,scanReportPhotoBase64:png},uploaderUid:r.ownerUid,baseRevision,action:'finalizeRecord',changes:edits,id:operationalQueueId(r.ownerUid,r.id,r.clientRevision)})
 const stats={uploads:0,commits:0,failUpload:false,failCommit:false,loseAck:false}
 async function open(k){
  guard()
  const app=initializeApp({projectId,apiKey:'demo-only-not-a-real-key'},'photo-integration-'+crypto.randomUUID())
  const auth=initializeAuth(app,{persistence:inMemoryPersistence});connectAuthEmulator(auth,'http://'+host+':'+authPort,{disableWarnings:true})
  const db=initializeFirestore(app,{});connectFirestoreEmulator(db,host,port)
  const c={app,auth,db};clients.push(c)
  const {user}=await signInWithEmailAndPassword(auth,email(k),password(k))
  assert.equal(user.uid,uid(k));return c
 }
 async function authorize(c,record){
  guard()
  const u=c.auth.currentUser
  if(!u||u.uid!==record.ownerUid)throw Error('MOCK_OWNER_REQUIRED')
  const token=await authAdmin.verifyIdToken(await u.getIdToken(),true)
  const m=(await markRef(token.uid).get()).data()
  const key=record.formType==='spray'?'qc_spraying':'qc_fertilizer'
  if(token.qcUat!==true||!m?.enabled||m.testOnly!==true||m.workspace!=='cutover'||m.permissions?.[key]!=='edit'||(await adb.doc('users/'+token.uid).get()).exists)throw Error('MOCK_PHOTO_PERMISSION_DENIED')
 }
 function verifyObject(r,bytes,record,slot){
  assert.ok(['main','scan','hold_uat-h1'].includes(slot),'MOCK_SLOT')
  assert.equal(r.kind,slot==='hold_uat-h1'?'hold':slot)
  if(r.kind==='hold')assert.equal(r.holdId,'uat-h1')
  else assert.equal(r.holdId,undefined)
  assert.equal(r.provider,'supabase');assert.equal(r.bucket,bucket);assert.equal(r.uploaderUid,record.ownerUid)
  assert.equal(r.sha256,digest(bytes));assert.equal(r.size,bytes.length);assert.ok(bytes.length>0&&bytes.length<=2097152)
  assert.equal(r.photoId,digest(slot).slice(0,24)+'_'+r.sha256)
  const ext={'image/png':'png','image/jpeg':'jpg','image/webp':'webp'}[r.contentType]
  assert.ok(ext)
  assert.equal(r.objectPath,record.ownerUid+'/qc/'+record.id+'/'+r.photoId+'.'+ext)
 }
 // Trusted in-process service: takes the original job, independently hashes it,
 // reconstructs expected manifest and QC from authoritative revision and DP.
 // No caller-supplied fingerprint or processed QC is accepted on trust.
 async function receipt(c,job,claimed){
  const {canonical,id:key}=jobPayload(job)
  const raw=JSON.parse(canonical),fp='sha256-v1:'+digest(canonical)
  assert.equal(claimed,fp,'TRUSTED_FINGERPRINT_MISMATCH')
  if(Object.hasOwn(job,'payloadFingerprint'))assert.equal(job.payloadFingerprint,fp,'TRUSTED_FINGERPRINT_MISMATCH')
  const record=stripOperationalPhotoPayload(raw.record)
  assert.deepEqual(Object.keys(record).sort(),['testOnly','id','ownerUid','inputtedBy','formType','clientRevision','saveType','dailyPlanId','monthlyPlanLineId','pid','date','shift','foreman','actualArea100','sessionId'].sort(),'TRUSTED_RECORD_FIELDS')
  await authorize(c,record)
  const jobId=syntheticJob(key),p=ref('photo_receipts',jobId)
  return adb.runTransaction(async t=>{
   const [old,existing,dp]=await Promise.all([t.get(ref('qc_records',record.id)),t.get(p),record.dailyPlanId?t.get(ref('daily_plans',record.dailyPlanId)):Promise.resolve(null)])
   const current=old.data()
   if(current?.clientRevision===record.clientRevision&&current?.operationalSaveId===jobId){
    const expected=existing.data()
    assert.ok(expected,'TRUSTED_RECEIPT_MISSING')
    assert.equal(current.operationalPayloadFingerprint,fp,'TRUSTED_RECEIPT_CONFLICT')
    assert.equal(expected.baseRevision,raw.baseRevision,'TRUSTED_RECEIPT_CONFLICT')
    assert.deepEqual(expected.expectedQc,current,'TRUSTED_RECEIPT_CONFLICT')
    return expected.expectedQc
   }
   assert.equal(current?.clientRevision??null,raw.baseRevision,'TRUSTED_BASE_REVISION_CONFLICT')
   const {manifest}=await prepareOperationalPhotoManifest({recordId:record.id,uploaderUid:raw.uploaderUid,previous:current?.operationalPhotoManifest??{},changes:raw.changes,bucket})
   for(const [slot,r] of Object.entries(manifest)){
    const p=ownPath(r,record)
    assert.ok(objects.has(p),'STORAGE_OBJECT_NOT_OWNED_BY_RUN')
    const bytes=await download(p)
    verifyObject(r,bytes,record,slot)
   }
   const plannedDailyArea100=record.dailyPlanId?dp?.data()?.area100:0
   assert.ok(Number.isSafeInteger(plannedDailyArea100)&&plannedDailyArea100>=0,'TRUSTED_DP_MISSING')
   const expectedQc={...record,saveType:raw.action==='finalizeRecord'?'uploaded':record.saveType,plannedDailyArea100,operationalSaveId:jobId,firestoreSaveState:'confirmed',operationalPhotoManifest:manifest,operationalQueueKey:key,operationalPayloadFingerprint:fp}
   const expected={testOnly:true,baseRevision:raw.baseRevision,expectedQc}
   if(existing.exists)assert.deepEqual(existing.data(),expected,'TRUSTED_RECEIPT_CONFLICT')
   else t.create(p,expected)
   return expectedQc
  })
 }
 const stripFingerprint=r=>{if(!r)return null;const {operationalPayloadFingerprint,...core}=r;return core}
 const stripIntegration=r=>{if(!r)return null;const {operationalPhotoManifest,operationalQueueKey,...core}=stripFingerprint(r);return core}
 const transportView=r=>r?{...r,operationalSaveId:r.operationalQueueKey}:null
 async function commit(c,input,original){
  stats.commits++
  if(stats.failCommit)throw Error('MOCK_COMMIT_OFFLINE')
  const {record,jobId:key,baseRevision,uploaderUid}=input
  const {operationalPhotoManifest:manifest,operationalSaveId,firestoreSaveState,operationalPayloadFingerprint:fp,...canonical}=record
  assert.equal(operationalSaveId,key)
  assert.equal(key,jobPayload(original).id,'TRUSTED_QUEUE_KEY_MISMATCH')
  assert.equal(baseRevision,original.baseRevision,'TRUSTED_BASE_REVISION_CONFLICT')
  assert.equal(uploaderUid,original.uploaderUid,'TRUSTED_OWNER_MISMATCH')
  const expected=await receipt(c,original,fp),jobId=expected.operationalSaveId
  const {plannedDailyArea100,operationalQueueKey,...expectedTransport}=transportView(expected)
  assert.deepEqual(record,expectedTransport,'TRUSTED_PROCESSED_PAYLOAD_MISMATCH')
  const result=await commitSyntheticQc({record:canonical,baseRevision,jobId,uploaderUid},{
   currentUid:async()=>c.auth.currentUser?.uid??null,
   transaction:fn=>runTransaction(c.db,async t=>{
    const readDoc=async(col,id)=>{const s=await t.get(path(c,col,id));return s.exists()?s.data():null}
    return fn({
     readQc:async id=>{const row=await readDoc('qc_records',id);if(row?.clientRevision===canonical.clientRevision)assert.equal(row.operationalPayloadFingerprint,fp,'TRUSTED_REPLAY_CONFLICT');return stripIntegration(row)},
     readActual:async id=>{const row=await readDoc('daily_reports',id);if(row?.clientRevision===canonical.clientRevision)assert.equal(row.operationalPayloadFingerprint,fp,'TRUSTED_REPLAY_CONFLICT');return stripFingerprint(row)},
     readAudit:async id=>{const row=await readDoc('qc_operational_audit',id);if(row)assert.equal(row.operationalPayloadFingerprint,fp,'TRUSTED_REPLAY_CONFLICT');return stripFingerprint(row)},
     readDaily:id=>readDoc('daily_plans',id),
     writeQc:(id,r)=>{const next={...r,operationalPhotoManifest:manifest,operationalQueueKey:key,operationalPayloadFingerprint:fp};assert.deepEqual(next,expected,'TRUSTED_TRANSACTION_PAYLOAD_MISMATCH');t.set(path(c,'qc_records',id),next)},
     writeActual:(id,r)=>t.set(path(c,'daily_reports',id),{...r,operationalPayloadFingerprint:fp}),
     writeAudit:(id,r)=>t.set(path(c,'qc_operational_audit',id),{...r,operationalPayloadFingerprint:fp})
    })
   })
  })
  assert.deepEqual(result,stripIntegration(expected),'TRUSTED_COMMIT_RESULT_MISMATCH')
  if(stats.loseAck){stats.loseAck=false;throw Error('MOCK_ACK_LOST')}
  return transportView(expected)
 }
 const run=(c,j)=>processStrictSyntheticJob(j,{
  currentUid:async()=>c.auth.currentUser?.uid??null,
  readRecord:async id=>{
   const row=await get(c,'qc_records',id)
   if(row?.clientRevision===j.record.clientRevision&&row?.operationalQueueKey===j.id){
    const audit=await get(c,'qc_operational_audit',id+':'+row.clientRevision)
    const actual=await get(c,'daily_reports','qcactual_'+id)
    if(!audit||audit.operationalPayloadFingerprint!==row.operationalPayloadFingerprint||(row.dailyPlanId&&row.actualArea100>0&&row.saveType!=='draft'&&(!actual||actual.clientRevision!==row.clientRevision||actual.operationalPayloadFingerprint!==row.operationalPayloadFingerprint)))throw Error('TRUSTED_REPLAY_PAIR_MISMATCH')
   }
   return transportView(row)
  },
  photoBucket:bucket,
  putVerifiedPhoto:async(r,bytes,j)=>{
   stats.uploads++
   if(stats.failUpload)throw Error('MOCK_UPLOAD_OFFLINE')
   await authorize(c,j.record)
   const slot=r.kind==='hold'?'hold_'+r.holdId:r.kind
   const b=Buffer.from(bytes);verifyObject(r,b,j.record,slot)
   await uploadObject(r,b,j.record)
  },
  commitRecord:input=>commit(c,input,j)
 })
 // In-process signer: verified emulator token, current Rules-authorized QC read,
 // confirmed manifest slot only. Not a deployed endpoint.
 async function signSlot(c,id,slot){
  const user=c.auth.currentUser
  if(!user)throw Error('SIGN_AUTH_REQUIRED')
  const token=await authAdmin.verifyIdToken(await user.getIdToken(),true)
  assert.equal(token.uid,user.uid,'SIGN_UID_MISMATCH')
  if(token.qcUat!==true)throw Error('SIGN_CLAIM_REQUIRED')
  const row=await get(c,'qc_records',id)
  if(!row||row.testOnly!==true||row.firestoreSaveState!=='confirmed')throw Error('SIGN_QC_REQUIRED')
  const r=row.operationalPhotoManifest?.[slot]
  if(!r||!['main','scan','hold_uat-h1'].includes(slot))throw Error('SIGN_SLOT_NOT_FOUND')
  const p=ownPath(r,row)
  assert.ok(objects.has(p),'SIGN_OBJECT_NOT_OWNED_BY_RUN')
  verifyObject(r,await download(p),row,slot)
  const url=allowedURL(storageData(await storage.createSignedUrl(p,30),'SIGN_FAILED').signedUrl)
  assert.equal(url.pathname,'/storage/v1/object/sign/'+bucket+'/'+p,'SIGN_PATH_MISMATCH')
  assert.ok(url.searchParams.get('token'),'SIGN_TOKEN_MISSING')
  return url
 }
 async function verifySigned(c,row,slot){
  const response=await safeFetch(await signSlot(c,row.id,slot),{cache:'no-store',headers:{'Cache-Control':'no-cache'}})
  assert.ok(response.ok,'SIGNED_DOWNLOAD_FAILED')
  assert.equal(digest(Buffer.from(await response.arrayBuffer())),row.operationalPhotoManifest[slot].sha256,'SIGNED_HASH_MISMATCH')
 }
 let n=0,stage='preflight',failed=false
 const check=async(name,fn)=>{stage=name;await fn();n++;console.log('PASS: '+name)}
 const q=qc(),j=job(q),aid='qcactual_'+q.id
 const pair=async(r)=>{const a=await read('daily_reports','qcactual_'+r.id),u=await read('qc_operational_audit',r.id+':'+r.clientRevision);assert.equal(a.clientRevision,r.clientRevision);assert.equal(a.actualArea100,r.actualArea100);assert.equal(u.revision,r.clientRevision);const saved=await read('qc_records',r.id);assert.match(saved.operationalPayloadFingerprint,/^sha256-v1:[0-9a-f]{64}$/);assert.equal(a.operationalPayloadFingerprint,saved.operationalPayloadFingerprint);assert.equal(u.operationalPayloadFingerprint,saved.operationalPayloadFingerprint)}
 const absent=async r=>{for(const [c,id] of [['qc_records',r.id],['daily_reports','qcactual_'+r.id],['qc_operational_audit',r.id+':'+r.clientRevision]])assert.equal(await read(c,id),null)}
 try{
  const b=storageData(await client.storage.getBucket(bucket),'STORAGE_BUCKET_LOOKUP_FAILED')
  assert.equal(b.id,bucket);assert.equal(b.public,false);assert.equal(Number(b.file_size_limit),2097152);assert.deepEqual([...b.allowed_mime_types].sort(),['image/jpeg','image/png','image/webp'])
  console.log('Synthetic storage run ID: '+runId)
  assert.equal((await authAdmin.listUsers(1)).users.length,0,'FRESH_AUTH_REQUIRED')
  for(const col of ['qc_uat_identities','users','daily_plans',prefix+'/qc_records',prefix+'/daily_reports',prefix+'/qc_operational_audit',prefix+'/daily_plans',prefix+'/photo_receipts'])assert.equal((await adb.collection(col).limit(1).get()).size,0,'FRESH_FIRESTORE_REQUIRED')
  for(const [k,role] of [['spray','mandor_spraying'],['fert','mandor_fertilizer'],['visitor','pengunjung'],['other','mandor_spraying']]){
   await authAdmin.createUser({uid:uid(k),email:email(k),password:password(k),emailVerified:true})
   await authAdmin.setCustomUserClaims(uid(k),{qcUat:true})
   await markRef(uid(k)).set(marker(role))
  }
  await adb.doc('daily_plans/root-sentinel').set({testOnly:false,rootSentinel:true})
  for(const r of [q,qc('fert','fertilizer')])await ref('daily_plans',r.dailyPlanId).set(daily(r))
  const spray=await open('spray'),fert=await open('fert'),visitor=await open('visitor'),other=await open('other')
  await check('upload failure prevents QC Actual audit',async()=>{stats.failUpload=true;await assert.rejects(run(spray,j),/MOCK_UPLOAD_OFFLINE/);await absent(q);assert.equal(stats.commits,0);stats.failUpload=false})
  await check('commit failure leaves verified real objects but no records',async()=>{stats.failCommit=true;await assert.rejects(run(spray,j),/MOCK_COMMIT_OFFLINE/);await absent(q);assert.equal(objects.size,3);stats.failCommit=false})
  await check('lost ACK after atomic commit leaves all records and manifest',async()=>{stats.loseAck=true;await assert.rejects(run(spray,j),/MOCK_ACK_LOST/);const saved=await read('qc_records',q.id);assert.equal(saved.saveType,'uploaded');assert.equal(saved.photoBase64,undefined);assert.equal(saved.scanReportPhotoBase64,undefined);assert.equal(Object.keys(saved.operationalPhotoManifest).length,3);assert.equal(saved.operationalQueueKey,j.id);await pair(q)})
  await check('replay confirms server job without reupload',async()=>{const before={...stats},result=await run(spray,j);assert.equal(result.status,'confirmed');assert.equal(result.record.operationalSaveId,j.id);assert.deepEqual(stats,before);assert.equal(objects.size,3)})
  await check('viewer can read manifest, another mandor cannot',async()=>{assert.equal(Object.keys((await get(visitor,'qc_records',q.id)).operationalPhotoManifest).length,3);await denied(()=>get(other,'qc_records',q.id))})
  await check('owner and permitted viewer obtain real signed PNG and WebP URLs',async()=>{const row=await read('qc_records',q.id);assert.equal(row.operationalPhotoManifest['hold_uat-h1'].contentType,'image/webp');await verifySigned(spray,row,'main');await verifySigned(visitor,row,'hold_uat-h1')})
  await check('other mandor cannot request signed URL for foreign QC',()=>denied(()=>signSlot(other,q.id,'main')))
  await check('arbitrary slot or path cannot be signed',()=>assert.rejects(signSlot(spray,q.id,'../../foreign'),/SIGN_SLOT_NOT_FOUND/))
  await check('viewer permission revocation blocks new signed URL',async()=>{await markRef(uid('visitor')).set(marker('pengunjung',{}, {qc_records:'none'}));await denied(()=>signSlot(visitor,q.id,'main'));await markRef(uid('visitor')).set(marker('pengunjung'))})
  await check('other UID cannot process original queue job',()=>assert.rejects(run(other,j),/QC_QUEUE_ACCOUNT_MISMATCH/))
  await check('correction preserves photos and same Actual ID',async()=>{const old=(await read('qc_records',q.id)).operationalPhotoManifest,r={...q,clientRevision:'uat-r2',actualArea100:350};await run(spray,job(r,'uat-r1',[]));assert.deepEqual((await read('qc_records',q.id)).operationalPhotoManifest,old);await pair(r);assert.equal((await read('daily_reports',aid)).dailyVariance100,-50)})
  await check('explicit HOLD removal leaves main scan and real objects',async()=>{const old=(await read('qc_records',q.id)).operationalPhotoManifest,r={...q,clientRevision:'uat-r3',actualArea100:350};await run(spray,job(r,'uat-r2',[{kind:'hold',holdId:'uat-h1',action:'remove'}]));assert.deepEqual((await read('qc_records',q.id)).operationalPhotoManifest,{main:old.main,scan:old.scan});assert.equal(objects.size,3);await pair(r)})
  await check('removed HOLD slot cannot issue new signed URL',()=>assert.rejects(signSlot(spray,q.id,'hold_uat-h1'),/SIGN_SLOT_NOT_FOUND/))
  await check('stale revision cannot overwrite newer manifest',()=>assert.rejects(run(spray,job({...q,clientRevision:'uat-stale'},'uat-r1',[])),/QC_REVISION_CONFLICT/))
  await check('fertilizer manifest commits its own pair',async()=>{const r=qc('fert','fertilizer');await run(fert,job(r));await pair(r);assert.equal((await read('qc_records',r.id)).operationalPhotoManifest.main.uploaderUid,'uat-fert')})
  await check('client cannot forge verifier receipt',()=>denied(()=>setDoc(path(spray,'photo_receipts','uat-forged'),{testOnly:true})))
  const saved=await read('qc_records',q.id),actual=await read('daily_reports',aid)
  const j4=job({...q,clientRevision:'uat-r4',actualArea100:360},'uat-r3',[])
  const strict4=await prepareStrictJob(j4)
  const next={...saved,clientRevision:'uat-r4',operationalQueueKey:j4.id,operationalPayloadFingerprint:strict4.payloadFingerprint,actualArea100:360}
  next.operationalSaveId=syntheticJob(next.operationalQueueKey)
  const nextA={...actual,clientRevision:'uat-r4',actualArea100:360,dailyVariance100:-60,operationalPayloadFingerprint:strict4.payloadFingerprint}
  const nextU={testOnly:true,recordId:q.id,revision:'uat-r4',actorUid:q.ownerUid,username:q.ownerUid,formType:q.formType,saveType:'uploaded',operationalPayloadFingerprint:strict4.payloadFingerprint}
  const batch=(row,a=nextA,u=nextU)=>{const b=writeBatch(spray.db);b.set(path(spray,'qc_records',q.id),row);b.set(path(spray,'daily_reports',aid),a);b.set(path(spray,'qc_operational_audit',q.id+':uat-r4'),u);return b.commit()}
  await check('complete three-record write without receipt denied',()=>denied(()=>batch(next)))
  await check('receipt for matching manifest rejects tampered reference',async()=>{assert.deepEqual(await receipt(spray,j4,strict4.payloadFingerprint),next);await denied(()=>batch({...next,operationalPhotoManifest:{...next.operationalPhotoManifest,main:{...next.operationalPhotoManifest.main,objectPath:'uat-other/qc/forged'}}}))})
  await check('receipt cannot authorize inconsistent Actual',()=>denied(()=>batch(next,{...nextA,actualArea100:999})))
  await check('receipt cannot authorize extra Actual field',()=>denied(()=>batch(next,{...nextA,unexpected:true})))
  await check('receipt cannot authorize extra audit field',()=>denied(()=>batch(next,nextA,{...nextU,unexpected:true})))
  await check('receipt cannot authorize QC and Actual without audit',()=>{const b=writeBatch(spray.db);b.set(path(spray,'qc_records',q.id),next);b.set(path(spray,'daily_reports',aid),nextA);return denied(()=>b.commit())})
  await check('standalone Actual remains denied even with valid receipt',()=>denied(()=>setDoc(path(spray,'daily_reports',aid),nextA)))
  await check('standalone audit remains denied even with valid receipt',()=>denied(()=>setDoc(path(spray,'qc_operational_audit',q.id+':uat-r4'),nextU)))
  await check('trusted verifier rejects caller fingerprint not derived from job',()=>assert.rejects(receipt(spray,j4,'sha256-v1:'+'0'.repeat(64)),/TRUSTED_FINGERPRINT_MISMATCH/))
  await check('same fingerprint cannot authorize modified QC and consistent Actual',()=>denied(()=>batch({...next,actualArea100:361},{...nextA,actualArea100:361,dailyVariance100:-61})))
  await check('fingerprint change on QC Actual and audit denied',async()=>{const fp='sha256-v1:'+'1'.repeat(64);await denied(()=>batch({...next,operationalPayloadFingerprint:fp},{...nextA,operationalPayloadFingerprint:fp},{...nextU,operationalPayloadFingerprint:fp}))})
  await check('Actual or audit fingerprint mismatch independently denied',async()=>{const fp='sha256-v1:'+'2'.repeat(64);await denied(()=>batch(next,{...nextA,operationalPayloadFingerprint:fp}));await denied(()=>batch(next,nextA,{...nextU,operationalPayloadFingerprint:fp}))})
  await check('same queue identity different payload cannot replace trusted receipt',async()=>{const divergent=job({...q,clientRevision:'uat-r4',actualArea100:362},'uat-r3',[]);await assert.rejects(receipt(spray,divergent,(await prepareStrictJob(divergent)).payloadFingerprint),/TRUSTED_RECEIPT_CONFLICT/);assert.deepEqual(await receipt(spray,j4,strict4.payloadFingerprint),next)})
  await check('trusted receipt cannot be issued on stale base',async()=>{const stale=job({...q,clientRevision:'uat-badbase'},'uat-r1',[]);await assert.rejects(receipt(spray,stale,(await prepareStrictJob(stale)).payloadFingerprint),/TRUSTED_BASE_REVISION_CONFLICT/);assert.equal(await read('photo_receipts',syntheticJob(stale.id)),null)})
  await check('denied transactions leave confirmed revision and no audit',async()=>{assert.deepEqual(await read('qc_records',q.id),saved);assert.deepEqual(await read('daily_reports',aid),actual);assert.equal(await read('qc_operational_audit',q.id+':uat-r4'),null)})
  await check('valid correction after rejected batches commits same receipt',async()=>{const r={...q,clientRevision:'uat-r4',actualArea100:360};await run(spray,job(r,'uat-r3',[]));await pair(r);assert.equal((await read('qc_records',q.id)).operationalQueueKey,next.operationalQueueKey)})
  await check('divergent server replay cannot fast confirm or reupload',async()=>{const before={...stats};const divergent=job({...q,clientRevision:'uat-r4',actualArea100:361},'uat-r3',[]);await assert.rejects(run(spray,divergent),/QC_REPLAY_PAYLOAD_CONFLICT/);assert.deepEqual(stats,before);await pair({...q,clientRevision:'uat-r4',actualArea100:360})})
  await check('trusted verifier independently rejects changed processed payload',async()=>{const r=qc('spray','spray','uat-q-tamper'),raw=job(r,null,[]),p=await prepareStrictJob(raw);const record={...stripOperationalPhotoPayload(raw.record),saveType:'uploaded',actualArea100:999,operationalPhotoManifest:{},operationalSaveId:raw.id,firestoreSaveState:'confirmed',operationalPayloadFingerprint:p.payloadFingerprint};await assert.rejects(commit(spray,{record,baseRevision:null,jobId:raw.id,uploaderUid:r.ownerUid},raw),/TRUSTED_PROCESSED_PAYLOAD_MISMATCH/);await absent(r)})
  await check('concurrent divergent same revision has one durable winner',async()=>{const a=qc('spray','spray','uat-q-race'),b={...a,actualArea100:260};const ja=job(a,null,[]),jb=job(b,null,[]);const out=await Promise.allSettled([run(spray,ja),run(spray,jb)]);assert.equal(out.filter(x=>x.status==='fulfilled').length,1);const win=out[0].status==='fulfilled'?a:b,winJob=out[0].status==='fulfilled'?ja:jb;assert.match(String(out.find(x=>x.status==='rejected').reason),/TRUSTED_RECEIPT_CONFLICT|QC_REPLAY_PAYLOAD_CONFLICT|TRUSTED_REPLAY_CONFLICT/);await pair(win);assert.equal((await read('qc_records',a.id)).operationalPayloadFingerprint,(await prepareStrictJob(winJob)).payloadFingerprint)})
  await check('permission revocation blocks next upload and record write',async()=>{await markRef(q.ownerUid).set(marker('mandor_spraying',{}, {qc_spraying:'none'}));const r={...q,clientRevision:'uat-r5'};await assert.rejects(run(spray,job(r,'uat-r4')),/MOCK_PHOTO_PERMISSION_DENIED/);assert.equal((await read('qc_records',q.id)).clientRevision,'uat-r4');assert.equal(await read('qc_operational_audit',q.id+':uat-r5'),null)})
  await check('root sentinel unchanged and inaccessible',async()=>{await denied(()=>getDocFromServer(doc(spray.db,'daily_plans','root-sentinel')));assert.deepEqual((await adb.doc('daily_plans/root-sentinel').get()).data(),{testOnly:false,rootSentinel:true})})
 }catch{
  failed=true
  console.error('FAIL: '+stage+' (details suppressed to protect keys and signed URLs)')
 }finally{
  try{await cleanup();console.log('PASS: scoped synthetic storage cleanup; touched folders empty')}
  catch{failed=true;console.error('FAIL: storage cleanup; review synthetic run ID '+runId)}
  try{
   for(const c of clients){try{await signOut(c.auth)}finally{try{await terminate(c.db)}finally{await deleteApp(c.app)}}}
   await adb.terminate()
   await adminDelete(admin)
  }catch{failed=true;console.error('FAIL: emulator client shutdown')}
 }
 if(failed){console.error('Synthetic run ID: '+runId);process.exitCode=1}
 else console.log('SUCCESS: '+n+' Firebase emulator and real Supabase UAT integration checks passed; synthetic cleanup verified')
}
