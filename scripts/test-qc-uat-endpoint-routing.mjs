import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {createRequire} from 'node:module'
import {randomUUID} from 'node:crypto'
import {endpointOrigin,endpointPaths,endpointUrl,callUatEndpoint} from '../src/qcUatEndpointRouting.mjs'
import {createUatEndpointServer,actorAllowed,editAllowed,readAllowed,exact,slotAllowed} from '../server/qc-photo-access/uat-endpoint-server.mjs'
import {marker} from '../src/qcUatRolePermissions.mjs'
import {prepareStrictJob} from '../src/qcUatStrictQueueContract.mjs'
const roles=["owner","asisten","manager","admin","mandor_spraying","mandor_fertilizer","pengunjung"]
function policyTests(){
 let n=0;const check=x=>{if(!x)throw Error('POLICY_TEST');n++}
 const m={testOnly:true,workspace:'cutover',enabled:true,role:'mandor_spraying',permissions:{qc_spraying:'edit',qc_records:'view'}},q={testOnly:true,id:'uat-q1',ownerUid:'uat-spray',formType:'spray'}
 check(actorAllowed('uat-spray',true,m,false));check(!actorAllowed('uat-spray',false,m,false));check(!actorAllowed('uat-spray',true,m,true));check(!actorAllowed('real-user',true,m,false));check(!actorAllowed('uat-spray',true,{...m,enabled:false},false));check(!actorAllowed('uat-spray',true,{...m,workspace:'root'},false));check(!actorAllowed('uat-spray',true,{...m,role:'unknown'},false));check(!actorAllowed('uat-spray',true,{...m,permissions:[]},false));
 check(editAllowed('uat-spray',m,q));check(!editAllowed('uat-other',m,q));check(!editAllowed('uat-spray',m,{...q,formType:'fertilizer'}));check(!editAllowed('uat-spray',{...m,permissions:{qc_spraying:'view'}},q));check(!editAllowed('uat-spray',{...m,permissions:{qc_spraying:'none'}},q));check(readAllowed('uat-spray',m,q));check(!readAllowed('uat-other',m,q));check(readAllowed('uat-view',{...m,role:'pengunjung',permissions:{qc_records:'view'}},q));check(!readAllowed('uat-view',{...m,role:'pengunjung',permissions:{qc_records:'none'}},q));check(!readAllowed('uat-spray',m,{...q,testOnly:false}));check(!readAllowed('uat-spray',m,{...q,formType:'unknown'}));check(exact({recordId:'uat-q1',slot:'main'},['recordId','slot']));check(!exact({recordId:'uat-q1',slot:'main',path:'foreign'},['recordId','slot']));check(slotAllowed('hold_uat-h1'));check(!slotAllowed('../main'));return n
}

