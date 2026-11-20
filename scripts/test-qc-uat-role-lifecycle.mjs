import assert from 'node:assert/strict'
import {createRequire} from 'node:module'
import {marker} from '../src/qcUatRolePermissions.mjs'
import {projectId,host,httpPort,origin,paths,guard,createOwnerHttp,createOwnerService} from '../server/qc-photo-access/uat-owner-permission-http.mjs'
const environment={GCLOUD_PROJECT:projectId,FIRESTORE_EMULATOR_HOST:'127.0.0.1:9485',FIREBASE_AUTH_EMULATOR_HOST:'127.0.0.1:10299'}
guard(environment)
for(const env of [{},{...environment,GCLOUD_PROJECT:'form-qc-unm'},{...environment,FIRESTORE_EMULATOR_HOST:'remote:9485'}])assert.throws(()=>guard(env))
assert.ok(process.argv.length===3&&['--self-test','--emulator'].includes(process.argv[2]))
console.log('SUCCESS: Custom role lifecycle isolated emulator guards passed (offline)')
if(process.argv[2]==='--emulator'){
 guard()
 const require=createRequire(new URL('../server/qc-photo-access/package.json',import.meta.url))
 const {initializeApp:adminInit,deleteApp:adminDelete}=require('firebase-admin/app')
 const {getFirestore}=require('firebase-admin/firestore'),{getAuth}=require('firebase-admin/auth')
 const {initializeApp,deleteApp}=await import('firebase/app')
 const {initializeAuth,inMemoryPersistence,connectAuthEmulator,signInWithEmailAndPassword,signOut}=await import('firebase/auth')
 const {initializeFirestore,connectFirestoreEmulator,doc,getDocFromServer,setDoc,terminate}=await import('firebase/firestore')
 const admin=adminInit({projectId},'role-lifecycle-demo'),adb=getFirestore(admin),authAdmin=getAuth(admin)
 const service=createOwnerService({adb,authAdmin}),server=createOwnerHttp(service),clients=[]
 const prefix='qc_uat_workspaces/cutover',mark=uid=>adb.doc('qc_uat_identities/'+uid)
 const catalog=id=>adb.doc(prefix+'/role_catalog/'+id),roleAudit=id=>adb.doc(prefix+'/role_catalog_audit/'+id),retired=id=>adb.doc(prefix+'/role_tombstones/'+id)
 const permissionAudit=(uid,rev)=>adb.doc(prefix+'/permission_audit/'+uid+':'+rev)
 const uidList=['uat-owner','uat-member-a','uat-member-b','uat-requester','uat-viewer','uat-prod']
 const email=uid=>uid+'@lifecycle.example.test',pw=uid=>'Synthetic-2026-'+uid
 let n=0
 const check=async(label,fn)=>{try{await fn()}catch(e){throw Error('FAIL: '+label,{cause:e})}n++;console.log('PASS: '+label)}
 async function open(uid){
  const app=initializeApp({projectId,apiKey:'demo-only-not-a-real-key'},'lifecycle-'+uid)
  const auth=initializeAuth(app,{persistence:inMemoryPersistence})
  connectAuthEmulator(auth,'http://127.0.0.1:10299',{disableWarnings:true})
  const db=initializeFirestore(app,{})
  connectFirestoreEmulator(db,host,9485)
  clients.push({auth,db,app})
  await signInWithEmailAndPassword(auth,email(uid),pw(uid))
  return {auth,db}
 }
 const token=c=>c.auth.currentUser.getIdToken()
 async function call(path,raw,body={}){
  const response=await fetch(origin+path,{method:'POST',headers:{'Content-Type':'application/json',...(raw?{Authorization:'Bearer '+raw}:{})},body:JSON.stringify(body)})
  assert.equal(response.headers.get('cache-control'),'no-store')
  return {status:response.status,data:await response.json()}
 }
 const idA='custom-qc-inspector',idB='custom-planning-reader',idC='custom-unused-officer'
 const create=(raw,name,permissions={})=>call(paths.rolesCreate,raw,{name,permissions})
 const preview=(raw,roleId)=>call(paths.rolesPreview,raw,{roleId})
 const update=(raw,roleId,expectedRevision,permissions,expectedMembers)=>call(paths.rolesUpdate,raw,{roleId,expectedRevision,permissions,expectedMembers})
 const drop=(raw,roleId,expectedRevision)=>call(paths.rolesDelete,raw,{roleId,expectedRevision,expectedMembers:[]})
 const assign=(raw,targetUid,expectedRevision,roleId)=>call(paths.rolesAssign,raw,{targetUid,expectedRevision,roleId})
 try{
  assert.equal((await authAdmin.listUsers(1)).users.length,0,'FRESH_AUTH_REQUIRED')
  for(const c of ['qc_uat_identities','users',prefix+'/role_catalog',prefix+'/role_tombstones',prefix+'/registration_requests',prefix+'/role_catalog_audit'])assert.equal((await adb.collection(c).limit(1).get()).size,0,'FRESH_FIRESTORE_REQUIRED')
  for(const uid of uidList){
   await authAdmin.createUser({uid,email:email(uid),password:pw(uid),emailVerified:true})
   await authAdmin.setCustomUserClaims(uid,{qcUat:true})
  }
  for(const uid of ['uat-owner','uat-member-a','uat-member-b','uat-viewer']){
   const role=uid==='uat-owner'?'owner':'pengunjung'
   await mark(uid).set({...marker(role),roleOverrides:{},manualOverrides:{},policyRevision:0})
  }
  await adb.doc('users/uat-prod').set({protected:true})
  await adb.doc('daily_plans/root-sentinel').set({protected:true})
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(httpPort,host,resolve)})
  const owner=await open('uat-owner'),a=await open('uat-member-a'),b=await open('uat-member-b'),viewer=await open('uat-viewer'),requester=await open('uat-requester'),prod=await open('uat-prod')
  const ot=await token(owner),at=await token(a),bt=await token(b),vt=await token(viewer),rt=await token(requester),pt=await token(prod)
  let definitionA,definitionB,definitionC
  await check('Owner creates custom roles with explicit defaults, no member marker mutation',async()=>{
   for(const [name,permissions,key] of [['QC Inspector',{qc_records:'view'},'a'],['Planning Reader',{data_plan_summary:'view'},'b'],['Unused Officer',{},'c']]){
    const r=await create(ot,name,permissions);assert.equal(r.status,200)
    if(key==='a')definitionA=r.data.role
    if(key==='b')definitionB=r.data.role
    if(key==='c')definitionC=r.data.role
   }
   assert.equal(definitionA.id,idA);assert.equal(definitionB.id,idB);assert.equal(definitionC.id,idC)
   assert.equal((await mark('uat-member-a').get()).data().role,'pengunjung')
  })
  await check('preview returns current revision and exact zero members only to Owner',async()=>{
   const r=await preview(ot,idA);assert.equal(r.status,200);assert.equal(r.data.preview.definition.revision,0);assert.deepEqual(r.data.preview.members,[])
   assert.equal((await preview(vt,idA)).status,403);assert.equal((await preview(pt,idA)).status,403)
   assert.equal((await preview('not-a-token',idA)).status,401);assert.equal((await preview(ot,'owner')).status,400)
  })
  await check('nonowner, forged field, builtin or unknown role changes denied',async()=>{
   assert.equal((await update(vt,idA,0,definitionA.permissions,[])).status,403)
   assert.equal((await drop(vt,idA,0)).status,403)
   assert.equal((await drop(ot,'owner',0)).status,400)
   assert.equal((await drop(ot,'custom-missing',0)).status,409)
   assert.equal((await call(paths.rolesUpdate,ot,{roleId:idA,expectedRevision:0,permissions:definitionA.permissions,expectedMembers:[],owner:true})).status,400)
  })
  await check('edit unused role commits new revision and immutable catalog audit',async()=>{
   const newPermissions={...definitionC.permissions,data_plan_actual:'view'}
   const r=await update(ot,idC,0,newPermissions,[]);assert.equal(r.status,200)
   assert.equal(r.data.update.affectedCount,0);assert.equal(r.data.update.definition.revision,1)
   assert.equal((await catalog(idC).get()).data().definition.revision,1)
   assert.equal((await roleAudit(idC+':1').get()).data().action,'edit_role')
   assert.equal((await update(ot,idC,0,newPermissions,[])).status,409)
  })
  await check('assignment preserves explicit manual override before role edit',async()=>{
   assert.equal((await assign(ot,'uat-member-a',0,idA)).status,200)
   assert.equal((await call(paths.patch,ot,{targetUid:'uat-member-b',expectedRevision:0,patch:{qc_records:'none'}})).status,200)
   assert.equal((await assign(ot,'uat-member-b',1,idA)).status,200)
   assert.equal((await mark('uat-member-b').get()).data().manualOverrides.qc_records,'none')
   assert.equal((await call(paths.session,at)).data.session.permissions.qc_records,'view')
  })
  await check('preview enumerates all affected members with exact policy revision',async()=>{
   const r=await preview(ot,idA);assert.equal(r.status,200)
   assert.deepEqual(r.data.preview.members,[{uid:'uat-member-a',policyRevision:1},{uid:'uat-member-b',policyRevision:2}])
  })
  await check('forged members, stale revision and partial permission maps denied without writes',async()=>{
   const perm={...definitionA.permissions,qc_records:'none',data_plan_summary:'view'}
   assert.equal((await update(ot,idA,0,perm,[])).status,409)
   assert.equal((await update(ot,idA,1,perm,[{uid:'uat-member-a',policyRevision:1},{uid:'uat-member-b',policyRevision:2}])).status,409)
   assert.equal((await update(ot,idA,0,{qc_records:'none'},[{uid:'uat-member-a',policyRevision:1},{uid:'uat-member-b',policyRevision:2}])).status,400)
   assert.equal((await catalog(idA).get()).data().definition.revision,0)
  })
  await check('atomic role edit recalculates every member and preserves overrides',async()=>{
   const perm={...definitionA.permissions,qc_records:'none',data_plan_summary:'view'}
   const members=[{uid:'uat-member-a',policyRevision:1},{uid:'uat-member-b',policyRevision:2}]
   const r=await update(ot,idA,0,perm,members);assert.equal(r.status,200);assert.equal(r.data.update.affectedCount,2)
   assert.equal(r.data.update.definition.revision,1)
   const ma=(await mark('uat-member-a').get()).data(),mb=(await mark('uat-member-b').get()).data()
   assert.equal(ma.policyRevision,2);assert.equal(mb.policyRevision,3)
   for(const m of [ma,mb]){assert.equal(m.permissions.qc_records,'none');assert.equal(m.permissions.data_plan_summary,'view')}
   assert.equal(mb.manualOverrides.qc_records,'none')
   assert.equal((await permissionAudit('uat-member-a',2).get()).data().action,'edit_role')
   assert.equal((await permissionAudit('uat-member-b',3).get()).data().action,'edit_role')
   assert.deepEqual((await roleAudit(idA+':1').get()).data().affectedUids,['uat-member-a','uat-member-b'])
  })
  await check('same Firebase Auth token reads newly revoked grants without relogin',async()=>{
   assert.equal((await call(paths.session,at)).data.session.permissions.qc_records,'none')
   assert.equal((await call(paths.session,bt)).data.session.permissions.data_plan_summary,'view')
   assert.equal((await update(ot,idA,0,definitionA.permissions,[])).status,409)
  })
  await check('audit collision aborts catalog and all member updates atomically',async()=>{
   const before=(await catalog(idA).get()).data().definition
   await roleAudit(idA+':2').create({collision:true})
   const p={...before.permissions,qc_records:'view'}
   const members=[{uid:'uat-member-a',policyRevision:2},{uid:'uat-member-b',policyRevision:3}]
   try{
    const result=await update(ot,idA,1,p,members)
    assert.notEqual(result.status,200)
    assert.equal((await catalog(idA).get()).data().definition.revision,1)
    assert.equal((await mark('uat-member-a').get()).data().policyRevision,2)
    assert.equal((await mark('uat-member-b').get()).data().policyRevision,3)
   }finally{await roleAudit(idA+':2').delete()}
   const result=await update(ot,idA,1,p,members);assert.equal(result.status,200);assert.equal(result.data.update.definition.revision,2)
  })
  await check('unresolved registration blocks edits and deletion of referenced role',async()=>{
   const r=await call(paths.registrationSubmit,rt,{requestedRoleId:idA});assert.equal(r.status,200)
   const current=(await catalog(idA).get()).data().definition
   assert.equal((await update(ot,idA,2,{...current.permissions,data_plan_daily:'view'},[{uid:'uat-member-a',policyRevision:3},{uid:'uat-member-b',policyRevision:4}])).status,409)
   assert.equal((await drop(ot,idA,2)).status,409)
   assert.equal((await call(paths.registrationReview,ot,{targetUid:'uat-requester',expectedRevision:0,decision:'reject',approvedRoleId:null})).status,200)
  })
  await check('Delete Role refuses assigned users and built-in roles',async()=>{
   assert.equal((await drop(ot,idA,2)).status,409)
   assert.equal((await drop(ot,idB,0)).status,200)
   assert.equal((await catalog(idB).get()).exists,false)
   assert.equal((await retired(idB).get()).data().lastRevision,0)
   assert.equal((await create(ot,'Planning Reader',{data_plan_summary:'view'})).status,409)
  })
  await check('reassign every member before retirement, preserving historical audit',async()=>{
   assert.equal((await assign(ot,'uat-member-a',3,'pengunjung')).status,200)
   assert.equal((await assign(ot,'uat-member-b',4,'pengunjung')).status,200)
   const p=await preview(ot,idA);assert.deepEqual(p.data.preview.members,[])
   const d=await drop(ot,idA,2);assert.equal(d.status,200);assert.equal(d.data.deleted.retired,true)
   assert.equal((await catalog(idA).get()).exists,false)
   assert.equal((await retired(idA).get()).data().definition.revision,2)
   assert.equal((await roleAudit(idA+':delete').get()).data().action,'delete_role')
   assert.equal((await create(ot,'QC Inspector',{qc_records:'view'})).status,409)
   assert.equal((await call(paths.session,at)).data.session.role,'pengunjung')
  })
  await check('current role cannot disappear while assigned and concurrent edits have one winner',async()=>{
   const r=await create(ot,'Final Auditor',{qc_logs:'view'});assert.equal(r.status,200)
   const id=r.data.role.id
   assert.equal((await assign(ot,'uat-member-a',4,id)).status,200)
   assert.equal((await drop(ot,id,0)).status,409)
   const previewed=(await preview(ot,id)).data.preview
   const next={...previewed.definition.permissions,qc_logs:'none'}
   const votes=await Promise.all([update(ot,id,0,next,previewed.members),update(ot,id,0,next,previewed.members)])
   assert.equal(votes.filter(v=>v.status===200).length,1)
   assert.equal((await catalog(id).get()).data().definition.revision,1)
   assert.equal((await mark('uat-member-a').get()).data().policyRevision,6)
  })
  await check('direct browser Firestore writes denied and production root untouched',async()=>{
   const ref=doc(viewer.db,'qc_uat_workspaces','cutover','role_tombstones',idA)
   await assert.rejects(getDocFromServer(ref),{code:'permission-denied'})
   await assert.rejects(setDoc(ref,{deletedBy:'uat-viewer'}),{code:'permission-denied'})
   assert.deepEqual((await adb.doc('users/uat-prod').get()).data(),{protected:true})
   assert.deepEqual((await adb.doc('daily_plans/root-sentinel').get()).data(),{protected:true})
  })
  await check('Owner revocation on existing token denies lifecycle operations',async()=>{
   await mark('uat-owner').update({enabled:false})
   assert.equal((await preview(ot,'custom-final-auditor')).status,403)
   assert.equal((await drop(ot,'custom-final-auditor',1)).status,403)
   await mark('uat-owner').update({enabled:true})
   assert.equal((await preview(ot,'custom-final-auditor')).status,200)
  })
  console.log('SUCCESS: '+n+' Custom role lifecycle integration checks passed (Firebase Auth + Firestore emulator)')
 }finally{
  if(server.listening)await new Promise(resolve=>server.close(resolve))
  for(const c of clients){await signOut(c.auth);await terminate(c.db);await deleteApp(c.app)}
  await adb.terminate();await adminDelete(admin)
 }
}
