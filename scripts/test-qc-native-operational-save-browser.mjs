// Stage 21 — delta QC save from the REAL src/main.tsx -> NativePortalSession
// -> PortalRouter -> App entrypoint. Only demo Auth/Firestore emulators.
// All uploads use local Cache Storage; no live Supabase, Hosting or production QC writes.
import assert from 'node:assert/strict'
import {createRequire} from 'node:module'
import {spawn} from 'node:child_process'
import {readFileSync} from 'node:fs'
import {fileURLToPath} from 'node:url'
const root=fileURLToPath(new URL('../',import.meta.url))
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8')
const project='demo-qc-photo-test',host='127.0.0.1',port=4387
const origin='http://'+host+':'+port,authOrigin='http://'+host+':9099'
const firestoreOrigin='http://'+host+':8085'
const mode=process.argv[2]
assert.ok(['--self-test','--browser'].includes(mode)&&process.argv.length===3,'NATIVE_BROWSER_MODE')
const emulatorConfig=JSON.parse(read('firebase.native-cutover-browser-emulator.json'))
assert.equal(emulatorConfig.firestore?.rules,'firestore.rules','FIRESTORE_RULES_MUST_STAY_INSIDE_REPO')
assert.deepEqual(emulatorConfig.emulators?.firestore,{host:'127.0.0.1',port:8085})
assert.deepEqual(emulatorConfig.emulators?.auth,{host:'127.0.0.1',port:9099})
assert.ok(read('vite.config.ts').includes("base: '/react/'"),'VITE_BASE_MISMATCH')
assert.match(read('src/main.tsx'),/nativePortalEnabled \? <NativePortalSession>/)
assert.match(read('src/firebase.ts'),/connectAuthEmulator\(firebaseAuth, 'http:\/\/127\.0\.0\.1:9099'\)/)
assert.match(read('src/firebase.ts'),/connectFirestoreEmulator\(firestoreDb, '127\.0\.0\.1', 8085\)/)
assert.match(read('src/qcLocalUat.ts'),/QC_LOCAL_UAT_REQUIRES_LOOPBACK_NATIVE_DEV/)
assert.match(read('src/NativePortalSession.tsx'),/readApprovedFirebaseSession\(\)/)
assert.match(read('src/qcFirebaseSession.ts'),/getDocFromServer\(doc\(db,'users',current\.uid\)\)/)
assert.match(read('src/qcFirebaseSession.ts'),/getDocFromServer\(doc\(db,'role_access',role\)\)/)
assert.match(read('src/api.ts'),/assertLegacyApiAllowed\(nativePortalEnabled,token\)/)
assert.match(read('src/App.tsx'),/record\.photoBase64\|\|record\.photoDriveUrl/)
assert.doesNotMatch(read('src/main.tsx'),/uat-unified-portal-lab|uat-owner-session-lab/)
console.log('PASS: native production entrypoint, local demo guards and legacy URL exclusion (offline)')
if(mode==='--browser'){
 assert.equal(process.env.GCLOUD_PROJECT,project,'DEMO_PROJECT_REQUIRED')
 assert.equal(process.env.FIRESTORE_EMULATOR_HOST,'127.0.0.1:8085','FIRESTORE_DEMO_REQUIRED')
 assert.equal(process.env.FIREBASE_AUTH_EMULATOR_HOST,'127.0.0.1:9099','AUTH_DEMO_REQUIRED')
 assert.equal(process.env.QC_UAT_MODE??'','', 'UNEXPECTED_UAT_MODE')
 const dir=process.env.QC_UAT_PLAYWRIGHT_DIR||((process.env.HOME||'')+'/qc-uat-playwright')
 assert.ok(dir.startsWith('/')&&!dir.includes('..'),'QC_UAT_PLAYWRIGHT_DIR_REQUIRED')
 const {chromium}=createRequire(dir+'/package.json')('playwright')
 const require=createRequire(new URL('../server/qc-photo-access/package.json',import.meta.url))
 const {initializeApp,deleteApp}=require('firebase-admin/app')
 const {getAuth}=require('firebase-admin/auth')
 const {getFirestore}=require('firebase-admin/firestore')
 const app=initializeApp({projectId:project},'native-cutover-browser')
 const adminAuth=getAuth(app),adb=getFirestore(app)
 const uid='uat-native-owner',email='uat-native-owner@example.test'
 const password='Demo-Only-2026-Native!'
 let dev,browser,context
 const denied=[],visited=new Set(),errors=[]
 let output=''
 const allowed=new Set([origin,authOrigin,firestoreOrigin])
 const check=async(label,fn)=>{try{await fn();console.log('PASS: '+label)}catch(e){throw Error('FAILED: '+label,{cause:e})}}
 try{
  assert.equal((await adminAuth.listUsers(1)).users.length,0,'AUTH_EMULATOR_NOT_EMPTY')
  for(const path of ['users','role_access','qc_records','monthly_plans','daily_plans','daily_reports']){
   assert.equal((await adb.collection(path).limit(1).get()).empty,true,'EMULATOR_NOT_EMPTY_'+path)
  }
  await adminAuth.createUser({uid,email,password,emailVerified:true})
  await adb.doc('users/'+uid).set({active:true,status:'approved',role:'owner',
   username:'uat-owner',fullName:'UAT Native Owner',email,firebaseUid:uid,testOnly:true})
  await adb.doc('role_access/owner').set({role:'owner',permissions:{
   qc_dashboard:'view',qc_spraying:'edit',qc_records:'view',
   data_plan_monthly:'view',data_plan_daily:'view',data_plan_summary:'view'
  },updatedBy:uid,updatedAt:'2026-11-22T00:00:00.000Z',testOnly:true})
  await adb.doc('master_paddocks/uat-p1').set({testOnly:true,pid:'uat-p1',active:true,area:10})
  await adb.doc('master_activities/uat-a1').set({testOnly:true,activity:'UAT spray',active:true})
  const childEnv=Object.fromEntries(Object.entries(process.env).filter(([k])=>
   ['PATH','HOME','USER','LANG','LC_ALL','TMPDIR'].includes(k)))
  Object.assign(childEnv,{
   VITE_QC_LOCAL_UAT:'true',VITE_QC_NATIVE_PORTAL:'true',
   VITE_QC_FIRESTORE_ONLY:'true',VITE_QC_MASTER_FIRESTORE:'true',
   VITE_QC_OPERATIONAL_SAVE:'true',VITE_QC_NATIVE_REGISTRATION:'true',
   VITE_FIRESTORE_ENABLED:'true',VITE_QC_HOSTED_UAT:'false',
   VITE_QC_FIREBASE_AUTH_PILOT:'false',VITE_QC_OPERATIONAL_PILOT:'false',
   VITE_ENABLE_SUPABASE_PHOTO_TEST:'false',VITE_RECAPTCHA_ENTERPRISE_SITE_KEY:''
  })
  dev=spawn(process.execPath,[root+'node_modules/vite/bin/vite.js','--host',host,
   '--port',String(port),'--strictPort'],{cwd:root,env:childEnv,stdio:['ignore','pipe','pipe']})
  for(const stream of [dev.stdout,dev.stderr])stream.on('data',d=>{output=(output+d.toString()).slice(-1500)})
  let ready=false
  for(let i=0;i<80;i++){
   if(dev.exitCode!==null)throw Error('LOCAL_VITE_EXITED')
   try{
    const response=await fetch(origin+'/react/',{signal:AbortSignal.timeout(700)})
    if(response.ok&&(await response.text()).includes('/src/main.tsx')){ready=true;break}
   }catch{}
   await new Promise(resolve=>setTimeout(resolve,250))
  }
  assert.ok(ready,'NATIVE_DEV_NOT_READY '+output.slice(-300))
  browser=await chromium.launch({headless:true})
  context=await browser.newContext({serviceWorkers:'block'})
  await context.route('**/*',async route=>{
   const u=new URL(route.request().url())
   if(allowed.has(u.origin)||u.protocol==='data:'){
    visited.add(u.origin)
    await route.continue()
   }else{
    denied.push(u.protocol+'//'+u.host)
    await route.abort()
   }
  })
  const page=await context.newPage()
  page.on('pageerror',e=>errors.push(e.message))
  page.on('websocket',socket=>{
   const u=new URL(socket.url())
   if(u.host!==host+':'+port&&u.host!==host+':8085')denied.push('websocket '+u.host)
  })
  await page.addInitScript(()=>{
   // Simulate an already configured Apps Script URL without using it.
   localStorage.setItem('qc_v48_config',JSON.stringify({apiUrl:
    'https://script.google.com/macros/s/legacy-test-only/exec'}))
   localStorage.setItem('qc_token','stale-legacy-token')
   localStorage.setItem('qc_user',JSON.stringify({username:'previous-user',role:'owner'}))
  })
  await page.goto(origin+'/react/',{waitUntil:'domcontentloaded'})
  await page.getByRole('heading',{name:'QC Form Web'}).waitFor({timeout:30000})
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill(password)
  await page.locator('button.primary').click()
  await page.getByRole('heading',{name:'Operational Portal'}).waitFor({timeout:30000})
  assert.ok(visited.has(authOrigin)&&visited.has(firestoreOrigin),'REAL_NATIVE_AUTH_REQUIRED')
  // Request the transformed module below Vite's /react/ base before import.
  const moduleReply=await page.request.get(origin+'/react/src/qcOperationalFormBridge.ts')
  const moduleText=await moduleReply.text()
  assert.ok(moduleReply.ok()&&moduleText.includes('queueFormSession')&&
    !moduleText.trimStart().toLowerCase().startsWith('<!doctype html'),
    'VITE_NATIVE_BRIDGE_MODULE_UNAVAILABLE: HTTP '+moduleReply.status()+' '+moduleText.slice(0,160))
  const recordId='qc-v2-uat-native-save-1'
  await check('actual SprayForm bridge persists synthetic QC and photo change in account-scoped IndexedDB',async()=>{
   const queued=await page.evaluate(async ({recordId,uid})=>{
    const {queueFormSession}=await import('/react/src/qcOperationalFormBridge.ts')
    const {operationalQueuedRecords}=await import('/react/src/qcOperationalAdapters.ts')
    const png='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jR1sAAAAASUVORK5CYII='
    await queueFormSession([{record:{
      id:recordId,sessionId:'uat-native-session-1',ownerUid:uid,
      clientRevision:'uat-revision-one',formType:'spray',saveType:'ready',
      inputtedBy:'uat-owner',name:'uat-owner',date:'2026-11-22',
      shift:'1',dailyPlanId:'uat-d1',paddock:'uat-p1',
      activity:'UAT spray',unit:'UAT-1',actualAreaHa:1.5,photoBase64:png
    },removedHoldIds:[],replaceHoldIds:[]}])
    const jobs=await operationalQueuedRecords()
    return jobs.map(j=>({scope:j.scope,id:j.record.id,revision:j.record.clientRevision,
      changes:j.changes.map(x=>x.kind+':'+x.action)}))
   },{recordId,uid})
   assert.deepEqual(queued,[{scope:'operational',id:recordId,revision:'uat-revision-one',changes:['main:replace']}])
   assert.equal((await adb.doc('qc_records/'+recordId).get()).exists,false)
   assert.equal((await adb.doc('daily_reports/qcactual_'+recordId).get()).exists,false)
  })
  await check('actual operational adapter atomically writes QC, Actual and immutable revision audit',async()=>{
   const result=await page.evaluate(async()=>{
    const {flushOperationalQc,operationalQueuedRecords}=await import('/react/src/qcOperationalAdapters.ts')
    const result=await flushOperationalQc()
    return {result,remaining:(await operationalQueuedRecords()).length}
   })
   assert.deepEqual(result.result.failures,[])
   assert.equal(result.result.sent,1)
   assert.equal(result.result.left,0)
   assert.equal(result.remaining,0)
   const qc=(await adb.doc('qc_records/'+recordId).get()).data()
   const actual=(await adb.doc('daily_reports/qcactual_'+recordId).get()).data()
   const audit=(await adb.doc('qc_operational_audit/'+recordId+':uat-revision-one').get()).data()
   assert.equal(qc.id,recordId)
   assert.equal(qc.ownerUid,uid)
   assert.equal(qc.clientRevision,'uat-revision-one')
   assert.equal(qc.firestoreSaveState,'confirmed')
   assert.equal(qc.saveType,'ready')
   assert.equal(qc.photoBase64,undefined)
   assert.equal(qc.operationalPhotoManifest.main.provider,'supabase')
   assert.equal(qc.operationalPhotoManifest.main.bucket,'qc-photos')
   assert.equal(actual.qcRecordId,recordId)
   assert.equal(actual.sourceOrigin,'QC')
   assert.equal(actual.actualAreaHa,1.5)
   assert.equal(audit.recordId,recordId)
   assert.equal(audit.revision,'uat-revision-one')
   assert.equal(audit.actorUid,uid)
   const photo=await page.evaluate(async({uid,recordId,photoId})=>{
    const {localUatPhotoKey}=await import('/react/src/qcLocalUat.ts')
    const key=localUatPhotoKey(uid,recordId,photoId)
    const cache=await caches.open('qc-local-uat-photos-v1')
    const response=await cache.match(key)
    return response?{status:response.status,contentType:response.headers.get('Content-Type'),
      length:(await response.arrayBuffer()).byteLength}:null
   },{uid,recordId,photoId:qc.operationalPhotoManifest.main.photoId})
   assert.equal(photo?.status,200)
   assert.equal(photo?.contentType,'image/png')
   assert.ok(photo.length>30)
  })
  await check('empty retry never duplicates committed QC, Actual, audit or queue job',async()=>{
   const data=await page.evaluate(async()=>{
    const {flushOperationalQc,operationalQueuedRecords}=await import('/react/src/qcOperationalAdapters.ts')
    return {result:await flushOperationalQc(),jobs:(await operationalQueuedRecords()).length}
   })
   assert.equal(data.result.sent,0)
   assert.equal(data.result.left,0)
   assert.equal(data.jobs,0)
   assert.equal((await adb.collection('qc_operational_audit').get()).size,1)
   assert.equal((await adb.collection('qc_records').get()).size,1)
   assert.equal((await adb.collection('daily_reports').get()).size,1)
  })
  await check('zero Apps Script, production Firebase or live Supabase egress during QC save',async()=>{
   assert.deepEqual(denied,[])
   for(const v of visited)assert.ok(allowed.has(v))
   assert.deepEqual(errors,[])
  })
  console.log('SUCCESS: 4 native operational QC queue, photo-cache, atomic Firestore and egress browser checks passed (DEMO ONLY, NO LIVE UPLOAD)')
 }finally{
  try{if(context)await context.close();if(browser)await browser.close()}
  finally{
   if(dev){
    dev.kill('SIGTERM')
    await Promise.race([
     new Promise(resolve=>dev.once('exit',resolve)),
     new Promise(resolve=>setTimeout(resolve,2000))
    ])
    if(dev.exitCode===null)dev.kill('SIGKILL')
   }
   await deleteApp(app)
  }
 }
}
