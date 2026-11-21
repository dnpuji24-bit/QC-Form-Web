// 11D.5b — One Firebase Auth token, one Firestore emulator and two real HTTP services.
// Explicitly isolated demo only. NO production identity, external photos, or Supabase.
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {createRequire} from 'node:module'
import {marker} from '../src/qcUatRolePermissions.mjs'
import {projectId as ownerDefault,guard as ownerGuard,createOwnerService,createOwnerHttp,origin as ownerOrigin,paths as ownerPaths} from '../server/qc-photo-access/uat-owner-permission-http.mjs'
import {projectId as planningDefault,guard as planningGuard} from '../server/qc-photo-access/uat-planning-role-service.mjs'
import {unifiedProjectId,unifiedHost,unifiedFirestorePort,unifiedAuthPort,unifiedGuard} from '../server/qc-photo-access/uat-unified-identity-guard.mjs'
import {createUnifiedPlanningHttp,unifiedPlanningOrigin,unifiedPaths} from '../server/qc-photo-access/uat-unified-planning-http.mjs'
const e={QC_UAT_MODE:'unified-lab',GCLOUD_PROJECT:unifiedProjectId,FIRESTORE_EMULATOR_HOST:unifiedHost+':'+unifiedFirestorePort,FIREBASE_AUTH_EMULATOR_HOST:unifiedHost+':'+unifiedAuthPort}
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8')
assert.equal(ownerGuard(e),unifiedProjectId)
assert.equal(planningGuard(e),unifiedProjectId)
assert.equal(unifiedGuard(e),unifiedProjectId)
assert.notEqual(ownerDefault,unifiedProjectId)
assert.notEqual(planningDefault,unifiedProjectId)
const oldOwner={GCLOUD_PROJECT:ownerDefault,FIRESTORE_EMULATOR_HOST:'127.0.0.1:9485',FIREBASE_AUTH_EMULATOR_HOST:'127.0.0.1:10299'}
const oldPlanning={GCLOUD_PROJECT:planningDefault,FIRESTORE_EMULATOR_HOST:'127.0.0.1:9085',FIREBASE_AUTH_EMULATOR_HOST:'127.0.0.1:9899'}
assert.equal(ownerGuard(oldOwner),ownerDefault)
assert.equal(planningGuard(oldPlanning),planningDefault)
for(const bad of [
 {},{...e,QC_UAT_MODE:'production'},{...e,GCLOUD_PROJECT:'form-qc-unm'},
 {...e,FIRESTORE_EMULATOR_HOST:'127.0.0.1:9485'},
 {...e,FIREBASE_AUTH_EMULATOR_HOST:'127.0.0.1:9899'},
 {...e,GOOGLE_CLOUD_PROJECT:'form-qc-unm'},
 {...e,FIREBASE_PROJECT_ID:'demo-qc-uat-owner-http'}
]){assert.throws(()=>ownerGuard(bad));assert.throws(()=>planningGuard(bad))}
const cfg=JSON.parse(read('firebase.uat-unified-role-planning-emulator.json'))
assert.equal(cfg.firestore.rules,'scripts/firestore.uat-planning-role-demo.rules')
assert.deepEqual(cfg.emulators.firestore,{host:unifiedHost,port:unifiedFirestorePort})
assert.deepEqual(cfg.emulators.auth,{host:unifiedHost,port:unifiedAuthPort})
for(const p of ['src/App.tsx','src/main.tsx','src/NativeUsersAccess.tsx','server/qc-photo-access/index.mjs','server/qc-photo-access/nativeAdminHttp.mjs'])assert.doesNotMatch(read(p),/uat-unified-planning-http|uat-unified-identity-guard|test-qc-uat-unified-role-planning/)
assert.doesNotMatch(read('server/qc-photo-access/uat-unified-planning-http.mjs'),/Access-Control-Allow-Origin|@supabase|firebase\/firestore|form-qc-unm/)
assert.ok(process.argv.length===3&&['--self-test','--emulator'].includes(process.argv[2]))
console.log('SUCCESS: Unified single-demo project, strict dual-service isolation, old defaults and production source guards passed (offline)')

