import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {createRequire} from 'node:module'
import {marker} from '../src/qcUatRolePermissions.mjs'
import {resolveOperationalPermissions} from '../server/qc-photo-access/uat-operational-permissions.mjs'
import {projectId,host,firestorePort,authPort,httpPort,origin,paths,guard,createOwnerService,createOwnerHttp} from '../server/qc-photo-access/uat-owner-permission-http.mjs'
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8')
const config=JSON.parse(read('firebase.uat-owner-permission-http.json'))
const environment={GCLOUD_PROJECT:projectId,FIRESTORE_EMULATOR_HOST:host+':'+firestorePort,FIREBASE_AUTH_EMULATOR_HOST:host+':'+authPort}
guard(environment)
for(const e of [{},{...environment,GCLOUD_PROJECT:'form-qc-unm'},{...environment,FIRESTORE_EMULATOR_HOST:'remote:9485'},{...environment,FIREBASE_AUTH_EMULATOR_HOST:'remote:10299'}])assert.throws(()=>guard(e))
assert.deepEqual(config.emulators.firestore,{host,port:firestorePort})
assert.deepEqual(config.emulators.auth,{host,port:authPort})
for(const p of ['src/main.tsx','src/App.tsx','src/NativeUsersAccess.tsx','server/qc-photo-access/index.mjs','server/qc-photo-access/nativeAdminHttp.mjs'])assert.doesNotMatch(read(p),/uat-custom-role-registration|qcUatCustomRoleRegistration/)
assert.ok(process.argv.length===3&&['--self-test','--emulator'].includes(process.argv[2]))
console.log('SUCCESS: Custom role registration isolation and environment guards passed (offline)')
if(process.argv[2]==='--emulator'){
 guard()
 const require=createRequire(new URL('../server/qc-photo-access/package.json',import.meta.url))
 const {initializeApp:adminInit,deleteApp:adminDelete}=require('firebase-admin/app')
 const {getAuth}=require('firebase-admin/auth'),{getFirestore}=require('firebase-admin/firestore')
 const {initializeApp,deleteApp}=await import('firebase/app')
 const {initializeAuth,inMemoryPersistence,connectAuthEmulator,signInWithEmailAndPassword,signOut}=await import('firebase/auth')
 const {initializeFirestore,connectFirestoreEmulator,doc,getDocFromServer,setDoc,terminate}=await import('firebase/firestore')
 const admin=adminInit({projectId},'registration-demo'),authAdmin=getAuth(admin),adb=getFirestore(admin)
 const service=createOwnerService({adb,authAdmin}),server=createOwnerHttp(service)
 const prefix='qc_uat_workspaces/cutover',mark=uid=>adb.doc('qc_uat_identities/'+uid),reg=uid=>adb.doc(prefix+'/registration_requests/'+uid),audit=(uid,rev)=>adb.doc(prefix+'/registration_audit/'+uid+':'+rev)
 const clients=[],email=uid=>uid+'@registration.example.test',password=uid=>'Synthetic-2026-'+uid
 let n=0
 const check=async(name,fn)=>{try{await fn()}catch(e){throw Error('FAIL: '+name,{cause:e})}n++;console.log('PASS: '+name)}
 const uidNames=['uat-owner','uat-applicant','uat-applicant-b','uat-reject','uat-collision','uat-unverified','uat-noclaim','uat-prod']
 async function open(uid){
  const app=initializeApp({projectId,apiKey:'demo-only-not-a-real-key'},crypto.randomUUID())
  const auth=initializeAuth(app,{persistence:inMemoryPersistence})
  connectAuthEmulator(auth,'http://'+host+':'+authPort,{disableWarnings:true})
  const db=initializeFirestore(app,{})
  connectFirestoreEmulator(db,host,firestorePort)
  clients.push({app,auth,db})
  await signInWithEmailAndPassword(auth,email(uid),password(uid))
  return {auth,db}
 }
 const token=c=>c.auth.currentUser.getIdToken()
 async function call(path,t,body={},extra={}){
  const response=await fetch(origin+path,{method:'POST',headers:{'Content-Type':'application/json',...(t?{Authorization:'Bearer '+t}:{}),...extra},body:JSON.stringify(body)})
  assert.equal(response.headers.get('cache-control'),'no-store')
  return {status:response.status,data:await response.json()}
 }
 const role1={name:'QC Inspector',permissions:{qc_records:'view'}},role2={name:'Planning Reader',permissions:{data_plan_summary:'view'}}
 const roleId1='custom-qc-inspector',roleId2='custom-planning-reader'
 const submit=(t,requestedRoleId=roleId1)=>call(paths.registrationSubmit,t,{requestedRoleId})
 const review=(t,targetUid,decision='approve',approvedRoleId=roleId2,expectedRevision=0)=>call(paths.registrationReview,t,{targetUid,expectedRevision,decision,approvedRoleId})
 const activate=t=>call(paths.registrationActivate,t,{expectedRevision:1})
 try{
  assert.equal((await authAdmin.listUsers(1)).users.length,0,'FRESH_AUTH_REQUIRED')
  for(const c of ['qc_uat_identities','users',prefix+'/registration_requests',prefix+'/registration_audit',prefix+'/role_catalog',prefix+'/role_catalog_audit'])assert.equal((await adb.collection(c).limit(1).get()).size,0,'FRESH_FIRESTORE_REQUIRED')
  for(const uid of uidNames){
   await authAdmin.createUser({uid,email:email(uid),password:password(uid),emailVerified:uid!=='uat-unverified'})
   if(uid!=='uat-noclaim')await authAdmin.setCustomUserClaims(uid,{qcUat:true})
  }
  await mark('uat-owner').set({...marker('owner'),roleOverrides:{},manualOverrides:{},policyRevision:0})
  await adb.doc('users/uat-prod').set({active:true})
  await adb.doc('daily_plans/root-sentinel').set({protected:true})
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(httpPort,host,resolve)})
  const owner=await open('uat-owner'),a=await open('uat-applicant'),b=await open('uat-applicant-b'),rejected=await open('uat-reject'),collision=await open('uat-collision'),noclaim=await open('uat-noclaim'),unverified=await open('uat-unverified'),prod=await open('uat-prod')
  const ot=await token(owner),at=await token(a),bt=await token(b),rt=await token(rejected),ct=await token(collision)
  await check('existing catalog supports two explicit custom templates and no automatic enrollment',async()=>{
   assert.equal((await call(paths.rolesCreate,ot,role1)).status,200)
   assert.equal((await call(paths.rolesCreate,ot,role2)).status,200)
   assert.equal((await mark('uat-applicant').get()).exists,false)
   assert.equal((await reg('uat-applicant').get()).exists,false)
  })
  await check('new user sees only names and IDs of custom roles, not permission grants',async()=>{
   const x=await call(paths.registrationRoles,at)
   assert.equal(x.status,200)
   assert.deepEqual(x.data.roles.map(r=>r.id).sort(),[roleId1,roleId2].sort())
   assert.deepEqual(Object.keys(x.data.roles[0]).sort(),['id','name'])
   assert.equal((await call(paths.registrationStatus,at)).data.registration,null)
  })
  await check('invalid token, missing UAT claim and unverified email cannot register',async()=>{
   assert.equal((await submit(null)).status,401)
   assert.equal((await submit('forged')).status,401)
   assert.equal((await submit(await token(noclaim))).status,403)
   assert.equal((await submit(await token(unverified))).status,403)
   assert.equal((await submit(await token(prod))).status,403)
   assert.equal((await call(paths.registrationRoles,await token(prod))).status,403)
  })
  await check('self request accepts custom role but not permission map or owner',async()=>{
   for(const bad of ['owner','asisten','custom-missing'])assert.notEqual((await submit(at,bad)).status,200)
   assert.equal((await call(paths.registrationSubmit,at,{requestedRoleId:roleId1,permissions:{qc_spraying:'edit'}})).status,400)
   const x=await submit(at)
   assert.equal(x.status,200);assert.equal(x.data.registration.uid,'uat-applicant');assert.equal(x.data.registration.status,'pending')
   assert.equal((await mark('uat-applicant').get()).exists,false)
   assert.equal((await audit('uat-applicant',0).get()).data().action,'submit')
  })
  await check('pending registration has no session or client direct Firestore authority',async()=>{
   assert.equal((await call(paths.session,at)).status,403)
   assert.equal((await submit(at)).status,409)
   assert.equal((await call(paths.registrationStatus,at)).data.registration.requestedRoleId,roleId1)
   for(const path of [['qc_uat_identities','uat-applicant'],['qc_uat_workspaces','cutover','registration_requests','uat-applicant'],['qc_uat_workspaces','cutover','registration_audit','uat-applicant:0']]){
    const ref=doc(a.db,...path)
    await assert.rejects(getDocFromServer(ref),{code:'permission-denied'})
    await assert.rejects(setDoc(ref,{permissions:{qc_spraying:'edit'}}),{code:'permission-denied'})
   }
  })
  await check('nonowner cannot review and actor cannot choose role at activation',async()=>{
   assert.equal((await review(at,'uat-applicant')).status,403)
   assert.equal((await call(paths.registrationReview,ot,{targetUid:'uat-applicant',expectedRevision:0,decision:'approve',approvedRoleId:'owner'})).status,400)
   assert.equal((await call(paths.registrationActivate,at,{expectedRevision:1,roleId:roleId1})).status,400)
   assert.equal((await activate(at)).status,409)
  })
  await check('Owner explicitly approves different custom role, not the requested grant',async()=>{
   const x=await review(ot,'uat-applicant')
   assert.equal(x.status,200)
   assert.equal(x.data.registration.approvedRoleId,roleId2)
   assert.equal(x.data.registration.requestedRoleId,roleId1)
   assert.equal(x.data.registration.status,'approved')
   assert.equal((await mark('uat-applicant').get()).exists,false)
   assert.equal((await audit('uat-applicant',1).get()).data().actorUid,'uat-owner')
  })
  await check('stale or repeated approval denied and no marker issued by reviewer',async()=>{
   assert.equal((await review(ot,'uat-applicant')).status,409)
   assert.equal((await review(ot,'uat-applicant','reject',null,1)).status,400)
   assert.equal((await mark('uat-applicant').get()).exists,false)
  })
  await check('user activates approved role atomically and session recomputes catalog permissions',async()=>{
   const x=await activate(at)
   assert.equal(x.status,200);assert.equal(x.data.session.role,roleId2)
   assert.equal(x.data.session.permissions.data_plan_summary,'view')
   assert.equal(x.data.session.permissions.qc_records,'none')
   assert.equal(x.data.session.permissions.qc_spraying,'none')
   const m=(await mark('uat-applicant').get()).data()
   assert.equal(m.role,roleId2);assert.equal(m.policyRevision,0);assert.deepEqual(m.manualOverrides,{})
   const catalog=(await adb.doc(prefix+'/role_catalog/'+roleId2).get()).data()
   assert.deepEqual(resolveOperationalPermissions({marker:m,productionProfile:false,catalog}),m.permissions)
   assert.equal((await reg('uat-applicant').get()).data().status,'activated')
   assert.equal((await audit('uat-applicant',2).get()).data().roleId,roleId2)
   assert.equal((await call(paths.session,at)).data.session.role,roleId2)
  })
  await check('same actor cannot replay activation or submit duplicate to gain rights',async()=>{
   assert.equal((await activate(at)).status,403)
   assert.equal((await submit(at)).status,403)
   assert.equal((await mark('uat-applicant').get()).data().permissions.qc_spraying,'none')
  })
  await check('rejected request is terminal and cannot activate',async()=>{
   assert.equal((await submit(rt)).status,200)
   const x=await review(ot,'uat-reject','reject',null)
   assert.equal(x.status,200);assert.equal(x.data.registration.status,'rejected')
   assert.equal((await activate(rt)).status,409)
   assert.equal((await mark('uat-reject').get()).exists,false)
  })
  await check('role catalog disappearance blocks activation without partial writes',async()=>{
   assert.equal((await submit(bt)).status,200)
   assert.equal((await review(ot,'uat-applicant-b')).status,200)
   const ref=adb.doc(prefix+'/role_catalog/'+roleId2),saved=(await ref.get()).data()
   await ref.delete()
   try{assert.equal((await activate(bt)).status,409);assert.equal((await mark('uat-applicant-b').get()).exists,false);assert.equal((await reg('uat-applicant-b').get()).data().status,'approved')}
   finally{await ref.set(saved)}
  })
  await check('audit collision aborts activation, then recovery succeeds',async()=>{
   await audit('uat-applicant-b',2).create({collision:true})
   assert.equal((await activate(bt)).status,500)
   assert.equal((await mark('uat-applicant-b').get()).exists,false)
   assert.equal((await reg('uat-applicant-b').get()).data().revision,1)
   await audit('uat-applicant-b',2).delete()
   assert.equal((await activate(bt)).status,200)
  })
  await check('concurrent request review and activation allow only one winner',async()=>{
   assert.deepEqual((await Promise.all([submit(ct),submit(ct)])).map(x=>x.status).sort(),[200,409])
   const votes=await Promise.all([review(ot,'uat-collision'),review(ot,'uat-collision')])
   assert.deepEqual(votes.map(x=>x.status).sort(),[200,409])
   const activations=await Promise.all([activate(ct),activate(ct)])
   assert.equal(activations.filter(x=>x.status===200).length,1)
   assert.equal((await mark('uat-collision').get()).data().role,roleId2)
   assert.equal((await audit('uat-collision',2).get()).data().revision,2)
  })
  await check('owner revoked denies registration review with same token',async()=>{
   await mark('uat-owner').update({enabled:false})
   assert.equal((await review(ot,'uat-reject')).status,403)
   await mark('uat-owner').update({enabled:true})
   assert.equal((await reg('uat-reject').get()).data().status,'rejected')
   assert.deepEqual((await adb.doc('daily_plans/root-sentinel').get()).data(),{protected:true})
  })
  console.log('SUCCESS: '+n+' Custom role registration integration checks passed (Firebase Auth + Firestore emulator)')
 }finally{
  if(server.listening)await new Promise(resolve=>server.close(resolve))
  for(const c of clients){await signOut(c.auth);await terminate(c.db);await deleteApp(c.app)}
  await adb.terminate();await adminDelete(admin)
 }
}
