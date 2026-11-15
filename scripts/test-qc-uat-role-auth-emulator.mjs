// Real Auth Emulator ID tokens only. Dedicated demo project; not an HTTP service or production adapter.
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {createRequire} from 'node:module'
import {marker} from '../src/qcUatRolePermissions.mjs'
import {ownerPermissionChange} from '../src/qcUatOwnerPermissionContract.mjs'
import {commitSyntheticQc} from '../src/qcUatQcLifecycleContract.mjs'
const projectId='demo-qc-uat-role-auth',host='127.0.0.1',port=8485,authPort=9299
const config=JSON.parse(readFileSync(new URL('../firebase.uat-role-auth-emulator.json',import.meta.url),'utf8'))
function guard(e=process.env){
 assert.equal(e.GCLOUD_PROJECT,projectId,'DEMO_PROJECT_REQUIRED')
 assert.equal(e.FIRESTORE_EMULATOR_HOST,host+':'+port,'FIRESTORE_LOOPBACK_REQUIRED')
 assert.equal(e.FIREBASE_AUTH_EMULATOR_HOST,host+':'+authPort,'AUTH_LOOPBACK_REQUIRED')
 for(const k of ['GOOGLE_CLOUD_PROJECT','FIREBASE_PROJECT_ID'])if(e[k])assert.equal(e[k],projectId,'WRONG_PROJECT')
}
const valid={GCLOUD_PROJECT:projectId,FIRESTORE_EMULATOR_HOST:host+':'+port,FIREBASE_AUTH_EMULATOR_HOST:host+':'+authPort}
assert.ok(process.argv.length===3&&['--self-test','--emulator'].includes(process.argv[2]))
guard(valid)
for(const e of [{},{...valid,GCLOUD_PROJECT:'form-qc-unm'},{...valid,FIRESTORE_EMULATOR_HOST:'remote:8485'},{...valid,FIREBASE_AUTH_EMULATOR_HOST:'127.0.0.1:9199'},{...valid,GOOGLE_CLOUD_PROJECT:'form-qc-unm'}])assert.throws(()=>guard(e))
assert.equal(config.firestore.rules,'scripts/firestore.uat-role-demo.rules')
assert.deepEqual(config.emulators.firestore,{host,port})
assert.deepEqual(config.emulators.auth,{host,port:authPort})
console.log('SUCCESS: role Auth demo project and loopback guards passed (offline)')
if(process.argv[2]==='--emulator'){
 guard()
 const {initializeApp,deleteApp}=await import('firebase/app')
 const {initializeAuth,inMemoryPersistence,connectAuthEmulator,signInWithEmailAndPassword,signOut}=await import('firebase/auth')
 const {initializeFirestore,connectFirestoreEmulator,doc,getDocFromServer,setDoc,runTransaction,terminate}=await import('firebase/firestore')
 const require=createRequire(new URL('../server/qc-photo-access/package.json',import.meta.url))
 const {initializeApp:adminInit,deleteApp:adminDelete}=require('firebase-admin/app')
 const {getAuth}=require('firebase-admin/auth')
 const {getFirestore}=require('firebase-admin/firestore')
 const admin=adminInit({projectId},'role-auth-demo-admin'),authAdmin=getAuth(admin),adb=getFirestore(admin)
 const prefix='qc_uat_workspaces/cutover'
 const clients=[]
 const specs={
  owner:{role:'owner',claim:true},spray:{role:'mandor_spraying',claim:true},fert:{role:'mandor_fertilizer',claim:true},
  visitor:{role:'pengunjung',claim:true},stale:{role:'mandor_spraying',claim:false},disabled:{role:'owner',claim:true,enabled:false},
  prod:{role:'owner',claim:true,prod:true}
 }
 const uid=k=>'uat-'+k
 const email=k=>k+'@qc-role-auth.example.test'
 const password=k=>'Synthetic-role-auth-only-'+k+'-2026'
 const markRef=k=>adb.doc('qc_uat_identities/'+k)
 const policyAudit=(k,r)=>adb.doc(prefix+'/permission_audit/'+k+':'+r)
 const ref=(c,id)=>adb.doc(prefix+'/'+c+'/'+id)
 const read=async(c,id)=>{const s=await ref(c,id).get();return s.exists?s.data():null}
 const qc=(k='spray',kind='spray',id='uat-q-'+k)=>({testOnly:true,id,ownerUid:uid(k),inputtedBy:uid(k),formType:kind,clientRevision:'uat-r1',saveType:'ready',dailyPlanId:'uat-d-'+kind,monthlyPlanLineId:'uat-m-'+kind,pid:'uat-pid',date:'2026-11-12',shift:'2',foreman:'uat-foreman',actualArea100:250,sessionId:'uat-session'})
 const daily=r=>({testOnly:true,dailyPlanId:r.dailyPlanId,monthlyPlanLineId:r.monthlyPlanLineId,pid:r.pid,date:r.date,shift:r.shift,foreman:r.foreman,formType:r.formType,area100:300})
 const path=(c,col,id)=>doc(c.db,'qc_uat_workspaces','cutover',col,id)
 async function open(k){
  guard()
  const app=initializeApp({projectId,apiKey:'demo-only-not-a-real-key'},'role-auth-'+crypto.randomUUID())
  const auth=initializeAuth(app,{persistence:inMemoryPersistence});connectAuthEmulator(auth,'http://'+host+':'+authPort,{disableWarnings:true})
  const db=initializeFirestore(app,{});connectFirestoreEmulator(db,host,port)
  const c={app,auth,db,k};clients.push(c)
  const {user}=await signInWithEmailAndPassword(auth,email(k),password(k))
  assert.equal(user.uid,uid(k));return c
 }
 const get=(c,col,id)=>getDocFromServer(path(c,col,id))
 const denied=fn=>assert.rejects(fn,{code:'permission-denied'})
 const run=(c,r,baseRevision=null,jobId='uat-j1')=>{guard();return commitSyntheticQc({record:r,baseRevision,jobId,uploaderUid:r.ownerUid},{
  currentUid:async()=>c.auth.currentUser?.uid??null,
  transaction:fn=>runTransaction(c.db,async t=>{
   const readDoc=async(col,id)=>{const s=await t.get(path(c,col,id));return s.exists()?s.data():null}
   return fn({readQc:id=>readDoc('qc_records',id),readActual:id=>readDoc('daily_reports',id),readAudit:id=>readDoc('qc_operational_audit',id),readDaily:id=>readDoc('daily_plans',id),writeQc:(id,r)=>t.set(path(c,'qc_records',id),r),writeActual:(id,r)=>t.set(path(c,'daily_reports',id),r),writeAudit:(id,r)=>t.set(path(c,'qc_operational_audit',id),r)})
  })
 })}
 // Trusted service simulation. Never accept caller-supplied actor UID or role.
 async function changePermissions(token,input){
  guard()
  const decoded=await authAdmin.verifyIdToken(token,true)
  assert.match(decoded.uid,/^uat-[a-z0-9-]{1,60}$/)
  assert.match(input.targetUid,/^uat-[a-z0-9-]{1,60}$/)
  return adb.runTransaction(async tx=>{
   const [actor,target,actorProfile,targetProfile]=await Promise.all([tx.get(markRef(decoded.uid)),tx.get(markRef(input.targetUid)),tx.get(adb.doc('users/'+decoded.uid)),tx.get(adb.doc('users/'+input.targetUid))])
   const result=ownerPermissionChange(input,{actorUid:decoded.uid,claim:decoded.qcUat===true,actor:actor.data(),target:target.data(),actorProductionProfile:actorProfile.exists,targetProductionProfile:targetProfile.exists})
   tx.update(markRef(input.targetUid),{manualOverrides:result.next.manualOverrides,permissions:result.next.permissions,policyRevision:result.next.policyRevision})
   tx.create(policyAudit(input.targetUid,result.next.policyRevision),result.audit)
   return result.next.policyRevision
  })
 }
 let n=0
 const check=async(name,fn)=>{try{await fn()}catch(e){throw Error('FAIL: '+name,{cause:e})}n++;console.log('PASS: '+name)}
 try{
  assert.equal((await authAdmin.listUsers(1)).users.length,0,'FRESH_AUTH_REQUIRED')
  for(const col of ['qc_uat_identities','users','daily_plans',prefix+'/qc_records',prefix+'/daily_reports',prefix+'/qc_operational_audit',prefix+'/daily_plans',prefix+'/permission_audit'])assert.equal((await adb.collection(col).limit(1).get()).size,0,'FRESH_FIRESTORE_REQUIRED')
  for(const [k,s] of Object.entries(specs)){
   await authAdmin.createUser({uid:uid(k),email:email(k),password:password(k),emailVerified:true})
   if(s.claim)await authAdmin.setCustomUserClaims(uid(k),{qcUat:true})
   await markRef(uid(k)).set({...marker(s.role,{}, {},s.enabled!==false),roleOverrides:{},manualOverrides:{},policyRevision:0})
   if(s.prod)await adb.doc('users/'+uid(k)).set({active:true})
  }
  await adb.doc('daily_plans/root-sentinel').set({testOnly:false,rootSentinel:true})
  for(const r of [qc(),qc('fert','fertilizer')])await ref('daily_plans',r.dailyPlanId).set(daily(r))
  const owner=await open('owner'),spray=await open('spray'),spray2=await open('spray'),fert=await open('fert'),visitor=await open('visitor'),stale=await open('stale'),disabled=await open('disabled'),prod=await open('prod')
  const token=c=>c.auth.currentUser.getIdToken()
  const q=qc(),aid='qcactual_'+q.id
  await check('real Auth token contains correct UID and UAT claim',async()=>{const t=await authAdmin.verifyIdToken(await token(spray),true);assert.equal(t.uid,'uat-spray');assert.equal(t.qcUat,true)})
  await check('real Auth spray commits QC Actual audit',async()=>{await run(spray,q);assert.equal((await read('daily_reports',aid)).actualArea100,250);assert.equal((await read('qc_operational_audit',q.id+':uat-r1')).actorUid,'uat-spray')})
  await check('real Auth fertilizer commits own pair',async()=>{const r=qc('fert','fertilizer');await run(fert,r);assert.equal((await read('daily_reports','qcactual_'+r.id)).qcFormType,'fertilizer')})
  await check('visitor reads QC and cannot create form',async()=>{assert.equal((await get(visitor,'qc_records',q.id)).data().id,q.id);await denied(()=>run(visitor,qc('visitor')))})
  await check('stale claim disabled and production profile denied',async()=>{for(const c of [stale,disabled,prod])await denied(()=>get(c,'qc_records',q.id))})
  await check('non-owner cannot use permission service',async()=>assert.rejects(changePermissions(await token(spray),{targetUid:'uat-fert',expectedRevision:0,patch:{qc_spraying:'edit'}}),/OWNER_REQUIRED/))
  await check('invalid token denied',()=>assert.rejects(changePermissions('not-a-token',{targetUid:'uat-spray',expectedRevision:0,patch:{qc_spraying:'view'}})))
  await check('owner cannot change own marker or production target',async()=>{const t=await token(owner);await assert.rejects(changePermissions(t,{targetUid:'uat-owner',expectedRevision:0,patch:{qc_spraying:'none'}}),/SELF_PERMISSION_CHANGE_DENIED/);await assert.rejects(changePermissions(t,{targetUid:'uat-prod',expectedRevision:0,patch:{qc_spraying:'none'}}),/TARGET_NOT_ELIGIBLE/)})
  await check('owner changes form permission to view',async()=>{assert.equal(await changePermissions(await token(owner),{targetUid:'uat-spray',expectedRevision:0,patch:{qc_spraying:'view',qc_records:'none'}}),1);const m=(await markRef('uat-spray').get()).data();assert.equal(m.permissions.qc_spraying,'view');assert.equal(m.manualOverrides.qc_records,'none');assert.equal((await policyAudit('uat-spray',1).get()).data().actorUid,'uat-owner')})
  await check('existing sessions immediately lose form edit',async()=>{for(const c of [spray,spray2]){assert.equal((await get(c,'daily_plans',q.dailyPlanId)).data().area100,300);await denied(()=>run(c,{...q,clientRevision:'uat-r2'},'uat-r1','uat-j2'))}assert.equal((await read('qc_records',q.id)).clientRevision,'uat-r1')})
  await check('relogin preserves manual view',async()=>{await signOut(spray2.auth);await signInWithEmailAndPassword(spray2.auth,email('spray'),password('spray'));await denied(()=>run(spray2,{...q,clientRevision:'uat-r2'},'uat-r1','uat-j2'))})
  await check('stale permission update rejected',async()=>assert.rejects(changePermissions(await token(owner),{targetUid:'uat-spray',expectedRevision:0,patch:{qc_spraying:'edit'}}),/PERMISSION_REVISION_CONFLICT/))
  await check('owner restores edit and preserves other manual none',async()=>{assert.equal(await changePermissions(await token(owner),{targetUid:'uat-spray',expectedRevision:1,patch:{qc_spraying:'edit'}}),2);const m=(await markRef('uat-spray').get()).data();assert.equal(m.permissions.qc_records,'none');assert.equal(m.permissions.qc_spraying,'edit')})
  await check('two real Auth sessions conflicting revisions one wins',async()=>{const a={...q,clientRevision:'uat-r2a',actualArea100:310},b={...q,clientRevision:'uat-r2b',actualArea100:320};const rs=await Promise.allSettled([run(spray,a,'uat-r1','uat-j2a'),run(spray2,b,'uat-r1','uat-j2b')]);assert.equal(rs.filter(x=>x.status==='fulfilled').length,1);const failure=rs.find(x=>x.status==='rejected');assert.match(String(failure.reason),/QC_REVISION_CONFLICT/);const stored=await read('qc_records',q.id),actual=await read('daily_reports',aid);assert.ok(['uat-r2a','uat-r2b'].includes(stored.clientRevision));assert.equal(actual.clientRevision,stored.clientRevision);assert.equal(actual.actualArea100,stored.actualArea100);assert.equal((await read('qc_operational_audit',q.id+':'+stored.clientRevision)).revision,stored.clientRevision);const loser=stored.clientRevision==='uat-r2a'?'uat-r2b':'uat-r2a';assert.equal(await read('qc_operational_audit',q.id+':'+loser),null)})
  await check('same transaction replay after concurrent winner',async()=>{const stored=await read('qc_records',q.id),r={...q,clientRevision:stored.clientRevision,actualArea100:stored.actualArea100};await run(spray2,r,'uat-r1',stored.operationalSaveId);assert.deepEqual(await read('qc_records',q.id),stored)})
  await check('manual none takes effect on both sessions',async()=>{await changePermissions(await token(owner),{targetUid:'uat-spray',expectedRevision:2,patch:{qc_spraying:'none'}});for(const c of [spray,spray2])await denied(()=>get(c,'daily_plans',q.dailyPlanId));assert.equal((await markRef('uat-spray').get()).data().permissions.qc_spraying,'none')})
  await check('client Owner cannot write marker or permission audit',async()=>{await denied(()=>setDoc(doc(owner.db,'qc_uat_identities','uat-spray'),marker('owner')));await denied(()=>setDoc(path(owner,'permission_audit','uat-fake'),{testOnly:true}))})
  await check('signed-out session denied',async()=>{await signOut(fert.auth);await denied(()=>get(fert,'daily_plans','uat-d-fertilizer'))})
  await check('root sentinel unchanged',async()=>assert.deepEqual((await adb.doc('daily_plans/root-sentinel').get()).data(),{testOnly:false,rootSentinel:true}))
  console.log('SUCCESS: '+n+' real Auth, Owner permission and concurrent transaction checks passed (dedicated demo emulators only)')
 }finally{
  for(const c of clients){try{await signOut(c.auth)}finally{try{await terminate(c.db)}finally{await deleteApp(c.app)}}}
  await adb.terminate()
  await adminDelete(admin)
 }
}
