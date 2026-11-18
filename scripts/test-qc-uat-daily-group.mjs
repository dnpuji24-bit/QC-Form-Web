// Dedicated Firebase Auth + Firestore emulator, no production credentials or data.
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {createRequire} from 'node:module'
import {marker} from '../src/qcUatRolePermissions.mjs'
import {roleDefinition,assignIdentityRole,permissionsForIdentity} from '../src/qcUatCustomRoles.mjs'
import {projectId,host,firestorePort,authPort,guard,planningMode,createPlanningService,createPlanningWriteService,createPlanningQcService,createDailyGroupService,createPlanningCarryoverService} from '../server/qc-photo-access/uat-planning-role-service.mjs'
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
 const service=createPlanningService({adb,authAdmin}),writer=createPlanningWriteService({adb,authAdmin}),qc=createPlanningQcService({adb,authAdmin}),groups=createDailyGroupService({adb,authAdmin}),carry=createPlanningCarryoverService({adb,authAdmin})
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
  for(const c of ['users','qc_uat_identities','monthly_plans',prefix+'/monthly_plans',prefix+'/daily_plans',prefix+'/role_catalog',prefix+'/planning_audit',prefix+'/master_paddocks',prefix+'/master_activities',prefix+'/qc_records',prefix+'/daily_reports',prefix+'/qc_operational_audit',prefix+'/daily_work_groups',prefix+'/daily_group_members'])assert.equal((await adb.collection(c).limit(1).get()).size,0,'FRESH_FIRESTORE_REQUIRED')
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
  await path('master_paddocks','uat-p2').set({testOnly:true,pid:'uat-p2',active:true})
  await plan('monthly','uat-m3',{...m,pid:'uat-p2'})
  const group={workGroupId:'uat-g1',planningOrder:1,date:d.date,shift:d.shift,foreman:d.foreman,activityId:d.activityId,formType:d.formType,sourceType:'MONTHLY',manpower:7,unitName:'Unit 01',unitReady:1,unitStandby:0,unitBreakdown:0,notes:'',rows:[{dailyPlanId:'uat-gd1',pid:'uat-p1',monthlyPlanLineId:'uat-m2',area100:500},{dailyPlanId:'uat-gd2',pid:'uat-p2',monthlyPlanLineId:'uat-m3',area100:700}]}
  const createGroup=(input=group,token=b.token)=>groups.create(token,input)
  const gdoc=id=>row('daily_work_groups',id),member=id=>row('daily_group_members',id)
  const fresh=(id,patch={})=>({...group,workGroupId:id,rows:group.rows.map((r,i)=>({...r,dailyPlanId:id+'-d'+(i+1)})),...patch})
  const noGroup=async input=>{assert.equal(await gdoc(input.workGroupId),undefined);for(const r of input.rows){assert.equal(await row('daily_plans',r.dailyPlanId),undefined);assert.equal(await member(r.dailyPlanId),undefined);assert.equal(await row('planning_audit','daily:'+r.dailyPlanId+':0'),undefined)}}
  await check('Daily View cannot create group even with Monthly Edit',async()=>{await deny(createGroup(group,t));await noGroup(group)})
  await check('atomic group creates two DP members and three audits',async()=>{const n=await audits(),out=await createGroup();assert.equal(out.header.totalArea100,1200);assert.equal(out.header.manpower,7);assert.equal(out.header.workGroupPidCount,2);assert.deepEqual(await gdoc(group.workGroupId),out.header);assert.equal(await audits(),n+3);for(const r of out.rows){assert.deepEqual(await row('daily_plans',r.id),r);assert.deepEqual(await member(r.id),{testOnly:true,dailyPlanId:r.id,workGroupId:group.workGroupId});assert.deepEqual((await row('planning_audit','daily:'+r.id+':0')).after,r)}assert.deepEqual((await row('planning_audit','group:uat-g1:0')).after,out.header)})
  await check('existing individual read service reads each member unchanged',async()=>{assert.deepEqual(await service.readPlan(b.token,'daily','uat-gd1'),{id:'uat-gd1',pid:'uat-p1',area100:500});assert.equal((await service.readPlan(b.token,'daily','uat-gd2')).area100,700)})
  await check('single-row edit and cancel cannot split group even before QC',async()=>{const n=await audits();await deny(mutate('daily',update('uat-gd1',{...d,area100:600})),'GROUP_MUTATION_REQUIRED');await deny(mutate('daily',cancel('uat-gd2')),'GROUP_MUTATION_REQUIRED');assert.equal(await audits(),n)})
  await check('duplicate group ID denied and no additional audits',async()=>{const n=await audits();await deny(createGroup(),'GROUP_ALREADY_EXISTS');assert.equal(await audits(),n)})
  await check('one bad monthly parent rolls back entire group',async()=>{const g=fresh('uat-bad1');g.rows[1].monthlyPlanLineId='uat-missing';const n=await audits();await deny(createGroup(g),'MONTHLY_PARENT_NOT_FOUND');await noGroup(g);assert.equal(await audits(),n)})
  await check('wrong parent PID and invalid master reject entire group',async()=>{const g=fresh('uat-bad2');g.rows[1].monthlyPlanLineId='uat-m2';await deny(createGroup(g),'MONTHLY_PARENT_MISMATCH');await noGroup(g);g.rows[1].pid='uat-missing';await deny(createGroup(g),'INVALID_PLANNING_MASTER');await noGroup(g)})
  await check('collision on second DP prevents first DP and group creation',async()=>{const g=fresh('uat-bad3');g.rows[1].dailyPlanId='uat-gd2';const n=await audits();await deny(createGroup(g),'PLAN_ALREADY_EXISTS');assert.equal(await gdoc(g.workGroupId),undefined);assert.equal(await row('daily_plans',g.rows[0].dailyPlanId),undefined);assert.equal(await audits(),n);assert.equal((await member('uat-gd2')).workGroupId,'uat-g1')})
  await check('audit collision aborts all group writes',async()=>{const g=fresh('uat-bad4'),collision=path('planning_audit','daily:'+g.rows[1].dailyPlanId+':0');await collision.set({testOnly:true,sentinel:true});await assert.rejects(createGroup(g));assert.equal(await gdoc(g.workGroupId),undefined);for(const r of g.rows){assert.equal(await row('daily_plans',r.dailyPlanId),undefined);assert.equal(await member(r.dailyPlanId),undefined)}assert.deepEqual((await collision.get()).data(),{testOnly:true,sentinel:true})})
  await check('QC uses exact member ID and independent planned area',async()=>{await permissions({...formOnly,qc_fertilizer:'edit'});const r1={...record('uat-groupq1','uat-gd1',d),actualArea100:400},r2={...record('uat-groupq2','uat-gd2',{...d,pid:'uat-p2',monthlyPlanLineId:'uat-m3'}),actualArea100:800};await save(job(r1));await save(job(r2));assert.equal((await ap(r1.id)).plannedDailyArea100,500);assert.equal((await ap(r2.id)).plannedDailyArea100,700);assert.equal((await ap(r2.id)).monthlyPlanLineId,'uat-m3');assert.equal((await ap(r2.id)).dailyPlanId,'uat-gd2')})
  await check('wrong PID or group ID is not a valid QC source',async()=>{const r=record('uat-badq','uat-gd2',d);await deny(save(job(r)),'DAILY_LINK_MISMATCH');await deny(save(job({...r,dailyPlanId:'uat-g1'})),'MISSING_DAILY_PLAN');await absent(r.id)})
  await check('carryover links member without creating new group or DP',async()=>{const r={...record('uat-groupc','uat-gd1',d),shift:'2',foreman:'uat-f2',actualArea100:300};const before=(await adb.collection(prefix+'/daily_plans').get()).size;await carry.commit(t,job(r));assert.equal((await ap(r.id)).dailyPlanId,'uat-gd1');assert.equal((await ap(r.id)).shift,'2');assert.equal((await adb.collection(prefix+'/daily_plans').get()).size,before);assert.equal((await gdoc('uat-g1')).totalArea100,1200)})
  await check('monthly cancellation blocked by member',()=>deny(mutate('monthly',cancel('uat-m3')),'PLAN_HAS_DEPENDENTS'))
  await check('manual Daily Edit grant and revoke apply to group creation',async()=>{const g=fresh('uat-g2',{sourceType:'ADHOC'});g.rows=g.rows.map(r=>({...r,monthlyPlanLineId:''}));await permissions({data_plan_daily:'edit'});await createGroup(g,t);assert.equal((await gdoc(g.workGroupId)).createdBy,uid);const h=fresh('uat-g3');await permissions({data_plan_daily:'none'});await deny(createGroup(h,t));await noGroup(h)})
  await check('concurrent same group create has one winner and consistent members',async()=>{const g=fresh('uat-raceg');const n=await audits(),results=await Promise.allSettled([createGroup(g),createGroup(g)]);assert.equal(results.filter(x=>x.status==='fulfilled').length,1);assert.equal(await audits(),n+3);for(const r of g.rows)assert.equal((await member(r.dailyPlanId)).workGroupId,g.workGroupId)})
  await check('concurrent old single create versus group create cannot overwrite or split',async()=>{const g=fresh('uat-race2');const r=g.rows[0];const results=await Promise.allSettled([createGroup(g),mutate('daily',create(r.dailyPlanId,{...d,pid:r.pid,monthlyPlanLineId:r.monthlyPlanLineId,area100:r.area100}))]);assert.equal(results.filter(x=>x.status==='fulfilled').length,1);if(await gdoc(g.workGroupId)){for(const r of g.rows)assert.equal((await member(r.dailyPlanId)).workGroupId,g.workGroupId)}else{assert.equal(await member(r.dailyPlanId),undefined);assert.equal(await row('daily_plans',g.rows[1].dailyPlanId),undefined)}})
  await check('client group member and audit writes denied; root untouched',async()=>{for(const c of ['daily_work_groups','daily_group_members','planning_audit'])await assert.rejects(setDoc(doc(b.db,prefix+'/'+c+'/uat-direct'),{testOnly:true}),e=>e.code==='permission-denied');assert.deepEqual((await adb.doc('monthly_plans/uat-m1').get()).data(),{syntheticSentinel:true});assert.deepEqual(Object.keys(groups),['create'])})
  console.log('SUCCESS: '+n+' atomic Daily work group integration checks passed (Firebase Auth + Firestore emulator)')
 }finally{
  for(const c of clients){await signOut(c.auth);await terminate(c.db);await deleteApp(c.app)}
  await adb.terminate();await adminDelete(admin)
 }
}
