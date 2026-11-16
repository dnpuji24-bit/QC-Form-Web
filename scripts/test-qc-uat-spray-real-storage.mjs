// Actual Auth and Firestore Emulator; full DTO photo gate with immutable mock storage.
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {randomUUID,createHash} from 'node:crypto'
import {setTimeout as delay} from 'node:timers/promises'
import {createRealSprayStore,guardStorage,scopePath,allowedURL,signedURL,origin,bucket} from '../server/qc-photo-access/uat-spray-real-storage.mjs'
import {createRequire} from 'node:module'
import {fixture} from './qc-uat-spray-full-dto-fixture.mjs'
import {buildQcActualPayload} from './qc-uat-load-actual-mapper.mjs'
import {marker} from '../src/qcUatRolePermissions.mjs'
import {createSprayPhotoSigner,guardRealPhotoRun,createSprayPhotoService,sprayPhotoFingerprint,guardSprayPhoto,demoProject,demoHost,firestorePort,authPort} from '../server/qc-photo-access/uat-spray-photo-service.mjs'
const config=JSON.parse(readFileSync(new URL('../firebase.uat-spray-photo-emulator.json',import.meta.url),'utf8'))
const rules=readFileSync(new URL('../scripts/firestore.uat-spray-full-demo.rules',import.meta.url),'utf8')
const env={GCLOUD_PROJECT:demoProject,FIRESTORE_EMULATOR_HOST:demoHost+':'+firestorePort,FIREBASE_AUTH_EMULATOR_HOST:demoHost+':'+authPort}
assert.equal(demoProject,'demo-qc-uat-spray-photo')
guardSprayPhoto(env)
for(const e of [{},{...env,GCLOUD_PROJECT:'form-qc-unm'},{...env,FIRESTORE_EMULATOR_HOST:'remote:9185'},{...env,FIREBASE_AUTH_EMULATOR_HOST:'127.0.0.1:9499'},{...env,FIREBASE_PROJECT_ID:'form-qc-unm'}])assert.throws(()=>guardSprayPhoto(e))
assert.equal(config.firestore.rules,'scripts/firestore.uat-spray-full-demo.rules')
assert.deepEqual(config.emulators.firestore,{host:demoHost,port:firestorePort})
assert.deepEqual(config.emulators.auth,{host:demoHost,port:authPort})
assert.match(rules,/allow read, write: if false;/)
assert.doesNotMatch(rules,/allow[^;]*if true/)
assert.match(readFileSync(new URL('../src/firebase.ts',import.meta.url),'utf8'),/QC_HOSTED_UAT_ISOLATION_REQUIRED/)
const {r,dp}=fixture()
assert.equal(sprayPhotoFingerprint(r,null),sprayPhotoFingerprint(Object.fromEntries(Object.entries(r).reverse()),null))
assert.notEqual(sprayPhotoFingerprint(r,null),sprayPhotoFingerprint({...r,noted:'different'},null))
assert.notEqual(sprayPhotoFingerprint(r,null),sprayPhotoFingerprint(r,'uat-base'))
assert.ok(process.argv.length===3&&['--self-test','--uat-write'].includes(process.argv[2]))
assert.notEqual(sprayPhotoFingerprint(r,null,[]),sprayPhotoFingerprint(r,null,[{kind:'main',action:'remove'}]))
console.log('SUCCESS: full Spray photo demo, deny-all rules and fingerprint guards passed (offline)')
const fake={...env,QC_UAT_STORAGE_ORIGIN:origin,QC_UAT_STORAGE_WRITE:'synthetic-only',QC_UAT_STORAGE_SECRET:'sb_secret_fake_test_only'}
const fakeRun='0'.repeat(32),fakePath='uat-spray/qc/qc-v2-uat-'+fakeRun+'-one/'+'a'.repeat(24)+'_'+'b'.repeat(64)+'.png'
guardStorage(fake);guardRealPhotoRun(fakeRun,fake);assert.equal(scopePath(fakeRun,fakePath),fakePath)
for(const bad of ['../'+fakePath,fakePath+'/other',fakePath.replace('uat-spray','uat-other'),fakePath.replace(fakeRun,'1'.repeat(32))])assert.throws(()=>scopePath(fakeRun,bad))
assert.throws(()=>guardStorage({...fake,QC_UAT_STORAGE_ORIGIN:'https://example.com'}))
assert.throws(()=>allowedURL(origin+'/rest/v1/users'));assert.throws(()=>signedURL(origin+'/storage/v1/object/sign/'+bucket+'/other?token=x',fakePath))
console.log('SUCCESS: real Spray storage scope and signed URL guards passed (offline)')
if(process.argv[2]==='--uat-write'){
 guardSprayPhoto();guardStorage(process.env)
 const runId=randomUUID().replaceAll('-','')
 guardRealPhotoRun(runId)
 r.id='qc-v2-uat-'+runId+'-one'
 const require=createRequire(new URL('../server/qc-photo-access/package.json',import.meta.url))
 const {initializeApp:adminInit,deleteApp:adminDelete}=require('firebase-admin/app')
 const {getAuth}=require('firebase-admin/auth')
 const {getFirestore}=require('firebase-admin/firestore')
 const {initializeApp,deleteApp}=await import('firebase/app')
 const {initializeAuth,inMemoryPersistence,connectAuthEmulator,signInWithEmailAndPassword,signOut}=await import('firebase/auth')
 const {initializeFirestore,connectFirestoreEmulator,doc,setDoc,getDocFromServer,terminate}=await import('firebase/firestore')
 const admin=adminInit({projectId:demoProject},'spray-full-admin'),db=getFirestore(admin),authAdmin=getAuth(admin),clients=[],tokens={}
 const prefix='qc_uat_workspaces/cutover'
 const ref=(c,id)=>db.doc(prefix+'/'+c+'/'+id)
 const mark=uid=>db.doc('qc_uat_identities/'+uid)
 const read=async(c,id)=>(await ref(c,id).get()).data()??null
 const q=(id=r.id)=>read('qc_records',id),ap=(id=r.id)=>read('daily_reports','qcactual_'+id),audit=(id=r.id,rev=r.clientRevision)=>read('qc_operational_audit',id+':'+rev)
 const snapshot=async(id=r.id)=>({q:await q(id),ap:await ap(id),audits:(await db.collection(prefix+'/qc_operational_audit').where('recordId','==',id).get()).docs.map(d=>d.data()).sort((a,b)=>a.revision.localeCompare(b.revision))})
 let photoStore,save,sign
 const call=(record,baseRevision=null,changes=[],uid='uat-spray')=>save(tokens[uid],{record,baseRevision,changes})
 const ticket=(slot='main',uid='uat-spray')=>sign(tokens[uid],{recordId:r.id,slot})
 const reject=(fn,message)=>assert.rejects(fn,{message})
 const fresh=(id,uid='uat-spray')=>({...fixture().r,id,ownerUid:uid,inputtedBy:uid})
 const revise=(record,clientRevision,area)=>({...record,clientRevision,area:String(area),actualAreaHa:area,productivityHaPerHour:Math.round(area/9*100)/100,estUsageAdjuvant:(0.5*350*area/1000).toFixed(2),estUsagePesticide1:(2*area).toFixed(2),actualPlanMaterials:[{...record.actualPlanMaterials[0],totalMaterial:2*area}]})
 let n=0,stage='preflight',failed=false
 const check=async(name,fn)=>{stage=name;await fn();n++;console.log('PASS: '+name)}
 try{
  photoStore=await createRealSprayStore(runId)
  save=createSprayPhotoService({db,verifyToken:t=>authAdmin.verifyIdToken(t,true),buildActual:buildQcActualPayload,photoStore,realRunId:runId})
  sign=createSprayPhotoSigner({db,verifyToken:t=>authAdmin.verifyIdToken(t,true),photoStore,realRunId:runId})
  assert.equal((await authAdmin.listUsers(1)).users.length,0,'FRESH_AUTH_REQUIRED')
  for(const c of ['qc_uat_identities','users',prefix+'/daily_plans',prefix+'/qc_records',prefix+'/daily_reports',prefix+'/qc_operational_audit','daily_plans'])assert.equal((await db.collection(c).limit(1).get()).size,0,'FRESH_DB_REQUIRED')
  for(const [uid,role] of Object.entries({'uat-spray':'mandor_spraying','uat-other':'mandor_spraying','uat-view':'pengunjung','uat-prod':'owner','uat-noclaim':'mandor_spraying'})){
   const email=uid+'@spray-full.example.test',password='Synthetic-full-spray-2026'
   await authAdmin.createUser({uid,email,password,emailVerified:true})
   if(uid!=='uat-noclaim')await authAdmin.setCustomUserClaims(uid,{qcUat:true})
   await mark(uid).set(marker(role))
   if(uid==='uat-prod')await db.doc('users/'+uid).set({active:true})
   const app=initializeApp({projectId:demoProject,apiKey:'demo-only-not-real'},'spray-full-'+uid)
   const auth=initializeAuth(app,{persistence:inMemoryPersistence});connectAuthEmulator(auth,'http://'+demoHost+':'+authPort,{disableWarnings:true})
   const f=initializeFirestore(app,{});connectFirestoreEmulator(f,demoHost,firestorePort)
   clients.push({uid,app,auth,f})
   const {user}=await signInWithEmailAndPassword(auth,email,password)
   tokens[uid]=await user.getIdToken()
  }
  await ref('daily_plans',dp.dailyPlanId).set(dp)
  await db.doc('daily_plans/root-sentinel').set({testOnly:false,rootSentinel:true})
  const png='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jR1sAAAAASUVORK5CYII='
  const webp='data:image/webp;base64,UklGRh4AAABXRUJQVlA4TBEAAAAvAAAAAAdQsmZUpv+BiOh/AAA='
  const bytes=Buffer.from(png.split(',')[1],'base64')
  const photo={...r,photoBase64:png,holdIntervals:[{...r.holdIntervals[0],photoBase64:png}]}
  const changes=[{kind:'main',action:'replace',dataUrl:png},{kind:'hold',holdId:'uat-h1',action:'replace',dataUrl:png}]
  const ready={...r,clientRevision:'uat-r2'},uploaded={...r,clientRevision:'uat-r3',saveType:'uploaded'}
  await check('invalid source and foreign record denied before real storage',async()=>{
   await reject(()=>call({...photo,monthlyPlanLineId:'uat-wrong'},null,changes),'SOURCE_DP_MISMATCH')
   await reject(()=>call({...photo,id:'qc-v2-uat-foreign'},null,changes),'REAL_RECORD_SCOPE_DENIED')
   await reject(()=>call(photo,null,changes,'uat-other'),'OWNER_REQUIRED')
   assert.equal(photoStore.owned.size,0)
  })
  await check('unconfirmed QC cannot issue signed URL',async()=>{await reject(()=>ticket(),'PHOTO_RECORD_UNAVAILABLE');assert.equal(photoStore.stats.signs,0)})
  await check('Draft commits actual UAT main and HOLD objects with no Actual',async()=>{
   await call({...photo,saveType:'draft'},null,changes);const row=await q(),m=row.operationalPhotoManifest
   assert.equal(m.main.bucket,bucket);assert.notEqual(m.main.objectPath,m['hold_uat-h1'].objectPath)
   assert.deepEqual(await photoStore.read(m.main),bytes);assert.deepEqual(await photoStore.read(m['hold_uat-h1']),bytes)
   assert.equal(row.photoBase64,undefined);assert.equal(await ap(),null);assert.equal(photoStore.owned.size,2)
  })
  await check('immutable real object cannot be overwritten',async()=>{const m=(await q()).operationalPhotoManifest;await photoStore.assertNoOverwrite(m.main,Buffer.concat([bytes,Buffer.from([1])]))})
  await check('Ready then Uploaded retain actual source and verified photo references',async()=>{
   const manifest=(await q()).operationalPhotoManifest;await call(ready,'uat-r1');await call(uploaded,'uat-r2')
   const s=await snapshot();assert.equal(s.q.saveType,'uploaded');assert.deepEqual(s.q.operationalPhotoManifest,manifest)
   assert.equal(s.ap.dailyPlanId,dp.dailyPlanId);assert.equal(s.ap.shift,'2');assert.equal(s.ap.foreman,'Mandor B');assert.equal(s.ap.actualAreaHa,9)
   assert.equal(s.ap.photoManifestFingerprint,s.q.photoManifestFingerprint);assert.equal(s.audits.length,3)
   assert.equal(s.audits[2].photoManifestFingerprint,s.q.photoManifestFingerprint)
  })
  await check('owner and authorized viewer receive signed URL for exact photo bytes',async()=>{
   const m=(await q()).operationalPhotoManifest
   for(const [slot,uid] of [['main','uat-spray'],['hold_uat-h1','uat-view']]){
    const out=await ticket(slot,uid);assert.equal(out.expiresIn,30);assert.deepEqual(await photoStore.signedBytes(out.signedUrl,m[slot]),bytes)
   }
  })
  await check('foreign mandor, arbitrary slot and revoked viewer denied',async()=>{
   const n=photoStore.stats.signs
   await reject(()=>ticket('main','uat-other'),'PHOTO_READ_DENIED')
   await reject(()=>ticket('hold_unknown'),'PHOTO_SLOT_NOT_FOUND')
   await mark('uat-view').set(marker('pengunjung',{}, {qc_records:'none'}))
   try{await reject(()=>ticket('main','uat-view'),'PHOTO_READ_DENIED')}finally{await mark('uat-view').set(marker('pengunjung'))}
   assert.equal(photoStore.stats.signs,n)
  })
  await check('private URLs deny anonymous access and tampered signature',async()=>{
   const m=(await q()).operationalPhotoManifest.main
   await photoStore.assertDenied(origin+'/storage/v1/object/public/'+bucket+'/'+m.objectPath)
   await photoStore.assertDenied(origin+'/storage/v1/object/authenticated/'+bucket+'/'+m.objectPath)
   const u=new URL((await ticket()).signedUrl),parts=u.searchParams.get('token').split('.')
   assert.equal(parts.length,3);parts[2]=(parts[2][0]==='A'?'B':'A')+parts[2].slice(1);u.searchParams.set('token',parts.join('.'));await photoStore.assertDenied(u)
  })
  await check('unused short signed URL expires',async()=>{const m=(await q()).operationalPhotoManifest.main,u=await photoStore.sign(m,3);await delay(8000);await photoStore.assertDenied(u)})
  await check('exact Uploaded replay creates no new objects or audit',async()=>{
   const before=await snapshot(),puts=photoStore.stats.puts
   assert.equal((await call(uploaded,'uat-r2')).replayed,true);assert.equal(photoStore.stats.puts,puts);assert.deepEqual(await snapshot(),before)
  })
  await check('real WebP correction preserves old object and HOLD; same Actual',async()=>{
   const before=await snapshot(),next={...revise(uploaded,'uat-r4',10),photoBase64:webp}
   await call(next,'uat-r3',[{kind:'main',action:'replace',dataUrl:webp}])
   const s=await snapshot(),m=s.q.operationalPhotoManifest
   assert.equal(m.main.contentType,'image/webp');assert.notEqual(m.main.objectPath,before.q.operationalPhotoManifest.main.objectPath)
   assert.deepEqual(await photoStore.read(before.q.operationalPhotoManifest.main),bytes)
   assert.deepEqual(m['hold_uat-h1'],before.q.operationalPhotoManifest['hold_uat-h1'])
   assert.equal(s.ap.actualReportId,before.ap.actualReportId);assert.equal(s.ap.actualAreaHa,10);assert.equal(photoStore.owned.size,3)
   assert.equal(createHash('sha256').update(await photoStore.signedBytes((await ticket()).signedUrl,m.main)).digest('hex'),m.main.sha256)
  })
  await check('removed HOLD no longer signs but historical object remains',async()=>{
   const before=await snapshot();await call(revise(uploaded,'uat-r5',11),'uat-r4',[{kind:'hold',holdId:'uat-h1',action:'remove'}])
   await reject(()=>ticket('hold_uat-h1'),'PHOTO_SLOT_NOT_FOUND')
   assert.deepEqual(await photoStore.read(before.q.operationalPhotoManifest['hold_uat-h1']),bytes)
   assert.equal((await ap()).actualAreaHa,11);assert.equal(photoStore.owned.size,3)
   assert.deepEqual((await db.doc('daily_plans/root-sentinel').get()).data(),{testOnly:false,rootSentinel:true})
  })
 }catch{failed=true;console.error('FAIL: '+stage+' (details suppressed to protect keys and signed URLs)')
 }finally{
  if(photoStore){try{await photoStore.cleanup();console.log('PASS: scoped synthetic real storage cleanup verified')}catch{failed=true;console.error('FAIL: scoped cleanup; inspect synthetic run ID '+runId)}}
  for(const c of clients){try{await signOut(c.auth)}finally{await terminate(c.f);await deleteApp(c.app)}}
  await db.terminate();await adminDelete(admin)
 }
 if(failed){console.error('Synthetic run ID for review: '+runId);process.exitCode=1}else console.log('SUCCESS: '+n+' full Spray real Supabase and Firebase emulator checks passed; cleanup verified')
}
