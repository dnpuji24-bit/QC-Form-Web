// Dedicated Firebase Auth + Firestore emulator, no production credentials or data.
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {createRequire} from 'node:module'
import {marker} from '../src/qcUatRolePermissions.mjs'
import {roleDefinition,assignIdentityRole,permissionsForIdentity} from '../src/qcUatCustomRoles.mjs'
import {projectId,host,firestorePort,authPort,guard,planningMode,createPlanningService} from '../server/qc-photo-access/uat-planning-role-service.mjs'
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
 const service=createPlanningService({adb,authAdmin})
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
  for(const c of ['users','qc_uat_identities','monthly_plans',prefix+'/monthly_plans',prefix+'/daily_plans',prefix+'/role_catalog'])assert.equal((await adb.collection(c).limit(1).get()).size,0,'FRESH_FIRESTORE_REQUIRED')
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
  await check('custom Monthly Edit allows view and edit capability',async()=>{assert.deepEqual(await service.check(t,'monthly','edit'),{scope:'monthly',operation:'edit',mode:'edit'});assert.deepEqual(await service.readPlan(t,'monthly','uat-m1'),{id:'uat-m1',pid:'uat-p1',area100:1200})})
  await check('custom Daily View reads but cannot edit',async()=>{assert.deepEqual(await service.readPlan(t,'daily','uat-d1'),{id:'uat-d1',pid:'uat-p1',area100:500});await deny(service.check(t,'daily','edit'))})
  await check('summary permission separate from Actual',async()=>{assert.equal((await service.check(t,'summary','view')).mode,'view');await deny(service.check(t,'actual','view'));await deny(service.check(t,'summary','edit'))})
  await check('no implicit QC or import privileges through Planning API',async()=>{await deny(service.check(t,'qc_spraying','edit'),'INVALID_PLANNING_OPERATION');await deny(service.check(t,'monthly_import','edit'),'INVALID_PLANNING_OPERATION')})
  await check('built-in Assistant retains explicit Planning modes',async()=>{for(const scope of ['monthly','daily','actual'])assert.equal((await service.check(b.token,scope,'edit')).mode,'edit')})
  await check('visitor cannot read Monthly or Daily',async()=>{await deny(service.readPlan(v.token,'monthly','uat-m1'));await deny(service.readPlan(v.token,'daily','uat-d1'))})
  await check('manual none revokes existing token immediately',async()=>{await mark('uat-planner').set(manual(custom,{data_plan_monthly:'none'}));await deny(service.readPlan(t,'monthly','uat-m1'));assert.equal((await service.readPlan(t,'daily','uat-d1')).area100,500)})
  await check('manual edit grants Daily with unchanged token',async()=>{await mark('uat-planner').set(manual(custom,{data_plan_daily:'edit'}));assert.equal((await service.check(t,'daily','edit')).mode,'edit')})
  await check('restored permissions work on same token',async()=>{await mark('uat-planner').set({...custom,policyRevision:custom.policyRevision+2});assert.equal((await service.readPlan(t,'monthly','uat-m1')).area100,1200);await deny(service.check(t,'daily','edit'))})
  await check('missing catalog and forged catalog fail closed',async()=>{await cat.delete();await deny(service.readPlan(t,'monthly','uat-m1'),'UAT_IDENTITY_DENIED');await cat.set({...catalog,workspace:'other'});await deny(service.readPlan(t,'monthly','uat-m1'),'UAT_IDENTITY_DENIED');await cat.set(catalog)})
  await check('forged materialized permission and invalid revision fail closed',async()=>{await mark('uat-planner').set({...custom,permissions:{...custom.permissions,data_plan_actual:'edit'}});await deny(service.check(t,'actual','edit'),'UAT_IDENTITY_DENIED');await mark('uat-planner').set({...custom,policyRevision:-1});await deny(service.readPlan(t,'monthly','uat-m1'),'UAT_IDENTITY_DENIED');await mark('uat-planner').set(custom)})
  await check('built-in forged permission map is rejected',async()=>{const m=base('pengunjung');await mark('uat-viewer').set({...m,permissions:{...m.permissions,data_plan_monthly:'edit'}});await deny(service.check(v.token,'monthly','edit'),'UAT_IDENTITY_DENIED');await mark('uat-viewer').set(m)})
  await check('missing claim disabled marker and production collision denied',async()=>{for(const c of [nc,dis,col])await deny(service.readPlan(c.token,'monthly','uat-m1'),'UAT_IDENTITY_DENIED')})
  await check('invalid token denied',()=>deny(service.readPlan('not-a-token','monthly','uat-m1'),'INVALID_TOKEN'))
  await check('unknown collection, actual raw rows and path injection denied',async()=>{for(const [scope,id] of [['actual','uat-m1'],['summary','uat-m1'],['monthly','../users'],['__proto__','uat-m1']])await deny(service.readPlan(t,scope,id),'INVALID_PLANNING_PATH')})
  await check('missing synthetic record returns null; root never read',async()=>{assert.equal(await service.readPlan(t,'monthly','uat-missing'),null);await mp.delete();assert.equal(await service.readPlan(t,'monthly','uat-m1'),null);await mp.set(monthly)})
  await check('non-synthetic and malformed records rejected',async()=>{await mp.set({...monthly,testOnly:false});await deny(service.readPlan(t,'monthly','uat-m1'),'INVALID_SYNTHETIC_PLAN');await mp.set({...monthly,targetArea100:-1});await deny(service.readPlan(t,'monthly','uat-m1'),'INVALID_SYNTHETIC_PLAN');await mp.set(monthly)})
  await check('direct client reads and writes denied even with edit capability',async()=>{const r=doc(a.db,prefix+'/monthly_plans/uat-m1');await assert.rejects(getDocFromServer(r),e=>e.code==='permission-denied');await assert.rejects(setDoc(r,{testOnly:true}),e=>e.code==='permission-denied')})
  await check('no Planning write method or mutation of plans and root sentinel',async()=>{assert.deepEqual(Object.keys(service).sort(),['check','readPlan']);assert.deepEqual((await mp.get()).data(),monthly);assert.deepEqual((await dp.get()).data(),daily);assert.deepEqual((await adb.doc('monthly_plans/uat-m1').get()).data(),{syntheticSentinel:true})})
  console.log('SUCCESS: '+n+' Planning authorization and isolated read checks passed (Firebase Auth + Firestore emulator)')
 }finally{
  for(const c of clients){await signOut(c.auth);await terminate(c.db);await deleteApp(c.app)}
  await adb.terminate();await adminDelete(admin)
 }
}
