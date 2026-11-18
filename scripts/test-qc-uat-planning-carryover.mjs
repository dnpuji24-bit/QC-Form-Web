// Dedicated Firebase Auth + Firestore emulator, no production credentials or data.
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {createRequire} from 'node:module'
import {dailySourceProgress} from '../src/qcUatDailySourceProgress.mjs'
import {marker} from '../src/qcUatRolePermissions.mjs'
import {roleDefinition,assignIdentityRole,permissionsForIdentity} from '../src/qcUatCustomRoles.mjs'
import {projectId,host,firestorePort,authPort,guard,planningMode,createPlanningService,createPlanningWriteService,createPlanningQcService,createPlanningCarryoverService} from '../server/qc-photo-access/uat-planning-role-service.mjs'
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
 const service=createPlanningService({adb,authAdmin}),writer=createPlanningWriteService({adb,authAdmin}),qc=createPlanningQcService({adb,authAdmin}),carry=createPlanningCarryoverService({adb,authAdmin})
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
  const carryJob=(id,dpId='uat-d2',fields=d,patch={})=>job({...record(id,dpId,fields),shift:'2',foreman:'uat-f2',...patch})
  const submit=(q,token=t)=>carry.commit(token,q)
  const spray=carryJob('uat-c1','uat-d2',d,{actualArea100:900}),fertCarry=carryJob('uat-cf','uat-fert',fd,{actualArea100:600})
  const sourceBefore=await row('daily_plans','uat-d2')
  const allForms={...formOnly,qc_fertilizer:'edit'}
  await check('planning permission alone cannot carryover',async()=>{await deny(submit(spray),'QC_PERMISSION_DENIED');await absent(spray.record.id)})
  await check('same-day shift 1 normal QC creates first Actual',async()=>{await permissions(formOnly);const r={...q1.record,actualArea100:1000};await save(job(r));assert.equal((await ap(r.id)).shift,'1');assert.equal((await ap(r.id)).foreman,'uat-f1')})
  await check('strict own-session service rejects explicit carryover payload',async()=>{await deny(save(spray),'DAILY_LINK_MISMATCH');await absent(spray.record.id)})
  await check('shift 2 custom form editor commits source DP with actual foreman',async()=>{const r=await submit(spray),a=await ap(r.id);assert.equal(r.shift,'2');assert.equal(r.foreman,'uat-f2');assert.equal(a.shift,'2');assert.equal(a.foreman,'uat-f2');assert.equal(a.dailyPlanId,'uat-d2');assert.equal(a.monthlyPlanLineId,'uat-m2');assert.equal(a.plannedDailyArea100,1500);assert.equal((await audit(r.id)).actorUid,uid);assert.deepEqual(await row('daily_plans','uat-d2'),sourceBefore)})
  const progress=async()=>{const s=await adb.collection(prefix+'/daily_reports').where('dailyPlanId','==','uat-d2').get();const rows=s.docs.map(x=>{const a=x.data();assert.equal(x.id,'qcactual_'+a.qcRecordId);return {id:a.qcRecordId,dailyPlanId:a.dailyPlanId,actualArea100:a.actualArea100,shift:a.shift,foreman:a.foreman}});return dailySourceProgress({testOnly:true,dailyPlans:[{id:sourceBefore.id,targetArea100:sourceBefore.area100,kind:'spray',shift:'1'}],actualReports:rows})}
  await check('aggregate target once across shifts with over-actual',async()=>{const p=await progress(),r=p.rows[0];assert.equal(p.totalTargetArea100,1500);assert.equal(r.actualArea100,1900);assert.equal(r.overArea100,400);assert.equal(r.actualByShift100['1'],1000);assert.equal(r.actualByShift100['2'],900);assert.equal(r.remainingArea100,0)})
  await check('exact retry leaves audit and Actual count unchanged',async()=>{const before=await audit('uat-c1');assert.deepEqual(await submit(spray),await qrow('uat-c1'));assert.deepEqual(await audit('uat-c1'),before);assert.equal((await progress()).rows[0].actualIds.length,2)})
  await check('correction replaces same Actual and updates aggregate',async()=>{const r={...spray.record,clientRevision:'uat-r2',actualArea100:1100};await submit(job(r,'uat-r1'));const p=await progress();assert.equal(p.rows[0].actualArea100,2100);assert.equal(p.rows[0].overArea100,600);assert.equal(p.rows[0].actualIds.length,2);assert.equal((await ap(r.id)).actualReportId,'qcactual_uat-c1')})
  await check('correction cannot rewrite actual executor or source identity',async()=>{const r={...spray.record,clientRevision:'uat-r3',foreman:'uat-f3'};await deny(submit(job(r,'uat-r2')),'QC_PLANNING_LINK_IMMUTABLE');assert.equal((await ap(r.id)).foreman,'uat-f2');assert.equal(await audit(r.id,'uat-r3'),undefined)})
  await check('foreign account cannot replay or replace original job',async()=>{await deny(submit(spray,b.token),'QC_OWNER_ONLY');assert.equal((await qrow('uat-c1')).ownerUid,uid)})
  await check('fertilizer view denies carryover; edit restores without login',async()=>{await deny(submit(fertCarry),'QC_PERMISSION_DENIED');await absent('uat-cf');await permissions(allForms);await submit(fertCarry);const a=await ap('uat-cf');assert.equal(a.qcFormType,'fertilizer');assert.equal(a.monthlyPlanLineId,'');assert.equal(a.shift,'2');assert.equal(a.foreman,'uat-f2')})
  await check('reverse same-shift and different-date rejected',async()=>{await plan('daily','uat-shift2',{...fd,shift:'2'});for(const j of [carryJob('uat-bad1','uat-d2',d,{shift:'1'}),carryJob('uat-bad2','uat-d2',d,{date:'2026-11-04'}),carryJob('uat-bad3','uat-shift2',{...fd,shift:'2'},{shift:'1'}),carryJob('uat-bad4','uat-shift2',{...fd,shift:'2'})]){await deny(submit(j),'CARRYOVER_SESSION_DENIED');await absent(j.record.id)}})
  await check('stale revision and cancelled source rejected',async()=>{await plan('daily','uat-new',fd);await mutate('daily',update('uat-new',{...fd,area100:1800}));const j=carryJob('uat-bad5','uat-new',fd);await deny(submit(j),'DAILY_REVISION_CONFLICT');await mutate('daily',cancel('uat-new',1));await deny(submit({...j,expectedDailyRevision:2}),'PLAN_CLOSED');await absent(j.record.id)})
  await check('draft carryover has no Actual until ready and blocks DP mutation',async()=>{await plan('daily','uat-draftdp',fd);const j=carryJob('uat-cdraft','uat-draftdp',fd,{saveType:'draft'});await submit(j);assert.equal(await ap(j.record.id),undefined);await deny(mutate('daily',cancel('uat-draftdp')),'PLAN_HAS_DEPENDENTS');const r={...j.record,clientRevision:'uat-r2',saveType:'ready'};await submit(job(r,'uat-r1'));assert.equal((await ap(r.id)).shift,'2')})
  await check('permission revocation blocks retry and new carryover',async()=>{await permissions({...allForms,qc_spraying:'none'});await deny(submit(job({...spray.record,clientRevision:'uat-r2',actualArea100:1100},'uat-r1')),'QC_PERMISSION_DENIED');const j=carryJob('uat-denied');await deny(submit(j),'QC_PERMISSION_DENIED');await absent(j.record.id);await permissions(allForms)})
  await check('MP period moves but carryover source remains original',async()=>{await mutate('monthly',update('uat-m2',{...m,week:'W2'}));const j=carryJob('uat-c2','uat-d2',d,{actualArea100:200});await submit(j);assert.equal((await ap(j.record.id)).monthlyPlanLineId,'uat-m2');assert.equal((await progress()).rows[0].actualArea100,2300)})
  await check('concurrent source cancellation and carryover cannot both succeed',async()=>{await plan('daily','uat-race',fd);const j=carryJob('uat-crace','uat-race',fd);const results=await Promise.allSettled([mutate('daily',cancel('uat-race')),submit(j)]);assert.equal(results.filter(x=>x.status==='fulfilled').length,1);const source=await row('daily_plans','uat-race');if(source.status==='cancelled'){await absent(j.record.id)}else{assert.equal((await ap(j.record.id)).dailyPlanId,source.id);assert.equal((await qrow(j.record.id)).shift,'2')}})
  await check('no duplicate DP and direct client writes denied',async()=>{assert.deepEqual(await row('daily_plans','uat-d2'),sourceBefore);const src=await adb.collection(prefix+'/daily_plans').where('monthlyPlanLineId','==','uat-m2').get();assert.equal(src.size,1);await assert.rejects(setDoc(doc(a.db,prefix+'/daily_reports/uat-direct'),{testOnly:true}),e=>e.code==='permission-denied');assert.deepEqual((await adb.doc('monthly_plans/uat-m1').get()).data(),{syntheticSentinel:true})})
  console.log('SUCCESS: '+n+' Planning carryover integration checks passed (Firebase Auth + Firestore emulator, photo-free)')
 }finally{
  for(const c of clients){await signOut(c.auth);await terminate(c.db);await deleteApp(c.app)}
  await adb.terminate();await adminDelete(admin)
 }
}
