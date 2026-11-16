// Actual Auth and Firestore Emulator; full DTO photo gate with immutable mock storage.
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {createRequire} from 'node:module'
import {multi,master,row} from './qc-uat-fertilizer-material-fixture.mjs'
import {componentProgressRecords} from '../src/qcUatFertilizerMaterialIntegration.mjs'
import {fertilizerComponentProgress} from '../src/qcUatFertilizerComponentProgress.mjs'
import {buildQcActualPayload} from './qc-uat-load-actual-mapper.mjs'
import {marker} from '../src/qcUatRolePermissions.mjs'
import {createFertilizerPhotoService,fertilizerPhotoFingerprint,guardFertilizerPhoto,demoProject,demoHost,firestorePort,authPort} from '../server/qc-photo-access/uat-fertilizer-photo-service.mjs'
const config=JSON.parse(readFileSync(new URL('../firebase.uat-fertilizer-photo-emulator.json',import.meta.url),'utf8'))
const rules=readFileSync(new URL('../scripts/firestore.uat-fertilizer-full-demo.rules',import.meta.url),'utf8')
const env={GCLOUD_PROJECT:demoProject,FIRESTORE_EMULATOR_HOST:demoHost+':'+firestorePort,FIREBASE_AUTH_EMULATOR_HOST:demoHost+':'+authPort}
assert.equal(demoProject,'demo-qc-uat-fertilizer-photo')
guardFertilizerPhoto(env)
for(const e of [{},{...env,GCLOUD_PROJECT:'form-qc-unm'},{...env,FIRESTORE_EMULATOR_HOST:'remote:9385'},{...env,FIREBASE_AUTH_EMULATOR_HOST:'127.0.0.1:9499'},{...env,FIREBASE_PROJECT_ID:'form-qc-unm'}])assert.throws(()=>guardFertilizerPhoto(e))
assert.equal(config.firestore.rules,'scripts/firestore.uat-fertilizer-full-demo.rules')
assert.deepEqual(config.emulators.firestore,{host:demoHost,port:firestorePort})
assert.deepEqual(config.emulators.auth,{host:demoHost,port:authPort})
assert.match(rules,/allow read, write: if false;/)
assert.doesNotMatch(rules,/allow[^;]*if true/)
assert.match(readFileSync(new URL('../src/firebase.ts',import.meta.url),'utf8'),/QC_HOSTED_UAT_ISOLATION_REQUIRED/)
const {r,dp}=multi()
assert.equal(fertilizerPhotoFingerprint(r,null),fertilizerPhotoFingerprint(Object.fromEntries(Object.entries(r).reverse()),null))
assert.notEqual(fertilizerPhotoFingerprint(r,null),fertilizerPhotoFingerprint({...r,noted:'different'},null))
assert.notEqual(fertilizerPhotoFingerprint(r,null),fertilizerPhotoFingerprint(r,'uat-base'))
assert.ok(process.argv.length===3&&['--self-test','--emulator'].includes(process.argv[2]))
assert.notEqual(fertilizerPhotoFingerprint(r,null,[]),fertilizerPhotoFingerprint(r,null,[{kind:'main',action:'remove'}]))
console.log('SUCCESS: full Fertilizer photo demo, deny-all rules and fingerprint guards passed (offline)')
if(process.argv[2]==='--emulator'){
 guardFertilizerPhoto()
 const require=createRequire(new URL('../server/qc-photo-access/package.json',import.meta.url))
 const {initializeApp:adminInit,deleteApp:adminDelete}=require('firebase-admin/app')
 const {getAuth}=require('firebase-admin/auth')
 const {getFirestore}=require('firebase-admin/firestore')
 const {initializeApp,deleteApp}=await import('firebase/app')
 const {initializeAuth,inMemoryPersistence,connectAuthEmulator,signInWithEmailAndPassword,signOut}=await import('firebase/auth')
 const {initializeFirestore,connectFirestoreEmulator,doc,setDoc,getDocFromServer,terminate}=await import('firebase/firestore')
 const admin=adminInit({projectId:demoProject},'fertilizer-full-admin'),db=getFirestore(admin),authAdmin=getAuth(admin),clients=[],tokens={}
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
 const save=createFertilizerPhotoService({db,verifyToken:t=>authAdmin.verifyIdToken(t,true),buildActual:buildQcActualPayload,photoStore})
 const call=(record,baseRevision=null,changes=[],uid='uat-fertilizer')=>save(tokens[uid],{record,baseRevision,changes})
 const reject=(fn,message)=>assert.rejects(fn,{message})
 const fresh=(id,uid='uat-fertilizer')=>({...multi().r,id,ownerUid:uid,inputtedBy:uid})
 const revise=(record,clientRevision,area)=>({...multi([row(1,9450,21),row(2,150*area,area,'Synthetic DAP',150)]).r,id:record.id,ownerUid:record.ownerUid,inputtedBy:record.inputtedBy,saveType:record.saveType,clientRevision})
 let n=0
 const check=async(name,fn)=>{try{await fn()}catch(e){throw Error('FAIL: '+name,{cause:e})}n++;console.log('PASS: '+name)}
 try{
  assert.equal((await authAdmin.listUsers(1)).users.length,0,'FRESH_AUTH_REQUIRED')
  for(const c of ['qc_uat_identities','users',prefix+'/daily_plans',prefix+'/qc_records',prefix+'/daily_reports',prefix+'/qc_operational_audit',prefix+'/fertilizer_master','daily_plans'])assert.equal((await db.collection(c).limit(1).get()).size,0,'FRESH_DB_REQUIRED')
  for(const [uid,role] of Object.entries({'uat-fertilizer':'mandor_fertilizer','uat-other':'mandor_fertilizer','uat-view':'pengunjung','uat-prod':'owner','uat-noclaim':'mandor_fertilizer'})){
   const email=uid+'@fertilizer-full.example.test',password='Synthetic-full-spray-2026'
   await authAdmin.createUser({uid,email,password,emailVerified:true})
   if(uid!=='uat-noclaim')await authAdmin.setCustomUserClaims(uid,{qcUat:true})
   await mark(uid).set(marker(role))
   if(uid==='uat-prod')await db.doc('users/'+uid).set({active:true})
   const app=initializeApp({projectId:demoProject,apiKey:'demo-only-not-real'},'fertilizer-full-'+uid)
   const auth=initializeAuth(app,{persistence:inMemoryPersistence});connectAuthEmulator(auth,'http://'+demoHost+':'+authPort,{disableWarnings:true})
   const f=initializeFirestore(app,{});connectFirestoreEmulator(f,demoHost,firestorePort)
   clients.push({uid,app,auth,f})
   const {user}=await signInWithEmailAndPassword(auth,email,password)
   tokens[uid]=await user.getIdToken()
  }
  await ref('daily_plans',dp.dailyPlanId).set(dp)
  await ref('fertilizer_master','uat-products').set({testOnly:true,products:master})
  await db.doc('daily_plans/root-sentinel').set({testOnly:false,rootSentinel:true})
  const png='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jR1sAAAAASUVORK5CYII='
  const photo={...r,photoBase64:png,scanReportPhotoBase64:png,holdIntervals:[{...r.holdIntervals[0],photoBase64:png}]}
  const changes=[{kind:'main',action:'replace',dataUrl:png},{kind:'hold',holdId:'uat-h1',action:'replace',dataUrl:png},{kind:'scan',action:'replace',dataUrl:png}]
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
   afterStage=()=>mark(r.ownerUid).set(marker('mandor_fertilizer',{}, {qc_fertilizer:'view'}))
   await reject(()=>call({...photo,saveType:'draft'},null,changes),'FORM_EDIT_REQUIRED')
   assert.deepEqual(await snapshot(),{q:null,ap:null,audits:[]})
   await mark(r.ownerUid).set(marker('mandor_fertilizer'))
  })
  await check('Draft commits verified main, HOLD and scan references but no Actual',async()=>{
   const out=await call({...photo,saveType:'draft'},null,changes),s=await snapshot()
   assert.equal(out.status,'confirmed');assert.equal(s.q.saveType,'draft');assert.equal(s.ap,null);assert.equal(s.audits.length,1)
   const m=s.q.operationalPhotoManifest;assert.deepEqual(Object.keys(m).sort(),['hold_uat-h1','main','scan'])
   assert.equal(new Set(Object.values(m).map(x=>x.objectPath)).size,3);assert.equal(objects.size,3)
   assert.equal(s.q.photoBase64,undefined);assert.equal(s.q.scanReportPhotoBase64,undefined);assert.equal(s.q.holdIntervals[0].photoBase64,undefined)
   assert.equal(s.q.photoManifestFingerprint,s.audits[0].photoManifestFingerprint)
  })
  await check('Ready preserves photos and generates same-source Actual',async()=>{
   const previous=await q(),puts=stats.puts
   await call(ready,'uat-r1')
   const s=await snapshot();assert.deepEqual(s.q.operationalPhotoManifest,previous.operationalPhotoManifest)
   assert.equal(s.ap.dailyPlanId,dp.dailyPlanId);assert.equal(s.ap.shift,'2');assert.equal(s.ap.foreman,'Mandor B');assert.equal(s.ap.actualAreaHa,undefined);assert.equal(s.ap.applicationArea100,4250);assert.deepEqual(s.ap.fertilizerComponents.map(c=>c.actualArea100),[2100,2150])
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
   const s=await snapshot();assert.deepEqual(s.q.operationalPhotoManifest,{main:before.q.operationalPhotoManifest.main,scan:before.q.operationalPhotoManifest.scan})
   assert.deepEqual(s.ap.fertilizerComponents.map(c=>c.actualArea100),[2100,1000]);assert.equal(s.ap.actualReportId,before.ap.actualReportId);assert.equal(s.q.holdIntervals.length,1);assert.equal(objects.size,3)
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
   await mark(r.ownerUid).set(marker('mandor_fertilizer',{}, {qc_fertilizer:'none'}))
   try{await reject(()=>call(revise(uploaded,'uat-r4',10),'uat-r3',[{kind:'hold',holdId:'uat-h1',action:'remove'}]),'FORM_EDIT_REQUIRED')}finally{await mark(r.ownerUid).set(marker('mandor_fertilizer'))}
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
   const row={...photo,id,holdIntervals:[...photo.holdIntervals,second],holdTotalMinutes:90,effectiveWorkingMinutes:510,productivityHaPerHour:5,downtimeList:[...r.downtimeList,{id:'uat-h2',issue:'Downtime',start:'20:00',end:'20:30',note:''}]}
   const intents=[...changes,{kind:'hold',holdId:'uat-h2',action:'replace',dataUrl:png}]
   const out=await call(row,null,intents),m=out.record.operationalPhotoManifest
   assert.deepEqual(Object.keys(m).sort(),['hold_uat-h1','hold_uat-h2','main','scan'])
   assert.equal(new Set(Object.values(m).map(ref=>ref.objectPath)).size,4)
   assert.equal((await ap(id)).dailyPlanId,dp.dailyPlanId)
   assert.equal((await call(row,null,intents)).replayed,true)
  })
  await check('photo replacement creates new immutable object and preserves untouched HOLD',async()=>{
   const id='qc-v2-uat-multi-hold',before=await q(id),webp='data:image/webp;base64,UklGRh4AAABXRUJQVlA4TBEAAAAvAAAAAAdQsmZUpv+BiOh/AAA='
   const second={...r.holdIntervals[0],holdId:'uat-h2',start:'20:00',end:'20:30',photoBase64:''}
   const next={...r,id,clientRevision:'uat-r2',saveType:'uploaded',photoBase64:webp,holdIntervals:[r.holdIntervals[0],second],holdTotalMinutes:90,effectiveWorkingMinutes:510,productivityHaPerHour:5,downtimeList:[...r.downtimeList,{id:'uat-h2',issue:'Downtime',start:'20:00',end:'20:30',note:''}]}
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
   const row={...r,id,clientRevision:'uat-r3',saveType:'uploaded',holdIntervals:[r.holdIntervals[0],second],holdTotalMinutes:90,effectiveWorkingMinutes:510,productivityHaPerHour:5,downtimeList:[...r.downtimeList,{id:'uat-h2',issue:'Downtime',start:'20:00',end:'20:30',note:''}]}
   const proposals=[call(row,'uat-r2',[{kind:'main',action:'remove'}]),call({...row,photoBase64:png},'uat-r2',[changes[0]])]
   const settled=await Promise.allSettled(proposals)
   assert.equal(settled.filter(x=>x.status==='fulfilled').length,1)
   assert.equal(settled.find(x=>x.status==='rejected').reason.message,'QC_REPLAY_PAYLOAD_CONFLICT')
   const s=await snapshot(id);assert.equal(s.q.clientRevision,'uat-r3');assert.equal(s.ap.clientRevision,'uat-r3');assert.equal(s.audits.length,3)
   assert.deepEqual(s.q.operationalPhotoManifest['hold_uat-h1'],before.operationalPhotoManifest['hold_uat-h1'])
   assert.equal(s.q.photoManifestFingerprint,s.ap.photoManifestFingerprint);assert.equal(s.q.photoManifestFingerprint,s.audits[2].photoManifestFingerprint)
  })
  await check('scan photo removal preserves main and independent component progress',async()=>{
   const before=await snapshot(),next=revise(uploaded,'uat-r5',18)
   await call(next,'uat-r4',[{kind:'scan',action:'remove'}])
   const s=await snapshot();assert.equal(s.q.operationalPhotoManifest.scan,undefined);assert.deepEqual(s.q.operationalPhotoManifest.main,before.q.operationalPhotoManifest.main)
   assert.equal(s.ap.actualReportId,before.ap.actualReportId);assert.ok(objects.has(before.q.operationalPhotoManifest.scan.objectPath))
   const components=dp.materials.map(m=>({componentId:master.find(p=>p.material===m.material).componentId,targetArea100:2000,targetDoseKgHa:m.dosePerHa}))
   const p=fertilizerComponentProgress({testOnly:true,monthlyPlans:[{id:dp.monthlyPlanLineId,pid:dp.pid,components}],dailyPlans:[{id:dp.dailyPlanId,monthlyPlanLineId:dp.monthlyPlanLineId,pid:dp.pid,date:dp.date,shift:dp.shift,foreman:dp.foreman,components}],products:master.map(p=>({id:p.productId,componentId:p.componentId,active:p.active})),records:componentProgressRecords([s.ap])})
   assert.equal(p.daily[0].done,false);assert.equal(p.daily[0].limitingProgressPct,90);assert.equal(p.daily[0].components[1].remainingArea100,200)
  })
  await check('master change during photo staging prevents commit',async()=>{
   const id='qc-v2-uat-master-revoke',catalog=ref('fertilizer_master','uat-products')
   afterStage=()=>catalog.set({testOnly:true,products:master.map(p=>({...p,active:false}))})
   try{await reject(()=>call({...photo,id},null,changes),'PRODUCT_NOT_AUTHORIZED');assert.deepEqual(await snapshot(id),{q:null,ap:null,audits:[]})}finally{await catalog.set({testOnly:true,products:master})}
  })
  console.log('SUCCESS: '+n+' full Fertilizer photo and Uploaded transaction checks (Auth/Firestore emulators, mock storage only)')
 }finally{
  for(const c of clients){try{await signOut(c.auth)}finally{await terminate(c.f);await deleteApp(c.app)}}
  await db.terminate();await adminDelete(admin)
 }
}
