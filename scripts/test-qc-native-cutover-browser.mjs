// Stage 20 — browser test of the REAL src/main.tsx -> NativePortalSession
// -> PortalRouter -> App entrypoint. Only demo Auth/Firestore emulators.
// No Supabase requests, production project, Hosting deployment, or live QC writes.
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
  await check('actual native portal starts at Firebase login, never trusts old local session',async()=>{
   await page.getByRole('heading',{name:'QC Form Web'}).waitFor({timeout:30000})
   assert.equal(await page.getByRole('heading',{name:'Operational Portal'}).count(),0)
   assert.notEqual(await page.evaluate(()=>localStorage.getItem('qc_token')),'stale-legacy-token')
  })
  await check('demo Firebase Auth login reads approved Firestore identity and renders real portal',async()=>{
   await page.getByLabel('Email').fill(email)
   await page.getByLabel('Password').fill(password)
   await page.locator('button.primary').click()
   await page.getByRole('heading',{name:'Operational Portal'}).waitFor({timeout:30000})
   await page.getByText('UAT Native Owner',{exact:true}).first().waitFor()
   assert.equal(await page.evaluate(()=>localStorage.getItem('qc_token')),
    'firebase-native-session-v1')
   assert.ok(visited.has(authOrigin),'FIREBASE_AUTH_EMULATOR_UNREACHED')
   assert.ok(visited.has(firestoreOrigin),'FIRESTORE_EMULATOR_UNREACHED')
  })
  await check('current role revocation removes native portal without legacy fallback',async()=>{
   await adb.doc('users/'+uid).update({active:false,status:'disabled'})
   await page.evaluate(()=>window.dispatchEvent(new Event('focus')))
   await page.getByRole('heading',{name:'QC Form Web'}).waitFor({timeout:30000})
   assert.equal(await page.getByRole('heading',{name:'Operational Portal'}).count(),0)
   assert.equal(await page.evaluate(()=>localStorage.getItem('qc_token')),null)
  })
  await check('zero network egress to Apps Script, Supabase or production Firebase',async()=>{
   assert.deepEqual(denied,[])
   // Browser entrypoint is allowed to contact only localhost Vite and demo emulators.
   for(const v of visited)assert.ok(allowed.has(v)||v==='data:')
   assert.deepEqual(errors,[])
  })
  console.log('SUCCESS: 4 real native React login, Firestore and egress demo browser checks passed (NO production)')
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
