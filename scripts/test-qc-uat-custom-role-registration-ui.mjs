import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {createRequire} from 'node:module'
import {fileURLToPath} from 'node:url'
import {roleDefinition} from '../src/qcUatCustomRoles.mjs'
import {marker} from '../src/qcUatRolePermissions.mjs'
import {projectId,host,authPort,httpPort,origin,paths,guard,createOwnerHttp,createOwnerService} from '../server/qc-photo-access/uat-owner-permission-http.mjs'
const root=fileURLToPath(new URL('../',import.meta.url)),read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8')
const entryPath='uat-custom-role-registration-lab/main.jsx'
const config=JSON.parse(read('firebase.uat-owner-permission-http.json'))
const env={GCLOUD_PROJECT:projectId,FIRESTORE_EMULATOR_HOST:host+':9485',FIREBASE_AUTH_EMULATOR_HOST:host+':10299'}
guard(env)
assert.deepEqual(config.emulators.auth,{host,port:authPort})
for(const source of ['src/App.tsx','src/main.tsx','src/NativeUsersAccess.tsx','server/qc-photo-access/index.mjs','server/qc-photo-access/nativeAdminHttp.mjs'])assert.doesNotMatch(read(source),/uat-custom-role-registration-lab|UatCustomRoleRegistrationPanel|UatCustomRoleApprovalPanel/)
assert.match(read(entryPath),/connectAuthEmulator\(auth,'http:\/\/127\.0\.0\.1:10299'/)
assert.match(read(entryPath),/inMemoryPersistence/)
assert.match(read(entryPath),/onAuthStateChanged/)
assert.doesNotMatch(read(entryPath),/firebase\/firestore|localStorage|sessionStorage/)
assert.ok(process.argv.length===3&&['--self-test','--browser'].includes(process.argv[2]))
console.log('SUCCESS: Custom registration React lab source and production isolation guards passed (offline)')
if(process.argv[2]==='--browser'){
 guard()
 const dir=process.env.QC_UAT_PLAYWRIGHT_DIR
 assert.ok(dir?.startsWith('/'),'QC_UAT_PLAYWRIGHT_DIR_REQUIRED')
 const {chromium}=createRequire(dir+'/package.json')('playwright'),{build}=await import('vite')
 const allowed=['UatCustomRoleRegistrationPanel.tsx','UatCustomRoleApprovalPanel.tsx','qcUatSessionPermissions.mjs','qcUatRolePermissions.mjs','qcUatCustomRoles.mjs']
 const plugin={name:'custom-role-registration-lab-isolation',enforce:'pre',generateBundle(_opts,bundle){
  const ids=Object.values(bundle).filter(o=>o.type==='chunk').flatMap(o=>Object.keys(o.modules))
  const src=ids.filter(id=>id.startsWith(root+'src/')).map(id=>id.slice((root+'src/').length))
  for(const id of src)assert.ok(allowed.includes(id),'UNEXPECTED_SOURCE '+id)
  for(const id of allowed)assert.ok(src.includes(id),'MISSING_SOURCE '+id)
  assert.ok(!ids.some(id=>/node_modules\/(?:@firebase\/firestore|firebase\/firestore|@supabase)\//.test(id)),'UNEXPECTED_DATA_SDK')
 }}
 const output=await build({root,configFile:false,envDir:false,publicDir:false,base:'/',logLevel:'warn',plugins:[plugin],build:{write:false,emptyOutDir:false,minify:false,modulePreload:false,rollupOptions:{input:root+entryPath}}})
 const chunks=(Array.isArray(output)?output:[output]).flatMap(o=>o.output??[])
 const assets=new Map(),entries=[]
 for(const chunk of chunks){
  assert.equal(chunk.type,'chunk')
  assert.ok(chunk.fileName.split('/').every(p=>/^[A-Za-z0-9_-][A-Za-z0-9_.-]*$/.test(p)))
  assert.match(chunk.fileName,/\.m?js$/)
  assert.ok(!assets.has('/'+chunk.fileName))
  assets.set('/'+chunk.fileName,{type:'text/javascript; charset=utf-8',body:chunk.code})
  if(chunk.isEntry)entries.push(chunk.fileName)
 }
 assert.equal(entries.length,1)
 for(const chunk of chunks)for(const dep of [...chunk.imports,...chunk.dynamicImports])assert.ok(assets.has('/'+dep),'NONLOCAL_IMPORT')
 assets.set('/',{type:'text/html; charset=utf-8',body:'<!doctype html><meta charset="utf-8"><title>Custom Registration UAT</title><link rel="icon" href="data:,"><div id="root"></div><script type="module" src="/'+entries[0]+'"></script>'})
 const require=createRequire(new URL('../server/qc-photo-access/package.json',import.meta.url))
 const {initializeApp,deleteApp}=require('firebase-admin/app'),{getAuth}=require('firebase-admin/auth'),{getFirestore}=require('firebase-admin/firestore')
 const admin=initializeApp({projectId},'custom-role-registration-browser'),adb=getFirestore(admin),authAdmin=getAuth(admin)
 const server=createOwnerHttp(createOwnerService({adb,authAdmin}),assets)
 const prefix='qc_uat_workspaces/cutover',mark=uid=>adb.doc('qc_uat_identities/'+uid),reg=uid=>adb.doc(prefix+'/registration_requests/'+uid),audit=(uid,r)=>adb.doc(prefix+'/registration_audit/'+uid+':'+r)
 const contexts=[],violations=[];let browser,n=0
 const check=async(name,fn)=>{try{await fn()}catch(e){throw Error('FAIL: '+name,{cause:e})}n++;console.log('PASS: '+name)}
 async function page(){
  const ctx=await browser.newContext({serviceWorkers:'block'});contexts.push(ctx)
  await ctx.route('**/*',async route=>{
   const url=new URL(route.request().url())
   if((url.origin===origin&&!url.search&&(assets.has(url.pathname)||Object.values(paths).includes(url.pathname)))||url.origin==='http://'+host+':'+authPort||url.protocol==='data:')await route.continue()
   else{violations.push('unexpected '+url.origin+url.pathname);await route.abort()}
  })
  await ctx.routeWebSocket('**/*',socket=>{violations.push('websocket');socket.close()})
  await ctx.addInitScript(()=>{globalThis.cspViolations=[];document.addEventListener('securitypolicyviolation',e=>cspViolations.push(e.effectiveDirective))})
  const p=await ctx.newPage();p.on('pageerror',e=>violations.push(e.message))
  await p.goto(origin);return p
 }
 const wait=async(locator,value)=>locator.filter({hasText:new RegExp('^'+value+'$')}).waitFor({timeout:20000})
 const actor=p=>p.getByTestId('actor')
 const state=p=>p.getByTestId('session-state')
 const applicantState=p=>p.getByTestId('registration-state')
 const ownerState=p=>p.getByTestId('owner-registration-state')
 async function login(p,uid,sessionState){await p.getByRole('button',{name:'Login '+uid,exact:true}).click();await wait(actor(p),uid);await wait(state(p),sessionState)}
 async function refresh(p){await p.getByRole('button',{name:'Refresh status registrasi'}).click()}
 const roleA='custom-qc-inspector',roleB='custom-planning-reader'
 try{
  assert.equal((await authAdmin.listUsers(1)).users.length,0,'FRESH_AUTH_REQUIRED')
  for(const col of ['qc_uat_identities','users','daily_plans',prefix+'/role_catalog',prefix+'/registration_requests',prefix+'/registration_audit'])assert.equal((await adb.collection(col).limit(1).get()).size,0,'FRESH_FIRESTORE_REQUIRED')
  for(const uid of ['uat-owner','uat-applicant','uat-reject','uat-viewer']){
   await authAdmin.createUser({uid,email:uid+'@registration-ui.example.test',password:'Synthetic-2026-'+uid,emailVerified:true})
   await authAdmin.setCustomUserClaims(uid,{qcUat:true})
  }
  await mark('uat-owner').set({...marker('owner'),roleOverrides:{},manualOverrides:{},policyRevision:0})
  await mark('uat-viewer').set({...marker('pengunjung'),roleOverrides:{},manualOverrides:{},policyRevision:0})
  const definitions=[roleDefinition({name:'QC Inspector',permissions:{qc_records:'view'}}),roleDefinition({name:'Planning Reader',permissions:{data_plan_summary:'view'}})]
  for(const definition of definitions)await adb.doc(prefix+'/role_catalog/'+definition.id).set({testOnly:true,workspace:'cutover',definition})
  await adb.doc('daily_plans/root-sentinel').set({protected:true})
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(httpPort,host,resolve)})
  browser=await chromium.launch({headless:true})
  const owner=await page(),applicant=await page(),rejected=await page(),viewer=await page()
  await check('signed out denies both registration and approval panels',async()=>{
   for(const p of [owner,applicant,rejected,viewer]){
    assert.equal(await p.getByRole('region',{name:'Persetujuan registrasi custom role'}).count(),0)
    assert.equal(await p.getByRole('region',{name:'Pendaftaran custom role UAT'}).count(),0)
   }
  })
  await check('real Auth emulator login shows Owner inbox and applicant role choices separately',async()=>{
   await login(owner,'uat-owner','confirmed');await wait(ownerState(owner),'ready')
   await login(applicant,'uat-applicant','denied');await wait(applicantState(applicant),'new')
   await login(rejected,'uat-reject','denied');await wait(applicantState(rejected),'new')
   await login(viewer,'uat-viewer','confirmed');await wait(applicantState(viewer),'blocked')
   assert.equal(await owner.getByRole('region',{name:'Pendaftaran custom role UAT'}).count(),0)
   assert.equal(await applicant.getByRole('region',{name:'Persetujuan registrasi custom role'}).count(),0)
   const options=await applicant.getByRole('combobox',{name:'Custom role yang diminta'}).locator('option').allTextContents()
   assert.equal(options.length,3);assert.ok(options.includes('QC Inspector'));assert.ok(options.includes('Planning Reader'));assert.ok(!options.includes('owner'))
  })
  await check('applicant submits requested role, no marker or self-granted permissions',async()=>{
   await applicant.getByRole('combobox',{name:'Custom role yang diminta'}).selectOption(roleA)
   await applicant.getByRole('button',{name:'Ajukan registrasi'}).click()
   await wait(applicantState(applicant),'pending')
   assert.equal(await applicant.getByTestId('requested-role').innerText(),roleA)
   assert.equal((await reg('uat-applicant').get()).data().status,'pending')
   assert.equal((await mark('uat-applicant').get()).exists,false)
   assert.equal((await audit('uat-applicant',0).get()).data().action,'submit')
  })
  await check('Owner inbox is explicit refresh and never available to applicant',async()=>{
   await owner.getByRole('button',{name:'Refresh permintaan Owner'}).click()
   await wait(ownerState(owner),'ready')
   await owner.getByRole('combobox',{name:'Permintaan menunggu keputusan'}).selectOption('uat-applicant')
   assert.equal(await owner.getByTestId('owner-requested-role').innerText(),roleA)
   assert.equal(await owner.getByRole('button',{name:'Setujui registrasi'}).isDisabled(),true)
   const test=await applicant.evaluate(async()=>{
    const response=await fetch('/uat/owner/registration/inbox',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'})
    return response.status
   })
   assert.equal(test,401)
  })
  await check('verified Owner inbox token returns only canonical rows, nonowner tokens are denied',async()=>{
   const {initializeApp:clientInit,deleteApp:clientDelete}=await import('firebase/app')
   const {initializeAuth,inMemoryPersistence,connectAuthEmulator,signInWithEmailAndPassword,signOut}=await import('firebase/auth')
   async function tokenFor(uid){
    const app=clientInit({projectId,apiKey:'demo-only-not-a-real-key'},'inbox-browser-test-'+uid)
    const auth=initializeAuth(app,{persistence:inMemoryPersistence})
    try{
     connectAuthEmulator(auth,'http://'+host+':'+authPort,{disableWarnings:true})
     const {user}=await signInWithEmailAndPassword(auth,uid+'@registration-ui.example.test','Synthetic-2026-'+uid)
     return await user.getIdToken()
    }finally{try{await signOut(auth)}finally{await clientDelete(app)}}
   }
   async function inbox(uid){
    const token=await tokenFor(uid)
    const r=await fetch(origin+paths.registrationInbox,{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:'{}'})
    return {status:r.status,body:await r.json()}
   }
   const ownerList=await inbox('uat-owner')
   assert.equal(ownerList.status,200)
   assert.deepEqual(ownerList.body.rows.map(x=>x.uid),['uat-applicant'])
   assert.deepEqual(Object.keys(ownerList.body.rows[0]).sort(),['testOnly','workspace','uid','status','revision','requestedRoleId','approvedRoleId','reviewedBy'].sort())
   assert.equal((await inbox('uat-applicant')).status,403)
   assert.equal((await inbox('uat-viewer')).status,403)
  })
  await check('Owner explicitly approves different role; activation still pending',async()=>{
   await owner.getByRole('combobox',{name:'Role disetujui oleh Owner'}).selectOption(roleB)
   await owner.getByRole('button',{name:'Setujui registrasi'}).click()
   await wait(owner.getByTestId('owner-registration-message'),'Permintaan disetujui.')
   assert.equal((await mark('uat-applicant').get()).exists,false)
   assert.equal((await reg('uat-applicant').get()).data().approvedRoleId,roleB)
   assert.equal((await audit('uat-applicant',1).get()).data().actorUid,'uat-owner')
  })
  await check('applicant refresh sees approved role, not caller-selected grant',async()=>{
   await refresh(applicant);await wait(applicantState(applicant),'approved')
   assert.equal(await applicant.getByTestId('requested-role').innerText(),roleA)
   assert.equal(await applicant.getByTestId('approved-role').innerText(),roleB)
   assert.equal(await applicant.getByRole('button',{name:'Ajukan registrasi'}).count(),0)
  })
  await check('applicant activates approved role and server recomputes permissions',async()=>{
   await applicant.getByRole('button',{name:'Aktifkan role disetujui'}).click()
   await wait(applicantState(applicant),'activated')
   assert.equal(await applicant.getByTestId('activated-role').innerText(),'Role aktif: '+roleB)
   assert.equal(await applicant.getByTestId('activated-permission-summary').innerText(),'Summary: view')
   const m=(await mark('uat-applicant').get()).data()
   assert.equal(m.role,roleB);assert.equal(m.permissions.qc_spraying,'none');assert.equal(m.permissions.data_plan_summary,'view')
   assert.equal((await audit('uat-applicant',2).get()).data().roleId,roleB)
   await applicant.getByRole('button',{name:'Refresh session'}).click()
   await wait(state(applicant),'confirmed');await wait(applicant.getByTestId('session-role'),roleB)
   assert.equal(await applicant.getByTestId('summary-mode').innerText(),'Summary permission: view')
  })
  await check('approved request cannot be replayed or upgraded from browser',async()=>{
   assert.equal(await applicant.getByRole('button',{name:'Aktifkan role disetujui'}).count(),0)
   assert.equal(await applicant.getByRole('button',{name:'Ajukan registrasi'}).count(),0)
   assert.equal((await adb.collection(prefix+'/registration_audit').where('uid','==','uat-applicant').get()).size,3)
  })
  await check('rejected registration remains terminal with no marker',async()=>{
   await rejected.getByRole('combobox',{name:'Custom role yang diminta'}).selectOption(roleA)
   await rejected.getByRole('button',{name:'Ajukan registrasi'}).click();await wait(applicantState(rejected),'pending')
   await owner.getByRole('button',{name:'Refresh permintaan Owner'}).click();await wait(ownerState(owner),'ready')
   await owner.getByRole('combobox',{name:'Permintaan menunggu keputusan'}).selectOption('uat-reject')
   await owner.getByRole('button',{name:'Tolak registrasi'}).click()
   await wait(owner.getByTestId('owner-registration-message'),'Permintaan ditolak.')
   await refresh(rejected);await wait(applicantState(rejected),'rejected')
   assert.equal(await rejected.getByRole('button',{name:'Aktifkan role disetujui'}).count(),0)
   assert.equal((await mark('uat-reject').get()).exists,false)
  })
  await check('failed status request closes applicant access until explicit refresh',async()=>{
   await rejected.route(origin+paths.registrationStatus,r=>r.abort())
   await refresh(rejected);await wait(applicantState(rejected),'blocked')
   assert.equal(await rejected.getByTestId('requested-role').count(),0)
   await rejected.unroute(origin+paths.registrationStatus)
   await refresh(rejected);await wait(applicantState(rejected),'rejected')
  })
  await check('switching user never reuses previous registration or permissions',async()=>{
   await applicant.getByRole('button',{name:'Login uat-viewer'}).click()
   await wait(actor(applicant),'uat-viewer');await wait(state(applicant),'confirmed')
   await wait(applicantState(applicant),'blocked')
   assert.equal(await applicant.getByTestId('activated-role').count(),0)
   assert.equal(await applicant.getByTestId('summary-mode').innerText(),'Summary permission: none')
   await applicant.getByRole('button',{name:'Logout'}).click()
   await wait(state(applicant),'signed-out')
   assert.equal(await applicant.getByRole('region',{name:'Pendaftaran custom role UAT'}).count(),0)
  })
  await check('revoked Owner hides approval and keeps source records unchanged',async()=>{
   await mark('uat-owner').update({enabled:false})
   await owner.getByRole('button',{name:'Refresh session'}).click()
   await wait(state(owner),'denied')
   assert.equal(await owner.getByRole('region',{name:'Persetujuan registrasi custom role'}).count(),0)
   assert.equal((await reg('uat-reject').get()).data().status,'rejected')
   assert.deepEqual((await adb.doc('daily_plans/root-sentinel').get()).data(),{protected:true})
  })
  await check('no direct Firestore SDK, external requests, WebSockets, CSP or persistent grants',async()=>{
   assert.deepEqual(violations,[])
   for(const p of [owner,applicant,rejected,viewer]){
    assert.deepEqual(await p.evaluate(()=>cspViolations),[])
    assert.deepEqual(await p.evaluate(()=>[localStorage.length,sessionStorage.length]),[0,0])
   }
  })
  console.log('SUCCESS: '+n+' Custom role registration React browser checks passed (Firebase Auth + Firestore emulator, in-memory only)')
 }finally{
  for(const ctx of contexts)await ctx.close()
  if(browser)await browser.close()
  if(server.listening)await new Promise(resolve=>server.close(resolve))
  await adb.terminate();await deleteApp(admin)
 }
}
