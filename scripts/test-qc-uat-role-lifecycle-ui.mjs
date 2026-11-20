import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {createRequire} from 'node:module'
import {fileURLToPath} from 'node:url'
import {roleDefinition,permissionsForIdentity} from '../src/qcUatCustomRoles.mjs'
import {marker} from '../src/qcUatRolePermissions.mjs'
import {projectId,host,authPort,httpPort,origin,paths,guard,createOwnerHttp,createOwnerService} from '../server/qc-photo-access/uat-owner-permission-http.mjs'
const root=fileURLToPath(new URL('../',import.meta.url)),read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8')
const entryPath='uat-role-lifecycle-lab/main.jsx',env={GCLOUD_PROJECT:projectId,FIRESTORE_EMULATOR_HOST:'127.0.0.1:9485',FIREBASE_AUTH_EMULATOR_HOST:'127.0.0.1:10299'}
guard(env)
const config=JSON.parse(read('firebase.uat-owner-permission-http.json'))
assert.deepEqual(config.emulators.auth,{host,port:authPort})
for(const p of ['src/App.tsx','src/main.tsx','src/NativeUsersAccess.tsx','server/qc-photo-access/index.mjs','server/qc-photo-access/nativeAdminHttp.mjs'])assert.doesNotMatch(read(p),/UatRoleLifecyclePanel|uat-role-lifecycle-lab/)
assert.match(read(entryPath),/connectAuthEmulator\(auth,'http:\/\/127\.0\.0\.1:10299'/)
assert.match(read(entryPath),/inMemoryPersistence/)
assert.doesNotMatch(read(entryPath),/firebase\/firestore|localStorage|sessionStorage/)
assert.ok(process.argv.length===3&&['--self-test','--browser'].includes(process.argv[2]))
console.log('SUCCESS: Owner role lifecycle UI source and production isolation guards passed (offline)')
if(process.argv[2]==='--browser'){
 guard()
 const dir=process.env.QC_UAT_PLAYWRIGHT_DIR
 assert.ok(dir?.startsWith('/'),'QC_UAT_PLAYWRIGHT_DIR_REQUIRED')
 const {chromium}=createRequire(dir+'/package.json')('playwright'),{build}=await import('vite')
 const allowed=['UatRoleLifecyclePanel.tsx','accessControl.ts','qcUatSessionPermissions.mjs','qcUatRolePermissions.mjs','qcUatCustomRoles.mjs']
 const plugin={name:'role-lifecycle-source-allowlist',enforce:'pre',generateBundle(_opts,bundle){
  const ids=Object.values(bundle).filter(x=>x.type==='chunk').flatMap(x=>Object.keys(x.modules))
  const src=ids.filter(x=>x.startsWith(root+'src/')).map(x=>x.slice((root+'src/').length))
  for(const p of src)assert.ok(allowed.includes(p),'UNEXPECTED_SOURCE '+p)
  for(const p of allowed)assert.ok(src.includes(p),'MISSING_SOURCE '+p)
  assert.ok(!ids.some(p=>/node_modules\/(?:@firebase\/firestore|firebase\/firestore|@supabase)\//.test(p)),'UNEXPECTED_DATA_SDK')
 }}
 const result=await build({root,configFile:false,envDir:false,publicDir:false,base:'/',logLevel:'warn',plugins:[plugin],build:{write:false,emptyOutDir:false,minify:false,modulePreload:false,rollupOptions:{input:root+entryPath}}})
 const chunks=(Array.isArray(result)?result:[result]).flatMap(x=>x.output??[]),assets=new Map(),entries=[]
 for(const chunk of chunks){
  assert.equal(chunk.type,'chunk')
  assert.ok(chunk.fileName.split('/').every(p=>/^[A-Za-z0-9_-][A-Za-z0-9_.-]*$/.test(p)))
  assert.match(chunk.fileName,/\.m?js$/)
  assets.set('/'+chunk.fileName,{type:'text/javascript; charset=utf-8',body:chunk.code})
  if(chunk.isEntry)entries.push(chunk.fileName)
 }
 assert.equal(entries.length,1)
 for(const c of chunks)for(const dep of [...c.imports,...c.dynamicImports])assert.ok(assets.has('/'+dep),'NONLOCAL_IMPORT')
 assets.set('/',{type:'text/html; charset=utf-8',body:'<!doctype html><meta charset="utf-8"><title>UAT Role Lifecycle</title><link rel="icon" href="data:,"><div id="root"></div><script type="module" src="/'+entries[0]+'"></script>'})
 const require=createRequire(new URL('../server/qc-photo-access/package.json',import.meta.url))
 const {initializeApp:adminInit,deleteApp:adminDelete}=require('firebase-admin/app')
 const {getAuth}=require('firebase-admin/auth'),{getFirestore}=require('firebase-admin/firestore')
 const {initializeApp:clientInit,deleteApp:clientDelete}=await import('firebase/app')
 const {initializeAuth,inMemoryPersistence,connectAuthEmulator,signInWithEmailAndPassword,signOut}=await import('firebase/auth')
 const admin=adminInit({projectId},'role-lifecycle-browser'),adb=getFirestore(admin),authAdmin=getAuth(admin),server=createOwnerHttp(createOwnerService({adb,authAdmin}),assets)
 const prefix='qc_uat_workspaces/cutover',mark=uid=>adb.doc('qc_uat_identities/'+uid),catalog=id=>adb.doc(prefix+'/role_catalog/'+id),audit=(id,revision)=>adb.doc(prefix+'/role_catalog_audit/'+id+':'+revision),retired=id=>adb.doc(prefix+'/role_tombstones/'+id)
 const contexts=[],violations=[];let browser,tokenApp,tokenAuth,n=0
 const check=async(name,fn)=>{try{await fn()}catch(e){throw Error('FAIL: '+name,{cause:e})}n++;console.log('PASS: '+name)}
 async function page(){
  const ctx=await browser.newContext({serviceWorkers:'block'});contexts.push(ctx)
  await ctx.route('**/*',async route=>{
   const url=new URL(route.request().url())
   if((url.origin===origin&&!url.search&&(assets.has(url.pathname)||Object.values(paths).includes(url.pathname)))||url.origin==='http://'+host+':'+authPort||url.protocol==='data:')await route.continue()
   else{violations.push('external '+url.origin+url.pathname);await route.abort()}
  })
  await ctx.routeWebSocket('**/*',s=>{violations.push('websocket');s.close()})
  await ctx.addInitScript(()=>{globalThis.cspViolations=[];document.addEventListener('securitypolicyviolation',e=>cspViolations.push(e.effectiveDirective))})
  const p=await ctx.newPage();p.on('pageerror',e=>violations.push(e.message));await p.goto(origin);return p
 }
 const state=p=>p.getByTestId('session-state'),ui=p=>p.getByTestId('lifecycle-state'),msg=p=>p.getByTestId('lifecycle-message')
 const wait=async(locator,value)=>locator.filter({hasText:new RegExp('^'+value+'
 async function login(p,uid){await p.getByRole('button',{name:'Login '+uid,exact:true}).click();await wait(p.getByTestId('actor'),uid);await wait(state(p),'confirmed')}
 async function choose(p,id){await p.getByRole('combobox',{name:'Role yang dikelola'}).selectOption(id);await wait(ui(p),'preview')}
 async function refresh(p){await p.getByRole('button',{name:'Refresh daftar lifecycle role'}).click();await wait(ui(p),'ready')}
 async function confirm(p,action,roleId){
  await p.getByRole('button',{name:action==='edit'?'Tinjau edit role':'Tinjau hapus role'}).click()
  const button=p.getByRole('button',{name:action==='edit'?'Konfirmasi edit role':'Konfirmasi hapus role'})
  assert.equal(await button.isDisabled(),true)
  await p.getByRole('textbox',{name:'Ketik konfirmasi role'}).fill((action==='edit'?'UBAH ':'HAPUS ')+roleId)
  assert.equal(await button.isEnabled(),true)
  await button.click()
  await wait(ui(p),'blocked')
 }
 async function nodeToken(uid){
  const app=clientInit({projectId,apiKey:'demo-only-not-a-real-key'},'role-lifecycle-node-'+uid)
  const auth=initializeAuth(app,{persistence:inMemoryPersistence})
  connectAuthEmulator(auth,'http://'+host+':'+authPort,{disableWarnings:true})
  try{
   const {user}=await signInWithEmailAndPassword(auth,uid+'@role-ui.example.test','Synthetic-2026-'+uid)
   return await user.getIdToken()
  }finally{await signOut(auth);await clientDelete(app)}
 }
 async function api(path,token,body={}){
  const response=await fetch(origin+path,{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify(body)})
  assert.equal(response.headers.get('cache-control'),'no-store')
  return {status:response.status,data:await response.json()}
 }
 const a=roleDefinition({name:'QC Inspector',permissions:{qc_records:'view'}}),unused=roleDefinition({name:'Unused Officer',permissions:{}}),pending=roleDefinition({name:'Pending Officer',permissions:{}})
 try{
  assert.equal((await authAdmin.listUsers(1)).users.length,0,'FRESH_AUTH_REQUIRED')
  for(const c of ['qc_uat_identities','users','daily_plans',prefix+'/role_catalog',prefix+'/role_tombstones',prefix+'/role_catalog_audit',prefix+'/registration_requests'])assert.equal((await adb.collection(c).limit(1).get()).size,0,'FRESH_FIRESTORE_REQUIRED')
  for(const uid of ['uat-owner','uat-member-a','uat-member-b','uat-viewer','uat-requester']){
   await authAdmin.createUser({uid,email:uid+'@role-ui.example.test',password:'Synthetic-2026-'+uid,emailVerified:true})
   await authAdmin.setCustomUserClaims(uid,{qcUat:true})
  }
  await mark('uat-owner').set({...marker('owner'),roleOverrides:{},manualOverrides:{},policyRevision:0})
  await mark('uat-viewer').set({...marker('pengunjung'),roleOverrides:{},manualOverrides:{},policyRevision:0})
  for(const definition of [a,unused,pending])await catalog(definition.id).set({testOnly:true,workspace:'cutover',definition})
  for(const uid of ['uat-member-a','uat-member-b']){
   const manualOverrides=uid==='uat-member-b'?{qc_records:'none'}:{}
   await mark(uid).set({testOnly:true,workspace:'cutover',enabled:true,role:a.id,roleOverrides:{},manualOverrides,policyRevision:0,permissions:permissionsForIdentity({role:a.id,roleOverrides:{},manualOverrides},a)})
  }
  await adb.doc('daily_plans/root-sentinel').set({protected:true})
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(httpPort,host,resolve)})
  browser=await chromium.launch({headless:true})
  const owner=await page(),member=await page(),viewer=await page()
  await check('signed out has no role management and no permission data',async()=>{
   for(const p of [owner,member,viewer])assert.equal(await p.getByRole('region',{name:'Edit dan hapus custom role UAT'}).count(),0)
  })
  await check('Owner panel requires real active session; viewer cannot access',async()=>{
   await login(owner,'uat-owner');await wait(ui(owner),'ready')
   await login(member,'uat-member-a')
   await login(viewer,'uat-viewer')
   assert.equal(await member.getByRole('region',{name:'Edit dan hapus custom role UAT'}).count(),0)
   assert.equal(await viewer.getByRole('region',{name:'Edit dan hapus custom role UAT'}).count(),0)
   assert.equal(await member.getByTestId('qc-record-mode').innerText(),'view')
  })
  await check('role selector contains custom roles only and never built-in Owner',async()=>{
   const options=await owner.getByRole('combobox',{name:'Role yang dikelola'}).locator('option').allTextContents()
   assert.equal(options[0],'Pilih custom role');assert.deepEqual(options.slice(1).sort(),['QC Inspector','Unused Officer','Pending Officer'].sort())
  })
  await check('read-only preview exposes exact revision and assigned member versions',async()=>{
   await choose(owner,a.id)
   assert.equal(await owner.getByTestId('lifecycle-role-id').innerText(),a.id)
   assert.equal(await owner.getByTestId('lifecycle-revision').innerText(),'0')
   assert.equal(await owner.getByTestId('lifecycle-member-count').innerText(),'2')
   const people=await owner.getByRole('list',{name:'Akun yang menggunakan role'}).locator('li').allTextContents()
   assert.equal(people.length,2);assert.ok(people[0].includes('uat-member-a'));assert.ok(people[1].includes('uat-member-b'))
   assert.equal(await owner.getByRole('button',{name:'Tinjau hapus role'}).isDisabled(),true)
  })
  await check('edit confirmation requires nonempty diff and exact typed role ID',async()=>{
   assert.equal(await owner.getByRole('button',{name:'Tinjau edit role'}).isDisabled(),true)
   await owner.getByRole('combobox',{name:'lifecycle-qc_records'}).selectOption('none')
   await owner.getByRole('combobox',{name:'lifecycle-data_plan_summary'}).selectOption('view')
   assert.equal(await owner.getByTestId('lifecycle-diff-count').innerText(),'Permission berubah: 2')
   await owner.getByRole('button',{name:'Tinjau edit role'}).click()
   assert.equal(await owner.getByRole('button',{name:'Konfirmasi edit role'}).isDisabled(),true)
   await owner.getByRole('textbox',{name:'Ketik konfirmasi role'}).fill('UBAH custom-wrong')
   assert.equal(await owner.getByRole('button',{name:'Konfirmasi edit role'}).isDisabled(),true)
   await owner.getByRole('button',{name:'Batal konfirmasi'}).click()
   assert.equal(await owner.getByRole('button',{name:'Konfirmasi edit role'}).count(),0)
  })
  await check('Owner confirmed edit atomically updates both members and catalog audit',async()=>{
   await confirm(owner,'edit',a.id)
   assert.match(await msg(owner).innerText(),/Perubahan role diterima/)
   const catalogRow=(await catalog(a.id).get()).data().definition
   assert.equal(catalogRow.revision,1);assert.equal(catalogRow.permissions.data_plan_summary,'view');assert.equal(catalogRow.permissions.qc_records,'none')
   const ma=(await mark('uat-member-a').get()).data(),mb=(await mark('uat-member-b').get()).data()
   for(const m of [ma,mb]){assert.equal(m.policyRevision,1);assert.equal(m.permissions.data_plan_summary,'view');assert.equal(m.permissions.qc_records,'none')}
   assert.equal(mb.manualOverrides.qc_records,'none')
   assert.deepEqual((await audit(a.id,1).get()).data().affectedUids,['uat-member-a','uat-member-b'])
  })
  await check('member refresh on same token applies new rights without relogin',async()=>{
   await member.getByRole('button',{name:'Refresh session'}).click()
   await wait(state(member),'confirmed')
   await wait(member.getByTestId('summary-mode'),'view')
   assert.equal(await member.getByTestId('qc-record-mode').innerText(),'none')
   assert.equal(await member.getByTestId('session-role').innerText(),a.id)
  })
  await check('stale catalog revision rejects update and fails closed until refresh',async()=>{
   await refresh(owner);await choose(owner,unused.id)
   const old=(await catalog(unused.id).get()).data().definition
   await owner.getByRole('combobox',{name:'lifecycle-data_plan_actual'}).selectOption('view')
   const next={...old,revision:1,permissions:{...old.permissions,qc_spraying:'view'}}
   await catalog(unused.id).update({definition:next})
   await audit(unused.id,1).create({testOnly:true,workspace:'cutover',action:'trusted_fixture_update',before:old,after:next})
   await confirm(owner,'edit',unused.id)
   assert.match(await msg(owner).innerText(),/tidak terkonfirmasi/)
   assert.equal((await catalog(unused.id).get()).data().definition.revision,1)
   assert.equal(await owner.getByRole('combobox',{name:'Role yang dikelola'}).count(),0)
   await refresh(owner);await choose(owner,unused.id)
   assert.equal(await owner.getByTestId('lifecycle-revision').innerText(),'1')
   assert.equal(await owner.getByRole('combobox',{name:'lifecycle-qc_spraying'}).inputValue(),'view')
  })
  await check('transport failure blocks retry and requires fresh preview',async()=>{
   await owner.getByRole('combobox',{name:'lifecycle-data_plan_daily'}).selectOption('view')
   const route=r=>r.abort()
   await owner.route(origin+paths.rolesUpdate,route)
   try{
    await confirm(owner,'edit',unused.id)
    assert.match(await msg(owner).innerText(),/tidak terkonfirmasi/)
    assert.equal((await catalog(unused.id).get()).data().definition.revision,1)
    assert.equal(await owner.getByRole('button',{name:'Konfirmasi edit role'}).count(),0)
   }finally{await owner.unroute(origin+paths.rolesUpdate,route)}
   await refresh(owner)
  })
  await check('Delete Role remains unavailable for assigned role even after preview',async()=>{
   await choose(owner,a.id)
   assert.equal(await owner.getByRole('button',{name:'Tinjau hapus role'}).isDisabled(),true)
   assert.match(await owner.getByTestId('lifecycle-delete-warning').innerText(),/2 akun/)
  })
  let ot
  await check('trusted Owner reassigns every member before archive',async()=>{
   ot=await nodeToken('uat-owner')
   for(const uid of ['uat-member-a','uat-member-b']){
    const result=await api(paths.rolesAssign,ot,{targetUid:uid,expectedRevision:1,roleId:'pengunjung'})
    assert.equal(result.status,200)
   }
   await refresh(owner);await choose(owner,a.id)
   assert.equal(await owner.getByTestId('lifecycle-member-count').innerText(),'0')
   assert.equal(await owner.getByRole('button',{name:'Tinjau hapus role'}).isEnabled(),true)
  })
  await check('retirement requires typed confirmation and retains immutable tombstone',async()=>{
   await confirm(owner,'delete',a.id)
   assert.match(await msg(owner).innerText(),/telah diarsipkan/)
   assert.equal((await catalog(a.id).get()).exists,false)
   assert.equal((await retired(a.id).get()).data().lastRevision,1)
   assert.equal((await adb.doc(prefix+'/role_catalog_audit/'+a.id+':delete').get()).data().action,'delete_role')
   assert.equal((await api(paths.rolesCreate,ot,{name:'QC Inspector',permissions:{}})).status,409)
   await refresh(owner)
   const choices=await owner.getByRole('combobox',{name:'Role yang dikelola'}).locator('option').allTextContents()
   assert.ok(!choices.includes('QC Inspector'))
  })
  await check('pending registration blocks deletion without partial tombstone',async()=>{
   const rt=await nodeToken('uat-requester')
   assert.equal((await api(paths.registrationSubmit,rt,{requestedRoleId:pending.id})).status,200)
   await choose(owner,pending.id)
   assert.equal(await owner.getByTestId('lifecycle-member-count').innerText(),'0')
   await confirm(owner,'delete',pending.id)
   assert.match(await msg(owner).innerText(),/tidak terkonfirmasi/)
   assert.equal((await catalog(pending.id).get()).exists,true)
   assert.equal((await retired(pending.id).get()).exists,false)
   assert.equal((await api(paths.registrationReview,ot,{targetUid:'uat-requester',expectedRevision:0,decision:'reject',approvedRoleId:null})).status,200)
   await refresh(owner)
  })
  await check('after terminal rejection Owner can retire genuinely unused role',async()=>{
   await choose(owner,pending.id);await confirm(owner,'delete',pending.id)
   assert.equal((await retired(pending.id).get()).data().roleId,pending.id)
   assert.equal((await catalog(pending.id).get()).exists,false)
   assert.deepEqual((await adb.doc('daily_plans/root-sentinel').get()).data(),{protected:true})
  })
  await check('owner revocation closes UI and prevents subsequent role operations',async()=>{
   await mark('uat-owner').update({enabled:false})
   await owner.getByRole('button',{name:'Refresh session'}).click()
   await wait(state(owner),'denied')
   assert.equal(await owner.getByRole('region',{name:'Edit dan hapus custom role UAT'}).count(),0)
   assert.equal((await api(paths.rolesPreview,ot,{roleId:unused.id})).status,403)
  })
  await check('browser isolation preserves no external traffic, WebSocket, CSP or local storage grants',async()=>{
   assert.deepEqual(violations,[])
   for(const p of [owner,member,viewer]){
    assert.deepEqual(await p.evaluate(()=>cspViolations),[])
    assert.deepEqual(await p.evaluate(()=>[localStorage.length,sessionStorage.length]),[0,0])
   }
   assert.equal((await adb.doc('qc_uat_identities/uat-member-a').get()).data().role,'pengunjung')
  })
  console.log('SUCCESS: '+n+' Owner Edit/Delete Role React browser checks passed (Firebase Auth + Firestore emulator, in-memory only)')
 }finally{
  for(const ctx of contexts)await ctx.close()
  if(browser)await browser.close()
  if(server.listening)await new Promise(resolve=>server.close(resolve))
  await adb.terminate();await adminDelete(admin)
 }
}
)}).waitFor({timeout:20000})
 async function login(p,uid){await p.getByRole('button',{name:'Login '+uid,exact:true}).click();await wait(p.getByTestId('actor'),uid);await wait(state(p),'confirmed')}
 async function choose(p,id){await p.getByRole('combobox',{name:'Role yang dikelola'}).selectOption(id);await wait(ui(p),'preview')}
 async function refresh(p){await p.getByRole('button',{name:'Refresh daftar lifecycle role'}).click();await wait(ui(p),'ready')}
 async function confirm(p,action,roleId){
  await p.getByRole('button',{name:action==='edit'?'Tinjau edit role':'Tinjau hapus role'}).click()
  const button=p.getByRole('button',{name:action==='edit'?'Konfirmasi edit role':'Konfirmasi hapus role'})
  assert.equal(await button.isDisabled(),true)
  await p.getByRole('textbox',{name:'Ketik konfirmasi role'}).fill((action==='edit'?'UBAH ':'HAPUS ')+roleId)
  assert.equal(await button.isEnabled(),true)
  await button.click()
  await wait(ui(p),'blocked')
 }
 async function nodeToken(uid){
  const app=clientInit({projectId,apiKey:'demo-only-not-a-real-key'},'role-lifecycle-node-'+uid)
  const auth=initializeAuth(app,{persistence:inMemoryPersistence})
  connectAuthEmulator(auth,'http://'+host+':'+authPort,{disableWarnings:true})
  try{
   const {user}=await signInWithEmailAndPassword(auth,uid+'@role-ui.example.test','Synthetic-2026-'+uid)
   return await user.getIdToken()
  }finally{await signOut(auth);await clientDelete(app)}
 }
 async function api(path,token,body={}){
  const response=await fetch(origin+path,{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify(body)})
  assert.equal(response.headers.get('cache-control'),'no-store')
  return {status:response.status,data:await response.json()}
 }
 const a=roleDefinition({name:'QC Inspector',permissions:{qc_records:'view'}}),unused=roleDefinition({name:'Unused Officer',permissions:{}}),pending=roleDefinition({name:'Pending Officer',permissions:{}})
 try{
  assert.equal((await authAdmin.listUsers(1)).users.length,0,'FRESH_AUTH_REQUIRED')
  for(const c of ['qc_uat_identities','users','daily_plans',prefix+'/role_catalog',prefix+'/role_tombstones',prefix+'/role_catalog_audit',prefix+'/registration_requests'])assert.equal((await adb.collection(c).limit(1).get()).size,0,'FRESH_FIRESTORE_REQUIRED')
  for(const uid of ['uat-owner','uat-member-a','uat-member-b','uat-viewer','uat-requester']){
   await authAdmin.createUser({uid,email:uid+'@role-ui.example.test',password:'Synthetic-2026-'+uid,emailVerified:true})
   await authAdmin.setCustomUserClaims(uid,{qcUat:true})
  }
  await mark('uat-owner').set({...marker('owner'),roleOverrides:{},manualOverrides:{},policyRevision:0})
  await mark('uat-viewer').set({...marker('pengunjung'),roleOverrides:{},manualOverrides:{},policyRevision:0})
  for(const definition of [a,unused,pending])await catalog(definition.id).set({testOnly:true,workspace:'cutover',definition})
  for(const uid of ['uat-member-a','uat-member-b']){
   const manualOverrides=uid==='uat-member-b'?{qc_records:'none'}:{}
   await mark(uid).set({testOnly:true,workspace:'cutover',enabled:true,role:a.id,roleOverrides:{},manualOverrides,policyRevision:0,permissions:permissionsForIdentity({role:a.id,roleOverrides:{},manualOverrides},a)})
  }
  await adb.doc('daily_plans/root-sentinel').set({protected:true})
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(httpPort,host,resolve)})
  browser=await chromium.launch({headless:true})
  const owner=await page(),member=await page(),viewer=await page()
  await check('signed out has no role management and no permission data',async()=>{
   for(const p of [owner,member,viewer])assert.equal(await p.getByRole('region',{name:'Edit dan hapus custom role UAT'}).count(),0)
  })
  await check('Owner panel requires real active session; viewer cannot access',async()=>{
   await login(owner,'uat-owner');await wait(ui(owner),'ready')
   await login(member,'uat-member-a')
   await login(viewer,'uat-viewer')
   assert.equal(await member.getByRole('region',{name:'Edit dan hapus custom role UAT'}).count(),0)
   assert.equal(await viewer.getByRole('region',{name:'Edit dan hapus custom role UAT'}).count(),0)
   assert.equal(await member.getByTestId('qc-record-mode').innerText(),'view')
  })
  await check('role selector contains custom roles only and never built-in Owner',async()=>{
   const options=await owner.getByRole('combobox',{name:'Role yang dikelola'}).locator('option').allTextContents()
   assert.equal(options[0],'Pilih custom role');assert.deepEqual(options.slice(1).sort(),['QC Inspector','Unused Officer','Pending Officer'].sort())
  })
  await check('read-only preview exposes exact revision and assigned member versions',async()=>{
   await choose(owner,a.id)
   assert.equal(await owner.getByTestId('lifecycle-role-id').innerText(),a.id)
   assert.equal(await owner.getByTestId('lifecycle-revision').innerText(),'0')
   assert.equal(await owner.getByTestId('lifecycle-member-count').innerText(),'2')
   const people=await owner.getByRole('list',{name:'Akun yang menggunakan role'}).locator('li').allTextContents()
   assert.equal(people.length,2);assert.ok(people[0].includes('uat-member-a'));assert.ok(people[1].includes('uat-member-b'))
   assert.equal(await owner.getByRole('button',{name:'Tinjau hapus role'}).isDisabled(),true)
  })
  await check('edit confirmation requires nonempty diff and exact typed role ID',async()=>{
   assert.equal(await owner.getByRole('button',{name:'Tinjau edit role'}).isDisabled(),true)
   await owner.getByRole('combobox',{name:'lifecycle-qc_records'}).selectOption('none')
   await owner.getByRole('combobox',{name:'lifecycle-data_plan_summary'}).selectOption('view')
   assert.equal(await owner.getByTestId('lifecycle-diff-count').innerText(),'Permission berubah: 2')
   await owner.getByRole('button',{name:'Tinjau edit role'}).click()
   assert.equal(await owner.getByRole('button',{name:'Konfirmasi edit role'}).isDisabled(),true)
   await owner.getByRole('textbox',{name:'Ketik konfirmasi role'}).fill('UBAH custom-wrong')
   assert.equal(await owner.getByRole('button',{name:'Konfirmasi edit role'}).isDisabled(),true)
   await owner.getByRole('button',{name:'Batal konfirmasi'}).click()
   assert.equal(await owner.getByRole('button',{name:'Konfirmasi edit role'}).count(),0)
  })
  await check('Owner confirmed edit atomically updates both members and catalog audit',async()=>{
   await confirm(owner,'edit',a.id)
   assert.match(await msg(owner).innerText(),/Perubahan role diterima/)
   const catalogRow=(await catalog(a.id).get()).data().definition
   assert.equal(catalogRow.revision,1);assert.equal(catalogRow.permissions.data_plan_summary,'view');assert.equal(catalogRow.permissions.qc_records,'none')
   const ma=(await mark('uat-member-a').get()).data(),mb=(await mark('uat-member-b').get()).data()
   for(const m of [ma,mb]){assert.equal(m.policyRevision,1);assert.equal(m.permissions.data_plan_summary,'view');assert.equal(m.permissions.qc_records,'none')}
   assert.equal(mb.manualOverrides.qc_records,'none')
   assert.deepEqual((await audit(a.id,1).get()).data().affectedUids,['uat-member-a','uat-member-b'])
  })
  await check('member refresh on same token applies new rights without relogin',async()=>{
   await member.getByRole('button',{name:'Refresh session'}).click()
   await wait(state(member),'confirmed')
   await wait(member.getByTestId('summary-mode'),'view')
   assert.equal(await member.getByTestId('qc-record-mode').innerText(),'none')
   assert.equal(await member.getByTestId('session-role').innerText(),a.id)
  })
  await check('stale catalog revision rejects update and fails closed until refresh',async()=>{
   await refresh(owner);await choose(owner,unused.id)
   const old=(await catalog(unused.id).get()).data().definition
   await owner.getByRole('combobox',{name:'lifecycle-data_plan_actual'}).selectOption('view')
   const next={...old,revision:1,permissions:{...old.permissions,qc_spraying:'view'}}
   await catalog(unused.id).update({definition:next})
   await audit(unused.id,1).create({testOnly:true,workspace:'cutover',action:'trusted_fixture_update',before:old,after:next})
   await confirm(owner,'edit',unused.id)
   assert.match(await msg(owner).innerText(),/tidak terkonfirmasi/)
   assert.equal((await catalog(unused.id).get()).data().definition.revision,1)
   assert.equal(await owner.getByRole('combobox',{name:'Role yang dikelola'}).count(),0)
   await refresh(owner);await choose(owner,unused.id)
   assert.equal(await owner.getByTestId('lifecycle-revision').innerText(),'1')
   assert.equal(await owner.getByRole('combobox',{name:'lifecycle-qc_spraying'}).inputValue(),'view')
  })
  await check('transport failure blocks retry and requires fresh preview',async()=>{
   await owner.getByRole('combobox',{name:'lifecycle-data_plan_daily'}).selectOption('view')
   const route=r=>r.abort()
   await owner.route(origin+paths.rolesUpdate,route)
   try{
    await confirm(owner,'edit',unused.id)
    assert.match(await msg(owner).innerText(),/tidak terkonfirmasi/)
    assert.equal((await catalog(unused.id).get()).data().definition.revision,1)
    assert.equal(await owner.getByRole('button',{name:'Konfirmasi edit role'}).count(),0)
   }finally{await owner.unroute(origin+paths.rolesUpdate,route)}
   await refresh(owner)
  })
  await check('Delete Role remains unavailable for assigned role even after preview',async()=>{
   await choose(owner,a.id)
   assert.equal(await owner.getByRole('button',{name:'Tinjau hapus role'}).isDisabled(),true)
   assert.match(await owner.getByTestId('lifecycle-delete-warning').innerText(),/2 akun/)
  })
  let ot
  await check('trusted Owner reassigns every member before archive',async()=>{
   ot=await nodeToken('uat-owner')
   for(const uid of ['uat-member-a','uat-member-b']){
    const result=await api(paths.rolesAssign,ot,{targetUid:uid,expectedRevision:1,roleId:'pengunjung'})
    assert.equal(result.status,200)
   }
   await refresh(owner);await choose(owner,a.id)
   assert.equal(await owner.getByTestId('lifecycle-member-count').innerText(),'0')
   assert.equal(await owner.getByRole('button',{name:'Tinjau hapus role'}).isEnabled(),true)
  })
  await check('retirement requires typed confirmation and retains immutable tombstone',async()=>{
   await confirm(owner,'delete',a.id)
   assert.match(await msg(owner).innerText(),/telah diarsipkan/)
   assert.equal((await catalog(a.id).get()).exists,false)
   assert.equal((await retired(a.id).get()).data().lastRevision,1)
   assert.equal((await adb.doc(prefix+'/role_catalog_audit/'+a.id+':delete').get()).data().action,'delete_role')
   assert.equal((await api(paths.rolesCreate,ot,{name:'QC Inspector',permissions:{}})).status,409)
   await refresh(owner)
   const choices=await owner.getByRole('combobox',{name:'Role yang dikelola'}).locator('option').allTextContents()
   assert.ok(!choices.includes('QC Inspector'))
  })
  await check('pending registration blocks deletion without partial tombstone',async()=>{
   const rt=await nodeToken('uat-requester')
   assert.equal((await api(paths.registrationSubmit,rt,{requestedRoleId:pending.id})).status,200)
   await choose(owner,pending.id)
   assert.equal(await owner.getByTestId('lifecycle-member-count').innerText(),'0')
   await confirm(owner,'delete',pending.id)
   assert.match(await msg(owner).innerText(),/tidak terkonfirmasi/)
   assert.equal((await catalog(pending.id).get()).exists,true)
   assert.equal((await retired(pending.id).get()).exists,false)
   assert.equal((await api(paths.registrationReview,ot,{targetUid:'uat-requester',expectedRevision:0,decision:'reject',approvedRoleId:null})).status,200)
   await refresh(owner)
  })
  await check('after terminal rejection Owner can retire genuinely unused role',async()=>{
   await choose(owner,pending.id);await confirm(owner,'delete',pending.id)
   assert.equal((await retired(pending.id).get()).data().roleId,pending.id)
   assert.equal((await catalog(pending.id).get()).exists,false)
   assert.deepEqual((await adb.doc('daily_plans/root-sentinel').get()).data(),{protected:true})
  })
  await check('owner revocation closes UI and prevents subsequent role operations',async()=>{
   await mark('uat-owner').update({enabled:false})
   await owner.getByRole('button',{name:'Refresh session'}).click()
   await wait(state(owner),'denied')
   assert.equal(await owner.getByRole('region',{name:'Edit dan hapus custom role UAT'}).count(),0)
   assert.equal((await api(paths.rolesPreview,ot,{roleId:unused.id})).status,403)
  })
  await check('browser isolation preserves no external traffic, WebSocket, CSP or local storage grants',async()=>{
   assert.deepEqual(violations,[])
   for(const p of [owner,member,viewer]){
    assert.deepEqual(await p.evaluate(()=>cspViolations),[])
    assert.deepEqual(await p.evaluate(()=>[localStorage.length,sessionStorage.length]),[0,0])
   }
   assert.equal((await adb.doc('qc_uat_identities/uat-member-a').get()).data().role,'pengunjung')
  })
  console.log('SUCCESS: '+n+' Owner Edit/Delete Role React browser checks passed (Firebase Auth + Firestore emulator, in-memory only)')
 }finally{
  for(const ctx of contexts)await ctx.close()
  if(browser)await browser.close()
  if(server.listening)await new Promise(resolve=>server.close(resolve))
  await adb.terminate();await adminDelete(admin)
 }
}
