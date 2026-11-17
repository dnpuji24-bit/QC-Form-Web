// Dedicated Firebase Auth + Firestore emulator, no production credentials or data.
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {createRequire} from 'node:module'
import {marker} from '../src/qcUatRolePermissions.mjs'
import {roleDefinition,assignIdentityRole,permissionsForIdentity} from '../src/qcUatCustomRoles.mjs'
import {projectId,host,firestorePort,authPort,guard,planningMode,createPlanningService,createPlanningWriteService} from '../server/qc-photo-access/uat-planning-role-service.mjs'
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8')
const cfg=JSON.parse(read('firebase.uat-planning-role-emulator.json'))
const valid={GCLOUD_PROJECT:projectId,FIRESTORE_EMULATOR_HOST:host+':'+firestorePort,FIREBASE_AUTH_EMULATOR_HOST:host+':'+authPort}
assert.ok(process.argv.length===3&&['--self-test','--emulator'].includes(process.argv[2]))
guard(valid)
for(const e of [{},{...valid,GCLOUD_PROJECT:'form-qc-unm'},{...valid,FIRESTORE_EMULATOR_HOST:'remote:9085'},{...valid,FIREBASE_AUTH_EMULATOR_HOST:'remote:9899'},{...valid,GOOGLE_CLOUD_PROJECT:'form-qc-unm'}])assert.throws(()=>guard(e))
assert.equal(cfg.firestore.rules,'scripts/firestore.uat-planning-role-demo.rules')
assert.deepEqual(cfg.emulators.firestore,{host,port:firestorePort})
assert.deepEqual(cfg.emulators.auth,{host,port:authPort})
for(const p of ['src/App.tsx','src/main.tsx','server/qc-photo-access/index.mjs'])assert.doesNotMatch(read(p),/uat-planning-role-service/)
assert.equal(planningMode({data_plan_monthly:'edit'},'monthly','view'),'edit')
assert.equal(planningMode({data_plan_daily:'view'},'daily','view'),'view')
for(const [scope,op] of [['daily','edit'],['monthly','view'],['actual','view'],['summary','view']])assert.throws(()=>planningMode({data_plan_daily:'view'},scope,op),{message:'PLANNING_PERMISSION_DENIED'})
for(const [scope,op] of [['__proto__','view'],['monthly','delete'],['qc_spraying','edit']])assert.throws(()=>planningMode({},scope,op),{message:'INVALID_PLANNING_OPERATION'})
console.log('SUCCESS: Planning demo isolation and permission guards passed (offline)')
if(process.argv[2]==='--emulator'){
 guard()
 const require=createRequire(new URL('../server/qc-photo-access/package.json',import.meta.url))
 const {initializeApp:adminInit,deleteApp:adminDelete}=require('firebase-admin/app')
 const {getAuth}=require('firebase-admin/auth'),{getFirestore}=require('firebase-admin/firestore')
 const {initializeApp,deleteApp}=await import('firebase/app')
 const {initializeAuth,inMemoryPersistence,connectAuthEmulator,signInWithEmailAndPassword,signOut}=await import('firebase/auth')
 const {initializeFirestore,connectFirestoreEmulator,doc,getDocFromServer,setDoc,terminate}=await import('firebase/firestore')
 const admin=adminInit({projectId},'planning-role-demo'),authAdmin=getAuth(admin),adb=getFirestore(admin)
 const clients=[],prefix='qc_uat_workspaces/cutover',mark=uid=>adb.doc('qc_uat_identities/'+uid)
 const mp=adb.doc(prefix+'/monthly_plans/uat-m1'),dp=adb.doc(prefix+'/daily_plans/uat-d1')
 const def=roleDefinition({name:'Field Planning',permissions:{data_plan_monthly:'edit',data_plan_daily:'view',data_plan_summary:'view'}})
 const cat=adb.doc(prefix+'/role_catalog/'+def.id)
 const base=role=>({...marker(role),policyRevision:0,roleOverrides:{},manualOverrides:{}})
 const custom=assignIdentityRole(base('mandor_spraying'),def.id,def)
 const manual=(m,overrides)=>{const next={...m,manualOverrides:overrides,policyRevision:m.policyRevision+1};return {...next,permissions:permissionsForIdentity(next,def)}}
 const email=uid=>uid+'@planning.example.test',password=uid=>'Synthetic-only-2026-'+uid
 const service=createPlanningService({adb,authAdmin}),writer=createPlanningWriteService({adb,authAdmin})
 let n=0
 const check=async(label,fn)=>{try{await fn()}catch(e){throw Error('FAIL: '+label,{cause:e})}n++;console.log('PASS: '+label)}
 const deny=(p,message='PLANNING_PERMISSION_DENIED')=>assert.rejects(p,{message})
 async function client(uid){
  const app=initializeApp({projectId,apiKey:'demo-only-not-a-real-key'},crypto.randomUUID())
  const auth=initializeAuth(app,{persistence:inMemoryPersistence})
  connectAuthEmulator(auth,'http://'+host+':'+authPort,{disableWarnings:true})
  const db=initializeFirestore(app,{});connectFirestoreEmulator(db,host,firestorePort);clients.push({app,auth,db})
  const c=await signInWithEmailAndPassword(auth,email(uid),password(uid))
  return {token:await c.user.getIdToken(),db}
 }
 try{
  assert.equal((await authAdmin.listUsers(1)).users.length,0,'FRESH_AUTH_REQUIRED')
  for(const c of ['users','qc_uat_identities','monthly_plans',prefix+'/monthly_plans',prefix+'/daily_plans',prefix+'/role_catalog',prefix+'/planning_audit',prefix+'/master_paddocks',prefix+'/master_activities',prefix+'/qc_records',prefix+'/daily_reports'])assert.equal((await adb.collection(c).limit(1).get()).size,0,'FRESH_FIRESTORE_REQUIRED')
  for(const [uid,m,claim] of [['uat-planner',custom,true],['uat-assistant',base('asisten'),true],['uat-viewer',base('pengunjung'),true],['uat-noclaim',custom,false],['uat-disabled',{...custom,enabled:false},true],['uat-collision',custom,true]]){
   await authAdmin.createUser({uid,email:email(uid),password:password(uid),emailVerified:true})
   if(claim)await authAdmin.setCustomUserClaims(uid,{qcUat:true})
   await mark(uid).set(m)
  }
  await adb.doc('users/uat-collision').set({syntheticSentinel:true})
  await adb.doc('monthly_plans/uat-m1').set({syntheticSentinel:true})
  const catalog={testOnly:true,workspace:'cutover',definition:def}
  await cat.set(catalog)
  const monthly={testOnly:true,id:'uat-m1',pid:'uat-p1',targetArea100:1200,internal:'not-returned'}
  const daily={testOnly:true,id:'uat-d1',pid:'uat-p1',area100:500}
  await mp.set(monthly);await dp.set(daily)
  const a=await client('uat-planner'),b=await client('uat-assistant'),v=await client('uat-viewer'),nc=await client('uat-noclaim'),dis=await client('uat-disabled'),col=await client('uat-collision')
  const t=a.token
  const path=(c,id)=>adb.doc(prefix+'/'+c+'/'+id)
  await path('master_paddocks','uat-p1').set({testOnly:true,pid:'uat-p1',active:true})
  await path('master_activities','uat-a1').set({testOnly:true,id:'uat-a1',active:true,formType:'spray'})
  const m={pid:'uat-p1',activityId:'uat-a1',monthKey:'2026-11',week:'W1',targetArea100:1000}
  const d={pid:m.pid,activityId:m.activityId,sourceType:'MONTHLY',monthlyPlanLineId:'uat-m2',date:'2026-11-03',shift:'1',foreman:'uat-f1',formType:'spray',area100:1500}
  const create=(id,fields)=>({action:'create',id,expectedRevision:null,fields})
  const update=(id,fields,expectedRevision=0)=>({action:'update',id,expectedRevision,fields})
  const cancel=(id,expectedRevision=0)=>({action:'cancel',id,expectedRevision})
  const mutate=(scope,q,token=t)=>writer.mutate(token,scope,q)
  const row=(c,id)=>path(c,id).get().then(s=>s.data())
  const audits=async()=> (await adb.collection(prefix+'/planning_audit').get()).size
  await check('custom Monthly Edit creates plan with atomic audit',async()=>{const r=await mutate('monthly',create('uat-m2',m));assert.equal(r.createdBy,'uat-planner');assert.equal(r.revision,0);assert.deepEqual(await row('monthly_plans',r.id),r);const audit=await row('planning_audit','monthly:uat-m2:0');assert.deepEqual(audit.after,r);assert.equal(audit.before,null);assert.equal(audit.actorUid,'uat-planner');assert.equal((await service.readPlan(t,'monthly',r.id)).area100,1000)})
  await check('Daily View and visitor cannot create or mutate',async()=>{await deny(mutate('daily',create('uat-d2',d)));await deny(mutate('monthly',update('uat-m2',m),v.token));assert.equal(await audits(),1)})
  await check('same token receives manual Daily Edit',async()=>{await mark('uat-planner').set(manual(custom,{data_plan_daily:'edit'}));const r=await mutate('daily',create('uat-d2',d));assert.equal(r.area100,1500);assert.equal(r.monthlyPlanLineId,'uat-m2');assert.equal(await audits(),2)})
  await check('Monthly target and period edit preserve linked Daily',async()=>{const r=await mutate('monthly',update('uat-m2',{...m,week:'W2',targetArea100:800}));assert.equal(r.revision,1);assert.equal((await row('daily_plans','uat-d2')).monthlyPlanLineId,'uat-m2');assert.equal((await row('daily_plans','uat-d2')).area100,1500)})
  await check('stale revision and duplicate create leave audit count unchanged',async()=>{const n=await audits();await deny(mutate('monthly',update('uat-m2',m)),'PLANNING_REVISION_CONFLICT');await deny(mutate('monthly',create('uat-m2',m)),'PLAN_ALREADY_EXISTS');assert.equal(await audits(),n)})
  await check('Monthly cancellation blocked by linked DP',()=>deny(mutate('monthly',cancel('uat-m2',1)),'PLAN_HAS_DEPENDENTS'))
  await check('new linked DP requires current period and valid parent',async()=>{await deny(mutate('daily',create('uat-d3',d)),'MONTHLY_PARENT_PERIOD_MISMATCH');await deny(mutate('daily',create('uat-d3',{...d,monthlyPlanLineId:'uat-missing'})),'MONTHLY_PARENT_NOT_FOUND')})
  await check('master and form checks reject invalid references',async()=>{await deny(mutate('monthly',create('uat-m3',{...m,pid:'uat-missing'})),'INVALID_PLANNING_MASTER');await deny(mutate('daily',create('uat-d3',{...d,date:'2026-11-09',formType:'fertilizer'})),'PLANNING_FORM_MISMATCH')})
  await check('Daily update in current MP period works and records before/after',async()=>{const r=await mutate('daily',update('uat-d2',{...d,date:'2026-11-09',area100:1600}));assert.equal(r.revision,1);const au=await row('planning_audit','daily:uat-d2:1');assert.equal(au.before.area100,1500);assert.equal(au.after.area100,1600)})
  await check('any linked QC including draft blocks Daily edit and cancel',async()=>{const q=path('qc_records','uat-q1'),payload={testOnly:true,dailyPlanId:'uat-d2',saveType:'draft'};await q.set(payload);const n=await audits();await deny(mutate('daily',update('uat-d2',{...d,date:'2026-11-10'},1)),'PLAN_HAS_DEPENDENTS');await deny(mutate('daily',cancel('uat-d2',1)),'PLAN_HAS_DEPENDENTS');assert.deepEqual((await q.get()).data(),payload);assert.equal(await audits(),n);await q.delete()})
  await check('linked Actual blocks Daily cancellation without modifying Actual',async()=>{const ap=path('daily_reports','uat-ap1'),payload={testOnly:true,dailyPlanId:'uat-d2',actualArea100:2100};await ap.set(payload);await deny(mutate('daily',cancel('uat-d2',1)),'PLAN_HAS_DEPENDENTS');assert.deepEqual((await ap.get()).data(),payload)})
  await check('ADHOC and SUPPORT create without monthly parent',async()=>{for(const [id,sourceType] of [['uat-d3','ADHOC'],['uat-d4','SUPPORT']]){const r=await mutate('daily',create(id,{...d,sourceType,monthlyPlanLineId:''}));assert.equal(r.monthlyPlanLineId,'')}})
  await check('soft cancellation of unlinked DP and unused MP is terminal',async()=>{const dp3=await mutate('daily',cancel('uat-d3'));assert.equal(dp3.status,'cancelled');await deny(mutate('daily',cancel('uat-d3',1)),'PLAN_CLOSED');await mutate('monthly',create('uat-m3',m));assert.equal((await mutate('monthly',cancel('uat-m3'))).status,'cancelled');await deny(mutate('daily',create('uat-d5',{...d,monthlyPlanLineId:'uat-m3'})),'MONTHLY_PARENT_CLOSED')})
  await check('manual none revokes writes with same token; no audit written',async()=>{const n=await audits();await mark('uat-planner').set(manual(custom,{data_plan_monthly:'none',data_plan_daily:'edit'}));await deny(mutate('monthly',create('uat-m4',m)));assert.equal(await audits(),n);await mark('uat-planner').set(manual(custom,{data_plan_daily:'edit'}))})
  await check('forged marker and missing catalog deny writes',async()=>{const good=manual(custom,{data_plan_daily:'edit'});await mark('uat-planner').set({...good,permissions:{...good.permissions,data_plan_actual:'edit'}});await deny(mutate('monthly',create('uat-m4',m)),'UAT_IDENTITY_DENIED');await mark('uat-planner').set(good);await cat.delete();await deny(mutate('monthly',create('uat-m4',m)),'UAT_IDENTITY_DENIED');await cat.set(catalog)})
  await check('concurrent same revision updates exactly one audit and result',async()=>{await mutate('monthly',create('uat-m4',m));const n=await audits();const results=await Promise.allSettled([mutate('monthly',update('uat-m4',{...m,targetArea100:1100})),mutate('monthly',update('uat-m4',{...m,targetArea100:1200}))]);assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(results.find(r=>r.status==='rejected').reason.message,'PLANNING_REVISION_CONFLICT');assert.equal(await audits(),n+1);assert.equal((await row('monthly_plans','uat-m4')).revision,1)})
  await check('audit collision aborts plan write atomically',async()=>{const audit=path('planning_audit','monthly:uat-m5:0');await audit.set({testOnly:true,sentinel:true});await assert.rejects(mutate('monthly',create('uat-m5',m)));assert.equal(await row('monthly_plans','uat-m5'),undefined);assert.deepEqual((await audit.get()).data(),{testOnly:true,sentinel:true})})
  await check('direct client plan and audit writes denied',async()=>{for(const c of ['monthly_plans','planning_audit'])await assert.rejects(setDoc(doc(a.db,prefix+'/'+c+'/uat-direct'),{testOnly:true}),e=>e.code==='permission-denied')})
  await check('root and read-only fixtures unchanged; no delete API',async()=>{assert.deepEqual(Object.keys(writer),['mutate']);assert.deepEqual((await mp.get()).data(),monthly);assert.deepEqual((await dp.get()).data(),daily);assert.deepEqual((await adb.doc('monthly_plans/uat-m1').get()).data(),{syntheticSentinel:true});assert.equal((await row('daily_reports','uat-ap1')).actualArea100,2100)})
  console.log('SUCCESS: '+n+' Planning write lifecycle checks passed (Firebase Auth + Firestore emulator)')
 }finally{
  for(const c of clients){await signOut(c.auth);await terminate(c.db);await deleteApp(c.app)}
  await adb.terminate();await adminDelete(admin)
 }
}
