// 11D.5a: Owner role mutation -> shared QC/Planning authorization parity.
// Single OWNER demo project only. Does NOT call the separate Planning project's guarded service.
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {createRequire} from 'node:module'
import {keys,marker} from '../src/qcUatRolePermissions.mjs'
import {permissionsForIdentity} from '../src/qcUatCustomRoles.mjs'
import {resolveOperationalPermissions,operationalPermissions,canReadOperationalPhoto} from '../server/qc-photo-access/uat-operational-permissions.mjs'
import {planningMode,guard as planningGuard} from '../server/qc-photo-access/uat-planning-role-service.mjs'
import {projectId,host,firestorePort,authPort,httpPort,origin,paths,guard,createOwnerService,createOwnerHttp} from '../server/qc-photo-access/uat-owner-permission-http.mjs'
const env={GCLOUD_PROJECT:projectId,FIRESTORE_EMULATOR_HOST:host+':'+firestorePort,FIREBASE_AUTH_EMULATOR_HOST:host+':'+authPort}
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8')
guard(env)
assert.throws(()=>planningGuard(env),{message:'DEMO_EMULATORS_REQUIRED'})
assert.equal(projectId,'demo-qc-uat-owner-http')
assert.deepEqual(keys.length,21)
for(const p of ['src/main.tsx','src/App.tsx','src/NativeUsersAccess.tsx','server/qc-photo-access/index.mjs','server/qc-photo-access/nativeAdminHttp.mjs'])assert.doesNotMatch(read(p),/test-qc-uat-role-planning-parity|role-planning-parity/)
for(const e of [{},{...env,GCLOUD_PROJECT:'form-qc-unm'},{...env,FIRESTORE_EMULATOR_HOST:'somehost:9485'}])assert.throws(()=>guard(e))
assert.ok(process.argv.length===3&&['--self-test','--emulator'].includes(process.argv[2]))
console.log('SUCCESS: Cross-domain authorization contract and dual-project isolation passed (offline)')
if(process.argv[2]==='--emulator'){
 guard()
 const require=createRequire(new URL('../server/qc-photo-access/package.json',import.meta.url))
 const {initializeApp:adminInit,deleteApp:adminDelete}=require('firebase-admin/app')
 const {getAuth}=require('firebase-admin/auth'),{getFirestore}=require('firebase-admin/firestore')
 const {initializeApp:clientInit,deleteApp:clientDelete}=await import('firebase/app')
 const {initializeAuth,inMemoryPersistence,connectAuthEmulator,signInWithEmailAndPassword,signOut}=await import('firebase/auth')
 const {initializeFirestore,connectFirestoreEmulator,doc,getDocFromServer,setDoc,terminate}=await import('firebase/firestore')
 const admin=adminInit({projectId},'qc-role-planning-parity'),adb=getFirestore(admin),authAdmin=getAuth(admin)
 const service=createOwnerService({adb,authAdmin}),server=createOwnerHttp(service)
 const clients=[],prefix='qc_uat_workspaces/cutover',mark=uid=>adb.doc('qc_uat_identities/'+uid)
 const cat=id=>adb.doc(prefix+'/role_catalog/'+id)
 const audit=(uid,rev)=>adb.doc(prefix+'/permission_audit/'+uid+':'+rev)
 const actorNames=['uat-owner','uat-field-a','uat-field-b','uat-other','uat-applicant']
 let n=0
 const check=async(name,fn)=>{try{await fn()}catch(e){throw Error('FAIL: '+name,{cause:e})}console.log('PASS: '+name);n++}
 const deny=(fn,code)=>assert.throws(fn,{message:code})
 async function open(uid){
  const app=clientInit({projectId,apiKey:'demo-only-not-a-real-key'},'parity-'+uid)
  const auth=initializeAuth(app,{persistence:inMemoryPersistence})
  connectAuthEmulator(auth,'http://'+host+':'+authPort,{disableWarnings:true})
  const db=initializeFirestore(app,{})
  connectFirestoreEmulator(db,host,firestorePort)
  clients.push({app,auth,db})
  await signInWithEmailAndPassword(auth,uid+'@parity.example.test','Synthetic-2026-'+uid)
  return {auth,db}
 }
 const tok=c=>c.auth.currentUser.getIdToken()
 async function http(path,t,body={}){
  const r=await fetch(origin+path,{method:'POST',headers:{'Content-Type':'application/json',...(t?{Authorization:'Bearer '+t}:{})},body:JSON.stringify(body)})
  assert.equal(r.headers.get('cache-control'),'no-store')
  return {status:r.status,data:await r.json()}
 }
 // Models the shared authorization inputs; this is NOT the separately guarded Planning HTTP service.
 async function effective(t){
  const decoded=await authAdmin.verifyIdToken(t,true)
  assert.equal(decoded.qcUat,true)
  return adb.runTransaction(async tx=>{
   const [m,prod]=await Promise.all([tx.get(mark(decoded.uid)),tx.get(adb.doc('users/'+decoded.uid))])
   const row=m.data()
   const p=await operationalPermissions({tx,db:adb,marker:row,productionProfile:prod.exists})
   assert.deepEqual(Object.keys(p),keys)
   return {row,permissions:p,uid:decoded.uid}
  })
 }
 const roleId='custom-field-operations'
 const initial={data_plan_monthly:'edit',data_plan_daily:'view',data_plan_summary:'view',qc_spraying:'edit',qc_records:'view'}
 const editP={qc_spraying:'none',qc_fertilizer:'edit',qc_records:'none',data_plan_monthly:'view',data_plan_daily:'edit',data_plan_actual:'view',data_plan_summary:'none'}
 const assertPlan=(p,scope,operation)=>assert.equal(planningMode(p,scope,operation),p[{monthly:'data_plan_monthly',daily:'data_plan_daily',actual:'data_plan_actual',summary:'data_plan_summary'}[scope]])
 const denyPlan=(p,scope,operation)=>deny(()=>planningMode(p,scope,operation),'PLANNING_PERMISSION_DENIED')
 try{
  assert.equal((await authAdmin.listUsers(1)).users.length,0,'FRESH_AUTH_REQUIRED')
  for(const col of ['qc_uat_identities','users',prefix+'/role_catalog',prefix+'/permission_audit',prefix+'/role_tombstones',prefix+'/registration_requests'])assert.equal((await adb.collection(col).limit(1).get()).size,0,'FRESH_FIRESTORE_REQUIRED')
  for(const uid of actorNames){
   await authAdmin.createUser({uid,email:uid+'@parity.example.test',password:'Synthetic-2026-'+uid,emailVerified:true})
   await authAdmin.setCustomUserClaims(uid,{qcUat:true})
  }
  for(const uid of actorNames.filter(x=>x!=='uat-applicant')){
   await mark(uid).set({...marker(uid==='uat-owner'?'owner':'pengunjung'),policyRevision:0,roleOverrides:{},manualOverrides:{}})
  }
  await adb.doc('daily_plans/root-sentinel').set({protected:true})
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(httpPort,host,resolve)})
  const owner=await open('uat-owner'),a=await open('uat-field-a'),b=await open('uat-field-b'),other=await open('uat-other'),applicant=await open('uat-applicant')
  const ot=await tok(owner),at=await tok(a),bt=await tok(b),otherT=await tok(other),appT=await tok(applicant)
  let role
  await check('Owner creates cross-domain role, without automatically assigning QC or Planning privileges',async()=>{
   const r=await http(paths.rolesCreate,ot,{name:'Field Operations',permissions:initial})
   assert.equal(r.status,200)
   role=r.data.role
   assert.equal(role.id,roleId);assert.equal(role.revision,0)
   assert.equal(role.permissions.data_plan_actual,'none')
   assert.equal(role.permissions.qc_fertilizer,'none')
   assert.equal((await effective(at)).permissions.data_plan_monthly,'none')
  })
  await check('Owner assignment changes both QC and Planning permission keys on same Firebase Auth token',async()=>{
   const r=await http(paths.rolesAssign,ot,{targetUid:'uat-field-a',expectedRevision:0,roleId})
   assert.equal(r.status,200)
   const x=await effective(at)
   assert.equal(x.row.policyRevision,1)
   assertPlan(x.permissions,'monthly','edit')
   assertPlan(x.permissions,'daily','view')
   assertPlan(x.permissions,'summary','view')
   denyPlan(x.permissions,'actual','view')
   assert.equal(x.permissions.qc_spraying,'edit')
   assert.equal(x.permissions.qc_fertilizer,'none')
  })
  await check('QC own-photo read and custom-role foreign-photo denial remain independent',async()=>{
   const x=await effective(at)
   assert.equal(canReadOperationalPhoto(x.row,x.permissions,x.uid,{ownerUid:x.uid},'qc_spraying'),true)
   assert.equal(canReadOperationalPhoto(x.row,x.permissions,x.uid,{ownerUid:'uat-field-b'},'qc_spraying'),false)
   assert.equal(x.permissions.qc_records,'view')
   assert.equal(x.permissions.data_plan_monthly_import,'none')
  })
  await check('manual user override remains independent of assigned custom role defaults',async()=>{
   assert.equal((await http(paths.rolesAssign,ot,{targetUid:'uat-field-b',expectedRevision:0,roleId})).status,200)
   assert.equal((await http(paths.patch,ot,{targetUid:'uat-field-b',expectedRevision:1,patch:{data_plan_daily:'none'}})).status,200)
   const x=await effective(bt)
   denyPlan(x.permissions,'daily','view')
   assertPlan(x.permissions,'monthly','edit')
   assert.equal(x.row.manualOverrides.data_plan_daily,'none')
  })
  await check('Owner read preview includes exact member policy revisions for cross-domain update',async()=>{
   const r=await http(paths.rolesPreview,ot,{roleId})
   assert.equal(r.status,200)
   assert.deepEqual(r.data.preview.members,[{uid:'uat-field-a',policyRevision:1},{uid:'uat-field-b',policyRevision:2}])
   assert.equal(r.data.preview.definition.revision,0)
  })
  await check('stale member set or incomplete permissions fail without modifying any domain',async()=>{
   const desired={...role.permissions,...editP}
   assert.equal((await http(paths.rolesUpdate,ot,{roleId,expectedRevision:0,permissions:desired,expectedMembers:[]})).status,409)
   assert.equal((await http(paths.rolesUpdate,ot,{roleId,expectedRevision:0,permissions:{data_plan_daily:'edit'},expectedMembers:[{uid:'uat-field-a',policyRevision:1},{uid:'uat-field-b',policyRevision:2}]})).status,400)
   assert.equal((await cat(roleId).get()).data().definition.revision,0)
   assert.equal((await effective(at)).permissions.qc_spraying,'edit')
  })
  await check('atomic role edit revokes QC Spray, grants Fertilizer and changes Planning scopes',async()=>{
   const r=await http(paths.rolesUpdate,ot,{roleId,expectedRevision:0,permissions:{...role.permissions,...editP},expectedMembers:[{uid:'uat-field-a',policyRevision:1},{uid:'uat-field-b',policyRevision:2}]})
   assert.equal(r.status,200);assert.equal(r.data.update.affectedCount,2)
   assert.equal(r.data.update.definition.revision,1)
   const aa=await effective(at),bb=await effective(bt)
   assert.equal(aa.row.policyRevision,2);assert.equal(bb.row.policyRevision,3)
   assert.equal(aa.permissions.qc_spraying,'none')
   assert.equal(aa.permissions.qc_fertilizer,'edit')
   assert.equal(aa.permissions.qc_records,'none')
   assertPlan(aa.permissions,'daily','edit')
   assertPlan(aa.permissions,'monthly','view')
   assertPlan(aa.permissions,'actual','view')
   denyPlan(aa.permissions,'summary','view')
   denyPlan(aa.permissions,'monthly','edit')
   denyPlan(bb.permissions,'daily','view')
   assert.equal(bb.row.manualOverrides.data_plan_daily,'none')
   assert.equal((await audit('uat-field-a',2).get()).data().action,'edit_role')
   assert.equal((await audit('uat-field-b',3).get()).data().action,'edit_role')
  })
  await check('Owner HTTP session and QC/Planning shared resolver agree after edit, no relogin',async()=>{
   const session=(await http(paths.session,at)).data.session
   const x=await effective(at)
   assert.equal(session.policyRevision,2)
   assert.deepEqual(session.permissions,x.permissions)
   assert.equal(session.permissions.data_plan_daily,'edit')
   assert.equal(session.permissions.qc_spraying,'none')
  })
  await check('unrelated viewer never receives the edited role or Planning access',async()=>{
   const x=await effective(otherT)
   assert.equal(x.row.role,'pengunjung')
   denyPlan(x.permissions,'daily','view')
   assert.equal(x.permissions.qc_fertilizer,'none')
   assert.equal(x.permissions.qc_records,'view')
  })
  await check('forged QC or Planning materialized grant is denied by common resolver',async()=>{
   const r=await mark('uat-field-a').get(),current=r.data()
   await mark('uat-field-a').update({permissions:{...current.permissions,data_plan_summary:'edit'}})
   try{await assert.rejects(effective(at),{message:'UAT_IDENTITY_DENIED'})}finally{await mark('uat-field-a').set(current)}
   assert.equal((await effective(at)).permissions.data_plan_summary,'none')
  })
  await check('missing custom catalog blocks shared permission projection with no fallback',async()=>{
   const document=await cat(roleId).get(),stored=document.data()
   await cat(roleId).delete()
   try{await assert.rejects(effective(at),{message:'UAT_IDENTITY_DENIED'})}finally{await cat(roleId).set(stored)}
   assert.equal((await effective(at)).permissions.data_plan_daily,'edit')
  })
  await check('unresolved applicant registration blocks another role edit across domains',async()=>{
   assert.equal((await http(paths.registrationSubmit,appT,{requestedRoleId:roleId})).status,200)
   const preview=(await http(paths.rolesPreview,ot,{roleId})).data.preview
   assert.equal((await http(paths.rolesUpdate,ot,{roleId,expectedRevision:1,permissions:{...preview.definition.permissions,data_plan_summary:'view'},expectedMembers:preview.members})).status,409)
   assert.equal((await http(paths.registrationReview,ot,{targetUid:'uat-applicant',expectedRevision:0,decision:'reject',approvedRoleId:null})).status,200)
   assert.equal((await cat(roleId).get()).data().definition.revision,1)
  })
  await check('Owner revocation prevents cross-domain role changes using existing token',async()=>{
   await mark('uat-owner').update({enabled:false})
   try{assert.equal((await http(paths.rolesPreview,ot,{roleId})).status,403)}finally{await mark('uat-owner').update({enabled:true})}
   assert.equal((await effective(at)).permissions.data_plan_actual,'view')
  })
  await check('role retirement requires reassigning all linked accounts and never reuses its ID',async()=>{
   assert.equal((await http(paths.rolesDelete,ot,{roleId,expectedRevision:1,expectedMembers:[]})).status,409)
   assert.equal((await http(paths.rolesAssign,ot,{targetUid:'uat-field-a',expectedRevision:2,roleId:'pengunjung'})).status,200)
   assert.equal((await http(paths.rolesAssign,ot,{targetUid:'uat-field-b',expectedRevision:3,roleId:'pengunjung'})).status,200)
   assert.equal((await http(paths.rolesDelete,ot,{roleId,expectedRevision:1,expectedMembers:[]})).status,200)
   assert.equal((await cat(roleId).get()).exists,false)
   assert.equal((await http(paths.rolesCreate,ot,{name:'Field Operations',permissions:initial})).status,409)
   denyPlan((await effective(at)).permissions,'monthly','view')
   assert.equal((await effective(bt)).permissions.qc_fertilizer,'none')
  })
  await check('browser Firestore reads/writes remain denied; unrelated root sentinel unchanged',async()=>{
   const ref=doc(a.db,'qc_uat_workspaces','cutover','role_tombstones',roleId)
   await assert.rejects(getDocFromServer(ref),{code:'permission-denied'})
   await assert.rejects(setDoc(ref,{testOnly:true,workspace:'cutover'}),{code:'permission-denied'})
   assert.deepEqual((await adb.doc('daily_plans/root-sentinel').get()).data(),{protected:true})
  })
  console.log('SUCCESS: '+n+' Owner-to-QC-and-Planning permission parity checks passed (one Owner emulator, not live Planning endpoint)')
 }finally{
  if(server.listening)await new Promise(resolve=>server.close(resolve))
  for(const c of clients){await signOut(c.auth);await terminate(c.db);await clientDelete(c.app)}
  await adb.terminate();await adminDelete(admin)
 }
}
