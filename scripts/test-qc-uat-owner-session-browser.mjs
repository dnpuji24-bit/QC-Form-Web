import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {createRequire} from 'node:module'
import {fileURLToPath} from 'node:url'
import {marker} from '../src/qcUatRolePermissions.mjs'
import {projectId,host,authPort,httpPort,origin,paths,guard,createOwnerHttp,createOwnerService} from '../server/qc-photo-access/uat-owner-permission-http.mjs'
const root=fileURLToPath(new URL('../',import.meta.url)),read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8')
const entryPath='uat-owner-session-lab/main.jsx'
for(const p of ['src/main.tsx','src/App.tsx','src/NativeUsersAccess.tsx','src/userAccess.ts'])assert.doesNotMatch(read(p),/uat-owner-session-lab|qcUatSessionPermissions/)
assert.match(read(entryPath),/connectAuthEmulator\(auth,'http:\/\/127\.0\.0\.1:10299'/)
assert.match(read(entryPath),/inMemoryPersistence/)
assert.match(read(entryPath),/onAuthStateChanged/)
assert.doesNotMatch(read(entryPath),/firebase\/firestore|localStorage|sessionStorage/)
assert.ok(process.argv.length===3&&['--self-test','--browser'].includes(process.argv[2]))
console.log('SUCCESS: Owner session browser source and production isolation guards passed (offline)')
if(process.argv[2]==='--browser'){
 guard()
 const dir=process.env.QC_UAT_PLAYWRIGHT_DIR;assert.ok(dir?.startsWith('/'),'QC_UAT_PLAYWRIGHT_DIR_REQUIRED')
 const {chromium}=createRequire(dir+'/package.json')('playwright'),{build}=await import('vite')
 const allowed=['UatOwnerPermissionPanel.tsx','accessControl.ts','qcUatSessionPermissions.mjs','qcUatRolePermissions.mjs','qcUatCustomRoles.mjs','UatAddRolePanel.tsx']
 const plugin={name:'owner-session-isolation',enforce:'pre',generateBundle(_opts,bundle){
  const ids=Object.values(bundle).filter(o=>o.type==='chunk').flatMap(o=>Object.keys(o.modules))
  const src=ids.filter(id=>id.startsWith(root+'src/')).map(id=>id.slice((root+'src/').length))
  for(const id of src)assert.ok(allowed.includes(id),'UNEXPECTED_SOURCE '+id)
  for(const id of allowed)assert.ok(src.includes(id),'MISSING_SOURCE '+id)
  assert.ok(!ids.some(id=>/node_modules\/(?:@firebase\/firestore|firebase\/firestore|@supabase)\//.test(id)),'UNEXPECTED_DATA_SDK')
 }}
 const built=await build({root,configFile:false,envDir:false,publicDir:false,base:'/',logLevel:'warn',plugins:[plugin],build:{write:false,emptyOutDir:false,minify:false,modulePreload:false,rollupOptions:{input:root+entryPath}}})
 const output=(Array.isArray(built)?built:[built]).flatMap(r=>r.output??[])
 const assets=new Map(),entries=[]
 for(const chunk of output){
  assert.equal(chunk.type,'chunk');assert.ok(chunk.fileName.split('/').every(p=>/^[A-Za-z0-9_-][A-Za-z0-9_.-]*$/.test(p)));assert.match(chunk.fileName,/\.m?js$/)
  assert.ok(!assets.has('/'+chunk.fileName));assets.set('/'+chunk.fileName,{type:'text/javascript; charset=utf-8',body:chunk.code})
  if(chunk.isEntry)entries.push(chunk.fileName)
 }
 assert.equal(entries.length,1)
 for(const chunk of output)for(const dep of [...chunk.imports,...chunk.dynamicImports])assert.ok(assets.has('/'+dep),'NONLOCAL_IMPORT')
 assets.set('/',{type:'text/html; charset=utf-8',body:'<!doctype html><meta charset="utf-8"><title>Owner Session Lab</title><link rel="icon" href="data:,"><div id="root"></div><script type="module" src="/'+entries[0]+'"></script>'})
 const require=createRequire(new URL('../server/qc-photo-access/package.json',import.meta.url))
 const {initializeApp,deleteApp}=require('firebase-admin/app'),{getAuth}=require('firebase-admin/auth'),{getFirestore}=require('firebase-admin/firestore')
 const admin=initializeApp({projectId},'owner-browser'),adb=getFirestore(admin),authAdmin=getAuth(admin)
 const server=createOwnerHttp(createOwnerService({adb,authAdmin}),assets)
 const mark=uid=>adb.doc('qc_uat_identities/'+uid),audit=()=>adb.collection('qc_uat_workspaces/cutover/permission_audit').get()
 const contexts=[],violations=[];let browser,n=0
 const check=async(name,fn)=>{try{await fn()}catch(e){throw Error('FAIL: '+name,{cause:e})}n++;console.log('PASS: '+name)}
 async function page(){
  const c=await browser.newContext({serviceWorkers:'block'});contexts.push(c)
  await c.route('**/*',async route=>{
   const u=new URL(route.request().url())
   if((u.origin===origin&&!u.search&&(assets.has(u.pathname)||Object.values(paths).includes(u.pathname)))||u.origin==='http://'+host+':'+authPort||u.protocol==='data:')await route.continue()
   else{violations.push('unexpected '+u.origin+u.pathname);await route.abort()}
  })
  await c.routeWebSocket('**/*',ws=>{violations.push('websocket');ws.close()})
  await c.addInitScript(()=>{globalThis.cspViolations=[];document.addEventListener('securitypolicyviolation',e=>cspViolations.push(e.effectiveDirective))})
  const p=await c.newPage();p.on('pageerror',e=>violations.push(e.message));await p.goto(origin);return p
 }
 const mode=(p,k='qc_spraying')=>p.getByTestId('mode-'+k)
 const state=p=>p.getByTestId('session-state')
 const wait=async(locator,text)=>{await locator.filter({hasText:new RegExp('^'+text+'$')}).waitFor({timeout:20000})}
 async function login(p,uid){await p.getByRole('button',{name:'Login '+uid,exact:true}).click();await wait(p.getByTestId('identity'),uid);await wait(state(p),'confirmed')}
 const selected=p=>p.getByRole('combobox',{name:'Pengguna',exact:true})
 const ownerStatus=p=>p.getByRole('status')
 async function choose(p,uid){await selected(p).selectOption(uid);await p.getByRole('combobox',{name:'qc_spraying',exact:true}).waitFor()}
 async function save(p,value){await p.getByRole('combobox',{name:'qc_spraying',exact:true}).selectOption(value);await p.getByRole('button',{name:'Simpan hak akses pengguna'}).click();await wait(ownerStatus(p),'Hak akses tersimpan.')}
 try{
  assert.equal((await authAdmin.listUsers(1)).users.length,0,'FRESH_AUTH_REQUIRED')
  for(const col of ['qc_uat_identities','users','daily_plans','qc_uat_workspaces/cutover/permission_audit','qc_uat_workspaces/cutover/role_catalog','qc_uat_workspaces/cutover/role_catalog_audit'])assert.equal((await adb.collection(col).limit(1).get()).size,0,'FRESH_FIRESTORE_REQUIRED')
  for(const [uid,role] of [['uat-owner','owner'],['uat-spray','mandor_spraying'],['uat-spray-b','mandor_spraying'],['uat-fert','mandor_fertilizer']]){
   await authAdmin.createUser({uid,email:uid+'@owner-browser.example.test',password:'Synthetic-only-2026-'+uid,emailVerified:true})
   await authAdmin.setCustomUserClaims(uid,{qcUat:true})
   const manualOverrides=uid==='uat-spray'?{qc_records:'none'}:{}
   await mark(uid).set({...marker(role,{},manualOverrides),manualOverrides,roleOverrides:{},policyRevision:0})
  }
  await adb.doc('daily_plans/root-sentinel').set({rootSentinel:true})
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(httpPort,host,resolve)})
  browser=await chromium.launch({headless:true})
  const owner=await page(),a=await page(),b=await page(),other=await page()
  await check('signed out denies all menus; real Auth login hydrates separate sessions',async()=>{
   assert.equal(await mode(a).innerText(),'none');await login(owner,'uat-owner');await wait(ownerStatus(owner),'Hak akses dimuat.')
   await login(a,'uat-spray');await login(b,'uat-spray');await login(other,'uat-spray-b')
   await wait(mode(a),'edit');await wait(mode(b),'edit');await wait(mode(other),'edit')
   assert.equal(await mode(a,'qc_records').innerText(),'none');assert.equal(await selected(a).count(),0)
  })
  await check('real Owner panel commits view; two active browsers auto refresh',async()=>{
   await choose(owner,'uat-spray');await save(owner,'view');await wait(mode(a),'view');await wait(mode(b),'view')
   assert.equal(await a.getByRole('button',{name:'Simulasi simpan Spray'}).isDisabled(),true)
   assert.equal(await mode(other).innerText(),'edit');assert.equal((await audit()).size,1)
   assert.equal((await mark('uat-spray').get()).data().manualOverrides.qc_records,'none')
  })
  await check('explicit none hides menu in both sessions without relogin',async()=>{
   await save(owner,'none');await wait(a.getByTestId('session-revision'),'2');await wait(b.getByTestId('session-revision'),'2')
   assert.equal(await a.getByRole('region',{name:'Spray menu'}).count(),0);assert.equal(await b.getByRole('region',{name:'Spray menu'}).count(),0)
   assert.equal((await audit()).size,2)
  })
  await check('relogin preserves manual none and account switch loads own grants',async()=>{
   await b.getByRole('button',{name:'Logout',exact:true}).click();await wait(state(b),'signed-out')
   await login(b,'uat-spray');await wait(b.getByTestId('session-revision'),'2');assert.equal(await mode(b).innerText(),'none')
   await login(b,'uat-fert');await wait(mode(b,'qc_fertilizer'),'edit');assert.equal(await mode(b).innerText(),'none')
  })
  await check('restored edit reaches target but not switched account',async()=>{
   await save(owner,'edit');await wait(a.getByTestId('session-revision'),'3');await wait(mode(a),'edit');assert.equal(await a.getByRole('button',{name:'Simulasi simpan Spray'}).isEnabled(),true)
   assert.equal(await mode(b).innerText(),'none');assert.equal((await audit()).size,3)
  })
  await check('failed network refresh closes access and recovery uses current permission',async()=>{
   const route=origin+paths.session
   const abort=r=>r.abort()
   await a.route(route,abort)
   try{await wait(state(a),'denied');assert.equal(await mode(a).innerText(),'none');assert.equal(await a.getByRole('region',{name:'Spray menu'}).count(),0)}
   finally{await a.unroute(route,abort)}
   await wait(mode(a),'edit')
  })
  await check('stale owner edit is rejected and refresh reconciles actual revision',async()=>{
   const m=(await mark('uat-spray').get()).data()
   // Simulate a trusted concurrent admin change, not a browser write.
   const {ownerPermissionChange}=await import('../src/qcUatOwnerPermissionContract.mjs')
   const result=ownerPermissionChange({targetUid:'uat-spray',expectedRevision:3,patch:{qc_spraying:'view'}},{actorUid:'uat-owner',claim:true,actor:(await mark('uat-owner').get()).data(),target:m,actorProductionProfile:false,targetProductionProfile:false})
   await adb.runTransaction(async tx=>{tx.update(mark('uat-spray'),result.next);tx.create(adb.doc('qc_uat_workspaces/cutover/permission_audit/uat-spray:4'),result.audit)})
   await owner.getByRole('combobox',{name:'qc_spraying',exact:true}).selectOption('none');await owner.getByRole('button',{name:'Simpan hak akses pengguna'}).click()
   await wait(ownerStatus(owner),'Perubahan tidak terkonfirmasi. Refresh sebelum mencoba lagi.')
   await owner.getByRole('button',{name:'Refresh hak akses'}).click();await wait(ownerStatus(owner),'Hak akses dimuat.');await choose(owner,'uat-spray')
   assert.equal(await owner.getByTestId('manual-qc_spraying').innerText(),'view');await wait(mode(a),'view');assert.equal((await audit()).size,4)
  })
  await check('Owner creates custom role from UI without changing existing users',async()=>{
   const rolePanel=owner.getByRole('region',{name:'Kelola role UAT'})
   await wait(owner.getByTestId('role-message'),'Daftar role dimuat.')
   assert.equal(await a.getByRole('region',{name:'Kelola role UAT'}).count(),0)
   await rolePanel.getByRole('textbox',{name:'Nama role'}).fill('QC Inspector')
   assert.equal(await rolePanel.getByRole('combobox',{name:'role-qc_spraying',exact:true}).inputValue(),'none')
   await rolePanel.getByRole('combobox',{name:'role-qc_records',exact:true}).selectOption('view')
   const before=(await mark('uat-spray').get()).data()
   await rolePanel.getByRole('button',{name:'Simpan role baru'}).click()
   await wait(owner.getByTestId('role-message'),'Role berhasil dibuat.')
   await owner.getByTestId('role-custom-qc-inspector').waitFor()
   assert.equal((await adb.doc('qc_uat_workspaces/cutover/role_catalog/custom-qc-inspector').get()).data().definition.permissions.qc_records,'view')
   assert.deepEqual((await mark('uat-spray').get()).data(),before)
   await rolePanel.getByRole('button',{name:'Refresh daftar role'}).click();await wait(owner.getByTestId('role-message'),'Daftar role dimuat.')
   await owner.getByTestId('role-custom-qc-inspector').waitFor()
  })
  await check('Owner assigns custom role and both active sessions hydrate without old defaults',async()=>{
   const rolePanel=owner.getByRole('region',{name:'Kelola role UAT'})
   await login(b,'uat-spray');await wait(mode(b),'view')
   await rolePanel.getByRole('button',{name:'Refresh daftar role'}).click();await wait(owner.getByTestId('role-message'),'Daftar role dimuat.')
   await rolePanel.getByRole('combobox',{name:'Target pengguna role'}).selectOption('uat-spray')
   await rolePanel.getByRole('combobox',{name:'Role pengganti'}).selectOption('custom-qc-inspector')
   await rolePanel.getByRole('button',{name:'Tetapkan role'}).click();await wait(owner.getByTestId('role-message'),'Role pengguna tersimpan.')
   for(const p of [a,b]){await wait(p.getByTestId('session-role'),'custom-qc-inspector');await wait(mode(p),'view');assert.equal(await mode(p,'qc_records').innerText(),'none')}
   assert.equal((await mark('uat-spray').get()).data().permissions.qc_dashboard,'none')
   assert.equal((await mark('uat-spray').get()).data().manualOverrides.qc_spraying,'view')
   assert.equal((await mark('uat-spray-b').get()).data().role,'mandor_spraying')
   assert.equal((await audit()).size,5)
  })
  await check('revoked owner loses panel on automatic refresh; root unchanged',async()=>{
   await mark('uat-owner').update({enabled:false});await wait(state(owner),'denied');assert.equal(await selected(owner).count(),0);assert.equal(await owner.getByRole('region',{name:'Kelola role UAT'}).count(),0)
   assert.deepEqual((await adb.doc('daily_plans/root-sentinel').get()).data(),{rootSentinel:true})
  })
  await check('no external requests WebSocket or CSP violations',async()=>{
   assert.deepEqual(violations,[]);for(const p of [owner,a,b,other])assert.deepEqual(await p.evaluate(()=>cspViolations),[])
  })
  console.log('SUCCESS: '+n+' Owner browser and active session lifecycle checks (real Auth/Firestore demo only)')
 }finally{
  for(const c of contexts)await c.close()
  if(browser)await browser.close()
  if(server.listening)await new Promise(resolve=>server.close(resolve))
  await adb.terminate();await deleteApp(admin)
 }
}
