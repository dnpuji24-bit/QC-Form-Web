// Actual Auth and Firestore Emulator; trusted Admin transaction, no photos.
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {createRequire} from 'node:module'
import {multi,master,row} from './qc-uat-fertilizer-material-fixture.mjs'
import {componentProgressRecords} from '../src/qcUatFertilizerMaterialIntegration.mjs'
import {fertilizerComponentProgress} from '../src/qcUatFertilizerComponentProgress.mjs'
import {buildQcActualPayload} from './qc-uat-load-actual-mapper.mjs'
import {marker} from '../src/qcUatRolePermissions.mjs'
import {createFullFertilizerService,fullFertilizerFingerprint,guardFullFertilizer,demoProject,demoHost,firestorePort,authPort} from '../server/qc-photo-access/uat-fertilizer-full-service.mjs'
const config=JSON.parse(readFileSync(new URL('../firebase.uat-fertilizer-full-emulator.json',import.meta.url),'utf8'))
const rules=readFileSync(new URL('../scripts/firestore.uat-fertilizer-full-demo.rules',import.meta.url),'utf8')
const env={GCLOUD_PROJECT:demoProject,FIRESTORE_EMULATOR_HOST:demoHost+':'+firestorePort,FIREBASE_AUTH_EMULATOR_HOST:demoHost+':'+authPort}
assert.equal(demoProject,'demo-qc-uat-fertilizer-full')
guardFullFertilizer(env)
for(const e of [{},{...env,GCLOUD_PROJECT:'form-qc-unm'},{...env,FIRESTORE_EMULATOR_HOST:'remote:9285'},{...env,FIREBASE_AUTH_EMULATOR_HOST:'127.0.0.1:9499'},{...env,FIREBASE_PROJECT_ID:'form-qc-unm'}])assert.throws(()=>guardFullFertilizer(e))
assert.equal(config.firestore.rules,'scripts/firestore.uat-fertilizer-full-demo.rules')
assert.deepEqual(config.emulators.firestore,{host:demoHost,port:firestorePort})
assert.deepEqual(config.emulators.auth,{host:demoHost,port:authPort})
assert.match(rules,/allow read, write: if false;/)
assert.doesNotMatch(rules,/allow[^;]*if true/)
assert.match(readFileSync(new URL('../src/firebase.ts',import.meta.url),'utf8'),/QC_HOSTED_UAT_ISOLATION_REQUIRED/)
const {r,dp}=multi()
assert.equal(fullFertilizerFingerprint(r,null),fullFertilizerFingerprint(Object.fromEntries(Object.entries(r).reverse()),null))
assert.notEqual(fullFertilizerFingerprint(r,null),fullFertilizerFingerprint({...r,noted:'different'},null))
assert.notEqual(fullFertilizerFingerprint(r,null),fullFertilizerFingerprint(r,'uat-base'))
assert.ok(process.argv.length===3&&['--self-test','--emulator'].includes(process.argv[2]))
console.log('SUCCESS: full Fertilizer trusted service demo, deny-all rules and fingerprint guards passed (offline)')
if(process.argv[2]==='--emulator'){
 guardFullFertilizer()
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
 const save=createFullFertilizerService({db,verifyToken:t=>authAdmin.verifyIdToken(t,true),buildActual:buildQcActualPayload})
 const call=(record,baseRevision=null,uid='uat-fertilizer')=>save(tokens[uid],{record,baseRevision})
 const reject=(fn,message)=>assert.rejects(fn,{message})
 const fresh=(id,uid='uat-fertilizer')=>({...multi().r,id,ownerUid:uid,inputtedBy:uid})
 const revise=(record,clientRevision,area)=>({...multi([row(1,9450,21),row(2,150*area,area,'Synthetic DAP',150)]).r,id:record.id,ownerUid:record.ownerUid,inputtedBy:record.inputtedBy,clientRevision})
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
  const catalog=ref('fertilizer_master','uat-products')
  const progress=async ids=>{
   const components=dp.materials.map(m=>({componentId:master.find(p=>p.material===m.material).componentId,targetArea100:2000,targetDoseKgHa:m.dosePerHa}))
   return fertilizerComponentProgress({testOnly:true,monthlyPlans:[{id:dp.monthlyPlanLineId,pid:dp.pid,components}],dailyPlans:[{id:dp.dailyPlanId,monthlyPlanLineId:dp.monthlyPlanLineId,pid:dp.pid,date:dp.date,shift:dp.shift,foreman:dp.foreman,components}],products:master.map(p=>({id:p.productId,componentId:p.componentId,active:p.active})),records:componentProgressRecords(await Promise.all(ids.map(ap)))})
  }
  await check('direct client cannot read or write QC, master or root',async()=>{const {f}=clients[0];await assert.rejects(setDoc(doc(f,prefix+'/qc_records/'+r.id),r),{code:'permission-denied'});for(const path of [prefix+'/fertilizer_master/uat-products',prefix+'/daily_plans/'+dp.dailyPlanId,'daily_plans/root-sentinel'])await assert.rejects(getDocFromServer(doc(f,path)),{code:'permission-denied'});assert.equal(await q(),null)})
  await check('missing token, invalid token, missing claim and production profile denied',async()=>{await reject(()=>save('',{record:r,baseRevision:null}),'AUTH_REQUIRED');await reject(()=>save('invalid',{record:r,baseRevision:null}),'INVALID_TOKEN');await reject(()=>call(fresh('qc-v2-uat-noclaim','uat-noclaim'),null,'uat-noclaim'),'UAT_IDENTITY_DENIED');await reject(()=>call(fresh('qc-v2-uat-prod','uat-prod'),null,'uat-prod'),'UAT_IDENTITY_DENIED')})
  await check('viewer and other account denied',async()=>{await reject(()=>call(fresh('qc-v2-uat-view','uat-view'),null,'uat-view'),'FORM_EDIT_REQUIRED');await reject(()=>call(r,null,'uat-other'),'OWNER_REQUIRED');assert.equal(await q(),null)})
  await check('authoritative DP and client supplied master rejected',async()=>{await reject(()=>call({...r,monthlyPlanLineId:'uat-wrong'}),'SOURCE_DP_MISMATCH');await reject(()=>call({...r,dailyPlanId:'uat-missing'}),'SOURCE_DP_NOT_FOUND');await reject(()=>save(tokens[r.ownerUid],{record:r,baseRevision:null,master}),'INVALID_REQUEST')})
  await check('inactive master product denies write and missing catalog fails closed',async()=>{await catalog.set({testOnly:true,products:master.map(p=>({...p,active:false}))});await reject(()=>call(r),'PRODUCT_NOT_AUTHORIZED');await catalog.delete();await reject(()=>call(r),'COMPONENT_MASTER_NOT_FOUND');await catalog.set({testOnly:true,products:master});assert.equal(await q(),null)})
  await check('tampered dose, totals and area rejected',async()=>{const wrong=multi([row(1,9450,21,'Synthetic NK',150)]).r;await reject(()=>call(wrong),'COMPONENT_TARGET_DOSE_MISMATCH');await reject(()=>call({...r,actualAreaHa:20}),'FILLING_TOTAL_MISMATCH');await reject(()=>call({...r,actualPlanMaterials:r.actualPlanMaterials.map(m=>({...m,totalMaterial:1}))}),'PLANNED_MATERIAL_ESTIMATE_MISMATCH')})
  await check('photos and Uploaded not enabled',async()=>{await reject(()=>call({...r,photoBase64:'data:image/png;base64,AAAA'}),'PHOTO_GATE_PENDING');await reject(()=>call({...r,saveType:'uploaded'}),'FINALIZE_NOT_ENABLED')})
  await check('Draft writes QC and audit only',async()=>{const d={...fresh('qc-v2-uat-draft'),saveType:'draft'};await call(d);assert.equal((await q(d.id)).saveType,'draft');assert.equal(await ap(d.id),null);assert.ok(await audit(d.id))})
  await check('Draft to Ready creates component Actual on same ID',async()=>{const d={...fresh('qc-v2-uat-draft'),clientRevision:'uat-r2'};await call(d,'uat-r1');assert.equal((await ap(d.id)).applicationArea100,4250);assert.equal((await ap(d.id)).actualAreaHa,undefined)})
  await check('NK alone Ready does not close DAP target',async()=>{const one={...multi([row(1,9400,21)]).r,id:'qc-v2-uat-nk',shift:'1',name:dp.foreman};await call(one);const p=(await progress([one.id])).daily[0];assert.equal(p.done,false);assert.equal(p.components[1].remainingArea100,2000);assert.equal(p.components[0].actualKg100,940000);assert.equal(p.components[0].estimatedKg100,945000)})
  await check('shift 2 carryover DAP closes both components without pooling area',async()=>{const two={...multi([row(1,3225,21.5,'Synthetic DAP',150)]).r,id:'qc-v2-uat-dap'};await call(two);const p=(await progress(['qc-v2-uat-nk',two.id])).daily[0];assert.equal(p.done,true);assert.equal(p.limitingProgressPct,105);assert.equal(p.applicationArea100,4250);assert.equal((await ap(two.id)).foreman,'Mandor B')})
  await check('full mixed record atomic pair with fingerprint and audit',async()=>{const out=await call(r),s=await snapshot();assert.equal(out.replayed,false);assert.deepEqual(s.q,out.record);assert.equal(s.ap.applicationArea100,4250);assert.equal(s.ap.actualAreaHa,undefined);assert.deepEqual(s.ap.fertilizerComponents.map(c=>c.actualArea100),[2100,2150]);assert.equal(s.ap.operationalPayloadFingerprint,s.q.operationalPayloadFingerprint);assert.equal(s.audits[0].operationalPayloadFingerprint,s.q.operationalPayloadFingerprint)})
  await check('exact replay and reordered keys do not duplicate audit',async()=>{const before=await snapshot();assert.equal((await call(r)).replayed,true);assert.equal((await call(Object.fromEntries(Object.entries(r).reverse()))).replayed,true);assert.deepEqual(await snapshot(),before)})
  await check('manual permission downgrade blocks replay and new revision',async()=>{const before=await snapshot();await mark(r.ownerUid).set(marker('mandor_fertilizer',{}, {qc_fertilizer:'view'}));await reject(()=>call(r),'FORM_EDIT_REQUIRED');await reject(()=>call(revise(r,'uat-r2',18),'uat-r1'),'FORM_EDIT_REQUIRED');assert.deepEqual(await snapshot(),before);await mark(r.ownerUid).set(marker('mandor_fertilizer'))})
  await check('correction preserves Actual ID, DAP balance reopens',async()=>{await call(revise(r,'uat-r2',18),'uat-r1');const s=await snapshot();assert.equal(s.ap.actualReportId,'qcactual_'+r.id);assert.equal(s.audits.length,2);assert.equal((await progress([r.id])).daily[0].limitingProgressPct,90)})
  await check('divergent retry and stale revision rejected',async()=>{const before=await snapshot();await reject(()=>call(revise(r,'uat-r2',19),'uat-r1'),'QC_REPLAY_PAYLOAD_CONFLICT');await reject(()=>call(revise(r,'uat-r3',19),'uat-stale'),'QC_REVISION_CONFLICT');assert.deepEqual(await snapshot(),before)})
  await check('source reassignment and master component remap rejected',async()=>{const d={...dp,dailyPlanId:'uat-dp2'};await ref('daily_plans',d.dailyPlanId).set(d);await reject(()=>call({...revise(r,'uat-r3',19),dailyPlanId:d.dailyPlanId},'uat-r2'),'SOURCE_LINK_IMMUTABLE');await catalog.set({testOnly:true,products:master.map(p=>p.material==='DAP'?{...p,componentId:'uat-remapped'}:p)});await reject(()=>call(revise(r,'uat-r3',19),'uat-r2'),'COMPONENT_SOURCE_CHANGED');await catalog.set({testOnly:true,products:master})})
  await check('concurrent divergent same revision has one durable winner',async()=>{const settled=await Promise.allSettled([19,22].map(area=>call(revise(r,'uat-r3',area),'uat-r2')));assert.equal(settled.filter(x=>x.status==='fulfilled').length,1);assert.equal(settled.find(x=>x.status==='rejected').reason.message,'QC_REPLAY_PAYLOAD_CONFLICT');const s=await snapshot();assert.deepEqual(s.q.fertilizerComponents,s.ap.fertilizerComponents);assert.equal(s.audits.length,3)})
  await check('orphan Actual and audit collision prevent partial writes',async()=>{const id='qc-v2-uat-orphan';await ref('daily_reports','qcactual_'+id).set({testOnly:true,orphan:true});await reject(()=>call(fresh(id)),'QC_ACTUAL_PAIR_MISMATCH');assert.equal(await q(id),null);assert.equal(await audit(id),null);await ref('qc_operational_audit',r.id+':uat-r4').set({testOnly:true,recordId:r.id,revision:'uat-r4',collision:true});const before=await snapshot();await reject(()=>call(revise(r,'uat-r4',23),'uat-r3'),'AUDIT_REVISION_EXISTS');assert.deepEqual(await snapshot(),before)})
  await check('corrupt paired Actual blocks replay; root sentinel unchanged',async()=>{const s=await snapshot(),area=s.ap.fertilizerComponents[1].actualArea100/100;await ref('daily_reports','qcactual_'+r.id).update({applicationArea100:999});await reject(()=>call(revise(r,'uat-r3',area),'uat-r2'),'QC_REPLAY_PAIR_MISMATCH');await ref('daily_reports','qcactual_'+r.id).set(s.ap);assert.deepEqual(await snapshot(),s);assert.deepEqual((await db.doc('daily_plans/root-sentinel').get()).data(),{testOnly:false,rootSentinel:true})})
  console.log('SUCCESS: '+n+' full Fertilizer component trusted server Auth and Firestore transaction checks (photo-free demo only)')
 }finally{
  for(const c of clients){try{await signOut(c.auth)}finally{await terminate(c.f);await deleteApp(c.app)}}
  await db.terminate();await adminDelete(admin)
 }
}
