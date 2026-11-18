// Dedicated Firebase Auth + Firestore emulator, no production credentials or data.
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {createRequire} from 'node:module'
import {marker} from '../src/qcUatRolePermissions.mjs'
import {roleDefinition,assignIdentityRole,permissionsForIdentity} from '../src/qcUatCustomRoles.mjs'
import {projectId,host,firestorePort,authPort,guard,planningMode,createPlanningService,createPlanningWriteService,createPlanningQcService,createDailyGroupService,createPlanningCarryoverService,createDailyGroupLifecycleService,createPlanningMasterSnapshotService} from '../server/qc-photo-access/uat-planning-role-service.mjs'
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
 const service=createPlanningService({adb,authAdmin}),writer=createPlanningWriteService({adb,authAdmin}),qc=createPlanningQcService({adb,authAdmin}),groups=createDailyGroupService({adb,authAdmin}),carry=createPlanningCarryoverService({adb,authAdmin}),full=createPlanningMasterSnapshotService({adb,authAdmin}),lifecycle=createDailyGroupLifecycleService({adb,authAdmin})
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
  for(const c of ['users','qc_uat_identities','monthly_plans',prefix+'/monthly_plans',prefix+'/daily_plans',prefix+'/role_catalog',prefix+'/planning_audit',prefix+'/master_paddocks',prefix+'/master_activities',prefix+'/qc_records',prefix+'/daily_reports',prefix+'/qc_operational_audit',prefix+'/daily_work_groups',prefix+'/daily_group_members',prefix+'/monthly_plan_snapshots',prefix+'/daily_plan_snapshots',prefix+'/daily_group_snapshots',prefix+'/master_companies',prefix+'/master_materials',prefix+'/master_foremen',prefix+'/master_shifts',prefix+'/master_units'])assert.equal((await adb.collection(c).limit(1).get()).size,0,'FRESH_FIRESTORE_REQUIRED')
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
  const company={testOnly:true,code:'uat-company',active:true}
  await path('master_companies',company.code).set(company)
  const pad=pid=>({testOnly:true,pid,active:true,companyCode:company.code,farm:'Farm A',stage:'Ratoon',variety:'V1/V2',areaPaddock100:2000,plantArea100:1800,varietyBreakdown:[{variety:'V1',area100:800},{variety:'V2',area100:1000}]})
  for(const pid of ['uat-p1','uat-p2'])await path('master_paddocks',pid).set(pad(pid))
  const activity={testOnly:true,id:'uat-a1',active:true,formType:'spray',companyScope:'GLOBAL',activity:'Spray',description:'Post Emergence',components:[{materialId:'uat-mat',dosePerHa:'1.2345',unit:'L'}]}
  const mat={testOnly:true,id:'uat-mat',active:true,materialName:'Synthetic Herbicide',unit:'L'}
  await path('master_activities',activity.id).set(activity);await path('master_materials',mat.id).set(mat)
  await path('master_foremen','uat-f1').set({testOnly:true,id:'uat-f1',active:true,name:'Mandor A'})
  await path('master_shifts','1').set({testOnly:true,code:'1',active:true})
  await path('master_units','uat-unit').set({testOnly:true,id:'uat-unit',name:'Unit 01',active:true})
  const fullMp=(id,pid='uat-p1',selectedVarieties=['V1'],token=b.token)=>full.createMonthly(token,{id,fields:{...m,pid},selectedVarieties})
  const fullGroup=(g,token=b.token)=>full.createGroup(token,g)
  const fullInput=fresh('uat-full',{rows:[{dailyPlanId:'uat-full-d1',pid:'uat-p1',monthlyPlanLineId:'uat-full-m1',area100:500},{dailyPlanId:'uat-full-d2',pid:'uat-p2',monthlyPlanLineId:'uat-full-m2',area100:700}]})
  const clone=(id,patch={})=>({...fullInput,workGroupId:id,rows:fullInput.rows.map((r,i)=>({...r,dailyPlanId:id+'-d'+(i+1)})),...patch})
  const absentFull=async g=>{await noGroup(g);assert.equal(await row('daily_group_snapshots',g.workGroupId),undefined);for(const r of g.rows)assert.equal(await row('daily_plan_snapshots',r.dailyPlanId),undefined)}
  await check('monthly create derives snapshot and exact material totals',async()=>{const x=await fullMp('uat-full-m1');assert.equal(x.snapshot.selectedPlantArea100,800);assert.equal(x.materials[0].totalMaterial1000000,12345000);assert.deepEqual(await row('monthly_plan_snapshots',x.row.id),x.snapshot);assert.deepEqual(await row('monthly_plans',x.row.id),x.row)})
  await check('second monthly can select multiple varieties with distinct PID',async()=>{const x=await fullMp('uat-full-m2','uat-p2',['V1','V2']);assert.equal(x.snapshot.selectedPlantArea100,1800);assert.equal(x.snapshot.pid,'uat-p2')})
  await check('bad variety and inactive material abort monthly creation',async()=>{await deny(fullMp('uat-badmp','uat-p1',['V3']),'UNKNOWN_VARIETY');await path('master_materials',mat.id).update({active:false});await deny(fullMp('uat-badmp'),'INVALID_PLANNING_MASTER');await path('master_materials',mat.id).set(mat);assert.equal(await row('monthly_plans','uat-badmp'),undefined);assert.equal(await row('monthly_plan_snapshots','uat-badmp'),undefined)})
  await check('monthly permission checked; sidecar collision atomic',async()=>{await deny(fullMp('uat-viewmp','uat-p1',['V1'],v.token));const r=path('monthly_plan_snapshots','uat-collisionmp');await r.set({testOnly:true,sentinel:true});await assert.rejects(fullMp('uat-collisionmp'));assert.equal(await row('monthly_plans','uat-collisionmp'),undefined);assert.equal(await row('planning_audit','monthly:uat-collisionmp:0'),undefined)})
  await check('Daily View cannot create full group',async()=>{await deny(fullGroup(fullInput,t));await absentFull(fullInput)})
  await check('full group derives materials from frozen MP despite changed master dose',async()=>{await path('master_activities',activity.id).update({components:[{...activity.components[0],dosePerHa:3}]});const x=await fullGroup(fullInput);assert.equal(x.snapshots[0].materials[0].dose10000,12345);assert.equal(x.snapshots[0].materials[0].totalMaterial1000000,6172500);assert.equal(x.snapshots[1].materials[0].totalMaterial1000000,8641500);assert.equal(x.groupSnapshot.totalMaterials[0].totalMaterial1000000,14814000);assert.equal(x.groupSnapshot.resources.manpower,7);assert.equal(x.groupSnapshot.resources.unitId,'uat-unit');assert.deepEqual(await row('daily_group_snapshots',x.header.workGroupId),x.groupSnapshot);for(const s of x.snapshots)assert.deepEqual(await row('daily_plan_snapshots',s.dailyPlanId),s)})
  await check('missing monthly snapshot rejects all group rows',async()=>{const g=clone('uat-nosnap');g.rows[0].monthlyPlanLineId='uat-m2';await deny(fullGroup(g),'MISSING_MONTHLY_SNAPSHOT');await absentFull(g)})
  await check('inactive foreman or ambiguous unit rejects whole group',async()=>{const g=clone('uat-resource');await path('master_foremen','uat-f1').update({active:false});await deny(fullGroup(g),'INVALID_PLANNING_MASTER');await path('master_foremen','uat-f1').update({active:true});const u=path('master_units','uat-unit2');await u.set({testOnly:true,id:'uat-unit2',name:'Unit 01',active:true});await deny(fullGroup(g),'INVALID_MASTER_UNIT');await u.delete();await absentFull(g)})
  await check('inactive current material rejects new DP but stored snapshot unchanged',async()=>{const g=clone('uat-inactive'),before=await row('daily_plan_snapshots','uat-full-d1');await path('master_materials',mat.id).update({active:false});await deny(fullGroup(g),'MATERIAL_UNIT_OR_STATUS');await absentFull(g);assert.deepEqual(await row('daily_plan_snapshots','uat-full-d1'),before);await path('master_materials',mat.id).set(mat)})
  await check('ADHOC group has no inferred recipe materials',async()=>{const g=clone('uat-adhoc',{sourceType:'ADHOC'});g.rows=g.rows.map(r=>({...r,monthlyPlanLineId:''}));const x=await fullGroup(g);assert.deepEqual(x.groupSnapshot.totalMaterials,[]);assert.ok(x.snapshots.every(s=>s.materials.length===0&&s.selectedVarieties.length===2))})
  await check('full group edit blocked until metadata lifecycle is integrated',async()=>{const g=fullInput,q={action:'edit',workGroupId:g.workGroupId,expectedRevision:0,fields:{shift:g.shift,foreman:g.foreman,manpower:8,unitName:g.unitName,unitReady:g.unitReady,unitStandby:g.unitStandby,unitBreakdown:g.unitBreakdown,notes:g.notes,rows:g.rows.map(r=>({dailyPlanId:r.dailyPlanId,area100:r.area100}))}};await deny(lifecycle.mutate(b.token,q),'FULL_GROUP_EDIT_PENDING');assert.equal((await gdoc(g.workGroupId)).revision,0)})
  await check('canonical member remains compatible with QC and independent target',async()=>{await permissions(formOnly);const r=record('uat-fullq','uat-full-d1',{...d,monthlyPlanLineId:'uat-full-m1'});await save(job(r));assert.equal((await ap(r.id)).plannedDailyArea100,500);assert.equal((await row('daily_plan_snapshots','uat-full-d1')).materials[0].dose10000,12345)})
  await check('snapshot collision rolls back entire group',async()=>{const g=clone('uat-snapcollision'),r=path('daily_plan_snapshots',g.rows[1].dailyPlanId);await r.set({testOnly:true,sentinel:true});const n=await audits();await assert.rejects(fullGroup(g));await noGroup(g);assert.equal(await row('daily_group_snapshots',g.workGroupId),undefined);assert.equal(await row('daily_plan_snapshots',g.rows[0].dailyPlanId),undefined);assert.deepEqual((await r.get()).data(),{testOnly:true,sentinel:true});assert.equal(await audits(),n)})
  await check('direct client snapshot writes denied and root untouched',async()=>{for(const c of ['monthly_plan_snapshots','daily_plan_snapshots','daily_group_snapshots'])await assert.rejects(setDoc(doc(b.db,prefix+'/'+c+'/uat-direct'),{testOnly:true}),e=>e.code==='permission-denied');assert.deepEqual((await adb.doc('monthly_plans/uat-m1').get()).data(),{syntheticSentinel:true})})
  console.log('SUCCESS: '+n+' Planning master snapshot integration checks passed (Firebase Auth + Firestore emulator)')
 }finally{
  for(const c of clients){await signOut(c.auth);await terminate(c.db);await deleteApp(c.app)}
  await adb.terminate();await adminDelete(admin)
 }
}
