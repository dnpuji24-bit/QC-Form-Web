// 11D.5a: genuine Planning service verification of a materialized Owner role schema.
// Owner and Planning emulators are intentionally separate; this is a controlled schema fixture,
// NOT a cross-project Owner API call or a deployed unified identity.
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {createRequire} from 'node:module'
import {marker} from '../src/qcUatRolePermissions.mjs'
import {roleDefinition,assignIdentityRole,permissionsForIdentity} from '../src/qcUatCustomRoles.mjs'
import {createPlanningService,projectId,host,firestorePort,authPort,guard} from '../server/qc-photo-access/uat-planning-role-service.mjs'
const env={GCLOUD_PROJECT:projectId,FIRESTORE_EMULATOR_HOST:host+':'+firestorePort,FIREBASE_AUTH_EMULATOR_HOST:host+':'+authPort}
guard(env)
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8')
for(const p of ['src/App.tsx','src/main.tsx','server/qc-photo-access/index.mjs'])assert.doesNotMatch(read(p),/planning-role-revision-parity/)
for(const bad of [{},{...env,GCLOUD_PROJECT:'demo-qc-uat-owner-http'},{...env,FIRESTORE_EMULATOR_HOST:'127.0.0.1:9485'}])assert.throws(()=>guard(bad))
assert.equal(projectId,'demo-qc-uat-planning-role')
assert.ok(process.argv.length===3&&['--self-test','--emulator'].includes(process.argv[2]))
console.log('SUCCESS: Planning role revision parity isolation guards passed (offline)')
if(process.argv[2]==='--emulator'){
 guard()
 const require=createRequire(new URL('../server/qc-photo-access/package.json',import.meta.url))
 const {initializeApp:adminInit,deleteApp:adminDelete}=require('firebase-admin/app')
 const {getAuth}=require('firebase-admin/auth'),{getFirestore}=require('firebase-admin/firestore')
 const {initializeApp,deleteApp}=await import('firebase/app')
 const {initializeAuth,inMemoryPersistence,connectAuthEmulator,signInWithEmailAndPassword,signOut}=await import('firebase/auth')
 const {initializeFirestore,connectFirestoreEmulator,doc,getDocFromServer,setDoc,terminate}=await import('firebase/firestore')
 const admin=adminInit({projectId},'planning-revision-parity'),authAdmin=getAuth(admin),adb=getFirestore(admin)
 const clients=[],prefix='qc_uat_workspaces/cutover',mark=uid=>adb.doc('qc_uat_identities/'+uid)
 const def0=roleDefinition({name:'Field Operations',permissions:{data_plan_monthly:'edit',data_plan_daily:'view',data_plan_summary:'view',qc_spraying:'edit'}})
 const def1={...roleDefinition({name:'Field Operations',permissions:{...def0.permissions,data_plan_monthly:'view',data_plan_daily:'edit',data_plan_summary:'none',data_plan_actual:'view',qc_spraying:'none',qc_fertilizer:'edit'}}),revision:1}
 const catalog=adb.doc(prefix+'/role_catalog/'+def0.id)
 const mp=adb.doc(prefix+'/monthly_plans/uat-cross-mp'),dp=adb.doc(prefix+'/daily_plans/uat-cross-dp')
 const base={...marker('pengunjung'),policyRevision:0,roleOverrides:{},manualOverrides:{}}
 const custom=assignIdentityRole(base,def0.id,def0)
 const service=createPlanningService({adb,authAdmin})
 let n=0
 const check=async(label,fn)=>{try{await fn()}catch(e){throw Error('FAIL: '+label,{cause:e})}n++;console.log('PASS: '+label)}
 const deny=(promise,code)=>assert.rejects(promise,{message:code})
 async function open(uid){
  const app=initializeApp({projectId,apiKey:'demo-only-not-a-real-key'},'planning-parity-'+uid)
  const auth=initializeAuth(app,{persistence:inMemoryPersistence})
  connectAuthEmulator(auth,'http://'+host+':'+authPort,{disableWarnings:true})
  const db=initializeFirestore(app,{})
  connectFirestoreEmulator(db,host,firestorePort)
  clients.push({app,auth,db})
  await signInWithEmailAndPassword(auth,uid+'@planning-parity.example.test','Synthetic-2026-'+uid)
  return {token:await auth.currentUser.getIdToken(),db}
 }
 try{
  assert.equal((await authAdmin.listUsers(1)).users.length,0,'FRESH_AUTH_REQUIRED')
  for(const path of ['qc_uat_identities','users',prefix+'/role_catalog',prefix+'/monthly_plans',prefix+'/daily_plans'])assert.equal((await adb.collection(path).limit(1).get()).size,0,'FRESH_FIRESTORE_REQUIRED')
  for(const uid of ['uat-field','uat-visitor','uat-no-claim']){
   await authAdmin.createUser({uid,email:uid+'@planning-parity.example.test',password:'Synthetic-2026-'+uid,emailVerified:true})
   if(uid!=='uat-no-claim')await authAdmin.setCustomUserClaims(uid,{qcUat:true})
  }
  await mark('uat-field').set(custom)
  await mark('uat-visitor').set({...marker('pengunjung'),policyRevision:0,roleOverrides:{},manualOverrides:{}})
  await mark('uat-no-claim').set(custom)
  await catalog.set({testOnly:true,workspace:'cutover',definition:def0})
  await mp.set({testOnly:true,id:'uat-cross-mp',pid:'uat-p1',targetArea100:1200})
  await dp.set({testOnly:true,id:'uat-cross-dp',pid:'uat-p1',area100:400})
  await adb.doc('monthly_plans/uat-root-sentinel').set({protected:true})
  const a=await open('uat-field'),v=await open('uat-visitor'),nc=await open('uat-no-claim')
  const t=a.token
  await check('actual Planning service authorizes synthetic custom Monthly Edit and Daily View',async()=>{
   assert.equal((await service.check(t,'monthly','edit')).mode,'edit')
   assert.equal((await service.check(t,'daily','view')).mode,'view')
   assert.equal((await service.readPlan(t,'monthly','uat-cross-mp')).area100,1200)
   assert.equal((await service.readPlan(t,'daily','uat-cross-dp')).area100,400)
  })
  await check('before revision, Actual is denied while Summary is independently viewable',async()=>{
   assert.equal((await service.check(t,'summary','view')).mode,'view')
   await deny(service.check(t,'actual','view'),'PLANNING_PERMISSION_DENIED')
   await deny(service.check(t,'daily','edit'),'PLANNING_PERMISSION_DENIED')
  })
  await check('new catalog revision without updated user marker fails closed instead of granting',async()=>{
   await catalog.update({definition:def1})
   await deny(service.readPlan(t,'daily','uat-cross-dp'),'UAT_IDENTITY_DENIED')
   assert.equal((await mark('uat-field').get()).data().policyRevision,1)
  })
  await check('materialized matching revision restores Planning with same exact Firebase token',async()=>{
   const next={...custom,policyRevision:2,permissions:permissionsForIdentity({...custom,policyRevision:2},def1)}
   await mark('uat-field').set(next)
   assert.equal((await service.check(t,'daily','edit')).mode,'edit')
   assert.equal((await service.check(t,'actual','view')).mode,'view')
   assert.equal((await service.check(t,'monthly','view')).mode,'view')
   await deny(service.check(t,'monthly','edit'),'PLANNING_PERMISSION_DENIED')
   await deny(service.check(t,'summary','view'),'PLANNING_PERMISSION_DENIED')
  })
  await check('new revision does not implicitly grant QC or Planning import paths',async()=>{
   await deny(service.check(t,'qc_spraying','edit'),'INVALID_PLANNING_OPERATION')
   await deny(service.check(t,'daily_import','edit'),'INVALID_PLANNING_OPERATION')
   const m=(await mark('uat-field').get()).data()
   assert.equal(m.permissions.qc_spraying,'none');assert.equal(m.permissions.qc_fertilizer,'edit')
   assert.equal(m.permissions.data_plan_daily_import,'none')
  })
  await check('manual override none supersedes updated role on same Auth token',async()=>{
   const before=(await mark('uat-field').get()).data()
   const after={...before,manualOverrides:{data_plan_daily:'none'},policyRevision:before.policyRevision+1}
   after.permissions=permissionsForIdentity(after,def1)
   await mark('uat-field').set(after)
   await deny(service.readPlan(t,'daily','uat-cross-dp'),'PLANNING_PERMISSION_DENIED')
   assert.equal((await service.check(t,'actual','view')).mode,'view')
  })
  await check('forged materialized permission and missing catalog are never accepted',async()=>{
   const before=(await mark('uat-field').get()).data()
   await mark('uat-field').update({permissions:{...before.permissions,data_plan_monthly:'edit'}})
   await deny(service.check(t,'monthly','view'),'UAT_IDENTITY_DENIED')
   await mark('uat-field').set(before)
   await catalog.delete()
   await deny(service.check(t,'actual','view'),'UAT_IDENTITY_DENIED')
   await catalog.set({testOnly:true,workspace:'cutover',definition:def1})
  })
  await check('visitor and missing qcUat claim remain denied independently',async()=>{
   await deny(service.readPlan(v.token,'monthly','uat-cross-mp'),'PLANNING_PERMISSION_DENIED')
   await deny(service.readPlan(nc.token,'monthly','uat-cross-mp'),'UAT_IDENTITY_DENIED')
  })
  await check('disabled member same token denied and recovery requires enabled marker',async()=>{
   await mark('uat-field').update({enabled:false})
   await deny(service.check(t,'actual','view'),'UAT_IDENTITY_DENIED')
   await mark('uat-field').update({enabled:true})
   assert.equal((await service.check(t,'actual','view')).mode,'view')
  })
  await check('no direct client read/write or accidental root mutation',async()=>{
   const r=doc(a.db,prefix+'/role_catalog/'+def0.id)
   await assert.rejects(getDocFromServer(r),{code:'permission-denied'})
   await assert.rejects(setDoc(r,{testOnly:true}),{code:'permission-denied'})
   assert.deepEqual((await adb.doc('monthly_plans/uat-root-sentinel').get()).data(),{protected:true})
  })
  console.log('SUCCESS: '+n+' real Planning-service role-revision checks passed (separate Planning emulator; Owner API not invoked)')
 }finally{
  for(const c of clients){await signOut(c.auth);await terminate(c.db);await deleteApp(c.app)}
  await adb.terminate();await adminDelete(admin)
 }
}