const projectId='demo-qc-uat-endpoint',host='127.0.0.1',firestorePort=8885,authPort=9699
const config=JSON.parse(readFileSync(new URL('../firebase.uat-endpoint-emulator.json',import.meta.url),'utf8'))
const source=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8')
function guard(e){
 assert.equal(e.GCLOUD_PROJECT,projectId)
 assert.equal(e.FIRESTORE_EMULATOR_HOST,host+':'+firestorePort)
 assert.equal(e.FIREBASE_AUTH_EMULATOR_HOST,host+':'+authPort)
 for(const k of ['GOOGLE_CLOUD_PROJECT','FIREBASE_PROJECT_ID'])if(e[k])assert.equal(e[k],projectId)
}
const env={GCLOUD_PROJECT:projectId,FIRESTORE_EMULATOR_HOST:host+':'+firestorePort,FIREBASE_AUTH_EMULATOR_HOST:host+':'+authPort}
guard(env)
for(const e of [{},{...env,GCLOUD_PROJECT:'form-qc-unm'},{...env,FIRESTORE_EMULATOR_HOST:'remote:8885'},{...env,FIREBASE_AUTH_EMULATOR_HOST:'127.0.0.1:9599'}])assert.throws(()=>guard(e))
assert.equal(config.firestore.rules,'scripts/firestore.uat-strict-integration-demo.rules')
assert.deepEqual(config.emulators.firestore,{host,port:firestorePort})
assert.deepEqual(config.emulators.auth,{host,port:authPort})
assert.match(source('src/firebase.ts'),/QC_HOSTED_UAT_ISOLATION_REQUIRED/)
assert.match(source('supabase/functions/_shared/qcPhotoUat.ts'),/daily-plan-and-report-unm/)
assert.doesNotMatch(source('src/main.tsx'),/qcUatEndpointRouting/)
assert.equal(endpointUrl('upload'),endpointOrigin+endpointPaths.upload)
for(const value of ['https://tcmtqgbpafwciaflgsaa.supabase.co','http://localhost:4485','http://127.0.0.1:4485/'])assert.throws(()=>endpointUrl('sign',value),/UAT_ROUTE_DENIED/)
assert.throws(()=>endpointUrl('constructor'),/UAT_ROUTE_DENIED/)
assert.ok(process.argv.length===3&&['--self-test','--emulator'].includes(process.argv[2]))
console.log('SUCCESS: '+policyTests()+' endpoint authorization policy checks (offline)')
console.log('SUCCESS: fixed route, demo emulator and production hold guards passed (offline)')
if(process.argv[2]==='--emulator'){
 guard(process.env)
 const require=createRequire(new URL('../server/qc-photo-access/package.json',import.meta.url))
 const {initializeApp:adminInit,deleteApp:adminDelete}=require('firebase-admin/app')
 const {getAuth}=require('firebase-admin/auth')
 const {getFirestore}=require('firebase-admin/firestore')
 const {initializeApp,deleteApp}=await import('firebase/app')
 const {initializeAuth,inMemoryPersistence,connectAuthEmulator,signInWithEmailAndPassword,signOut}=await import('firebase/auth')
 const admin=adminInit({projectId},'endpoint-demo-admin'),authAdmin=getAuth(admin),db=getFirestore(admin)
 const prefix='qc_uat_workspaces/cutover',clients=[],objects=new Map(),tickets=[],reads=[]
 const mark=uid=>db.doc('qc_uat_identities/'+uid)
 const qc=id=>db.doc(prefix+'/qc_records/'+id)
 const rolesByUid={'uat-spray':'mandor_spraying','uat-fert':'mandor_fertilizer','uat-other':'mandor_spraying','uat-view':'pengunjung','uat-owner':'owner','uat-disabled':'owner','uat-prod':'owner','uat-noclaim':'mandor_spraying'}
 const password='Synthetic-endpoint-only-2026'
 const email=uid=>uid+'@endpoint-demo.example.test'
 const tokens={}
 const png='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jR1sAAAAASUVORK5CYII='
 const makeJob=(uid='uat-spray',id='uat-q1',formType='spray',baseRevision=null,clientRevision='uat-r1')=>prepareStrictJob({testOnly:true,scope:'uat-strict',uploaderUid:uid,record:{testOnly:true,id,ownerUid:uid,formType,clientRevision,saveType:'ready',actualArea100:250},baseRevision,action:'finalizeRecord',changes:[{kind:'main',action:'replace',dataUrl:png}]})
 const server=createUatEndpointServer({
  verifyToken:token=>authAdmin.verifyIdToken(token,true),
  snapshot:(uid,id)=>db.runTransaction(async tx=>{const [m,p,q]=await Promise.all([tx.get(mark(uid)),tx.get(db.doc('users/'+uid)),tx.get(qc(id))]);return {marker:m.data(),productionProfile:p.exists,record:q.data()??null}}),
  putImmutable:async(r,bytes)=>{const old=objects.get(r.objectPath);if(old)assert.deepEqual(old,Buffer.from(bytes));else objects.set(r.objectPath,Buffer.from(bytes))},
  readObject:async r=>{reads.push(r.objectPath);return objects.get(r.objectPath)},
  issueTicket:async(r,ttl)=>{tickets.push({path:r.objectPath,ttl});return 'mock-'+randomUUID().replaceAll('-','')}
 })
 let n=0
 const check=async(name,fn)=>{try{await fn()}catch(e){throw Error('FAIL: '+name,{cause:e})}n++;console.log('PASS: '+name)}
 const call=(uid,op,body)=>callUatEndpoint(op,body,tokens[uid])
 const deny=(fn,status,error)=>assert.rejects(fn,{status,message:error})
 async function raw(path,{method='POST',token=tokens['uat-spray'],origin,contentType='application/json',body='{}'}={}){
  const response=await fetch(endpointOrigin+path,{method,headers:{...(token?{Authorization:'Bearer '+token}:{}),'Content-Type':contentType,...(origin?{Origin:origin}:{})},...(method==='POST'?{body}:{}),redirect:'error'})
  return {status:response.status,data:await response.json(),cache:response.headers.get('cache-control')}
 }
 try{
  assert.equal((await authAdmin.listUsers(1)).users.length,0,'FRESH_AUTH_REQUIRED')
  for(const col of ['qc_uat_identities','users',prefix+'/qc_records','daily_plans'])assert.equal((await db.collection(col).limit(1).get()).size,0,'FRESH_FIRESTORE_REQUIRED')
  for(const [uid,role] of Object.entries(rolesByUid)){
   await authAdmin.createUser({uid,email:email(uid),password,emailVerified:true})
   if(uid!=='uat-noclaim')await authAdmin.setCustomUserClaims(uid,{qcUat:true})
   await mark(uid).set(marker(role,{}, {},uid!=='uat-disabled'))
   if(uid==='uat-prod')await db.doc('users/'+uid).set({active:true})
   const app=initializeApp({projectId,apiKey:'demo-only-not-real'},'endpoint-'+uid)
   const auth=initializeAuth(app,{persistence:inMemoryPersistence});connectAuthEmulator(auth,'http://'+host+':'+authPort,{disableWarnings:true})
   clients.push({app,auth})
   const {user}=await signInWithEmailAndPassword(auth,email(uid),password)
   tokens[uid]=await user.getIdToken()
  }
  await db.doc('daily_plans/root-sentinel').set({testOnly:false,rootSentinel:true})
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(4485,host,resolve)})
  const j=await makeJob(),awaitedWrong=await makeJob('uat-fert','uat-wrong','spray'),sign={recordId:'uat-q1',slot:'main'}
  await check('legacy and unknown endpoints rejected locally',async()=>{for(const p of ['/functions/v1/qc-photo-upload-uat','/functions/v1/qc-photo-sign-uat','/api/qc-uat/v1/photo-upload?target=prod'])assert.equal((await raw(p)).status,404)})
  await check('wrong origin and method denied',async()=>{assert.equal((await raw(endpointPaths.upload,{origin:'https://example.com'})).status,403);assert.equal((await raw(endpointPaths.upload,{method:'GET'})).status,405)})
  await check('missing and invalid tokens denied',async()=>{assert.equal((await raw(endpointPaths.upload,{token:''})).status,401);assert.equal((await raw(endpointPaths.upload,{token:'invalid'})).status,401)})
  await check('wrong content type and invalid JSON denied',async()=>{assert.equal((await raw(endpointPaths.upload,{contentType:'text/plain'})).status,415);assert.equal((await raw(endpointPaths.upload,{body:'{'})).status,400)})
  await check('disabled missing claim and production profiles denied',async()=>{for(const uid of ['uat-disabled','uat-prod','uat-noclaim'])await deny(()=>call(uid,'sign',sign),403,'UAT_IDENTITY_DENIED')})
  await check('forged owner and wrong form denied before storage',async()=>{await deny(()=>call('uat-other','upload',{job:j}),403,'OWNER_REQUIRED');await deny(()=>call('uat-fert','upload',{job:awaitedWrong}),403,'FORM_EDIT_REQUIRED');assert.equal(objects.size,0)})
  await check('tampered or omitted fingerprint denied',async()=>{await deny(()=>call('uat-spray','upload',{job:{...j,payloadFingerprint:'sha256-v1:'+'0'.repeat(64)}}),400,'INVALID_STRICT_JOB');const {payloadFingerprint,...noFp}=j;await deny(()=>call('uat-spray','upload',{job:noFp}),400,'FINGERPRINT_REQUIRED')})
  await check('client supplied bucket path or UID rejected',async()=>{await deny(()=>call('uat-spray','upload',{job:j,bucket:'qc-photos'}),400,'INVALID_UPLOAD_REQUEST');await deny(()=>call('uat-spray','sign',{...sign,objectPath:'foreign'}),400,'INVALID_SIGN_REQUEST')})
  let uploaded
  await check('actual Auth token permits own upload over HTTP',async()=>{uploaded=await call('uat-spray','upload',{job:j});assert.equal(uploaded.payloadFingerprint,j.payloadFingerprint);assert.equal(objects.size,1);assert.equal(uploaded.manifest.main.bucket,'qc-photos-uat-mock');assert.equal((await qc('uat-q1').get()).exists,false)})
  await check('identical upload is immutable and idempotent',async()=>{assert.deepEqual(await call('uat-spray','upload',{job:j}),uploaded);assert.equal(objects.size,1)})
  await check('unconfirmed record cannot issue ticket',async()=>{await deny(()=>call('uat-spray','sign',sign),403,'QC_READ_REQUIRED');await qc('uat-q1').set({...j.record,firestoreSaveState:'pending',operationalPhotoManifest:uploaded.manifest});await deny(()=>call('uat-spray','sign',sign),409,'QC_NOT_CONFIRMED')})
  // Privileged synthetic fixture, NOT a client commit; previous atomic suite
  // separately proves real transaction rules.
  await qc('uat-q1').set({...j.record,saveType:'uploaded',firestoreSaveState:'confirmed',operationalPhotoManifest:uploaded.manifest})
  await check('owner and viewer can request confirmed mock ticket',async()=>{for(const uid of ['uat-spray','uat-view','uat-owner']){const result=await call(uid,'sign',sign);assert.match(result.ticket,/^mock-[a-f0-9]{32}$/);assert.equal(result.expiresIn,30)}assert.equal(tickets.length,3)})
  await check('same-role other mandor and arbitrary slot denied',async()=>{await deny(()=>call('uat-other','sign',sign),403,'QC_READ_REQUIRED');await deny(()=>call('uat-spray','sign',{...sign,slot:'../foreign'}),400,'INVALID_SIGN_REQUEST');assert.equal(tickets.length,3)})
  await check('manual viewer none takes effect without token refresh',async()=>{await mark('uat-view').set(marker('pengunjung',{}, {qc_records:'none'}));await deny(()=>call('uat-view','sign',sign),403,'QC_READ_REQUIRED');assert.equal(tickets.length,3)})
  await check('manual downgrade prevents upload without token refresh',async()=>{await mark('uat-spray').set(marker('mandor_spraying',{}, {qc_spraying:'view'}));const next=await makeJob('uat-spray','uat-q1','spray','uat-r1','uat-r2');await deny(()=>call('uat-spray','upload',{job:next}),403,'FORM_EDIT_REQUIRED');await mark('uat-spray').set(marker('mandor_spraying'))})
  await check('stale base and cross-owner correction rejected',async()=>{await deny(()=>call('uat-spray','upload',{job:j}),409,'STALE_BASE');const x=await makeJob('uat-other','uat-q1','spray','uat-r1','uat-r2');await deny(()=>call('uat-other','upload',{job:x}),403,'OWNER_REQUIRED')})
  await check('missing photo slot and corrupted reference denied',async()=>{await deny(()=>call('uat-spray','sign',{...sign,slot:'scan'}),404,'PHOTO_SLOT_MISSING');const row=(await qc('uat-q1').get()).data();await qc('uat-q1').update({operationalPhotoManifest:{main:{...uploaded.manifest.main,sha256:'0'.repeat(64)}}});await deny(()=>call('uat-spray','sign',sign),409,'PHOTO_REFERENCE_INVALID');await qc('uat-q1').set(row)})
  await check('corrupt path rejected before storage adapter read',async()=>{const row=(await qc('uat-q1').get()).data(),before=reads.length;await qc('uat-q1').update({operationalPhotoManifest:{main:{...uploaded.manifest.main,objectPath:'uat-other/qc/foreign/file.png'}}});await deny(()=>call('uat-spray','sign',sign),409,'PHOTO_REFERENCE_INVALID');assert.equal(reads.length,before);await qc('uat-q1').set(row)})
  await check('fertilizer own form allowed',async()=>{const fj=await makeJob('uat-fert','uat-q2','fertilizer');const result=await call('uat-fert','upload',{job:fj});assert.equal(result.manifest.main.uploaderUid,'uat-fert');assert.equal(objects.size,2)})
  await check('response no-store and root sentinel unchanged',async()=>{assert.equal((await raw(endpointPaths.sign,{body:JSON.stringify(sign)})).cache,'no-store');assert.deepEqual((await db.doc('daily_plans/root-sentinel').get()).data(),{testOnly:false,rootSentinel:true});assert.equal((await qc('uat-q2').get()).exists,false)})
  console.log('SUCCESS: '+n+' local HTTP endpoint and Auth/Firestore emulator checks passed (mock storage/tickets only)')
 }finally{
  if(server.listening)await new Promise(resolve=>server.close(resolve))
  for(const c of clients){try{await signOut(c.auth)}finally{await deleteApp(c.app)}}
  await db.terminate();await adminDelete(admin)
 }
}
