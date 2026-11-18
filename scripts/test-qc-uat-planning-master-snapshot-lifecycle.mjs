// Dedicated Firebase Auth + Firestore emulator, no production credentials or data.
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {createRequire} from 'node:module'
import {marker} from '../src/qcUatRolePermissions.mjs'
import {roleDefinition,assignIdentityRole,permissionsForIdentity} from '../src/qcUatCustomRoles.mjs'
import {projectId,host,firestorePort,authPort,guard,planningMode,createPlanningService,createPlanningWriteService,createPlanningQcService,createDailyGroupService,createPlanningCarryoverService,createDailyGroupLifecycleService,createPlanningMasterSnapshotService,createPlanningMasterSnapshotLifecycleService} from '../server/qc-photo-access/uat-planning-role-service.mjs'
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
 const service=createPlanningService({adb,authAdmin}),writer=createPlanningWriteService({adb,authAdmin}),qc=createPlanningQcService({adb,authAdmin}),groups=createDailyGroupService({adb,authAdmin}),carry=createPlanningCarryoverService({adb,authAdmin}),full=createPlanningMasterSnapshotService({adb,authAdmin}),lifecycle=createDailyGroupLifecycleService({adb,authAdmin}),enriched=createPlanningMasterSnapshotLifecycleService({adb,authAdmin})
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
  await fullMp('uat-full-m1');await fullMp('uat-full-m2','uat-p2',['V1','V2'])
  await fullGroup(fullInput)
  await path('master_foremen','uat-f2').set({testOnly:true,id:'uat-f2',active:true,name:'Mandor B'})
  await path('master_shifts','2').set({testOnly:true,code:'2',active:true})
  await path('master_units','uat-unit2').set({testOnly:true,id:'uat-unit2',name:'Unit 02',active:true})
  const edit=(g,expectedRevision=0,patch={})=>({action:'edit',workGroupId:g.workGroupId,expectedRevision,fields:{shift:g.shift,foreman:g.foreman,manpower:g.manpower,unitName:g.unitName,unitReady:g.unitReady,unitStandby:g.unitStandby,unitBreakdown:g.unitBreakdown,notes:g.notes,rows:g.rows.map(r=>({dailyPlanId:r.dailyPlanId,area100:r.area100})),...patch}})
  const change=(q,token=b.token)=>enriched.editGroup(token,q)
  const readGroup=(g,token=b.token)=>enriched.readGroup(token,g.workGroupId)
  const readMp=(id,token=b.token)=>enriched.readMonthly(token,id)
  const input=fullInput
  await check('separate current monthly and daily read permissions',async()=>{assert.equal((await readMp('uat-full-m1',t)).materials[0].totalMaterial1000000,12345000);assert.equal((await readGroup(input,t)).groupSnapshot.totalMaterials[0].totalMaterial1000000,14814000);await deny(readGroup(input,v.token));await deny(readMp('uat-full-m1',v.token));await deny(change(edit(input),t))})
  await check('monthly target edit updates computed totals but freezes recipe and variety',async()=>{const before=await readMp('uat-full-m1');await mutate('monthly',update('uat-full-m1',{...m,targetArea100:2000}));const after=await readMp('uat-full-m1');assert.deepEqual(after.snapshot,before.snapshot);assert.equal(after.materials[0].totalMaterial1000000,24690000)})
  await check('edit recalculates every member and group totals and records snapshot audits',async()=>{const before=await readGroup(input),n=await audits();await path('master_activities',activity.id).update({components:[{...activity.components[0],dosePerHa:3}]});const x=await change(edit(input,0,{shift:'2',foreman:'uat-f2',unitName:'Unit 02',manpower:9,rows:input.rows.map(r=>({dailyPlanId:r.dailyPlanId,area100:r.area100+100}))}));assert.equal(x.header.revision,1);assert.equal(x.groupSnapshot.sourceGroupRevision,1);assert.equal(x.groupSnapshot.resources.unitId,'uat-unit2');assert.equal(x.groupSnapshot.resources.foremanName,'Mandor B');assert.equal(x.groupSnapshot.totalMaterials[0].totalMaterial1000000,17283000);assert.equal(x.snapshots[0].materials[0].totalMaterial1000000,7407000);assert.equal(x.snapshots[1].materials[0].totalMaterial1000000,9876000);assert.deepEqual(x.snapshots[0].componentsSnapshot,before.snapshots[0].componentsSnapshot);assert.deepEqual(x.snapshots[1].selectedVarietyDetails,before.snapshots[1].selectedVarietyDetails);assert.equal(await audits(),n+6);assert.deepEqual((await row('planning_audit','daily_snapshot:uat-full-d1:1')).after,x.snapshots[0]);assert.deepEqual(await readGroup(input),x)})
  await check('stale revision and old edit API fail closed',async()=>{const before=await readGroup(input),n=await audits();await deny(change(edit(input)),'GROUP_REVISION_CONFLICT');await deny(lifecycle.mutate(b.token,edit(input,1)),'FULL_GROUP_EDIT_PENDING');assert.deepEqual(await readGroup(input),before);assert.equal(await audits(),n)})
  await check('tampered snapshot material and missing sidecar deny read and edit',async()=>{const r=path('daily_plan_snapshots','uat-full-d2'),before=(await r.get()).data();await r.update({materials:[]});await deny(readGroup(input),'INVALID_DAILY_MATERIAL_TOTAL');await deny(change(edit(input,1)),'INVALID_DAILY_MATERIAL_TOTAL');await r.delete();await deny(readGroup(input),'MISSING_DAILY_SNAPSHOT');await r.set(before);assert.equal((await readGroup(input)).header.revision,1)})
  await check('invalid current resource or material rolls back all writes',async()=>{const before=await readGroup(input),n=await audits();await path('master_foremen','uat-f1').update({active:false});await deny(change(edit(input,1)),'INVALID_PLANNING_MASTER');await path('master_foremen','uat-f1').update({active:true});await path('master_materials',mat.id).update({active:false});await deny(change(edit(input,1)),'MATERIAL_UNIT_OR_STATUS');assert.deepEqual(await readGroup(input),before);await path('master_materials',mat.id).set(mat);assert.equal(await audits(),n)})
  await check('ADHOC edit preserves original varietal snapshot and empty recipe',async()=>{const g=clone('uat-adhoc',{sourceType:'ADHOC'});g.rows=g.rows.map(r=>({...r,monthlyPlanLineId:''}));const x=await fullGroup(g);await path('master_paddocks','uat-p1').update({variety:'Changed master'});const y=await change(edit(g,0,{manpower:8}));assert.deepEqual(y.snapshots[0].selectedVarietyDetails,x.snapshots[0].selectedVarietyDetails);assert.equal(y.snapshots[0].masterVariety,x.snapshots[0].masterVariety);assert.deepEqual(y.groupSnapshot.totalMaterials,[]);await path('master_paddocks','uat-p1').set(pad('uat-p1'))})
  await check('reorder increments header but not operational snapshot or DP revisions',async()=>{const g={workGroupId:'uat-adhoc'},x=await readGroup(input),y=await readGroup(g);await lifecycle.reorder(b.token,{date:input.date,groups:[{workGroupId:g.workGroupId,expectedRevision:y.header.revision},{workGroupId:input.workGroupId,expectedRevision:x.header.revision}]});const after=await readGroup(input);assert.equal(after.header.revision,2);assert.deepEqual(after.snapshots,x.snapshots);assert.deepEqual(after.groupSnapshot,x.groupSnapshot)})
  await check('QC uses edited canonical member revision after reorder',async()=>{await permissions(formOnly);const r=record('uat-editqc','uat-full-d1',{...d,shift:'2',foreman:'uat-f2',monthlyPlanLineId:'uat-full-m1'});await deny(save(job(r)),'DAILY_REVISION_CONFLICT');await save(job(r,null,1));assert.equal((await ap(r.id)).plannedDailyArea100,600);assert.equal((await readGroup(input)).header.revision,2)})
  await check('QC on one member blocks enriched edit and cancel',async()=>{const x=await readGroup(input),n=await audits();await deny(change(edit(input,2)),'GROUP_HAS_DEPENDENTS');await deny(lifecycle.mutate(b.token,{action:'cancel',workGroupId:input.workGroupId,expectedRevision:2}),'GROUP_HAS_DEPENDENTS');assert.deepEqual(await readGroup(input),x);assert.equal(await audits(),n)})
  await check('cancelled unused group retains historical snapshot and is readable',async()=>{const g=clone('uat-cancel');const x=await fullGroup(g);await lifecycle.mutate(b.token,{action:'cancel',workGroupId:g.workGroupId,expectedRevision:0});const y=await readGroup(g);assert.equal(y.header.status,'cancelled');assert.deepEqual(y.snapshots,x.snapshots);assert.deepEqual(y.groupSnapshot,x.groupSnapshot);await deny(change(edit(g,1)),'GROUP_CLOSED')})
  await check('snapshot audit collision rolls back canonical rows and all snapshots',async()=>{const g=clone('uat-audit');await fullGroup(g);const before=await readGroup(g),r=path('planning_audit','daily_snapshot:'+g.rows[1].dailyPlanId+':1');await r.set({testOnly:true,sentinel:true});await assert.rejects(change(edit(g)));assert.deepEqual(await readGroup(g),before);assert.deepEqual((await r.get()).data(),{testOnly:true,sentinel:true})})
  await check('manual Daily Edit grant and revoke on same token',async()=>{const g=clone('uat-grant');await fullGroup(g);await permissions({data_plan_daily:'edit'});await change(edit(g),t);await permissions({data_plan_daily:'none'});await deny(change(edit(g,1),t));await deny(readGroup(g,t));await permissions(formOnly)})
  await check('concurrent full edits have one winner and matching derived totals',async()=>{const g=clone('uat-race');await fullGroup(g);const n=await audits(),results=await Promise.allSettled([change(edit(g,0,{manpower:8})),change(edit(g,0,{manpower:9}))]);assert.equal(results.filter(x=>x.status==='fulfilled').length,1);assert.equal(await audits(),n+6);const x=await readGroup(g);assert.equal(x.header.revision,1);assert.equal(x.groupSnapshot.resources.manpower,x.header.manpower)})
  await check('concurrent edit versus QC cannot leave stale planned area',async()=>{const g=clone('uat-raceqc');await fullGroup(g);const r=record('uat-raceqc-record',g.rows[0].dailyPlanId,{...d,monthlyPlanLineId:'uat-full-m1'});const results=await Promise.allSettled([change(edit(g,0,{rows:g.rows.map(r=>({dailyPlanId:r.dailyPlanId,area100:r.area100+100}))})),save(job(r))]);assert.equal(results.filter(x=>x.status==='fulfilled').length,1);const x=await readGroup(g),q=await qrow(r.id);if(q){assert.equal(x.header.revision,0);assert.equal((await ap(r.id)).plannedDailyArea100,x.rows[0].area100)}else{assert.equal(x.header.revision,1);await absent(r.id)}})
  await check('direct client edits denied and root unchanged',async()=>{await assert.rejects(setDoc(doc(b.db,prefix+'/daily_plan_snapshots/uat-full-d1'),{testOnly:true}),e=>e.code==='permission-denied');assert.deepEqual((await adb.doc('monthly_plans/uat-m1').get()).data(),{syntheticSentinel:true})})
  console.log('SUCCESS: '+n+' Planning master snapshot read/edit integration checks passed (Firebase Auth + Firestore emulator)')
 }finally{
  for(const c of clients){await signOut(c.auth);await terminate(c.db);await deleteApp(c.app)}
  await adb.terminate();await adminDelete(admin)
 }
}
