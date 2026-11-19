// Dedicated Firebase Auth + Firestore emulator, no production credentials or data.
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {createRequire} from 'node:module'
import {planningSprayFixture} from './qc-uat-planning-spray-fixture.mjs'
import {planningFertilizerFixture,row as filling} from './qc-uat-planning-fertilizer-fixture.mjs'
import {marker} from '../src/qcUatRolePermissions.mjs'
import {roleDefinition,assignIdentityRole,permissionsForIdentity} from '../src/qcUatCustomRoles.mjs'
import {projectId,host,firestorePort,authPort,guard,planningMode,createPlanningService,createPlanningWriteService,createPlanningQcService,createDailyGroupService,createPlanningCarryoverService,createDailyGroupLifecycleService,createPlanningMasterSnapshotService,createPlanningMasterSnapshotLifecycleService,createPlanningQcSourceService,createPlanningSprayCommitService,createPlanningFertilizerCommitService,createPlanningActualSummaryService,createPlanningDashboardService,createPlanningManualActualService} from '../server/qc-photo-access/uat-planning-role-service.mjs'
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
 const service=createPlanningService({adb,authAdmin}),writer=createPlanningWriteService({adb,authAdmin}),qc=createPlanningQcService({adb,authAdmin}),groups=createDailyGroupService({adb,authAdmin}),carry=createPlanningCarryoverService({adb,authAdmin}),full=createPlanningMasterSnapshotService({adb,authAdmin}),lifecycle=createDailyGroupLifecycleService({adb,authAdmin}),enriched=createPlanningMasterSnapshotLifecycleService({adb,authAdmin}),qcSource=createPlanningQcSourceService({adb,authAdmin}),spray=createPlanningSprayCommitService({adb,authAdmin}),fertilizer=createPlanningFertilizerCommitService({adb,authAdmin}),report=createPlanningActualSummaryService({adb,authAdmin}),dashboard=createPlanningDashboardService({adb,authAdmin}),manualActual=createPlanningManualActualService({adb,authAdmin})
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
  for(const c of ['users','qc_uat_identities','monthly_plans',prefix+'/monthly_plans',prefix+'/daily_plans',prefix+'/role_catalog',prefix+'/planning_audit',prefix+'/master_paddocks',prefix+'/master_activities',prefix+'/qc_records',prefix+'/daily_reports',prefix+'/qc_operational_audit',prefix+'/daily_work_groups',prefix+'/daily_group_members',prefix+'/monthly_plan_snapshots',prefix+'/daily_plan_snapshots',prefix+'/daily_group_snapshots',prefix+'/master_companies',prefix+'/master_materials',prefix+'/master_foremen',prefix+'/master_shifts',prefix+'/master_units',prefix+'/qc_spray_full',prefix+'/qc_spray_full_audit',prefix+'/qc_fertilizer_full',prefix+'/qc_fertilizer_full_audit',prefix+'/master_fertilizer_products'])assert.equal((await adb.collection(c).limit(1).get()).size,0,'FRESH_FIRESTORE_REQUIRED')
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
  const req={dailyPlanId:'uat-full-d1',expectedDailyRevision:0,formType:'spray',date:d.date,shift:'1',foreman:'uat-f1'}
  const readSource=(q=req,token=t)=>qcSource.readSource(token,q)
  const fertActivity={...activity,id:'uat-a2',formType:'fertilizer',activity:'Fertilizer',description:'Top Dressing',components:[{materialId:'uat-nk',dosePerHa:450,unit:'kg'},{materialId:'uat-dap',dosePerHa:150,unit:'kg'}]}
  await path('master_activities',fertActivity.id).set(fertActivity)
  for(const [id,name] of [['uat-nk','NK'],['uat-dap','DAP']])await path('master_materials',id).set({testOnly:true,id,active:true,materialName:name,unit:'kg'})
  const products=[{testOnly:true,productId:'uat-brand-nk',name:'Synthetic NK',componentId:'uat-nk',material:'NK',active:true},{testOnly:true,productId:'uat-brand-dap',name:'Synthetic DAP',componentId:'uat-dap',material:'DAP',active:true}]
  for(const p of products)await path('master_fertilizer_products',p.productId).set(p)
  for(const [id,pid] of [['uat-fm1','uat-p1'],['uat-fm2','uat-p2']])await full.createMonthly(b.token,{id,fields:{...m,pid,activityId:'uat-a2'},selectedVarieties:['V1']})
  const fg=clone('uat-fg',{activityId:'uat-a2',formType:'fertilizer',rows:[{dailyPlanId:'uat-fg-d1',pid:'uat-p1',monthlyPlanLineId:'uat-fm1',area100:1000},{dailyPlanId:'uat-fg-d2',pid:'uat-p2',monthlyPlanLineId:'uat-fm2',area100:1000}]})
  await fullGroup(fg)
  const fq={...req,dailyPlanId:'uat-fg-d1',formType:'fertilizer'}
  const source=await readSource(fq,b.token)
  const make=(s,id,opts={})=>planningFertilizerFixture(s,{id:'qc-v2-'+id,uid,...opts})
  const submit=(r,baseRevision=null,token=t,foremanId='uat-f1',expectedDailyRevision=0)=>fertilizer.commit(token,{record:r,baseRevision,jobId:'uat-job-'+r.id.slice('qc-v2-uat-'.length)+'-'+r.clientRevision.slice(4),uploaderUid:uid,expectedDailyRevision,foremanId})
  const detail=id=>row('qc_fertilizer_full',id),fullAudit=(id,rev='uat-r1')=>row('qc_fertilizer_full_audit',id+':'+rev)
  const missing=async id=>{await absent(id);assert.equal(await detail(id),undefined);assert.equal(await fullAudit(id),undefined)}
  const r=make(source,'uat-fq'),fertOnly={...formOnly,qc_spraying:'none',qc_fertilizer:'edit'}
  const ssrc=await readSource(req,b.token)
  const sprayRow=(s,id,opts={})=>planningSprayFixture(s,{id:'qc-v2-'+id,uid,...opts})
  const spraySave=(r,baseRevision=null,foremanId='uat-f1')=>spray.commit(t,{record:r,baseRevision,jobId:'uat-job-'+r.id.slice('qc-v2-uat-'.length)+'-'+r.clientRevision.slice(4),uploaderUid:uid,expectedDailyRevision:0,foremanId})
  const readDailySummary=(id,token=t)=>report.readSummary(token,{scope:'daily',id}),readMonthlySummary=(id,token=t)=>report.readSummary(token,{scope:'monthly',id}),readActualList=(id,token=t)=>report.readActuals(token,id)
  const bothForms={...formOnly,qc_fertilizer:'edit'}
  const noReport={...bothForms,data_plan_summary:'none',data_plan_actual:'none'}
  const reportOnly={data_plan_daily:'none',data_plan_monthly:'none',qc_spraying:'none',qc_fertilizer:'none',data_plan_summary:'view',data_plan_actual:'view'}
  const dash=(week='ALL',monthKey='2026-11',token=t)=>dashboard.readPeriod(token,{monthKey,week})
  const summaryOnly={...reportOnly,data_plan_actual:'none',qc_dashboard:'none'}
  await check('Summary View independent from QC Dashboard and Actual permissions',async()=>{await permissions({...noReport,qc_dashboard:'view'});await deny(dash());await permissions({...reportOnly,data_plan_summary:'none'});await deny(dash());await permissions(summaryOnly);await deny(readActualList(req.dailyPlanId));assert.equal((await dash('ALL','2026-12')).monthly.spray.targetArea100,0)})
  await check('narrow legacy in selected period fails closed, not silently skipped',async()=>{await deny(dash(),'ENRICHED_SOURCE_REQUIRED');for(const [c,id] of [['daily_plans','uat-d2'],['daily_plans','uat-fert'],['monthly_plans','uat-m2'],['monthly_plans','uat-m3']])await path(c,id).delete()})
  await check('monthly and daily targets independent; no invented fertilizer scalar',async()=>{const x=await dash();assert.equal(x.monthly.spray.targetArea100,2000);assert.equal(x.daily.spray.targetArea100,1200);assert.equal(x.monthly.fertilizer.applicationTargetArea100,4000);assert.equal(x.daily.fertilizer.applicationTargetArea100,4000);assert.ok(!Object.hasOwn(x.daily.fertilizer,'actualArea100'));assert.equal(x.monthly.spray.progressPct,0);assert.deepEqual(x.executionByForemanShift,[])})
  await check('carryover and fertilizer component execution aggregated without mixing',async()=>{await permissions(noReport);await spraySave(sprayRow(ssrc,'uat-dash-s1',{area:4}));const cs=await readSource({...req,shift:'2',foreman:'uat-f2'});const sr=sprayRow(cs,'uat-dash-s2',{area:3});sr.actUsagePesticide1='';await spraySave(sr,null,'uat-f2');await submit(r);await submit(make(source,'uat-dash-draft',{saveType:'draft'}));await permissions(summaryOnly);const x=await dash();assert.equal(x.monthly.spray.actualArea100,700);assert.equal(x.daily.spray.progressPct,700/1200*100);assert.deepEqual(x.daily.spray.actualByShift100,{'1':400,'2':300});assert.equal(x.daily.fertilizer.applicationArea100,1300);assert.equal(x.daily.fertilizer.completedPlanCount,0);assert.equal(x.daily.fertilizer.draftCount,1);assert.equal(x.daily.spray.materials[0].actualMaterial1000000,null);assert.equal(x.executionByForemanShift.find(a=>a.foreman==='uat-f2'&&a.kind==='spray').actualArea100,300);assert.ok(!Object.hasOwn(x,'actuals'))})
  await check('manual Actual contributes once and cancelled manual excluded',async()=>{await permissions({...reportOnly,data_plan_actual:'edit'});const q={action:'create',dailyPlanId:'uat-full-d2',expectedDailyRevision:0,expectedRevision:null,reason:'Field report',execution:{actualArea100:600,measured:[{materialId:'uat-mat',actualMaterial1000000:null}]}};await manualActual.mutate(t,q);assert.equal((await dash()).daily.spray.actualArea100,1300);await manualActual.mutate(t,{action:'cancel',dailyPlanId:q.dailyPlanId,expectedDailyRevision:0,expectedRevision:0,reason:'Cancel field report'});assert.equal((await dash()).daily.spray.actualArea100,700)})
  await check('MP assigned week changes while actual date stays original',async()=>{await mutate('monthly',update('uat-full-m1',{...m,week:'W2',targetArea100:2000}));const x=await dash('W1'),y=await dash('W2');assert.equal(x.monthly.spray.actualArea100,0);assert.equal(x.daily.spray.actualArea100,700);assert.equal(y.monthly.spray.actualArea100,700);assert.equal(y.monthly.spray.targetArea100,2000);assert.equal(y.daily.spray.actualArea100,0);assert.equal(y.outOfPeriodDailyCount,1)})
  await check('orphan date-scoped Actual cannot disappear from dashboard',async()=>{const p=path('daily_reports','uat-dash-orphan');await p.set({testOnly:true,date:d.date,dailyPlanId:'uat-no-source',monthlyPlanLineId:''});await deny(dash(),'ACTUAL_RECONCILIATION_REQUIRED');await p.delete();assert.equal((await dash()).daily.spray.actualArea100,700)})
  await check('duplicate current Actual blocks whole dashboard',async()=>{const p=path('daily_reports','uat-dash-copy');await p.set(await ap('uat-dash-s1'));await deny(dash(),'ACTUAL_RECONCILIATION_REQUIRED');await p.delete();assert.equal((await dash()).daily.spray.actualArea100,700)})
  await check('period bounds reject instead of truncating results',async()=>{const col=adb.collection(prefix+'/daily_plans');const batch=adb.batch();for(let i=0;i<31;i++)batch.set(col.doc('uat-limit-'+i),{testOnly:true,date:'2026-12-01'});await batch.commit();await deny(dash('ALL','2026-12'),'DASHBOARD_SCOPE_LIMIT');const cleanup=adb.batch();for(let i=0;i<31;i++)cleanup.delete(col.doc('uat-limit-'+i));await cleanup.commit()})
  await check('same token permission revoke and root sentinel unchanged',async()=>{await permissions({data_plan_summary:'none'});await deny(dash());await permissions(summaryOnly);assert.equal((await dash()).readOnly,true);assert.deepEqual(Object.keys(dashboard),['readPeriod']);assert.deepEqual((await adb.doc('monthly_plans/uat-m1').get()).data(),{syntheticSentinel:true})})
  console.log('SUCCESS: '+n+' Planning Dashboard integration checks passed (Firebase Auth + Firestore emulator, read-only)')
 }finally{
  for(const c of clients){await signOut(c.auth);await terminate(c.db);await deleteApp(c.app)}
  await adb.terminate();await adminDelete(admin)
 }
}
