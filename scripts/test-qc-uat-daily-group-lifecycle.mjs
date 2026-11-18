// Dedicated Firebase Auth + Firestore emulator, no production credentials or data.
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {createRequire} from 'node:module'
import {marker} from '../src/qcUatRolePermissions.mjs'
import {roleDefinition,assignIdentityRole,permissionsForIdentity} from '../src/qcUatCustomRoles.mjs'
import {projectId,host,firestorePort,authPort,guard,planningMode,createPlanningService,createPlanningWriteService,createPlanningQcService,createDailyGroupService,createPlanningCarryoverService,createDailyGroupLifecycleService} from '../server/qc-photo-access/uat-planning-role-service.mjs'
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
 const service=createPlanningService({adb,authAdmin}),writer=createPlanningWriteService({adb,authAdmin}),qc=createPlanningQcService({adb,authAdmin}),groups=createDailyGroupService({adb,authAdmin}),carry=createPlanningCarryoverService({adb,authAdmin}),lifecycle=createDailyGroupLifecycleService({adb,authAdmin})
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
  const editFields=(g,patch={})=>({shift:g.shift,foreman:g.foreman,manpower:g.manpower,unitName:g.unitName,unitReady:g.unitReady,unitStandby:g.unitStandby,unitBreakdown:g.unitBreakdown,notes:g.notes,rows:g.rows.map(r=>({dailyPlanId:r.dailyPlanId,area100:r.area100})),...patch})
  const edit=(g,expectedRevision=0,patch={})=>({action:'edit',workGroupId:g.workGroupId,expectedRevision,fields:editFields(g,patch)})
  const cancelGroup=(g,expectedRevision=0)=>({action:'cancel',workGroupId:g.workGroupId,expectedRevision})
  const change=(q,token=b.token)=>lifecycle.mutate(token,q)
  const readGroup=(g,token=b.token)=>lifecycle.read(token,g.workGroupId)
  const reorder=(gs,token=b.token)=>lifecycle.reorder(token,{date:group.date,groups:gs})
  const entry=(g,expectedRevision=0)=>({workGroupId:g.workGroupId,expectedRevision})
  const g2=fresh('uat-g2')
  await createGroup(group);await createGroup(g2)
  await check('Daily View reads full group but cannot edit cancel or reorder',async()=>{assert.equal((await readGroup(group,t)).header.totalArea100,1200);await deny(change(edit(group),t));await deny(change(cancelGroup(group),t));await deny(reorder([entry(group),entry(g2)],t));await deny(readGroup(group,v.token))})
  await check('edit updates all members and audits atomically',async()=>{const n=await audits(),q=edit(group,0,{shift:'2',foreman:'uat-f2',manpower:9,rows:group.rows.map(r=>({dailyPlanId:r.dailyPlanId,area100:r.area100+100}))});const x=await change(q);assert.equal(x.header.revision,1);assert.equal(x.header.totalArea100,1400);assert.equal(x.header.manpower,9);assert.ok(x.rows.every(r=>r.revision===1&&r.shift==='2'&&r.foreman==='uat-f2'));assert.equal(await audits(),n+3);assert.deepEqual((await row('planning_audit','group:uat-g1:1')).after,x.header);assert.deepEqual(await readGroup(group),x);for(const r of x.rows)assert.equal((await member(r.id)).workGroupId,group.workGroupId)})
  await check('stale edit and changed membership denied without writes',async()=>{const before=await readGroup(group),n=await audits();await deny(change(edit(group)),'GROUP_REVISION_CONFLICT');await deny(change(edit(group,1,{rows:[{dailyPlanId:group.rows[0].dailyPlanId,area100:600}]})),'GROUP_MEMBERSHIP_IMMUTABLE');assert.deepEqual(await readGroup(group),before);assert.equal(await audits(),n)})
  await check('missing membership and extra index row fail closed',async()=>{const id=g2.rows[1].dailyPlanId,r=path('daily_group_members',id),m=await member(id);await r.delete();await deny(readGroup(g2),'INVALID_GROUP_MEMBERS');await r.set(m);const extra=path('daily_group_members','uat-extra');await extra.set({testOnly:true,dailyPlanId:'uat-extra',workGroupId:g2.workGroupId});await deny(change(cancelGroup(g2)),'INVALID_GROUP_MEMBERS');await extra.delete()})
  await check('invalid master on one member aborts edit of whole group',async()=>{const p=path('master_paddocks','uat-p2'),before=await readGroup(g2),n=await audits();await p.update({active:false});await deny(change(edit(g2)),'INVALID_PLANNING_MASTER');await p.update({active:true});assert.deepEqual(await readGroup(g2),before);assert.equal(await audits(),n)})
  await check('reorder requires complete same-date set and current revisions',async()=>{await deny(reorder([entry(group,1)]),'REORDER_SCOPE_MISMATCH');await deny(reorder([entry(g2),entry(group,0)]),'GROUP_REVISION_CONFLICT')})
  await check('reorder changes headers only with contiguous ranks',async()=>{const before=await readGroup(group),before2=await readGroup(g2),n=await audits();const x=await reorder([entry(g2),entry(group,1)]);assert.deepEqual(x.map(h=>[h.workGroupId,h.planningOrder,h.revision]),[['uat-g2',1,1],['uat-g1',2,2]]);assert.deepEqual((await readGroup(group)).rows,before.rows);assert.deepEqual((await readGroup(g2)).rows,before2.rows);assert.equal(await audits(),n+2)})
  await check('QC commits edited member using member revision not header revision',async()=>{await permissions(formOnly);const r={...record('uat-gq1','uat-gd1',{...d,shift:'2',foreman:'uat-f2'}),actualArea100:650};await deny(save(job(r)),'DAILY_REVISION_CONFLICT');await save(job(r,null,1));assert.equal((await ap(r.id)).plannedDailyArea100,600);assert.equal((await ap(r.id)).dailyPlanId,'uat-gd1')})
  await check('QC on any member blocks entire edit and cancel',async()=>{const before=await readGroup(group),n=await audits();await deny(change(edit(group,2)),'GROUP_HAS_DEPENDENTS');await deny(change(cancelGroup(group,2)),'GROUP_HAS_DEPENDENTS');assert.deepEqual(await readGroup(group),before);assert.equal(await audits(),n)})
  await check('reorder linked group leaves QC and Actual unchanged',async()=>{const before=await readGroup(group),q=await qrow('uat-gq1'),a=await ap('uat-gq1');await reorder([entry(group,2),entry(g2,1)]);assert.deepEqual((await readGroup(group)).rows,before.rows);assert.deepEqual(await qrow('uat-gq1'),q);assert.deepEqual(await ap('uat-gq1'),a)})
  await check('manual Actual on second member blocks entire cancellation',async()=>{const r=path('daily_reports','uat-manual'),payload={testOnly:true,dailyPlanId:g2.rows[1].dailyPlanId,actualArea100:800};await r.set(payload);await deny(change(cancelGroup(g2,2)),'GROUP_HAS_DEPENDENTS');assert.deepEqual((await r.get()).data(),payload);await r.delete()})
  await check('soft cancel all unused members and retain membership',async()=>{const n=await audits(),out=await change(cancelGroup(g2,2));assert.equal(out.header.status,'cancelled');assert.equal(out.header.revision,3);assert.ok(out.rows.every(r=>r.status==='cancelled'&&r.revision===1));assert.equal(await audits(),n+3);for(const r of out.rows)assert.equal((await member(r.id)).workGroupId,g2.workGroupId);await deny(change(cancelGroup(g2,3)),'GROUP_CLOSED')})
  await check('cancelled member cannot commit QC or be edited individually',async()=>{const r=record('uat-cancelq',g2.rows[0].dailyPlanId,d);await deny(save(job(r,null,1)),'PLAN_CLOSED');await absent(r.id);await deny(mutate('daily',update(g2.rows[0].dailyPlanId,d,1)),'GROUP_MUTATION_REQUIRED')})
  await check('current manual Daily Edit grant and revoke apply without login',async()=>{const g=fresh('uat-g3');await createGroup(g);await permissions({data_plan_daily:'edit'});const x=await change(edit(g),t);assert.equal(x.header.updatedBy,uid);await permissions({data_plan_daily:'none'});await deny(change(cancelGroup(g,1),t));await deny(readGroup(g,t));await permissions(formOnly)})
  await check('audit collision rolls back header and every member',async()=>{const g=fresh('uat-g4');await createGroup(g);const before=await readGroup(g),collision=path('planning_audit','daily:'+g.rows[1].dailyPlanId+':1');await collision.set({testOnly:true,sentinel:true});await assert.rejects(change(edit(g)));assert.deepEqual(await readGroup(g),before);assert.deepEqual((await collision.get()).data(),{testOnly:true,sentinel:true})})
  await check('concurrent same revision edits have one winner',async()=>{const g=fresh('uat-g5');await createGroup(g);const n=await audits(),r=await Promise.allSettled([change(edit(g,0,{manpower:8})),change(edit(g,0,{manpower:9}))]);assert.equal(r.filter(x=>x.status==='fulfilled').length,1);assert.equal(await audits(),n+3);assert.equal((await readGroup(g)).header.revision,1)})
  await check('concurrent cancel versus QC on member cannot both succeed',async()=>{const g=fresh('uat-g6');await createGroup(g);const r=record('uat-raceq',g.rows[0].dailyPlanId,d);const results=await Promise.allSettled([change(cancelGroup(g)),save(job(r))]);assert.equal(results.filter(x=>x.status==='fulfilled').length,1);const x=await readGroup(g);if(x.header.status==='cancelled'){assert.ok(x.rows.every(r=>r.status==='cancelled'));await absent(r.id)}else{assert.equal((await ap(r.id)).dailyPlanId,g.rows[0].dailyPlanId);assert.ok(x.rows.every(r=>r.status==='open'))}})
  await check('direct client group edits denied and production root untouched',async()=>{await assert.rejects(setDoc(doc(b.db,prefix+'/daily_work_groups/uat-g1'),{testOnly:true}),e=>e.code==='permission-denied');assert.deepEqual((await adb.doc('monthly_plans/uat-m1').get()).data(),{syntheticSentinel:true})})
  console.log('SUCCESS: '+n+' Daily work group lifecycle integration checks passed (Firebase Auth + Firestore emulator)')
 }finally{
  for(const c of clients){await signOut(c.auth);await terminate(c.db);await deleteApp(c.app)}
  await adb.terminate();await adminDelete(admin)
 }
}
