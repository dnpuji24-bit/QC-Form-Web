// Dedicated demo only: real Auth + Firestore, simulated immutable object store.
import assert from 'node:assert/strict'
import {createHash} from 'node:crypto'
import {createRequire} from 'node:module'
import {readFileSync} from 'node:fs'
import {marker} from '../src/qcUatRolePermissions.mjs'
import {commitSyntheticQc} from '../src/qcUatQcLifecycleContract.mjs'
import {processOperationalQcJob,operationalQueueId} from '../src/qcOperationalSaveTransport.mjs'
const projectId='demo-qc-uat-photo-integration',host='127.0.0.1',port=8585,authPort=9399
const config=JSON.parse(readFileSync(new URL('../firebase.uat-photo-integration-emulator.json',import.meta.url),'utf8'))
const rules=readFileSync(new URL('../scripts/firestore.uat-photo-integration-demo.rules',import.meta.url),'utf8')
function guard(e=process.env){
 assert.equal(e.GCLOUD_PROJECT,projectId,'DEMO_PROJECT_REQUIRED')
 assert.equal(e.FIRESTORE_EMULATOR_HOST,host+':'+port,'FIRESTORE_LOOPBACK_REQUIRED')
 assert.equal(e.FIREBASE_AUTH_EMULATOR_HOST,host+':'+authPort,'AUTH_LOOPBACK_REQUIRED')
 for(const k of ['GOOGLE_CLOUD_PROJECT','FIREBASE_PROJECT_ID'])if(e[k])assert.equal(e[k],projectId,'WRONG_PROJECT')
}
const valid={GCLOUD_PROJECT:projectId,FIRESTORE_EMULATOR_HOST:host+':'+port,FIREBASE_AUTH_EMULATOR_HOST:host+':'+authPort}
assert.ok(process.argv.length===3&&['--self-test','--emulator'].includes(process.argv[2]))
guard(valid)
for(const e of [{},{...valid,GCLOUD_PROJECT:'form-qc-unm'},{...valid,FIRESTORE_EMULATOR_HOST:'127.0.0.1:8485'},{...valid,FIREBASE_AUTH_EMULATOR_HOST:'remote:9399'},{...valid,GOOGLE_CLOUD_PROJECT:'form-qc-unm'}])assert.throws(()=>guard(e))
assert.equal(config.firestore.rules,'scripts/firestore.uat-photo-integration-demo.rules')
assert.deepEqual(config.emulators.firestore,{host,port})
assert.deepEqual(config.emulators.auth,{host,port:authPort})
assert.ok(rules.includes('receiptMatches(q)')&&rules.includes('r.manifest == q.operationalPhotoManifest'))
const digest=v=>createHash('sha256').update(v).digest('hex')
const syntheticJob=key=>'uat-job-'+digest(key).slice(0,48)
assert.match(syntheticJob(operationalQueueId('uat-spray','uat-q1','uat-r1')), /^uat-[a-z0-9-]{1,60}$/)
assert.notEqual(syntheticJob(operationalQueueId('uat-spray','uat-q1','uat-r1')),syntheticJob(operationalQueueId('uat-spray','uat-q1','uat-r2')))
console.log('SUCCESS: photo integration demo and queue identity guards passed (offline)')
if(process.argv[2]==='--emulator'){
 guard()
 const {initializeApp,deleteApp}=await import('firebase/app')
 const {initializeAuth,inMemoryPersistence,connectAuthEmulator,signInWithEmailAndPassword,signOut}=await import('firebase/auth')
 const {initializeFirestore,connectFirestoreEmulator,doc,getDocFromServer,setDoc,writeBatch,runTransaction,terminate}=await import('firebase/firestore')
 const require=createRequire(new URL('../server/qc-photo-access/package.json',import.meta.url))
 const {initializeApp:adminInit,deleteApp:adminDelete}=require('firebase-admin/app')
 const {getAuth}=require('firebase-admin/auth')
 const {getFirestore}=require('firebase-admin/firestore')
 const admin=adminInit({projectId},'photo-integration-admin'),authAdmin=getAuth(admin),adb=getFirestore(admin)
 const prefix='qc_uat_workspaces/cutover',bucket='qc-photos-uat-mock',clients=[],objects=new Map()
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
 const qc=(k='spray',kind='spray',id='uat-q-'+k,rev='uat-r1',area=250)=>({testOnly:true,id,ownerUid:uid(k),inputtedBy:uid(k),formType:kind,clientRevision:rev,saveType:'ready',dailyPlanId:'uat-d-'+kind,monthlyPlanLineId:'uat-m-'+kind,pid:'uat-pid',date:'2026-11-12',shift:'2',foreman:'uat-foreman',actualArea100:area,sessionId:'uat-session'})
 const daily=r=>({testOnly:true,dailyPlanId:r.dailyPlanId,monthlyPlanLineId:r.monthlyPlanLineId,pid:r.pid,date:r.date,shift:r.shift,foreman:r.foreman,formType:r.formType,area100:300})
 const changes=[{kind:'main',action:'replace',dataUrl:png},{kind:'hold',holdId:'uat-h1',action:'replace',dataUrl:png},{kind:'scan',action:'replace',dataUrl:png}]
 const job=(r,baseRevision=null,edits=changes)=>({record:{...r,photoBase64:png,scanReportPhotoBase64:png},uploaderUid:r.ownerUid,baseRevision,action:'finalizeRecord',changes:edits,id:operationalQueueId(r.ownerUid,r.id,r.clientRevision)})
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
 async function receipt(c,record,manifest,key){
  await authorize(c,record)
  assert.equal(key,operationalQueueId(record.ownerUid,record.id,record.clientRevision))
  for(const [slot,r] of Object.entries(manifest)){
   const bytes=objects.get(r.objectPath)
   assert.ok(bytes,'MOCK_OBJECT_MISSING')
   verifyObject(r,bytes,record,slot)
  }
  const jobId=syntheticJob(key),p=ref('photo_receipts',jobId)
  const expected={testOnly:true,recordId:record.id,ownerUid:record.ownerUid,revision:record.clientRevision,jobId,queueKey:key,manifest}
  await adb.runTransaction(async t=>{const s=await t.get(p);if(s.exists)assert.deepEqual(s.data(),expected,'MOCK_RECEIPT_CONFLICT');else t.create(p,expected)})
  return jobId
 }
 // Keep the core contract exact: strip integration-only metadata on transaction
 // reads, attach it to the QC write in the same real transaction as Actual/audit.
 const stripIntegration=r=>{if(!r)return null;const {operationalPhotoManifest,operationalQueueKey,...core}=r;return core}
 const transportView=r=>r?{...r,operationalSaveId:r.operationalQueueKey}:null
 async function commit(c,input){
  stats.commits++
  if(stats.failCommit)throw Error('MOCK_COMMIT_OFFLINE')
  const {record,jobId:key,baseRevision,uploaderUid}=input
  const {operationalPhotoManifest:manifest,operationalSaveId,firestoreSaveState,...canonical}=record
  assert.equal(operationalSaveId,key)
  const jobId=await receipt(c,canonical,manifest,key)
  const result=await commitSyntheticQc({record:canonical,baseRevision,jobId,uploaderUid},{
   currentUid:async()=>c.auth.currentUser?.uid??null,
   transaction:fn=>runTransaction(c.db,async t=>{
    const readDoc=async(col,id)=>{const s=await t.get(path(c,col,id));return s.exists()?s.data():null}
    return fn({
     readQc:async id=>stripIntegration(await readDoc('qc_records',id)),
     readActual:id=>readDoc('daily_reports',id),
     readAudit:id=>readDoc('qc_operational_audit',id),
     readDaily:id=>readDoc('daily_plans',id),
     writeQc:(id,r)=>t.set(path(c,'qc_records',id),{...r,operationalPhotoManifest:manifest,operationalQueueKey:key}),
     writeActual:(id,r)=>t.set(path(c,'daily_reports',id),r),
     writeAudit:(id,r)=>t.set(path(c,'qc_operational_audit',id),r)
    })
   })
  })
  if(stats.loseAck){stats.loseAck=false;throw Error('MOCK_ACK_LOST')}
  return {...result,operationalPhotoManifest:manifest,operationalQueueKey:key,operationalSaveId:key}
 }
 const run=(c,j)=>processOperationalQcJob(j,{
  currentUid:async()=>c.auth.currentUser?.uid??null,
  readRecord:async id=>transportView(await get(c,'qc_records',id)),
  photoBucket:bucket,
  putVerifiedPhoto:async(r,bytes,j)=>{
   stats.uploads++
   if(stats.failUpload)throw Error('MOCK_UPLOAD_OFFLINE')
   await authorize(c,j.record)
   const slot=r.kind==='hold'?'hold_'+r.holdId:r.kind
   const b=Buffer.from(bytes);verifyObject(r,b,j.record,slot)
   const old=objects.get(r.objectPath)
   if(old)assert.deepEqual(old,b,'MOCK_IMMUTABLE_CONFLICT')
   else objects.set(r.objectPath,b)
  },
  commitRecord:input=>commit(c,input)
 })
 let n=0
 const check=async(name,fn)=>{try{await fn()}catch(e){throw Error('FAIL: '+name,{cause:e})}n++;console.log('PASS: '+name)}
 const q=qc(),j=job(q),aid='qcactual_'+q.id
 const pair=async(r)=>{const a=await read('daily_reports','qcactual_'+r.id),u=await read('qc_operational_audit',r.id+':'+r.clientRevision);assert.equal(a.clientRevision,r.clientRevision);assert.equal(a.actualArea100,r.actualArea100);assert.equal(u.revision,r.clientRevision)}
 const absent=async r=>{for(const [c,id] of [['qc_records',r.id],['daily_reports','qcactual_'+r.id],['qc_operational_audit',r.id+':'+r.clientRevision]])assert.equal(await read(c,id),null)}
 try{
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
  await check('commit failure leaves verified mock objects but no records',async()=>{stats.failCommit=true;await assert.rejects(run(spray,j),/MOCK_COMMIT_OFFLINE/);await absent(q);assert.equal(objects.size,3);stats.failCommit=false})
  await check('lost ACK after atomic commit leaves all records and manifest',async()=>{stats.loseAck=true;await assert.rejects(run(spray,j),/MOCK_ACK_LOST/);const saved=await read('qc_records',q.id);assert.equal(saved.saveType,'uploaded');assert.equal(saved.photoBase64,undefined);assert.equal(saved.scanReportPhotoBase64,undefined);assert.equal(Object.keys(saved.operationalPhotoManifest).length,3);assert.equal(saved.operationalQueueKey,j.id);await pair(q)})
  await check('replay confirms server job without reupload',async()=>{const before={...stats},result=await run(spray,j);assert.equal(result.status,'confirmed');assert.equal(result.record.operationalSaveId,j.id);assert.deepEqual(stats,before);assert.equal(objects.size,3)})
  await check('viewer can read manifest, another mandor cannot',async()=>{assert.equal(Object.keys((await get(visitor,'qc_records',q.id)).operationalPhotoManifest).length,3);await denied(()=>get(other,'qc_records',q.id))})
  await check('other UID cannot process original queue job',()=>assert.rejects(run(other,j),/QC_QUEUE_ACCOUNT_MISMATCH/))
  await check('correction preserves photos and same Actual ID',async()=>{const old=(await read('qc_records',q.id)).operationalPhotoManifest,r={...q,clientRevision:'uat-r2',actualArea100:350};await run(spray,job(r,'uat-r1',[]));assert.deepEqual((await read('qc_records',q.id)).operationalPhotoManifest,old);await pair(r);assert.equal((await read('daily_reports',aid)).dailyVariance100,-50)})
  await check('explicit HOLD removal leaves main scan and mock objects',async()=>{const old=(await read('qc_records',q.id)).operationalPhotoManifest,r={...q,clientRevision:'uat-r3',actualArea100:350};await run(spray,job(r,'uat-r2',[{kind:'hold',holdId:'uat-h1',action:'remove'}]));assert.deepEqual((await read('qc_records',q.id)).operationalPhotoManifest,{main:old.main,scan:old.scan});assert.equal(objects.size,3);await pair(r)})
  await check('stale revision cannot overwrite newer manifest',()=>assert.rejects(run(spray,job({...q,clientRevision:'uat-stale'},'uat-r1',[])),/QC_REVISION_CONFLICT/))
  await check('fertilizer manifest commits its own pair',async()=>{const r=qc('fert','fertilizer');await run(fert,job(r));await pair(r);assert.equal((await read('qc_records',r.id)).operationalPhotoManifest.main.uploaderUid,'uat-fert')})
  await check('client cannot forge verifier receipt',()=>denied(()=>setDoc(path(spray,'photo_receipts','uat-forged'),{testOnly:true})))
  const saved=await read('qc_records',q.id),actual=await read('daily_reports',aid)
  const next={...saved,clientRevision:'uat-r4',operationalQueueKey:operationalQueueId(q.ownerUid,q.id,'uat-r4'),actualArea100:360}
  next.operationalSaveId=syntheticJob(next.operationalQueueKey)
  const nextA={...actual,clientRevision:'uat-r4',actualArea100:360,dailyVariance100:-60}
  const nextU={testOnly:true,recordId:q.id,revision:'uat-r4',actorUid:q.ownerUid,username:q.ownerUid,formType:q.formType,saveType:'uploaded'}
  const batch=(row,a=nextA,u=nextU)=>{const b=writeBatch(spray.db);b.set(path(spray,'qc_records',q.id),row);b.set(path(spray,'daily_reports',aid),a);b.set(path(spray,'qc_operational_audit',q.id+':uat-r4'),u);return b.commit()}
  await check('complete three-record write without receipt denied',()=>denied(()=>batch(next)))
  await check('receipt for matching manifest rejects tampered reference',async()=>{await receipt(spray,{...q,clientRevision:'uat-r4'},next.operationalPhotoManifest,next.operationalQueueKey);await denied(()=>batch({...next,operationalPhotoManifest:{...next.operationalPhotoManifest,main:{...next.operationalPhotoManifest.main,objectPath:'uat-other/qc/forged'}}}))})
  await check('receipt cannot authorize inconsistent Actual',()=>denied(()=>batch(next,{...nextA,actualArea100:999})))
  await check('denied transactions leave confirmed revision and no audit',async()=>{assert.deepEqual(await read('qc_records',q.id),saved);assert.deepEqual(await read('daily_reports',aid),actual);assert.equal(await read('qc_operational_audit',q.id+':uat-r4'),null)})
  await check('valid correction after rejected batches commits same receipt',async()=>{const r={...q,clientRevision:'uat-r4',actualArea100:360};await run(spray,job(r,'uat-r3',[]));await pair(r);assert.equal((await read('qc_records',q.id)).operationalQueueKey,next.operationalQueueKey)})
  await check('permission revocation blocks next upload and record write',async()=>{await markRef(q.ownerUid).set(marker('mandor_spraying',{}, {qc_spraying:'none'}));const r={...q,clientRevision:'uat-r5'};await assert.rejects(run(spray,job(r,'uat-r4')),/MOCK_PHOTO_PERMISSION_DENIED/);assert.equal((await read('qc_records',q.id)).clientRevision,'uat-r4');assert.equal(await read('qc_operational_audit',q.id+':uat-r5'),null)})
  await check('root sentinel unchanged and inaccessible',async()=>{await denied(()=>getDocFromServer(doc(spray.db,'daily_plans','root-sentinel')));assert.deepEqual((await adb.doc('daily_plans/root-sentinel').get()).data(),{testOnly:false,rootSentinel:true})})
  console.log('SUCCESS: '+n+' integrated QC photo transport and Firestore checks passed (real Auth/Firestore emulators, mock storage only)')
 }finally{
  for(const c of clients){try{await signOut(c.auth)}finally{try{await terminate(c.db)}finally{await deleteApp(c.app)}}}
  await adb.terminate()
  await adminDelete(admin)
 }
}