if(process.argv[2]==='--emulator'){
 assert.equal(process.env.QC_UAT_MODE,'unified-lab')
 ownerGuard();planningGuard();unifiedGuard()
 const require=createRequire(new URL('../server/qc-photo-access/package.json',import.meta.url))
 const {initializeApp:adminInit,deleteApp:adminDelete}=require('firebase-admin/app')
 const {getAuth}=require('firebase-admin/auth'),{getFirestore}=require('firebase-admin/firestore')
 const {initializeApp:clientInit,deleteApp:clientDelete}=await import('firebase/app')
 const {initializeAuth,inMemoryPersistence,connectAuthEmulator,signInWithEmailAndPassword,signOut}=await import('firebase/auth')
 const {initializeFirestore,connectFirestoreEmulator,doc,getDocFromServer,setDoc,terminate}=await import('firebase/firestore')
 const admin=adminInit({projectId:unifiedProjectId},'uat-unified-owner-planning'),adb=getFirestore(admin),authAdmin=getAuth(admin)
 const ownerServer=createOwnerHttp(createOwnerService({adb,authAdmin}))
 const planningServer=createUnifiedPlanningHttp({adb,authAdmin})
 const clients=[],prefix='qc_uat_workspaces/cutover'
 const path=(collection,id)=>adb.doc(prefix+'/'+collection+'/'+id),mark=uid=>adb.doc('qc_uat_identities/'+uid)
 const get=(c,id)=>path(c,id).get().then(x=>x.data())
 let n=0
 const check=async(label,fn)=>{try{await fn()}catch(cause){throw Error('FAIL: '+label,{cause})}n++;console.log('PASS: '+label)}
 async function start(server,port){await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,unifiedHost,resolve)})}
 const users=['uat-owner','uat-field','uat-viewer','uat-applicant']
 const email=uid=>uid+'@unified.example.test',pw=uid=>'Synthetic-2026-'+uid
 async function client(uid){
  const app=clientInit({projectId:unifiedProjectId,apiKey:'demo-only-not-a-real-key'},'unified-'+uid)
  const auth=initializeAuth(app,{persistence:inMemoryPersistence})
  connectAuthEmulator(auth,'http://'+unifiedHost+':'+unifiedAuthPort,{disableWarnings:true})
  const db=initializeFirestore(app,{})
  connectFirestoreEmulator(db,unifiedHost,unifiedFirestorePort)
  clients.push({app,auth,db})
  await signInWithEmailAndPassword(auth,email(uid),pw(uid))
  return {auth,db}
 }
 const token=c=>c.auth.currentUser.getIdToken()
 async function post(origin,path,raw,input={}){
  const response=await fetch(origin+path,{
   method:'POST',
   headers:{'Content-Type':'application/json',...(raw?{Authorization:'Bearer '+raw}:{})},
   body:JSON.stringify(input)
  })
  assert.equal(response.headers.get('cache-control'),'no-store')
  return {status:response.status,data:await response.json()}
 }
 const own=(raw,p,input)=>post(ownerOrigin,p,raw,input)
 const plan=(raw,p,input)=>post(unifiedPlanningOrigin,p,raw,input)
 const monthly={pid:'uat-p1',activityId:'uat-a1',monthKey:'2026-11',week:'W1',targetArea100:900}
 const daily={pid:'uat-p1',activityId:'uat-a1',sourceType:'MONTHLY',monthlyPlanLineId:'uat-m1',date:'2026-11-03',shift:'1',foreman:'uat-f1',formType:'spray',area100:1000}
 const fertilizerDaily={...daily,activityId:'uat-a2',sourceType:'ADHOC',monthlyPlanLineId:'',formType:'fertilizer',area100:800}
 const create=(id,fields)=>({action:'create',id,expectedRevision:null,fields})
 const q=(id,source,formType='spray')=>{
  const record={testOnly:true,id,ownerUid:'uat-field',inputtedBy:'uat-field',formType,clientRevision:'uat-r1',saveType:'ready',dailyPlanId:source,monthlyPlanLineId:formType==='spray'?'uat-m1':'',pid:'uat-p1',date:'2026-11-03',shift:'1',foreman:'uat-f1',actualArea100:1200,sessionId:'uat-session'}
  return {record,baseRevision:null,jobId:'uat-job-'+id.slice(4)+'-r1',uploaderUid:'uat-field',expectedDailyRevision:0}
 }
 try{
  assert.equal((await authAdmin.listUsers(1)).users.length,0,'FRESH_AUTH_REQUIRED')
  for(const collection of ['qc_uat_identities','users','monthly_plans','daily_plans',prefix+'/role_catalog',prefix+'/role_tombstones',prefix+'/monthly_plans',prefix+'/daily_plans',prefix+'/qc_records',prefix+'/daily_reports',prefix+'/planning_audit'])assert.equal((await adb.collection(collection).limit(1).get()).size,0,'FRESH_FIRESTORE_REQUIRED')
  for(const uid of users){
   await authAdmin.createUser({uid,email:email(uid),password:pw(uid),emailVerified:true})
   await authAdmin.setCustomUserClaims(uid,{qcUat:true})
  }
  for(const uid of users.filter(u=>u!=='uat-applicant')){
   await mark(uid).set({...marker(uid==='uat-owner'?'owner':'pengunjung'),policyRevision:0,roleOverrides:{},manualOverrides:{}})
  }
  await path('master_paddocks','uat-p1').set({testOnly:true,pid:'uat-p1',active:true})
  await path('master_activities','uat-a1').set({testOnly:true,id:'uat-a1',active:true,formType:'spray'})
  await path('master_activities','uat-a2').set({testOnly:true,id:'uat-a2',active:true,formType:'fertilizer'})
  await adb.doc('users/root-sentinel').set({protected:true})
  await adb.doc('daily_plans/root-sentinel').set({protected:true})
  await start(ownerServer,4497);await start(planningServer,4697)
  const owner=await client('uat-owner'),field=await client('uat-field'),viewer=await client('uat-viewer'),applicant=await client('uat-applicant')
  const ot=await token(owner),ft=await token(field),vt=await token(viewer),rt=await token(applicant)
  const roleId='custom-field-operations'
  let role
  const updates=async(revision,permissions,memberRevision)=>own(ot,ownerPaths.rolesUpdate,{roleId,expectedRevision:revision,permissions,expectedMembers:[{uid:'uat-field',policyRevision:memberRevision}]})
  await check('same Firebase token authenticates Owner and Planning endpoints; unauthenticated requests are denied',async()=>{
   assert.equal((await own('',ownerPaths.rolesList,{})).status,401)
   assert.equal((await plan('',unifiedPaths.check,{scope:'monthly',operation:'view'})).status,401)
   assert.equal((await plan(ft,unifiedPaths.check,{scope:'daily',operation:'view'})).status,403)
   assert.equal((await own(ft,ownerPaths.rolesList,{})).status,403)
  })
  await check('Owner creates a role with explicit independent Monthly, Daily, QC, Actual and Summary grants',async()=>{
   const r=await own(ot,ownerPaths.rolesCreate,{name:'Field Operations',permissions:{data_plan_monthly:'edit',data_plan_daily:'edit',data_plan_summary:'view',qc_spraying:'none'}})
   assert.equal(r.status,200)
   role=r.data.role;assert.equal(role.id,roleId);assert.equal(role.revision,0)
   assert.equal(role.permissions.data_plan_actual,'none')
   assert.equal(role.permissions.qc_fertilizer,'none')
  })
  await check('Owner assigns custom role while preserving one unchanged Firebase Auth token',async()=>{
   const r=await own(ot,ownerPaths.rolesAssign,{targetUid:'uat-field',expectedRevision:0,roleId})
   assert.equal(r.status,200)
   assert.equal((await plan(ft,unifiedPaths.check,{scope:'monthly',operation:'edit'})).data.capability.mode,'edit')
   assert.equal((await plan(ft,unifiedPaths.check,{scope:'daily',operation:'edit'})).data.capability.mode,'edit')
   assert.equal((await own(ft,ownerPaths.session,{})).data.session.policyRevision,1)
  })
  await check('same token creates a Monthly Plan with immutable audit through real Planning HTTP',async()=>{
   const r=await plan(ft,unifiedPaths.mutate,{scope:'monthly',request:create('uat-m1',monthly)})
   assert.equal(r.status,200);assert.equal(r.data.plan.revision,0)
   assert.equal((await get('planning_audit','monthly:uat-m1:0')).actorUid,'uat-field')
   assert.equal((await plan(ft,unifiedPaths.read,{scope:'monthly',id:'uat-m1'})).data.plan.area100,900)
  })
  await check('same token creates linked Daily Plan through real Planning HTTP with exact PID and source',async()=>{
   const r=await plan(ft,unifiedPaths.mutate,{scope:'daily',request:create('uat-d1',daily)})
   assert.equal(r.status,200);assert.equal(r.data.plan.monthlyPlanLineId,'uat-m1')
   assert.equal((await get('planning_audit','daily:uat-d1:0')).actorUid,'uat-field')
   assert.equal((await plan(ft,unifiedPaths.read,{scope:'daily',id:'uat-d1'})).data.plan.area100,1000)
  })
  await check('QC Spray form not granted, so no QC Actual or audit written',async()=>{
   const r=await plan(ft,unifiedPaths.qcCommit,{request:q('uat-q1','uat-d1')})
   assert.equal(r.status,403)
   assert.equal(await get('qc_records','uat-q1'),undefined)
   assert.equal(await get('daily_reports','qcactual_uat-q1'),undefined)
  })
  let rev1
  await check('Owner edits role atomically and Planning sees updated catalog immediately on same token',async()=>{
   const desired={...role.permissions,data_plan_monthly:'view',data_plan_daily:'view',data_plan_actual:'view',data_plan_summary:'view',qc_spraying:'edit'}
   const r=await updates(0,desired,1)
   assert.equal(r.status,200);rev1=r.data.update.definition
   assert.equal(rev1.revision,1);assert.equal(r.data.update.affectedCount,1)
   assert.equal((await get('permission_audit','uat-field:2')).action,'edit_role')
   assert.equal((await get('role_catalog_audit',roleId+':1')).action,'edit_role')
   assert.equal((await own(ft,ownerPaths.session,{})).data.session.policyRevision,2)
   assert.equal((await plan(ft,unifiedPaths.check,{scope:'actual',operation:'view'})).status,200)
  })
  await check('Monthly and Daily edit revoked without relogin; read remains permitted',async()=>{
   assert.equal((await plan(ft,unifiedPaths.mutate,{scope:'monthly',request:create('uat-m2',monthly)})).status,403)
   assert.equal((await plan(ft,unifiedPaths.mutate,{scope:'daily',request:create('uat-d2',fertilizerDaily)})).status,403)
   assert.equal((await plan(ft,unifiedPaths.read,{scope:'monthly',id:'uat-m1'})).status,200)
   assert.equal((await plan(ft,unifiedPaths.read,{scope:'daily',id:'uat-d1'})).status,200)
   assert.equal(await get('monthly_plans','uat-m2'),undefined)
  })
  await check('granted QC Spray commits ready QC, Actual and audit atomically with same token',async()=>{
   const r=await plan(ft,unifiedPaths.qcCommit,{request:q('uat-q1','uat-d1')})
   assert.equal(r.status,200);assert.equal(r.data.qc.id,'uat-q1')
   assert.equal(r.data.qc.plannedDailyArea100,1000)
   const actual=await get('daily_reports','qcactual_uat-q1')
   assert.equal(actual.actualArea100,1200)
   assert.equal(actual.dailyPlanId,'uat-d1')
   assert.equal(actual.monthlyPlanLineId,'uat-m1')
   assert.equal((await get('qc_operational_audit','uat-q1:uat-r1')).actorUid,'uat-field')
  })
  await check('QC retry does not duplicate Actual or audit and source Daily edit stays blocked',async()=>{
   const r=await plan(ft,unifiedPaths.qcCommit,{request:q('uat-q1','uat-d1')})
   assert.equal(r.status,200)
   assert.equal((await adb.collection(prefix+'/daily_reports').get()).size,1)
   assert.equal((await adb.collection(prefix+'/qc_operational_audit').get()).size,1)
   assert.equal((await plan(ft,unifiedPaths.mutate,{scope:'daily',request:{action:'cancel',id:'uat-d1',expectedRevision:0}})).status,403)
  })
  await check('Owner manual override grants Daily edit without granting unrelated QC rights',async()=>{
   const r=await own(ot,ownerPaths.patch,{targetUid:'uat-field',expectedRevision:2,patch:{data_plan_daily:'edit'}})
   assert.equal(r.status,200)
   assert.equal((await plan(ft,unifiedPaths.check,{scope:'daily',operation:'edit'})).status,200)
   assert.equal((await own(ft,ownerPaths.session,{})).data.session.policyRevision,3)
   assert.equal((await plan(ft,unifiedPaths.check,{scope:'monthly',operation:'edit'})).status,403)
  })
  await check('Daily Fertilizer ADHOC source created with explicit Daily override',async()=>{
   const r=await plan(ft,unifiedPaths.mutate,{scope:'daily',request:create('uat-df',fertilizerDaily)})
   assert.equal(r.status,200)
   assert.equal(r.data.plan.monthlyPlanLineId,'')
   assert.equal(r.data.plan.formType,'fertilizer')
  })
  await check('another Owner role edit switches QC Spray off and Fertilizer on, preserving manual override',async()=>{
   const desired={...rev1.permissions,qc_spraying:'none',qc_fertilizer:'edit'}
   const r=await updates(1,desired,3)
   assert.equal(r.status,200);assert.equal(r.data.update.definition.revision,2)
   assert.equal((await own(ft,ownerPaths.session,{})).data.session.policyRevision,4)
   assert.equal((await plan(ft,unifiedPaths.check,{scope:'daily',operation:'edit'})).status,200)
   assert.equal((await plan(ft,unifiedPaths.qcCommit,{request:q('uat-q1','uat-d1')})).status,403)
   assert.equal((await get('daily_reports','qcactual_uat-q1')).actualArea100,1200)
  })
  await check('same token commits Fertilizer ADHOC QC and Actual after the role edit',async()=>{
   const r=await plan(ft,unifiedPaths.qcCommit,{request:q('uat-qf','uat-df','fertilizer')})
   assert.equal(r.status,200)
   assert.equal(r.data.qc.monthlyPlanLineId,'')
   const actual=await get('daily_reports','qcactual_uat-qf')
   assert.equal(actual.qcFormType,'fertilizer')
   assert.equal(actual.actualArea100,1200)
   assert.equal(actual.monthlyPlanLineId,'')
  })
  await check('Owner explicit none removes Daily read/edit without revoking Fertilizer',async()=>{
   const r=await own(ot,ownerPaths.patch,{targetUid:'uat-field',expectedRevision:4,patch:{data_plan_daily:'none'}})
   assert.equal(r.status,200)
   assert.equal((await plan(ft,unifiedPaths.read,{scope:'daily',id:'uat-df'})).status,403)
   assert.equal((await plan(ft,unifiedPaths.mutate,{scope:'daily',request:create('uat-d3',fertilizerDaily)})).status,403)
   assert.equal((await plan(ft,unifiedPaths.qcCommit,{request:q('uat-qf','uat-df','fertilizer')})).status,200)
  })
  await check('outsider and applicant cannot read unrelated Plans, QC or Owner role data',async()=>{
   assert.equal((await plan(vt,unifiedPaths.read,{scope:'monthly',id:'uat-m1'})).status,403)
   assert.equal((await plan(vt,unifiedPaths.qcCommit,{request:q('uat-qf','uat-df','fertilizer')})).status,403)
   assert.equal((await own(vt,ownerPaths.rolesPreview,{roleId})).status,403)
   assert.equal((await plan(rt,unifiedPaths.read,{scope:'monthly',id:'uat-m1'})).status,403)
   assert.equal((await own(rt,ownerPaths.rolesList,{})).status,403)
  })
  await check('pending applicant blocks role edit while keeping QC and Planning records unchanged',async()=>{
   assert.equal((await own(rt,ownerPaths.registrationSubmit,{requestedRoleId:roleId})).status,200)
   const latest=(await get('role_catalog',roleId)).definition
   const r=await updates(2,{...latest.permissions,data_plan_summary:'none'},5)
   assert.equal(r.status,409)
   assert.equal((await get('role_catalog',roleId)).definition.revision,2)
   assert.equal((await own(ot,ownerPaths.registrationReview,{targetUid:'uat-applicant',expectedRevision:0,decision:'reject',approvedRoleId:null})).status,200)
   assert.equal((await get('daily_reports','qcactual_uat-qf')).actualArea100,1200)
  })
  await check('Owner cannot delete assigned role; audited reassignment revokes both domains on old token',async()=>{
   assert.equal((await own(ot,ownerPaths.rolesDelete,{roleId,expectedRevision:2,expectedMembers:[]})).status,409)
   const r=await own(ot,ownerPaths.rolesAssign,{targetUid:'uat-field',expectedRevision:5,roleId:'pengunjung'})
   assert.equal(r.status,200)
   assert.equal((await plan(ft,unifiedPaths.read,{scope:'monthly',id:'uat-m1'})).status,403)
   assert.equal((await plan(ft,unifiedPaths.qcCommit,{request:q('uat-qf','uat-df','fertilizer')})).status,403)
   assert.equal((await own(ft,ownerPaths.session,{})).data.session.role,'pengunjung')
  })
  await check('Owner archives unused role with tombstone and its ID cannot be reused',async()=>{
   assert.equal((await own(ot,ownerPaths.rolesDelete,{roleId,expectedRevision:2,expectedMembers:[]})).status,200)
   assert.equal(await get('role_catalog',roleId),undefined)
   assert.equal((await get('role_tombstones',roleId)).lastRevision,2)
   assert.equal((await own(ot,ownerPaths.rolesCreate,{name:'Field Operations',permissions:{}})).status,409)
  })
  await check('direct Firestore client reads and writes denied across all three domains; roots unchanged',async()=>{
   for(const collection of ['role_catalog','monthly_plans','daily_plans','qc_records','daily_reports','role_tombstones']){
    const ref=doc(field.db,prefix+'/'+collection+'/uat-browser')
    await assert.rejects(getDocFromServer(ref),{code:'permission-denied'})
    await assert.rejects(setDoc(ref,{testOnly:true}),{code:'permission-denied'})
   }
   assert.deepEqual((await adb.doc('users/root-sentinel').get()).data(),{protected:true})
   assert.deepEqual((await adb.doc('daily_plans/root-sentinel').get()).data(),{protected:true})
  })
  await check('Owner revocation denies same-token role HTTP, and services do not expose public CORS',async()=>{
   await mark('uat-owner').update({enabled:false})
   assert.equal((await own(ot,ownerPaths.rolesList,{})).status,403)
   assert.equal((await plan(ot,unifiedPaths.check,{scope:'monthly',operation:'view'})).status,403)
   assert.equal((await fetch(unifiedPlanningOrigin+'/',{method:'OPTIONS'})).headers.get('access-control-allow-origin'),null)
  })
  console.log('SUCCESS: '+n+' unified Owner HTTP → Planning HTTP → QC/Actual checks passed (same Auth token and Firestore emulator)')
 }finally{
  for(const srv of [planningServer,ownerServer])if(srv.listening)await new Promise(resolve=>srv.close(resolve))
  for(const c of clients){await signOut(c.auth);await terminate(c.db);await clientDelete(c.app)}
  await adb.terminate();await adminDelete(admin)
 }
}
