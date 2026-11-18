// Dedicated Firebase Auth + Firestore emulator, no production credentials or data.
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {createRequire} from 'node:module'
import {marker} from '../src/qcUatRolePermissions.mjs'
import {roleDefinition,assignIdentityRole,permissionsForIdentity} from '../src/qcUatCustomRoles.mjs'
import {projectId,host,firestorePort,authPort,guard,planningMode,createPlanningService,createPlanningWriteService,createPlanningQcService} from '../server/qc-photo-access/uat-planning-role-service.mjs'
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
 const service=createPlanningService({adb,authAdmin}),writer=createPlanningWriteService({adb,authAdmin}),qc=createPlanningQcService({adb,authAdmin})
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
  for(const c of ['users','qc_uat_identities','monthly_plans',prefix+'/monthly_plans',prefix+'/daily_plans',prefix+'/role_catalog',prefix+'/planning_audit',prefix+'/master_paddocks',prefix+'/master_activities',prefix+'/qc_records',prefix+'/daily_reports',prefix+'/qc_operational_audit'])assert.equal((await adb.collection(c).limit(1).get()).size,0,'FRESH_FIRESTORE_REQUIRED')
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
  const mutate=(scope,q,token=b.token)=>writer.mutate(token,scope,q)
  const row=(c,id)=>path(c,id).get().then(s=>s.data())
  const audits=async()=> (await adb.collection(prefix+'/planning_audit').get()).size
  const plan=(scope,id,fields)=>mutate(scope,create(id,fields))
  await path('master_activities','uat-a2').set({testOnly:true,id:'uat-a2',active:true,formType:'fertilizer'})
  await plan('monthly','uat-m2',m)
  await plan('daily','uat-d2',d)
  const fd={...d,activityId:'uat-a2',sourceType:'ADHOC',monthlyPlanLineId:'',formType:'fertilizer'}
  await plan('daily','uat-fert',fd)
  const uid='uat-planner'
  const record=(id,dpId='uat-d2',fields=d)=>({testOnly:true,id,ownerUid:uid,inputtedBy:uid,formType:fields.formType,clientRevision:'uat-r1',saveType:'ready',dailyPlanId:dpId,monthlyPlanLineId:fields.monthlyPlanLineId,pid:fields.pid,date:fields.date,shift:fields.shift,foreman:fields.foreman,actualArea100:2100,sessionId:'uat-session'})
  const job=(r,baseRevision=null,expectedDailyRevision=0)=>({record:r,baseRevision,jobId:'uat-job-'+r.id.slice(4)+'-'+r.clientRevision.slice(4),uploaderUid:uid,expectedDailyRevision})
  const save=(q,token=t)=>qc.commit(token,q)
  const q1=job(record('uat-q1')),draft=job({...record('uat-q2'),saveType:'draft'}),fert=job(record('uat-qf','uat-fert',fd))
  const qrow=id=>row('qc_records',id),ap=id=>row('daily_reports','qcactual_'+id),audit=(id,rev='uat-r1')=>row('qc_operational_audit',id+':'+rev)
  const absent=async id=>{assert.equal(await qrow(id),undefined);assert.equal(await ap(id),undefined);assert.equal(await audit(id),undefined)}
  let policyRevision=custom.policyRevision
  const permissions=async overrides=>{const mm={...manual(custom,overrides),policyRevision:++policyRevision};await mark(uid).set(mm)}
  const formOnly={data_plan_monthly:'none',data_plan_daily:'none',qc_spraying:'edit',qc_fertilizer:'view'}
  await check('planning edit alone cannot commit QC',async()=>{await deny(save(q1),'QC_PERMISSION_DENIED');await absent('uat-q1')})
  await check('same token with form edit commits without Planning or Actual permission',async()=>{await permissions(formOnly);await deny(service.readPlan(t,'daily','uat-d2'));await deny(service.check(t,'actual','edit'));const r=await save(q1);assert.equal(r.plannedDailyArea100,1500);assert.equal((await ap(r.id)).actualArea100,2100);assert.equal((await ap(r.id)).dailyVariance100,-600);assert.equal((await audit(r.id)).actorUid,uid);assert.deepEqual(await qrow(r.id),r)})
  await check('exact replay does not duplicate QC Actual audit',async()=>{const before=await audit('uat-q1');assert.deepEqual(await save(q1),await qrow('uat-q1'));assert.deepEqual(await audit('uat-q1'),before);assert.equal((await adb.collection(prefix+'/qc_operational_audit').get()).size,1)})
  await check('changed replay payload rejected',async()=>{await deny(save({...q1,record:{...q1.record,actualArea100:2200}}),'QC_REPLAY_PAYLOAD_MISMATCH');assert.equal((await ap('uat-q1')).actualArea100,2100)})
  await check('foreign token cannot commit original owner job',async()=>{await deny(save(q1,b.token),'QC_OWNER_ONLY');assert.equal((await qrow('uat-q1')).ownerUid,uid)})
  await check('form View cannot save Fertilizer',async()=>{await deny(save(fert),'QC_PERMISSION_DENIED');await absent('uat-qf')})
  await check('manual grant enables Fertilizer ADHOC without monthly link',async()=>{await permissions({...formOnly,qc_fertilizer:'edit'});const r=await save(fert);assert.equal(r.monthlyPlanLineId,'');assert.equal((await ap(r.id)).qcFormType,'fertilizer');assert.equal((await ap(r.id)).monthlyPlanLineId,'')})
  await check('draft blocks planning change but creates no Actual',async()=>{await save(draft);assert.equal(await ap('uat-q2'),undefined);assert.equal((await audit('uat-q2')).saveType,'draft');await deny(mutate('daily',update('uat-d2',d)),'PLAN_HAS_DEPENDENTS')})
  await check('draft to ready creates exactly one linked Actual',async()=>{const r={...draft.record,clientRevision:'uat-r2',saveType:'ready',actualArea100:600};await save(job(r,'uat-r1'));assert.equal((await ap(r.id)).actualArea100,600);assert.equal((await audit(r.id,'uat-r2')).saveType,'ready')})
  await check('correction updates same Actual and cannot remove it',async()=>{const r={...q1.record,clientRevision:'uat-r2',actualArea100:2300};await save(job(r,'uat-r1'));assert.equal((await ap(r.id)).actualArea100,2300);assert.equal((await ap(r.id)).actualReportId,'qcactual_uat-q1');await deny(save(job({...r,clientRevision:'uat-r3',actualArea100:0},'uat-r2')),'QC_ACTUAL_REMOVAL_REQUIRES_REVIEW');assert.equal(await audit(r.id,'uat-r3'),undefined)})
  await check('monthly period edits preserve existing source linkage',async()=>{await mutate('monthly',update('uat-m2',{...m,week:'W2'}));const r=await save(job(record('uat-q3')));assert.equal(r.monthlyPlanLineId,'uat-m2');assert.equal((await ap(r.id)).dailyPlanId,'uat-d2')})
  await check('QC and Actual block DP and MP cancellation',async()=>{await deny(mutate('daily',cancel('uat-d2')),'PLAN_HAS_DEPENDENTS');await deny(mutate('monthly',cancel('uat-m2',1)),'PLAN_HAS_DEPENDENTS')})
  await check('missing and cancelled Daily plan reject QC without any writes',async()=>{await deny(save(job(record('uat-q4','uat-missing'))),'MISSING_DAILY_PLAN');await plan('daily','uat-cancelled',fd);await mutate('daily',cancel('uat-cancelled'));await deny(save(job(record('uat-q4','uat-cancelled',fd),null,1)),'PLAN_CLOSED');await absent('uat-q4')})
  await check('stale Daily revision denied and current revision accepted',async()=>{await plan('daily','uat-stale',fd);await mutate('daily',update('uat-stale',{...fd,area100:1800}));const r=record('uat-q5','uat-stale',fd);await deny(save(job(r)),'DAILY_REVISION_CONFLICT');await absent(r.id);assert.equal((await save(job(r,null,1))).plannedDailyArea100,1800)})
  await check('mismatched link and forged actor denied',async()=>{const r=record('uat-q6');await deny(save(job({...r,monthlyPlanLineId:'uat-other'})),'DAILY_LINK_MISMATCH');await deny(save(job({...r,inputtedBy:'uat-other'})),'QC_OWNER_ONLY');await absent(r.id)})
  await check('existing QC cannot be relinked to another valid DP',async()=>{await plan('daily','uat-relink',{...fd,formType:'spray',activityId:'uat-a1'});const r={...q1.record,clientRevision:'uat-r3',dailyPlanId:'uat-relink',monthlyPlanLineId:'',actualArea100:2400};await deny(save(job(r,'uat-r2')),'QC_PLANNING_LINK_IMMUTABLE');assert.equal((await ap(r.id)).dailyPlanId,'uat-d2')})
  await check('revocation blocks exact replay and new correction with unchanged token',async()=>{await permissions({...formOnly,qc_spraying:'none'});await deny(save(job(record('uat-q3'))),'QC_PERMISSION_DENIED');await deny(save(job(record('uat-q7'))),'QC_PERMISSION_DENIED');await absent('uat-q7');await permissions({...formOnly,qc_fertilizer:'edit'});assert.equal((await save(job(record('uat-q3')))).id,'uat-q3')})
  await check('forged catalog marker denies QC before write',async()=>{const good=(await mark(uid).get()).data();await mark(uid).set({...good,permissions:{...good.permissions,qc_fertilizer:'none'}});await deny(save(job(record('uat-q7'))),'UAT_IDENTITY_DENIED');await mark(uid).set(good);await cat.delete();await deny(save(job(record('uat-q7'))),'UAT_IDENTITY_DENIED');await cat.set(catalog);await absent('uat-q7')})
  await check('preexisting foreign Actual prevents atomic commit',async()=>{const r=record('uat-q8'),f=path('daily_reports','qcactual_'+r.id),payload={testOnly:true,ownerUid:'uat-other',dailyPlanId:r.dailyPlanId,monthlyPlanLineId:r.monthlyPlanLineId};await f.set(payload);await deny(save(job(r)),'QC_ACTUAL_ID_CONFLICT');assert.equal(await qrow(r.id),undefined);assert.equal(await audit(r.id),undefined);assert.deepEqual((await f.get()).data(),payload)})
  await check('concurrent DP cancel versus QC commit never leaves QC on cancelled DP',async()=>{await plan('daily','uat-race',fd);const r=record('uat-qrace','uat-race',fd);const results=await Promise.allSettled([mutate('daily',cancel('uat-race')),save(job(r))]);const final=await row('daily_plans','uat-race'),q=await qrow(r.id);assert.equal(results.filter(x=>x.status==='fulfilled').length,1);if(final.status==='cancelled'){assert.equal(q,undefined);assert.equal(await ap(r.id),undefined);assert.equal(await audit(r.id),undefined)}else{assert.equal(final.status,'open');assert.equal(q.id,r.id);assert.equal((await ap(r.id)).dailyPlanId,final.id);assert.equal((await audit(r.id)).recordId,r.id)}})
  await check('concurrent DP update versus QC commit never leaves mismatched planned area',async()=>{await plan('daily','uat-race2',fd);const r=record('uat-qrace2','uat-race2',fd);const results=await Promise.allSettled([mutate('daily',update('uat-race2',{...fd,area100:1700})),save(job(r))]);const final=await row('daily_plans','uat-race2'),q=await qrow(r.id);assert.equal(results.filter(x=>x.status==='fulfilled').length,1);if(q){assert.equal(final.revision,0);assert.equal(q.plannedDailyArea100,final.area100);assert.equal((await ap(r.id)).plannedDailyArea100,final.area100)}else{assert.equal(final.revision,1);assert.equal(await ap(r.id),undefined);assert.equal(await audit(r.id),undefined)}})
  await check('direct client QC Actual and audit writes denied; root untouched',async()=>{for(const c of ['qc_records','daily_reports','qc_operational_audit'])await assert.rejects(setDoc(doc(a.db,prefix+'/'+c+'/uat-direct'),{testOnly:true}),e=>e.code==='permission-denied');assert.deepEqual((await adb.doc('monthly_plans/uat-m1').get()).data(),{syntheticSentinel:true});assert.deepEqual((await mp.get()).data(),monthly);assert.deepEqual((await dp.get()).data(),daily)})
  console.log('SUCCESS: '+n+' Planning QC integration checks passed (Firebase Auth + Firestore emulator, photo-free)')
 }finally{
  for(const c of clients){await signOut(c.auth);await terminate(c.db);await deleteApp(c.app)}
  await adb.terminate();await adminDelete(admin)
 }
}
