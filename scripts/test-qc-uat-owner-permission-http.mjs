import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {createRequire} from 'node:module'
import {marker} from '../src/qcUatRolePermissions.mjs'
import {createUatSession} from '../src/qcUatSessionPermissions.mjs'
import {projectId,host,firestorePort,authPort,httpPort,origin,paths,guard,createOwnerService,createOwnerHttp} from '../server/qc-photo-access/uat-owner-permission-http.mjs'
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8')
const config=JSON.parse(read('firebase.uat-owner-permission-http.json'))
const valid={GCLOUD_PROJECT:projectId,FIRESTORE_EMULATOR_HOST:host+':'+firestorePort,FIREBASE_AUTH_EMULATOR_HOST:host+':'+authPort}
guard(valid)
for(const e of [{},{...valid,GCLOUD_PROJECT:'form-qc-unm'},{...valid,FIRESTORE_EMULATOR_HOST:'remote:9485'},{...valid,FIREBASE_AUTH_EMULATOR_HOST:'remote:10299'},{...valid,GOOGLE_CLOUD_PROJECT:'form-qc-unm'}])assert.throws(()=>guard(e))
assert.equal(config.firestore.rules,'scripts/firestore.uat-role-demo.rules')
assert.deepEqual(config.emulators.firestore,{host,port:firestorePort});assert.deepEqual(config.emulators.auth,{host,port:authPort})
for(const path of ['src/App.tsx','src/NativeUsersAccess.tsx','server/qc-photo-access/index.mjs','server/qc-photo-access/nativeAdminHttp.mjs'])assert.doesNotMatch(read(path),/uat-owner-permission-http/)
assert.ok(process.argv.length===3&&['--self-test','--emulator'].includes(process.argv[2]))
console.log('SUCCESS: Owner HTTP demo project, loopback and production isolation guards passed (offline)')
if(process.argv[2]==='--emulator'){
 guard()
 const require=createRequire(new URL('../server/qc-photo-access/package.json',import.meta.url))
 const {initializeApp:adminInit,deleteApp:adminDelete}=require('firebase-admin/app')
 const {getAuth}=require('firebase-admin/auth'),{getFirestore}=require('firebase-admin/firestore')
 const {initializeApp,deleteApp}=await import('firebase/app')
 const {initializeAuth,inMemoryPersistence,connectAuthEmulator,signInWithEmailAndPassword,signOut}=await import('firebase/auth')
 const {initializeFirestore,connectFirestoreEmulator,doc,getDocFromServer,setDoc,terminate}=await import('firebase/firestore')
 const admin=adminInit({projectId},'owner-http-demo'),authAdmin=getAuth(admin),adb=getFirestore(admin)
 const server=createOwnerHttp(createOwnerService({adb,authAdmin}))
 const clients=[],prefix='qc_uat_workspaces/cutover',mark=k=>adb.doc('qc_uat_identities/'+k),audit=()=>adb.collection(prefix+'/permission_audit').get()
 const specs=[['uat-owner','owner',true,true],['uat-other-owner','owner',true,true],['uat-disabled','owner',true,false],['uat-no-claim','owner',false,true],['uat-prod','owner',true,true],['uat-spray','mandor_spraying',true,true],['uat-spray-b','mandor_spraying',true,true],['uat-fert','mandor_fertilizer',true,true],['uat-prod-target','mandor_spraying',true,true]]
 const email=uid=>uid+'@owner-http.example.test',password=uid=>'Synthetic-only-2026-'+uid
 let n=0
 const check=async(name,fn)=>{try{await fn()}catch(e){throw Error('FAIL: '+name,{cause:e})}n++;console.log('PASS: '+name)}
 async function open(uid){
  const app=initializeApp({projectId,apiKey:'demo-only-not-a-real-key'},crypto.randomUUID())
  const auth=initializeAuth(app,{persistence:inMemoryPersistence});connectAuthEmulator(auth,'http://'+host+':'+authPort,{disableWarnings:true})
  const db=initializeFirestore(app,{});connectFirestoreEmulator(db,host,firestorePort);clients.push({app,auth,db})
  await signInWithEmailAndPassword(auth,email(uid),password(uid));return {auth,db}
 }
 const token=c=>c.auth.currentUser.getIdToken()
 async function call(path,t,body={},extra={}){
  const response=await fetch(origin+path,{method:'POST',headers:{'Content-Type':'application/json',...(t?{Authorization:'Bearer '+t}:{}),...extra},body:JSON.stringify(body)})
  assert.equal(response.headers.get('cache-control'),'no-store')
  return {status:response.status,data:await response.json()}
 }
 const input=(revision=0,patch={qc_spraying:'view'},targetUid='uat-spray')=>({targetUid,expectedRevision:revision,patch})
 const readMarker=async uid=>(await mark(uid).get()).data()
 try{
  assert.equal((await authAdmin.listUsers(1)).users.length,0,'FRESH_AUTH_REQUIRED')
  for(const col of ['qc_uat_identities','users','daily_plans',prefix+'/permission_audit',prefix+'/daily_plans'])assert.equal((await adb.collection(col).limit(1).get()).size,0,'FRESH_FIRESTORE_REQUIRED')
  for(const [uid,role,claim,enabled] of specs){
   await authAdmin.createUser({uid,email:email(uid),password:password(uid),emailVerified:true})
   if(claim)await authAdmin.setCustomUserClaims(uid,{qcUat:true})
   const manualOverrides=uid==='uat-spray'?{qc_records:'none'}:{}
   await mark(uid).set({...marker(role,{},manualOverrides,enabled),manualOverrides,roleOverrides:{},policyRevision:0})
   if(uid==='uat-prod'||uid==='uat-prod-target')await adb.doc('users/'+uid).set({active:true})
  }
  await adb.doc('daily_plans/root-sentinel').set({rootSentinel:true})
  await adb.doc(prefix+'/daily_plans/uat-d-spray').set({testOnly:true,formType:'spray',area100:300})
  const owner=await open('uat-owner'),spray=await open('uat-spray'),spray2=await open('uat-spray'),disabled=await open('uat-disabled'),noClaim=await open('uat-no-claim'),prod=await open('uat-prod')
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(httpPort,host,resolve)})
  const ot=await token(owner)
  const patch=(v)=>call(paths.patch,ot,v)
  const dp=c=>doc(c.db,'qc_uat_workspaces','cutover','daily_plans','uat-d-spray')
  await check('fixed route and origin reject unknown and foreign requests',async()=>{
   assert.equal((await call('/legacy',ot)).status,404);assert.equal((await call(paths.list,ot,{}, {Origin:'https://example.test'})).status,403)
   assert.equal((await fetch(origin+paths.list)).status,405)
  })
  await check('missing invalid and claimless token denied',async()=>{
   assert.equal((await call(paths.list,null)).status,401);assert.equal((await call(paths.list,'bad')).status,401);assert.equal((await call(paths.list,await token(noClaim))).status,403)
  })
  await check('non-owner disabled and production owner denied on both routes',async()=>{
   for(const c of [spray,disabled,prod]){const t=await token(c);assert.equal((await call(paths.list,t)).status,403);assert.equal((await call(paths.patch,t,input())).status,403)}
  })
  await check('owner list excludes all owners and production target; only safe fields',async()=>{
   const a=await call(paths.list,ot);assert.equal(a.status,200);assert.deepEqual(a.data.rows.map(r=>r.uid).sort(),['uat-fert','uat-spray','uat-spray-b'])
   for(const r of a.data.rows)assert.deepEqual(Object.keys(r).sort(),['uid','role','enabled','policyRevision','manualOverrides','permissions'].sort())
  })
  await check('forged actor self other owner and production targets denied',async()=>{
   assert.equal((await patch({...input(),actorUid:'uat-owner'})).status,400)
   for(const uid of ['uat-owner','uat-other-owner','uat-prod-target','uat-missing'])assert.equal((await patch(input(0,{qc_spraying:'none'},uid))).status,403)
   assert.equal((await audit()).size,0)
  })
  await check('unknown menu invalid mode and empty patch rejected',async()=>{
   for(const p of [{role:'edit'},{qc_spraying:'admin'},{}])assert.equal((await patch(input(0,p))).status,400)
   assert.equal((await audit()).size,0)
  })
  const sessionA=createUatSession({currentUser:()=>spray.auth.currentUser}),sessionB=createUatSession({currentUser:()=>spray2.auth.currentUser})
  await check('session endpoint returns own effective permissions only',async()=>{
   assert.equal((await call(paths.session,ot)).status,200)
   const a=await call(paths.session,await token(spray));assert.equal(a.status,200);assert.equal(a.data.session.uid,'uat-spray');assert.deepEqual(Object.keys(a.data.session).sort(),['uid','role','policyRevision','permissions'].sort())
   assert.equal((await call(paths.session,await token(spray),{targetUid:'uat-fert'})).status,400)
   await sessionA.refresh();await sessionB.refresh();assert.equal(sessionA.canEdit('qc_spraying'),true);assert.equal(sessionB.canView('qc_records'),false)
  })
  await check('session rejects disabled claimless production and invalid token',async()=>{
   for(const c of [disabled,noClaim,prod])assert.equal((await call(paths.session,await token(c))).status,403)
   assert.equal((await call(paths.session,'bad')).status,401)
  })
  await check('manual view committed atomically and other user unchanged',async()=>{
   const a=await patch(input());assert.equal(a.status,200);assert.equal(a.data.row.policyRevision,1);assert.equal(a.data.row.permissions.qc_spraying,'view')
   const m=await readMarker('uat-spray');assert.equal(m.manualOverrides.qc_records,'none');assert.equal((await readMarker('uat-spray-b')).permissions.qc_spraying,'edit')
   const log=(await adb.doc(prefix+'/permission_audit/uat-spray:1').get()).data();assert.equal(log.actorUid,'uat-owner');assert.deepEqual(log.patch,{qc_spraying:'view'})
  })
  await check('both session adapters refresh to view using existing auth',async()=>{
   await sessionA.refresh();await sessionB.refresh()
   for(const s of [sessionA,sessionB]){assert.equal(s.snapshot().policyRevision,1);assert.equal(s.canView('qc_spraying'),true);assert.equal(s.canEdit('qc_spraying'),false);assert.equal(s.canView('qc_records'),false)}
  })
  await check('stale patch rejected with no audit or marker mutation',async()=>{
   const before=await readMarker('uat-spray');assert.equal((await patch(input(0,{qc_spraying:'edit'}))).status,409);assert.deepEqual(await readMarker('uat-spray'),before);assert.equal((await audit()).size,1)
  })
  await check('concurrent same revision has exactly one winner',async()=>{
   const rs=await Promise.all([patch(input(1,{qc_spraying:'edit'})),patch(input(1,{qc_spraying:'none'}))])
   assert.deepEqual(rs.map(r=>r.status).sort(),[200,409]);assert.equal((await readMarker('uat-spray')).policyRevision,2);assert.equal((await audit()).size,2)
  })
  await check('manual none blocks both existing client sessions without token refresh',async()=>{
   assert.equal((await patch(input(2,{qc_spraying:'none'}))).status,200)
   for(const c of [spray,spray2])await assert.rejects(getDocFromServer(dp(c)),{code:'permission-denied'})
   assert.equal((await readMarker('uat-spray')).manualOverrides.qc_records,'none')
  })
  await check('session refresh and relogin retain manual none',async()=>{
   await sessionA.refresh();assert.equal(sessionA.access('qc_spraying'),'none')
   await signOut(spray2.auth);sessionB.reset();assert.equal(sessionB.snapshot(),null)
   await signInWithEmailAndPassword(spray2.auth,email('uat-spray'),password('uat-spray'));sessionB.reset();await sessionB.refresh()
   assert.equal(sessionB.snapshot().policyRevision,3);assert.equal(sessionB.canView('qc_spraying'),false)
  })
  await check('audit collision rolls back permission change',async()=>{
   const before=await readMarker('uat-spray');await adb.doc(prefix+'/permission_audit/uat-spray:4').create({collision:true})
   assert.equal((await patch(input(3,{qc_spraying:'edit'}))).status,500);assert.deepEqual(await readMarker('uat-spray'),before)
   assert.deepEqual((await adb.doc(prefix+'/permission_audit/uat-spray:4').get()).data(),{collision:true})
  })
  await check('client owner cannot read or write marker or audit directly',async()=>{
   for(const path of [['qc_uat_identities','uat-spray'],['qc_uat_workspaces','cutover','permission_audit','uat-spray:1']]){
    const ref=doc(owner.db,...path);await assert.rejects(getDocFromServer(ref),{code:'permission-denied'});await assert.rejects(setDoc(ref,{fake:true}),{code:'permission-denied'})
   }
  })
  await check('owner revocation blocks existing token and root remains untouched',async()=>{
   const before=await readMarker('uat-spray');await mark('uat-owner').update({enabled:false})
   assert.equal((await call(paths.list,ot)).status,403);assert.equal((await patch(input(3,{qc_spraying:'edit'}))).status,403)
   assert.deepEqual(await readMarker('uat-spray'),before);assert.deepEqual((await adb.doc('daily_plans/root-sentinel').get()).data(),{rootSentinel:true})
  })
  await check('revoked owner session denied and client clears access',async()=>{
   const own=createUatSession({currentUser:()=>owner.auth.currentUser});assert.equal(await own.refresh(),null);assert.equal(own.canEdit('qc_spraying'),false)
   assert.equal((await call(paths.session,ot)).status,403)
  })
  console.log('SUCCESS: '+n+' Owner HTTP permission and real Auth/Firestore transaction checks (dedicated demo only)')
 }finally{
  if(server.listening)await new Promise(resolve=>server.close(resolve))
  for(const c of clients){try{await signOut(c.auth)}finally{try{await terminate(c.db)}finally{await deleteApp(c.app)}}}
  await adb.terminate();await adminDelete(admin)
 }
}
