// Actual Auth and Firestore Emulator; full DTO photo gate with immutable mock storage.
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {createRequire} from 'node:module'
import {fixture} from './qc-uat-spray-full-dto-fixture.mjs'
import {buildQcActualPayload} from './qc-uat-load-actual-mapper.mjs'
import {marker} from '../src/qcUatRolePermissions.mjs'
import {createSprayPhotoService,sprayPhotoFingerprint,guardSprayPhoto,demoProject,demoHost,firestorePort,authPort} from '../server/qc-photo-access/uat-spray-photo-service.mjs'
const config=JSON.parse(readFileSync(new URL('../firebase.uat-spray-photo-emulator.json',import.meta.url),'utf8'))
const rules=readFileSync(new URL('../scripts/firestore.uat-spray-full-demo.rules',import.meta.url),'utf8')
const env={GCLOUD_PROJECT:demoProject,FIRESTORE_EMULATOR_HOST:demoHost+':'+firestorePort,FIREBASE_AUTH_EMULATOR_HOST:demoHost+':'+authPort}
assert.equal(demoProject,'demo-qc-uat-spray-photo')
guardSprayPhoto(env)
for(const e of [{},{...env,GCLOUD_PROJECT:'form-qc-unm'},{...env,FIRESTORE_EMULATOR_HOST:'remote:9185'},{...env,FIREBASE_AUTH_EMULATOR_HOST:'127.0.0.1:9499'},{...env,FIREBASE_PROJECT_ID:'form-qc-unm'}])assert.throws(()=>guardSprayPhoto(e))
assert.equal(config.firestore.rules,'scripts/firestore.uat-spray-full-demo.rules')
assert.deepEqual(config.emulators.firestore,{host:demoHost,port:firestorePort})
assert.deepEqual(config.emulators.auth,{host:demoHost,port:authPort})
assert.match(rules,/allow read, write: if false;/)
assert.doesNotMatch(rules,/allow[^;]*if true/)
assert.match(readFileSync(new URL('../src/firebase.ts',import.meta.url),'utf8'),/QC_HOSTED_UAT_ISOLATION_REQUIRED/)
const {r,dp}=fixture()
assert.equal(sprayPhotoFingerprint(r,null),sprayPhotoFingerprint(Object.fromEntries(Object.entries(r).reverse()),null))
assert.notEqual(sprayPhotoFingerprint(r,null),sprayPhotoFingerprint({...r,noted:'different'},null))
assert.notEqual(sprayPhotoFingerprint(r,null),sprayPhotoFingerprint(r,'uat-base'))
assert.ok(process.argv.length===3&&['--self-test','--emulator'].includes(process.argv[2]))
assert.notEqual(sprayPhotoFingerprint(r,null,[]),sprayPhotoFingerprint(r,null,[{kind:'main',action:'remove'}]))
console.log('SUCCESS: full Spray photo demo, deny-all rules and fingerprint guards passed (offline)')
if(process.argv[2]==='--emulator'){
 guardSprayPhoto()
 const require=createRequire(new URL('../server/qc-photo-access/package.json',import.meta.url))
 const {initializeApp:adminInit,deleteApp:adminDelete}=require('firebase-admin/app')
 const {getAuth}=require('firebase-admin/auth')
 const {getFirestore}=require('firebase-admin/firestore')
 const {initializeApp,deleteApp}=await import('firebase/app')
 const {initializeAuth,inMemoryPersistence,connectAuthEmulator,signInWithEmailAndPassword,signOut}=await import('firebase/auth')
 const {initializeFirestore,connectFirestoreEmulator,doc,setDoc,getDocFromServer,terminate}=await import('firebase/firestore')
 const admin=adminInit({projectId:demoProject},'spray-full-admin'),db=getFirestore(admin),authAdmin=getAuth(admin),clients=[],tokens={}
 const prefix='qc_uat_workspaces/cutover'
 const ref=(c,id)=>db.doc(prefix+'/'+c+'/'+id)
 const mark=uid=>db.doc('qc_uat_identities/'+uid)
 const read=async(c,id)=>(await ref(c,id).get()).data()??null
 const q=(id=r.id)=>read('qc_records',id),ap=(id=r.id)=>read('daily_reports','qcactual_'+id),audit=(id=r.id,rev=r.clientRevision)=>read('qc_operational_audit',id+':'+rev)
 const snapshot=async(id=r.id)=>({q:await q(id),ap:await ap(id),audits:(await db.collection(prefix+'/qc_operational_audit').where('recordId','==',id).get()).docs.map(d=>d.data()).sort((a,b)=>a.revision.localeCompare(b.revision))})
 const objects=new Map(),stats={puts:0,reads:0}
 let failUpload=false,afterStage=null
 const photoStore={
  putImmutable:async(ref,bytes)=>{
   if(failUpload)throw Error('MOCK_UPLOAD_FAILED')
   stats.puts++
   const copy=Buffer.from(bytes),old=objects.get(ref.objectPath)
   if(old)assert.deepEqual(old,copy);else objects.set(ref.objectPath,copy)
   if(afterStage){const fn=afterStage;afterStage=null;await fn()}
  },
  read:async ref=>{stats.reads++;return objects.get(ref.objectPath)}
 }
 const save=createSprayPhotoService({db,verifyToken:t=>authAdmin.verifyIdToken(t,true),buildActual:buildQcActualPayload,photoStore})
 const call=(record,baseRevision=null,changes=[],uid='uat-spray')=>save(tokens[uid],{record,baseRevision,changes})
 const reject=(fn,message)=>assert.rejects(fn,{message})
 const fresh=(id,uid='uat-spray')=>({...fixture().r,id,ownerUid:uid,inputtedBy:uid})
 const revise=(record,clientRevision,area)=>({...record,clientRevision,area:String(area),actualAreaHa:area,productivityHaPerHour:Math.round(area/9*100)/100,estUsageAdjuvant:(0.5*350*area/1000).toFixed(2),estUsagePesticide1:(2*area).toFixed(2),actualPlanMaterials:[{...record.actualPlanMaterials[0],totalMaterial:2*area}]})
 let n=0
 const check=async(name,fn)=>{try{await fn()}catch(e){throw Error('FAIL: '+name,{cause:e})}n++;console.log('PASS: '+name)}
 try{
  assert.equal((await authAdmin.listUsers(1)).users.length,0,'FRESH_AUTH_REQUIRED')
  for(const c of ['qc_uat_identities','users',prefix+'/daily_plans',prefix+'/qc_records',prefix+'/daily_reports',prefix+'/qc_operational_audit','daily_plans'])assert.equal((await db.collection(c).limit(1).get()).size,0,'FRESH_DB_REQUIRED')
  for(const [uid,role] of Object.entries({'uat-spray':'mandor_spraying','uat-other':'mandor_spraying','uat-view':'pengunjung','uat-prod':'owner','uat-noclaim':'mandor_spraying'})){
   const email=uid+'@spray-full.example.test',password='Synthetic-full-spray-2026'
   await authAdmin.createUser({uid,email,password,emailVerified:true})
   if(uid!=='uat-noclaim')await authAdmin.setCustomUserClaims(uid,{qcUat:true})
   await mark(uid).set(marker(role))
   if(uid==='uat-prod')await db.doc('users/'+uid).set({active:true})
   const app=initializeApp({projectId:demoProject,apiKey:'demo-only-not-real'},'spray-full-'+uid)
   const auth=initializeAuth(app,{persistence:inMemoryPersistence});connectAuthEmulator(auth,'http://'+demoHost+':'+authPort,{disableWarnings:true})
   const f=initializeFirestore(app,{});connectFirestoreEmulator(f,demoHost,firestorePort)
   clients.push({uid,app,auth,f})
   const {user}=await signInWithEmailAndPassword(auth,email,password)
   tokens[uid]=await user.getIdToken()
  }
  await ref('daily_plans',dp.dailyPlanId).set(dp)
  await db.doc('daily_plans/root-sentinel').set({testOnly:false,rootSentinel:true})
  const png='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jR1sAAAAASUVORK5CYII='
  const photo={...r,photoBase64:png,holdIntervals:[{...r.holdIntervals[0],photoBase64:png}]}
  const changes=[{kind:'main',action:'replace',dataUrl:png},{kind:'hold',holdId:'uat-h1',action:'replace',dataUrl:png}]
  const ready={...r,clientRevision:'uat-r2'}
  const uploaded={...r,clientRevision:'uat-r3',saveType:'uploaded'}
  await check('direct client write denied in dedicated demo',async()=>{await assert.rejects(setDoc(doc(clients[0].f,prefix+'/qc_records/'+r.id),r),{code:'permission-denied'});assert.equal(await q(),null)})
  await check('foreign owner, viewer and invalid source denied before staging',async()=>{
   await reject(()=>call(photo,null,changes,'uat-other'),'OWNER_REQUIRED')
   await reject(()=>call({...photo,ownerUid:'uat-view',inputtedBy:'uat-view'},null,changes,'uat-view'),'FORM_EDIT_REQUIRED')
   await reject(()=>call({...photo,monthlyPlanLineId:'uat-wrong'},null,changes),'SOURCE_DP_MISMATCH')
   assert.equal(stats.puts,0);assert.equal(await q(),null)
  })
  await check('forged path, mismatched bytes, duplicate slot and unknown HOLD denied',async()=>{
   await reject(()=>call(photo,null,[{...changes[0],objectPath:'foreign'},changes[1]]),'PHOTO_CHANGE_INVALID')
   await reject(()=>call(photo,null,[{...changes[0],dataUrl:'data:image/png;base64,AA=='},changes[1]]),'PHOTO_INTENT_MISMATCH')
   await reject(()=>call(photo,null,[changes[0],changes[0],changes[1]]),'PHOTO_SLOT_DUPLICATE')
   await reject(()=>call(photo,null,[changes[0],{...changes[1],holdId:'uat-unknown'}]),'PHOTO_INTENT_MISMATCH')
   await reject(()=>call({...photo,photoBase64:'data:image/png;base64,AA=='},null,[{...changes[0],dataUrl:'data:image/png;base64,AA=='},changes[1]]),'PHOTO_FORMAT_INVALID')
   assert.equal(stats.puts,0);assert.equal(await q(),null)
  })
  await check('cannot jump directly to Uploaded',async()=>{await reject(()=>call({...photo,saveType:'uploaded'},null,changes),'READY_REQUIRED_FOR_UPLOAD');assert.equal(stats.puts,0)})
  await check('upload failure leaves no QC Actual or audit',async()=>{
   failUpload=true;try{await reject(()=>call({...photo,saveType:'draft'},null,changes),'MOCK_UPLOAD_FAILED')}finally{failUpload=false}
   assert.deepEqual(await snapshot(),{q:null,ap:null,audits:[]})
  })
  await check('permission revoked after immutable staging blocks final commit',async()=>{
   afterStage=()=>mark(r.ownerUid).set(marker('mandor_spraying',{}, {qc_spraying:'view'}))
   await reject(()=>call({...photo,saveType:'draft'},null,changes),'FORM_EDIT_REQUIRED')
   assert.deepEqual(await snapshot(),{q:null,ap:null,audits:[]})
   await mark(r.ownerUid).set(marker('mandor_spraying'))
  })
  await check('Draft commits verified main and HOLD references but no Actual',async()=>{
   const out=await call({...photo,saveType:'draft'},null,changes),s=await snapshot()
   assert.equal(out.status,'confirmed');assert.equal(s.q.saveType,'draft');assert.equal(s.ap,null);assert.equal(s.audits.length,1)
   const m=s.q.operationalPhotoManifest;assert.deepEqual(Object.keys(m).sort(),['hold_uat-h1','main'])
   assert.notEqual(m.main.objectPath,m['hold_uat-h1'].objectPath);assert.equal(objects.size,2)
   assert.equal(s.q.photoBase64,undefined);assert.equal(s.q.holdIntervals[0].photoBase64,undefined)
   assert.equal(s.q.photoManifestFingerprint,s.audits[0].photoManifestFingerprint)
  })
  await check('Ready preserves photos and generates same-source Actual',async()=>{
   const previous=await q(),puts=stats.puts
   await call(ready,'uat-r1')
   const s=await snapshot();assert.deepEqual(s.q.operationalPhotoManifest,previous.operationalPhotoManifest)
   assert.equal(s.ap.dailyPlanId,dp.dailyPlanId);assert.equal(s.ap.shift,'2');assert.equal(s.ap.foreman,'Mandor B');assert.equal(s.ap.actualAreaHa,9);assert.equal(s.ap.dailyVarianceHa,-1)
   assert.equal(s.ap.photoManifestFingerprint,s.q.photoManifestFingerprint);assert.equal(stats.puts,puts)
  })
  await check('missing stored bytes prevents finalization without partial writes',async()=>{
   const s=await snapshot(),path=s.q.operationalPhotoManifest.main.objectPath,bytes=objects.get(path)
   objects.delete(path)
   try{await reject(()=>call(uploaded,'uat-r2'),'PHOTO_BYTES_UNVERIFIED');assert.deepEqual(await snapshot(),s)}finally{objects.set(path,bytes)}
  })
  await check('Uploaded atomically retains same Actual and audit manifest binding',async()=>{
   const previous=await snapshot(),out=await call(uploaded,'uat-r2'),s=await snapshot()
   assert.equal(out.status,'confirmed');assert.equal(s.q.saveType,'uploaded');assert.equal(s.ap.actualReportId,previous.ap.actualReportId);assert.deepEqual(s.q.operationalPhotoManifest,previous.q.operationalPhotoManifest)
   assert.equal(s.audits.length,3);assert.equal(s.audits[2].photoManifestFingerprint,s.q.photoManifestFingerprint)
   assert.equal(s.q.operationalPayloadFingerprint,s.ap.operationalPayloadFingerprint)
  })
  await check('lost acknowledgement exact retry does not upload or duplicate audit',async()=>{
   const before=await snapshot(),puts=stats.puts;assert.equal((await call(uploaded,'uat-r2')).replayed,true);assert.equal(stats.puts,puts);assert.deepEqual(await snapshot(),before)
   await reject(()=>call({...uploaded,noted:'different'},'uat-r2'),'QC_REPLAY_PAYLOAD_CONFLICT')
  })
  await check('Uploaded correction explicitly removes HOLD while retaining main',async()=>{
   const before=await snapshot(),corrected=revise(uploaded,'uat-r4',10)
   await call(corrected,'uat-r3',[{kind:'hold',holdId:'uat-h1',action:'remove'}])
   const s=await snapshot();assert.deepEqual(s.q.operationalPhotoManifest,{main:before.q.operationalPhotoManifest.main})
   assert.equal(s.ap.actualAreaHa,10);assert.equal(s.ap.actualReportId,before.ap.actualReportId);assert.equal(s.q.holdIntervals.length,1);assert.equal(objects.size,2)
   const puts=stats.puts;assert.equal((await call(corrected,'uat-r3',[{kind:'hold',holdId:'uat-h1',action:'remove'}])).replayed,true);assert.equal(stats.puts,puts)
  })
  await check('stored foreign reference denied before reading objects',async()=>{
   const s=await snapshot(),reads=stats.reads
   await ref('qc_records',r.id).update({operationalPhotoManifest:{main:{...s.q.operationalPhotoManifest.main,objectPath:'foreign/path.png'}}})
   try{await reject(()=>call(revise(uploaded,'uat-r5',11),'uat-r4'),'PHOTO_SCOPE_INVALID');assert.equal(stats.reads,reads)}finally{await ref('qc_records',r.id).set(s.q)}
   assert.deepEqual(await snapshot(),s)
  })
  await check('revoked edit denies exact Uploaded correction replay',async()=>{
   const before=await snapshot(),puts=stats.puts
   await mark(r.ownerUid).set(marker('mandor_spraying',{}, {qc_spraying:'none'}))
   try{await reject(()=>call(revise(uploaded,'uat-r4',10),'uat-r3',[{kind:'hold',holdId:'uat-h1',action:'remove'}]),'FORM_EDIT_REQUIRED')}finally{await mark(r.ownerUid).set(marker('mandor_spraying'))}
   assert.equal(stats.puts,puts);assert.deepEqual(await snapshot(),before)
  })
  await check('stale correction cannot stage new objects and root sentinel unchanged',async()=>{
   const before=await snapshot(),puts=stats.puts
   await reject(()=>call({...revise(uploaded,'uat-r5',11),photoBase64:png},'uat-r2',[changes[0]]),'QC_REVISION_CONFLICT')
   assert.equal(stats.puts,puts);assert.deepEqual(await snapshot(),before)
   assert.deepEqual((await db.doc('daily_plans/root-sentinel').get()).data(),{testOnly:false,rootSentinel:true})
  })
  await check('multiple HOLD photos have independent immutable slots',async()=>{
   const id='qc-v2-uat-multi-hold',second={...photo.holdIntervals[0],holdId:'uat-h2',start:'20:00',end:'20:30'}
   const row={...photo,id,holdIntervals:[...photo.holdIntervals,second],holdTotalMinutes:90,effectiveWorkingMinutes:510,productivityHaPerHour:1.06}
   const intents=[...changes,{kind:'hold',holdId:'uat-h2',action:'replace',dataUrl:png}]
   const out=await call(row,null,intents),m=out.record.operationalPhotoManifest
   assert.deepEqual(Object.keys(m).sort(),['hold_uat-h1','hold_uat-h2','main'])
   assert.equal(new Set(Object.values(m).map(ref=>ref.objectPath)).size,3)
   assert.equal((await ap(id)).dailyPlanId,dp.dailyPlanId)
   assert.equal((await call(row,null,intents)).replayed,true)
  })
  await check('photo replacement creates new immutable object and preserves untouched HOLD',async()=>{
   const id='qc-v2-uat-multi-hold',before=await q(id),webp='data:image/webp;base64,UklGRh4AAABXRUJQVlA4TBEAAAAvAAAAAAdQsmZUpv+BiOh/AAA='
   const second={...r.holdIntervals[0],holdId:'uat-h2',start:'20:00',end:'20:30',photoBase64:''}
   const next={...r,id,clientRevision:'uat-r2',saveType:'uploaded',photoBase64:webp,holdIntervals:[r.holdIntervals[0],second],holdTotalMinutes:90,effectiveWorkingMinutes:510,productivityHaPerHour:1.06}
   const out=await call(next,'uat-r1',[{kind:'main',action:'replace',dataUrl:webp}]),m=out.record.operationalPhotoManifest
   assert.notEqual(m.main.objectPath,before.operationalPhotoManifest.main.objectPath)
   assert.equal(m.main.contentType,'image/webp');assert.ok(objects.has(before.operationalPhotoManifest.main.objectPath))
   assert.deepEqual(m['hold_uat-h1'],before.operationalPhotoManifest['hold_uat-h1'])
   assert.deepEqual(m['hold_uat-h2'],before.operationalPhotoManifest['hold_uat-h2'])
   assert.equal((await q(id)).saveType,'uploaded')
  })
  await check('corrupt object bytes block replay without mutation',async()=>{
   const before=await snapshot(),ref=before.q.operationalPhotoManifest.main,bytes=objects.get(ref.objectPath),puts=stats.puts
   objects.set(ref.objectPath,Buffer.alloc(bytes.length,0))
   try{await reject(()=>call(revise(uploaded,'uat-r4',10),'uat-r3',[{kind:'hold',holdId:'uat-h1',action:'remove'}]),'PHOTO_BYTES_UNVERIFIED');assert.deepEqual(await snapshot(),before);assert.equal(stats.puts,puts)}finally{objects.set(ref.objectPath,bytes)}
  })
  await check('concurrent same revision photo intents allow one durable winner',async()=>{
   const id='qc-v2-uat-multi-hold',before=await q(id)
   const second={...r.holdIntervals[0],holdId:'uat-h2',start:'20:00',end:'20:30',photoBase64:''}
   const row={...r,id,clientRevision:'uat-r3',saveType:'uploaded',holdIntervals:[r.holdIntervals[0],second],holdTotalMinutes:90,effectiveWorkingMinutes:510,productivityHaPerHour:1.06}
   const proposals=[call(row,'uat-r2',[{kind:'main',action:'remove'}]),call({...row,photoBase64:png},'uat-r2',[changes[0]])]
   const settled=await Promise.allSettled(proposals)
   assert.equal(settled.filter(x=>x.status==='fulfilled').length,1)
   assert.equal(settled.find(x=>x.status==='rejected').reason.message,'QC_REPLAY_PAYLOAD_CONFLICT')
   const s=await snapshot(id);assert.equal(s.q.clientRevision,'uat-r3');assert.equal(s.ap.clientRevision,'uat-r3');assert.equal(s.audits.length,3)
   assert.deepEqual(s.q.operationalPhotoManifest['hold_uat-h1'],before.operationalPhotoManifest['hold_uat-h1'])
   assert.equal(s.q.photoManifestFingerprint,s.ap.photoManifestFingerprint);assert.equal(s.q.photoManifestFingerprint,s.audits[2].photoManifestFingerprint)
  })
  console.log('SUCCESS: '+n+' full Spray photo and Uploaded transaction checks (Auth/Firestore emulators, mock storage only)')
 }finally{
  for(const c of clients){try{await signOut(c.auth)}finally{await terminate(c.f);await deleteApp(c.app)}}
  await db.terminate();await adminDelete(admin)
 }
}
