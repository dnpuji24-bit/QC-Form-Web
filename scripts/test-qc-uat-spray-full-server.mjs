// Actual Auth and Firestore Emulator; trusted Admin transaction, no photos.
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {createRequire} from 'node:module'
import {fixture} from './qc-uat-spray-full-dto-fixture.mjs'
import {buildQcActualPayload} from './qc-uat-load-actual-mapper.mjs'
import {marker} from '../src/qcUatRolePermissions.mjs'
import {roleDefinition,assignIdentityRole,permissionsForIdentity} from '../src/qcUatCustomRoles.mjs'
import {createFullSprayService,fullSprayFingerprint,guardFullSpray,demoProject,demoHost,firestorePort,authPort} from '../server/qc-photo-access/uat-spray-full-service.mjs'
const config=JSON.parse(readFileSync(new URL('../firebase.uat-spray-full-emulator.json',import.meta.url),'utf8'))
const rules=readFileSync(new URL('../scripts/firestore.uat-spray-full-demo.rules',import.meta.url),'utf8')
const env={GCLOUD_PROJECT:demoProject,FIRESTORE_EMULATOR_HOST:demoHost+':'+firestorePort,FIREBASE_AUTH_EMULATOR_HOST:demoHost+':'+authPort}
assert.equal(demoProject,'demo-qc-uat-spray-full')
guardFullSpray(env)
for(const e of [{},{...env,GCLOUD_PROJECT:'form-qc-unm'},{...env,FIRESTORE_EMULATOR_HOST:'remote:9085'},{...env,FIREBASE_AUTH_EMULATOR_HOST:'127.0.0.1:9499'},{...env,FIREBASE_PROJECT_ID:'form-qc-unm'}])assert.throws(()=>guardFullSpray(e))
assert.equal(config.firestore.rules,'scripts/firestore.uat-spray-full-demo.rules')
assert.deepEqual(config.emulators.firestore,{host:demoHost,port:firestorePort})
assert.deepEqual(config.emulators.auth,{host:demoHost,port:authPort})
assert.match(rules,/allow read, write: if false;/)
assert.doesNotMatch(rules,/allow[^;]*if true/)
assert.match(readFileSync(new URL('../src/firebase.ts',import.meta.url),'utf8'),/QC_HOSTED_UAT_ISOLATION_REQUIRED/)
const {r,dp}=fixture()
assert.equal(fullSprayFingerprint(r,null),fullSprayFingerprint(Object.fromEntries(Object.entries(r).reverse()),null))
assert.notEqual(fullSprayFingerprint(r,null),fullSprayFingerprint({...r,noted:'different'},null))
assert.notEqual(fullSprayFingerprint(r,null),fullSprayFingerprint(r,'uat-base'))
assert.ok(process.argv.length===3&&['--self-test','--emulator'].includes(process.argv[2]))
console.log('SUCCESS: full Spray trusted service demo, deny-all rules and fingerprint guards passed (offline)')
if(process.argv[2]==='--emulator'){
 guardFullSpray()
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
 const save=createFullSprayService({db,verifyToken:t=>authAdmin.verifyIdToken(t,true),buildActual:buildQcActualPayload})
 const call=(record,baseRevision=null,uid='uat-spray')=>save(tokens[uid],{record,baseRevision})
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
  await check('direct client reads and writes denied including valid Auth token',async()=>{
   const {f}=clients[0]
   await assert.rejects(setDoc(doc(f,prefix+'/qc_records/'+r.id),r),{code:'permission-denied'})
   await assert.rejects(getDocFromServer(doc(f,prefix+'/daily_plans/'+dp.dailyPlanId)),{code:'permission-denied'})
   await assert.rejects(getDocFromServer(doc(f,'daily_plans/root-sentinel')),{code:'permission-denied'})
   assert.equal(await q(),null)
  })
  await check('missing invalid token, missing claim and production profile denied',async()=>{
   await reject(()=>save('',{record:r,baseRevision:null}),'AUTH_REQUIRED')
   await reject(()=>save('invalid',{record:r,baseRevision:null}),'INVALID_TOKEN')
   await reject(()=>call(fresh('qc-v2-uat-noclaim','uat-noclaim'),null,'uat-noclaim'),'UAT_IDENTITY_DENIED')
   await reject(()=>call(fresh('qc-v2-uat-prod','uat-prod'),null,'uat-prod'),'UAT_IDENTITY_DENIED')
  })
  await check('viewer and forged owner denied before transaction writes',async()=>{
   await reject(()=>call(fresh('qc-v2-uat-view','uat-view'),null,'uat-view'),'FORM_EDIT_REQUIRED')
   await reject(()=>call(r,null,'uat-other'),'OWNER_REQUIRED')
   assert.equal(await q(),null)
  })
  await check('authoritative DP mismatch and missing source rejected',async()=>{
   await reject(()=>call({...r,monthlyPlanLineId:'uat-mp-other'}),'SOURCE_DP_MISMATCH')
   await reject(()=>call({...r,dailyPlanId:'uat-missing'}),'SOURCE_DP_NOT_FOUND')
   await reject(()=>call({...r,shift:'1'}),'SOURCE_SESSION_DENIED')
   assert.equal(await q(),null)
  })
  await check('tampered material timing and area rejected',async()=>{
   await reject(()=>call({...r,actualPlanMaterials:[{...r.actualPlanMaterials[0],totalMaterial:1}]}),'MATERIAL_MISMATCH')
   await reject(()=>call({...r,effectiveWorkingMinutes:600}),'TIMING_MISMATCH')
   await reject(()=>call({...r,actualAreaHa:99}),'AREA_MISMATCH')
   assert.equal(await q(),null)
  })
  await check('photo payload or finalization fails closed in this gate',async()=>{
   await reject(()=>call({...r,photoBase64:'data:image/png;base64,AA=='}),'PHOTO_TRANSPORT_NOT_ENABLED')
   await reject(()=>call({...r,holdIntervals:[{...r.holdIntervals[0],photoDriveUrl:'https://example.test/photo'}]}),'PHOTO_TRANSPORT_NOT_ENABLED')
   await reject(()=>call({...r,saveType:'uploaded'}),'FINALIZE_NOT_ENABLED')
   assert.equal(await q(),null)
  })
  await check('draft creates QC and audit only',async()=>{
   const draft={...fresh('qc-v2-uat-draft'),saveType:'draft'}
   const out=await call(draft);assert.equal(out.status,'confirmed');assert.equal((await q(draft.id)).saveType,'draft');assert.equal(await ap(draft.id),null);assert.ok(await audit(draft.id))
  })
  await check('draft to Ready creates Actual with same QC identity',async()=>{
   const ready={...fresh('qc-v2-uat-draft'),clientRevision:'uat-r2'}
   await call(ready,'uat-r1');assert.equal((await ap(ready.id)).qcRecordId,ready.id);assert.ok(await audit(ready.id,'uat-r2'))
  })
  await check('carryover and over actual commit complete atomic pair',async()=>{
   const out=await call(r),saved=await q(),actual=await ap(),log=await audit()
   assert.equal(out.replayed,false);assert.deepEqual(saved,out.record)
   assert.equal(saved.dailyPlanId,dp.dailyPlanId);assert.equal(actual.monthlyPlanLineId,dp.monthlyPlanLineId)
   assert.equal(actual.shift,'2');assert.equal(actual.foreman,'Mandor B');assert.equal(actual.actualAreaHa,9);assert.equal(actual.dailyVarianceHa,-1)
   assert.deepEqual(actual.materials,r.actualPlanMaterials);assert.equal(saved.photoBase64,undefined);assert.equal(saved.holdIntervals[0].photoBase64,undefined)
   assert.equal(actual.operationalPayloadFingerprint,saved.operationalPayloadFingerprint);assert.equal(log.operationalPayloadFingerprint,saved.operationalPayloadFingerprint)
  })
  await check('Shift 1 and Shift 2 keep separate Actual IDs on same DP',async()=>{
   const first={...fresh('qc-v2-uat-shift1','uat-other'),shift:'1',name:dp.foreman}
   await call(first,null,'uat-other');const one=await ap(first.id),two=await ap()
   assert.equal(one.dailyPlanId,two.dailyPlanId);assert.equal(one.shift,'1');assert.equal(one.foreman,dp.foreman);assert.notEqual(one.actualReportId,two.actualReportId);assert.equal(one.actualAreaHa+two.actualAreaHa,18)
  })
  await check('exact replay does not mutate records or duplicate audit',async()=>{
   const before=await snapshot();const out=await call(r);assert.equal(out.replayed,true);assert.deepEqual(await snapshot(),before)
   const reordered=Object.fromEntries(Object.entries(r).reverse());assert.equal((await call(reordered)).replayed,true)
  })
  await check('changed payload same revision and stale base rejected',async()=>{
   const before=await snapshot();await reject(()=>call({...r,noted:'different'}),'QC_REPLAY_PAYLOAD_CONFLICT')
   await reject(()=>call({...r,clientRevision:'uat-r2'},'uat-stale'),'QC_REVISION_CONFLICT');assert.deepEqual(await snapshot(),before)
  })
  await check('manual permission downgrade blocks replay and correction',async()=>{
   const before=await snapshot();await mark(r.ownerUid).set(marker('mandor_spraying',{}, {qc_spraying:'view'}))
   await reject(()=>call(r),'FORM_EDIT_REQUIRED');await reject(()=>call(revise(r,'uat-r2',10),'uat-r1'),'FORM_EDIT_REQUIRED')
   assert.deepEqual(await snapshot(),before);await mark(r.ownerUid).set(marker('mandor_spraying'))
  })
  await check('other account cannot replace existing QC despite edit permission',async()=>{
   const before=await snapshot();await reject(()=>call({...r,ownerUid:'uat-other',inputtedBy:'uat-other',clientRevision:'uat-r2'},'uat-r1','uat-other'),'OWNER_REQUIRED');assert.deepEqual(await snapshot(),before)
  })
  await check('correction updates same Actual and source, with new audit',async()=>{
   const corrected=revise(r,'uat-r2',10);await call(corrected,'uat-r1')
   const s=await snapshot();assert.equal(s.ap.actualReportId,'qcactual_'+r.id);assert.equal(s.ap.actualAreaHa,10);assert.equal(s.ap.dailyPlanId,dp.dailyPlanId);assert.equal(s.audits.length,2)
   assert.equal(s.ap.dailyVarianceHa,-2)
  })
  await check('source link cannot silently change on correction',async()=>{
   const newDp={...dp,dailyPlanId:'uat-dp2',monthlyPlanLineId:'uat-mp2'};await ref('daily_plans',newDp.dailyPlanId).set(newDp)
   const before=await snapshot();await reject(()=>call({...revise(r,'uat-r3',11),dailyPlanId:newDp.dailyPlanId,monthlyPlanLineId:newDp.monthlyPlanLineId},'uat-r2'),'SOURCE_LINK_IMMUTABLE');assert.deepEqual(await snapshot(),before)
  })
  await check('concurrent divergent revisions have one durable winner',async()=>{
   const proposals=[revise(r,'uat-r3',11),revise(r,'uat-r3',12)]
   const settled=await Promise.allSettled(proposals.map(x=>call(x,'uat-r2')))
   assert.equal(settled.filter(x=>x.status==='fulfilled').length,1)
   assert.equal(settled.find(x=>x.status==='rejected').reason.message,'QC_REPLAY_PAYLOAD_CONFLICT')
   const s=await snapshot();assert.ok([11,12].includes(s.q.actualAreaHa));assert.equal(s.q.actualAreaHa,s.ap.actualAreaHa);assert.equal(s.audits.length,3)
  })
  await check('orphan Actual blocks new QC and leaves audit absent',async()=>{
   const id='qc-v2-uat-orphan';await ref('daily_reports','qcactual_'+id).set({testOnly:true,orphan:true})
   await reject(()=>call(fresh(id)),'QC_ACTUAL_PAIR_MISMATCH')
   assert.equal(await q(id),null);assert.equal(await audit(id),null);assert.deepEqual(await ap(id),{testOnly:true,orphan:true})
  })
  await check('audit collision prevents correction without partial writes',async()=>{
   await ref('qc_operational_audit',r.id+':uat-r4').set({testOnly:true,recordId:r.id,revision:'uat-r4',collision:true})
   const before=await snapshot();await reject(()=>call(revise(r,'uat-r4',13),'uat-r3'),'AUDIT_REVISION_EXISTS');assert.deepEqual(await snapshot(),before)
  })
  await check('corrupt paired Actual prevents exact replay and root unchanged',async()=>{
   const s=await snapshot(),current=s.q;const winner=revise(r,'uat-r3',current.actualAreaHa)
   await ref('daily_reports','qcactual_'+r.id).update({actualAreaHa:999})
   await reject(()=>call(winner,'uat-r2'),'QC_REPLAY_PAIR_MISMATCH')
   await ref('daily_reports','qcactual_'+r.id).set(s.ap)
   assert.deepEqual(await snapshot(),s);assert.deepEqual((await db.doc('daily_plans/root-sentinel').get()).data(),{testOnly:false,rootSentinel:true})
  })
  const custom=roleDefinition({name:'Field Operator',permissions:{qc_spraying:'edit',qc_records:'view'}})
  const roleDoc=ref('role_catalog',custom.id)
  const assigned=assignIdentityRole({...marker('mandor_spraying'),policyRevision:0,roleOverrides:{},manualOverrides:{}},custom.id,custom)
  const useCustom=async(overrides={})=>{
   const m={...assigned,manualOverrides:overrides}
   await mark('uat-spray').set({...m,permissions:permissionsForIdentity(m,custom)})
  }
  await check('custom role saves and replays own photo-free QC without duplicate Actual or audit',async()=>{
   await roleDoc.set({testOnly:true,workspace:'cutover',definition:custom});await useCustom()
   const id='qc-v2-uat-custom-full',record=fresh(id)
   try{
    assert.equal((await call(record)).replayed,false)
    const before=await snapshot(id)
    assert.equal(before.ap.ownerUid,'uat-spray');assert.equal(before.audits.length,1)
    assert.equal((await call(record)).replayed,true);assert.deepEqual(await snapshot(id),before)
   }finally{await mark('uat-spray').set(marker('mandor_spraying'))}
  })
  await check('manual none overrides custom form edit and blocks replay and new QC',async()=>{
   await useCustom({qc_spraying:'none',qc_fertilizer:'edit'})
   const id='qc-v2-uat-custom-full',before=await snapshot(id)
   try{
    await reject(()=>call(fresh(id)),'FORM_EDIT_REQUIRED')
    await reject(()=>call(fresh('qc-v2-uat-custom-full-denied')),'FORM_EDIT_REQUIRED')
    assert.deepEqual(await snapshot(id),before);assert.deepEqual(await snapshot('qc-v2-uat-custom-full-denied'),{q:null,ap:null,audits:[]})
   }finally{await mark('uat-spray').set(marker('mandor_spraying'))}
  })
  await check('missing role catalog or forged cached grant denies photo-free QC',async()=>{
   await useCustom()
   const id='qc-v2-uat-custom-full-invalid'
   try{
    await roleDoc.delete();await reject(()=>call(fresh(id)),'UAT_IDENTITY_DENIED')
    await roleDoc.set({testOnly:true,workspace:'cutover',definition:custom})
    await useCustom({qc_spraying:'none'});await mark('uat-spray').update({'permissions.qc_spraying':'edit'})
    await reject(()=>call(fresh(id)),'UAT_IDENTITY_DENIED')
    assert.deepEqual(await snapshot(id),{q:null,ap:null,audits:[]})
   }finally{await mark('uat-spray').set(marker('mandor_spraying'))}
  })
  console.log('SUCCESS: '+n+' full Spray trusted server Auth and Firestore transaction checks (photo-free demo only)')
 }finally{
  for(const c of clients){try{await signOut(c.auth)}finally{await terminate(c.f);await deleteApp(c.app)}}
  await db.terminate();await adminDelete(admin)
 }
}
