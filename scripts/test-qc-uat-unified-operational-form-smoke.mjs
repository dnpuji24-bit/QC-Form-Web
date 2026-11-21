// Fast targeted emulator smoke for 11D.5c.2. Real Planning HTTP and QC/Actual transaction.
import assert from 'node:assert/strict'
import {createRequire} from 'node:module'
import {marker} from '../src/qcUatRolePermissions.mjs'
import {permissionsForIdentity} from '../src/qcUatCustomRoles.mjs'
import {nextPlanningRow} from '../src/qcUatPlanningWriteContract.mjs'
import {prepareUnifiedOperationalQc} from '../src/qcUatUnifiedOperationalForm.mjs'
import {unifiedGuard,unifiedProjectId,unifiedHost,unifiedFirestorePort,unifiedAuthPort} from '../server/qc-photo-access/uat-unified-identity-guard.mjs'
import {createUnifiedPlanningHttp,unifiedPlanningPort,unifiedPlanningOrigin,unifiedPaths} from '../server/qc-photo-access/uat-unified-planning-http.mjs'
unifiedGuard()
const require=createRequire(new URL('../server/qc-photo-access/package.json',import.meta.url))
const {initializeApp:adminInit,deleteApp:adminDelete}=require('firebase-admin/app')
const {getAuth}=require('firebase-admin/auth'),{getFirestore}=require('firebase-admin/firestore')
const {initializeApp:clientInit,deleteApp:clientDelete}=await import('firebase/app')
const {initializeAuth,inMemoryPersistence,connectAuthEmulator,signInWithEmailAndPassword,signOut}=await import('firebase/auth')
const {initializeFirestore,connectFirestoreEmulator,doc,getDocFromServer,setDoc,terminate}=await import('firebase/firestore')
const admin=adminInit({projectId:unifiedProjectId},'uat-operational-smoke'),adb=getFirestore(admin),authAdmin=getAuth(admin)
const api=createUnifiedPlanningHttp({adb,authAdmin}),clients=[]
const basePath='qc_uat_workspaces/cutover/',ref=(col,id)=>adb.doc(basePath+col+'/'+id),idRef=uid=>adb.doc('qc_uat_identities/'+uid)
let n=0
const check=async(label,fn)=>{try{await fn()}catch(cause){throw Error('FAIL: '+label,{cause})}n++;console.log('PASS: '+label)}
async function open(uid){
 const app=clientInit({projectId:unifiedProjectId,apiKey:'demo-only-not-a-real-key'},'uat-form-smoke-'+uid)
 const auth=initializeAuth(app,{persistence:inMemoryPersistence})
 connectAuthEmulator(auth,'http://'+unifiedHost+':'+unifiedAuthPort,{disableWarnings:true})
 const db=initializeFirestore(app,{})
 connectFirestoreEmulator(db,unifiedHost,unifiedFirestorePort)
 clients.push({app,auth,db})
 await signInWithEmailAndPassword(auth,uid+'@smoke.example.test','Synthetic-2026-'+uid)
 return {auth,db,token:await auth.currentUser.getIdToken()}
}
async function post(token,path,body){
 const r=await fetch(unifiedPlanningOrigin+path,{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify(body)})
 assert.equal(r.headers.get('cache-control'),'no-store')
 return {status:r.status,data:await r.json()}
}
const source=(token,formType,dailyPlanId)=>post(token,unifiedPaths.qcSource,{request:{formType,dailyPlanId}})
const save=(token,request)=>post(token,unifiedPaths.qcCommit,{request})
const createDaily=(id,fields)=>nextPlanningRow('daily',{action:'create',id,expectedRevision:null,fields},null,'uat-qc-op')
const common={pid:'uat-p1',date:'2026-11-03',shift:'1',foreman:'uat-f1',sourceType:'ADHOC',monthlyPlanLineId:'',area100:1000}
const input=(source,recordId,saveType,actualArea100)=>prepareUnifiedOperationalQc({source,uid:'uat-qc-op',recordId,saveType,actualArea100,sessionId:'uat-session-1',clientRevision:'uat-rev-'+recordId.slice(4),jobId:'uat-job-'+recordId.slice(4)})
try{
 assert.equal((await authAdmin.listUsers(1)).users.length,0,'FRESH_AUTH_REQUIRED')
 for(const col of ['qc_uat_identities','users',basePath+'daily_plans',basePath+'qc_records',basePath+'daily_reports',basePath+'qc_operational_audit'])assert.equal((await adb.collection(col).limit(1).get()).size,0,'FRESH_FIRESTORE_REQUIRED')
 for(const uid of ['uat-qc-op','uat-visitor']){
  await authAdmin.createUser({uid,email:uid+'@smoke.example.test',password:'Synthetic-2026-'+uid,emailVerified:true})
  await authAdmin.setCustomUserClaims(uid,{qcUat:true})
 }
 const baseline={...marker('pengunjung'),policyRevision:0,roleOverrides:{},manualOverrides:{qc_spraying:'edit',qc_fertilizer:'edit'}}
 await idRef('uat-qc-op').set({...baseline,permissions:permissionsForIdentity(baseline)})
 await idRef('uat-visitor').set({...marker('pengunjung'),policyRevision:0,roleOverrides:{},manualOverrides:{}})
 await ref('daily_plans','uat-ds').set(createDaily('uat-ds',{...common,activityId:'uat-a1',formType:'spray'}))
 await ref('daily_plans','uat-df').set(createDaily('uat-df',{...common,activityId:'uat-a2',formType:'fertilizer',area100:500}))
 await adb.doc('users/root-sentinel').set({protected:true})
 await new Promise((resolve,reject)=>{api.once('error',reject);api.listen(unifiedPlanningPort,unifiedHost,resolve)})
 const worker=await open('uat-qc-op'),visitor=await open('uat-visitor')
 let spray,fert
 await check('QC Edit alone retrieves trusted Spray source without Planning View grant',async()=>{
  assert.equal((await post(worker.token,unifiedPaths.check,{scope:'daily',operation:'view'})).status,403)
  const r=await source(worker.token,'spray','uat-ds')
  assert.equal(r.status,200);spray=r.data.source
  assert.equal(spray.dailyPlanId,'uat-ds');assert.equal(spray.revision,0);assert.equal(spray.area100,1000)
  assert.equal(spray.readOnly,true)
 })
 await check('Fertilizer source is independent, wrong-form sources are rejected',async()=>{
  const r=await source(worker.token,'fertilizer','uat-df')
  assert.equal(r.status,200);fert=r.data.source
  assert.equal(fert.monthlyPlanLineId,'')
  assert.equal((await source(worker.token,'spray','uat-df')).status,409)
  assert.equal((await source(worker.token,'fertilizer','uat-ds')).status,409)
 })
 await check('visitor cannot select either QC source or commit QC',async()=>{
  assert.equal((await source(visitor.token,'spray','uat-ds')).status,403)
  assert.equal((await source(visitor.token,'fertilizer','uat-df')).status,403)
  assert.equal((await save(visitor.token,input(spray,'uat-qs','ready',1100))).status,403)
 })
 await check('Spray ready with over-actual commits QC and Actual atomically',async()=>{
  const r=await save(worker.token,input(spray,'uat-qs','ready',1200))
  assert.equal(r.status,200);assert.equal(r.data.qc.id,'uat-qs')
  const actual=(await ref('daily_reports','qcactual_uat-qs').get()).data()
  assert.equal(actual.dailyPlanId,'uat-ds')
  assert.equal(actual.actualArea100,1200)
  assert.equal(actual.plannedDailyArea100,1000)
 })
 await check('exact retry does not duplicate QC, Actual or audit',async()=>{
  assert.equal((await save(worker.token,input(spray,'uat-qs','ready',1200))).status,200)
  assert.equal((await adb.collection(basePath+'daily_reports').get()).size,1)
  assert.equal((await adb.collection(basePath+'qc_operational_audit').get()).size,1)
  assert.equal((await save(worker.token,input(spray,'uat-qs','ready',1000))).status,409)
 })
 await check('Fertilizer draft creates no Actual; separate ready generates only one Actual',async()=>{
  assert.equal((await save(worker.token,input(fert,'uat-qf-draft','draft',0))).status,200)
  assert.equal((await ref('daily_reports','qcactual_uat-qf-draft').get()).exists,false)
  assert.equal((await save(worker.token,input(fert,'uat-qf-ready','ready',650))).status,200)
  assert.equal((await ref('daily_reports','qcactual_uat-qf-ready').get()).data().actualArea100,650)
  assert.equal((await adb.collection(basePath+'daily_reports').get()).size,2)
 })
 await check('stale Daily revision and forged source metadata fail closed without writes',async()=>{
  const wrong={...input(spray,'uat-q-stale','ready',100),expectedDailyRevision:1}
  assert.equal((await save(worker.token,wrong)).status,409)
  const forged=input(spray,'uat-q-forged','ready',100)
  forged.record.pid='uat-other-pid'
  assert.equal((await save(worker.token,forged)).status,409)
  assert.equal((await ref('qc_records','uat-q-stale').get()).exists,false)
  assert.equal((await ref('qc_records','uat-q-forged').get()).exists,false)
 })
 await check('revoked QC rights block same-token selections; direct client writes denied',async()=>{
  const m={...baseline,policyRevision:1,manualOverrides:{qc_spraying:'none',qc_fertilizer:'none'}}
  await idRef('uat-qc-op').set({...m,permissions:permissionsForIdentity(m)})
  assert.equal((await source(worker.token,'spray','uat-ds')).status,403)
  assert.equal((await source(worker.token,'fertilizer','uat-df')).status,403)
  assert.equal((await save(worker.token,input(fert,'uat-qf-after','ready',700))).status,403)
  const direct=doc(worker.db,basePath+'qc_records/uat-attacker')
  await assert.rejects(getDocFromServer(direct),{code:'permission-denied'})
  await assert.rejects(setDoc(direct,{testOnly:true}),{code:'permission-denied'})
  assert.deepEqual((await adb.doc('users/root-sentinel').get()).data(),{protected:true})
  assert.equal((await adb.collection(basePath+'daily_reports').get()).size,2)
 })
 console.log('SUCCESS: '+n+' focused operational Spray/Fertilizer QC UAT emulator smoke checks passed')
}finally{
 if(api.listening)await new Promise(resolve=>api.close(resolve))
 for(const c of clients){await signOut(c.auth);await terminate(c.db);await clientDelete(c.app)}
 await adb.terminate();await adminDelete(admin)
}
