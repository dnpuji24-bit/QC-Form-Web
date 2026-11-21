// 11D.5c.1 — real React Owner role panel + Planning menu on one emulator token.
// Headless browser uses in-memory bundle and same-origin loopback proxy only.
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {createRequire} from 'node:module'
import {fileURLToPath} from 'node:url'
import {marker} from '../src/qcUatRolePermissions.mjs'
import {roleDefinition,assignIdentityRole} from '../src/qcUatCustomRoles.mjs'
import {nextPlanningRow} from '../src/qcUatPlanningWriteContract.mjs'
import {unifiedGuard,unifiedProjectId,unifiedHost,unifiedAuthPort} from '../server/qc-photo-access/uat-unified-identity-guard.mjs'
import {createOwnerHttp,createOwnerService,paths as ownerPaths} from '../server/qc-photo-access/uat-owner-permission-http.mjs'
import {createUnifiedPlanningHttp} from '../server/qc-photo-access/uat-unified-planning-http.mjs'
import {createUnifiedBrowserShell,shellPort,shellOrigin,shellRoute,ownerPrefix,planningPrefix} from '../server/qc-photo-access/uat-unified-browser-shell.mjs'
const root=fileURLToPath(new URL('../',import.meta.url)),read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8')
const e={QC_UAT_MODE:'unified-lab',GCLOUD_PROJECT:unifiedProjectId,FIRESTORE_EMULATOR_HOST:'127.0.0.1:9285',FIREBASE_AUTH_EMULATOR_HOST:'127.0.0.1:10099'}
unifiedGuard(e)
assert.equal(shellRoute(ownerPrefix+ownerPaths.rolesUpdate).kind,'owner')
assert.equal(shellRoute(planningPrefix+'/uat/unified/planning/read').kind,'planning')
for(const path of ['/api/owner/uat/owner/permissions/roles-update?x=1','/api/planning/http://evil.test','/api/owner/../admin','/api/owner/uat/owner/permissions/delete'])assert.equal(shellRoute(path),null)
for(const p of ['src/main.tsx','src/App.tsx','src/NativeUsersAccess.tsx','server/qc-photo-access/index.mjs','server/qc-photo-access/nativeAdminHttp.mjs'])assert.doesNotMatch(read(p),/uat-unified-portal-lab|UatUnifiedPortalShell|uat-unified-browser-shell/)
const entry='uat-unified-portal-lab/main.jsx'
assert.match(read(entry),/inMemoryPersistence/)
assert.match(read(entry),/http:\/\/127\.0\.0\.1:10099/)
assert.doesNotMatch(read(entry),/firebase\/firestore|localStorage|sessionStorage|supabase|fetch\(['"]https?:/)
assert.doesNotMatch(read('server/qc-photo-access/uat-unified-browser-shell.mjs'),/Access-Control-Allow-Origin|https:\/\/|supabase/)
assert.ok(process.argv.length===3&&['--self-test','--browser'].includes(process.argv[2]))
console.log('SUCCESS: Unified portal-shell UI source, exact proxy routing and production isolation guards passed (offline)')
if(process.argv[2]==='--browser'){
 unifiedGuard()
 const directory=process.env.QC_UAT_PLAYWRIGHT_DIR
 assert.ok(directory?.startsWith('/'),'QC_UAT_PLAYWRIGHT_DIR_REQUIRED')
 const {chromium}=createRequire(directory+'/package.json')('playwright')
 const {build}=await import('vite')
 const allow=['UatRoleLifecyclePanel.tsx','accessControl.ts','qcUatSessionPermissions.mjs','qcUatRolePermissions.mjs','qcUatCustomRoles.mjs','UatUnifiedOperationalForm.jsx','qcUatUnifiedOperationalForm.mjs','UatUnifiedFullOperationalForm.jsx','qcUatUnifiedFullQcFormBuilder.mjs','qcUatSprayFullDto.mjs','qcUatFertilizerFullDto.mjs']
 const plugin={name:'unified-portal-shell-source-allowlist',enforce:'pre',generateBundle(_opts,bundle){
  const ids=Object.values(bundle).filter(x=>x.type==='chunk').flatMap(x=>Object.keys(x.modules))
  const src=ids.filter(x=>x.startsWith(root+'src/')).map(x=>x.slice((root+'src/').length))
  for(const x of src)assert.ok(allow.includes(x),'UNEXPECTED_SOURCE '+x)
  for(const x of allow)assert.ok(src.includes(x),'MISSING_SOURCE '+x)
  assert.ok(!ids.some(x=>/node_modules\/(?:@firebase\/firestore|firebase\/firestore|@supabase)\//.test(x)),'UNEXPECTED_DATA_SDK')
 }}
 const bundle=await build({root,configFile:false,envDir:false,publicDir:false,base:'/',logLevel:'warn',plugins:[plugin],build:{write:false,emptyOutDir:false,minify:false,modulePreload:false,rollupOptions:{input:root+entry}}})
 const chunks=(Array.isArray(bundle)?bundle:[bundle]).flatMap(b=>b.output??[])
 const assets=new Map(),entries=[]
 for(const chunk of chunks){
  assert.equal(chunk.type,'chunk')
  assert.ok(chunk.fileName.split('/').every(x=>/^[a-zA-Z0-9_-][a-zA-Z0-9_.-]*$/.test(x)))
  assert.match(chunk.fileName,/\.m?js$/)
  assets.set('/'+chunk.fileName,{type:'text/javascript; charset=utf-8',body:chunk.code})
  if(chunk.isEntry)entries.push(chunk.fileName)
 }
 assert.equal(entries.length,1)
 for(const chunk of chunks)for(const x of [...chunk.imports,...chunk.dynamicImports])assert.ok(assets.has('/'+x),'NONLOCAL_IMPORT')
 assets.set('/',{type:'text/html; charset=utf-8',body:'<!doctype html><meta charset="utf-8"><title>Unified UAT Portal Shell</title><link rel="icon" href="data:,"><div id="root"></div><script type="module" src="/'+entries[0]+'"></script>'})
 const require=createRequire(new URL('../server/qc-photo-access/package.json',import.meta.url))
 const {initializeApp,deleteApp}=require('firebase-admin/app')
 const {getAuth}=require('firebase-admin/auth'),{getFirestore}=require('firebase-admin/firestore')
 const admin=initializeApp({projectId:unifiedProjectId},'unified-portal-browser'),adb=getFirestore(admin),authAdmin=getAuth(admin)
 const ownerHttp=createOwnerHttp(createOwnerService({adb,authAdmin}))
 const planHttp=createUnifiedPlanningHttp({adb,authAdmin})
 const browserHttp=createUnifiedBrowserShell(assets)
 const contexts=[],errors=[];let browser,n=0
 const prefix='qc_uat_workspaces/cutover',mark=uid=>adb.doc('qc_uat_identities/'+uid),roleId='custom-field-operations'
 const catalog=adb.doc(prefix+'/role_catalog/'+roleId)
 const check=async(label,fn)=>{try{await fn()}catch(cause){throw Error('FAIL: '+label,{cause})}console.log('PASS: '+label);n++}
 const expected=async(locator,value)=>{await locator.filter({hasText:new RegExp('^'+value+'$')}).waitFor({timeout:20000})}
 async function listen(server,port){await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,unifiedHost,resolve)})}
 async function page(){
  const ctx=await browser.newContext({serviceWorkers:'block'});contexts.push(ctx)
  await ctx.route('**/*',async route=>{
   const u=new URL(route.request().url())
   if((u.origin===shellOrigin&&!u.search&&(assets.has(u.pathname)||shellRoute(u.pathname)))||u.origin==='http://'+unifiedHost+':'+unifiedAuthPort||u.protocol==='data:')await route.continue()
   else{errors.push('EGRESS '+u.origin+u.pathname);await route.abort()}
  })
  await ctx.routeWebSocket('**/*',ws=>{errors.push('WEBSOCKET');ws.close()})
  await ctx.addInitScript(()=>{globalThis.cspViolations=[];document.addEventListener('securitypolicyviolation',event=>cspViolations.push(event.effectiveDirective))})
  const p=await ctx.newPage()
  p.on('pageerror',error=>errors.push(error.message))
  await p.goto(shellOrigin)
  return p
 }
 async function login(p,uid){
  await p.getByRole('button',{name:'Login '+uid,exact:true}).click()
  await expected(p.getByTestId('actor'),uid)
  await expected(p.getByTestId('session-state'),'confirmed')
 }
 async function select(p){
  await p.getByRole('combobox',{name:'Role yang dikelola'}).selectOption(roleId)
  await expected(p.getByTestId('lifecycle-state'),'preview')
 }
 async function update(p,changes){
  for(const [k,v] of Object.entries(changes))await p.getByRole('combobox',{name:'lifecycle-'+k,exact:true}).selectOption(v)
  await p.getByRole('button',{name:'Tinjau edit role'}).click()
  const commit=p.getByRole('button',{name:'Konfirmasi edit role'})
  assert.equal(await commit.isDisabled(),true)
  await p.getByRole('textbox',{name:'Ketik konfirmasi role'}).fill('UBAH '+roleId)
  await commit.click()
  await expected(p.getByTestId('lifecycle-state'),'blocked')
  assert.match(await p.getByTestId('lifecycle-message').innerText(),/Perubahan role diterima/)
 }
 try{
  assert.equal((await authAdmin.listUsers(1)).users.length,0,'FRESH_AUTH_REQUIRED')
  for(const collection of ['qc_uat_identities','users','monthly_plans','daily_plans',prefix+'/role_catalog',prefix+'/role_catalog_audit',prefix+'/permission_audit',prefix+'/monthly_plans',prefix+'/daily_plans',prefix+'/qc_records',prefix+'/daily_reports']){
   assert.equal((await adb.collection(collection).limit(1).get()).size,0,'FRESH_FIRESTORE_REQUIRED')
  }
  for(const uid of ['uat-owner','uat-field','uat-viewer']){
   await authAdmin.createUser({uid,email:uid+'@unified-ui.example.test',password:'Synthetic-2026-'+uid,emailVerified:true})
   await authAdmin.setCustomUserClaims(uid,{qcUat:true})
  }
  const definition=roleDefinition({name:'Field Operations',permissions:{data_plan_monthly:'view'}})
  assert.equal(definition.id,roleId)
  await catalog.set({testOnly:true,workspace:'cutover',definition})
  const base={...marker('pengunjung'),policyRevision:0,roleOverrides:{},manualOverrides:{}}
  await mark('uat-field').set(assignIdentityRole(base,roleId,definition))
  await mark('uat-owner').set({...marker('owner'),policyRevision:0,roleOverrides:{},manualOverrides:{}})
  await mark('uat-viewer').set(base)
  await adb.doc(prefix+'/monthly_plans/uat-m1').set({testOnly:true,id:'uat-m1',pid:'uat-p1',targetArea100:900})
  await adb.doc(prefix+'/daily_plans/uat-d1').set({testOnly:true,id:'uat-d1',pid:'uat-p1',area100:400})
  for(const [id,activityId,formType,area100] of [['uat-ds','uat-a1','spray',1000],['uat-df','uat-a2','fertilizer',500]]){
   await adb.doc(prefix+'/daily_plans/'+id).set(nextPlanningRow('daily',{
    action:'create',id,expectedRevision:null,
    fields:{pid:'uat-p1',activityId,sourceType:'ADHOC',monthlyPlanLineId:'',date:'2026-11-03',shift:'1',foreman:'uat-f1',formType,area100}
   },null,'uat-field'))
  }
  await adb.doc('users/root-sentinel').set({protected:true})
  await adb.doc('monthly_plans/root-sentinel').set({protected:true})
  await listen(ownerHttp,4497);await listen(planHttp,4697);await listen(browserHttp,shellPort)
  browser=await chromium.launch({headless:true})
  const owner=await page(),field=await page(),viewer=await page()
  await check('signed out has zero menus and Owner role editor',async()=>{
   for(const p of [owner,field,viewer]){
    assert.equal(await p.locator('[data-testid^="menu-"]').count(),0)
    assert.equal(await p.getByRole('region',{name:'Edit dan hapus custom role UAT'}).count(),0)
   }
  })
  await check('Firebase Auth login in 3 separate contexts creates independent verified server sessions',async()=>{
   await login(owner,'uat-owner')
   await login(field,'uat-field')
   await login(viewer,'uat-viewer')
   assert.equal(await owner.getByRole('region',{name:'Edit dan hapus custom role UAT'}).count(),1)
   assert.equal(await field.getByRole('region',{name:'Edit dan hapus custom role UAT'}).count(),0)
   assert.equal(await viewer.getByRole('region',{name:'Edit dan hapus custom role UAT'}).count(),0)
  })
  await check('first render uses server grants: worker Monthly view, no Daily/QC, viewer none',async()=>{
   assert.equal(await field.getByTestId('menu-monthly').count(),1)
   assert.equal(await field.getByTestId('menu-daily').count(),0)
   assert.equal(await field.getByTestId('menu-spray').count(),0)
   assert.equal(await field.getByTestId('uat-full-spray').count(),0)
   assert.equal(await field.getByTestId('uat-full-fertilizer').count(),0)
   assert.equal(await viewer.getByTestId('menu-monthly').count(),0)
   await expected(field.getByTestId('revision'),'1')
  })
  await check('Monthly Plan read actually uses Planning HTTP, not local fixture data',async()=>{
   await field.getByRole('button',{name:'Baca Monthly UAT'}).click()
   await expected(field.getByTestId('read-result'),'monthly: uat-m1 / 900')
  })
  await check('Owner UI previews exact custom role and affected account revision',async()=>{
   await select(owner)
   assert.equal(await owner.getByTestId('lifecycle-member-count').innerText(),'1')
   assert.equal(await owner.getByTestId('lifecycle-revision').innerText(),'0')
   assert.match(await owner.getByRole('list',{name:'Akun yang menggunakan role'}).innerText(),/uat-field/)
  })
  await check('Owner UI edits catalog permissions through trusted server transaction',async()=>{
   await update(owner,{data_plan_monthly:'none',data_plan_daily:'view',qc_spraying:'edit',qc_fertilizer:'edit'})
   assert.equal((await catalog.get()).data().definition.revision,1)
   assert.equal((await mark('uat-field').get()).data().policyRevision,2)
   assert.equal((await adb.doc(prefix+'/role_catalog_audit/'+roleId+':1').get()).data().action,'edit_role')
  })
  await check('same worker Auth session refresh replaces menu with Daily and QC Spray, no relogin',async()=>{
   await field.getByRole('button',{name:'Refresh permission'}).click()
   await expected(field.getByTestId('session-state'),'confirmed')
   await expected(field.getByTestId('revision'),'2')
   assert.equal(await field.getByTestId('menu-monthly').count(),0)
   assert.equal(await field.getByTestId('menu-daily').count(),1)
   assert.equal(await field.getByTestId('menu-spray').count(),1)
   assert.match(await field.getByTestId('menu-spray').innerText(),/edit/)
   assert.equal(await field.getByTestId('menu-fertilizer').count(),1)
   assert.equal(await field.getByTestId('uat-full-spray').count(),1)
   assert.equal(await field.getByTestId('uat-full-fertilizer').count(),1)
  })
  await check('worker reads actual Daily via Planning HTTP with updated role but cannot read Monthly',async()=>{
   await field.getByRole('button',{name:'Baca Daily UAT'}).click()
   await expected(field.getByTestId('read-result'),'daily: uat-d1 / 400')
   assert.equal(await field.getByTestId('menu-monthly').count(),0)
  })
  await check('actual React Spray UAT selector commits over-target ready QC and Actual using verified Daily source',async()=>{
   assert.equal(await field.getByTestId('uat-qc-spray').count(),1)
   await field.getByRole('textbox',{name:'ID Daily Plan spray'}).fill('uat-ds')
   await field.getByRole('button',{name:'Periksa sumber spray'}).click()
   await expected(field.getByTestId('uat-qc-spray-state'),'sumber terverifikasi')
   assert.match(await field.getByTestId('uat-qc-spray-source').innerText(),/PID uat-p1/)
   await field.getByRole('textbox',{name:'Luas aktual spray'}).fill('12.00')
   await field.getByRole('button',{name:'Simpan ready spray'}).click()
   await field.getByTestId('uat-qc-spray-state').filter({hasText:/QC ready dan Actual tersimpan:/}).waitFor({timeout:20000})
   const actual=(await adb.collection(prefix+'/daily_reports').where('dailyPlanId','==','uat-ds').get()).docs
   assert.equal(actual.length,1)
   assert.equal(actual[0].data().actualArea100,1200)
   assert.equal(actual[0].data().plannedDailyArea100,1000)
  })
  await check('actual React Fertilizer UAT selector commits only its source and own Actual',async()=>{
   assert.equal(await field.getByTestId('uat-qc-fertilizer').count(),1)
   await field.getByRole('textbox',{name:'ID Daily Plan fertilizer'}).fill('uat-df')
   await field.getByRole('button',{name:'Periksa sumber fertilizer'}).click()
   await expected(field.getByTestId('uat-qc-fertilizer-state'),'sumber terverifikasi')
   await field.getByRole('textbox',{name:'Luas aktual fertilizer'}).fill('5.50')
   await field.getByRole('button',{name:'Simpan ready fertilizer'}).click()
   await field.getByTestId('uat-qc-fertilizer-state').filter({hasText:/QC ready dan Actual tersimpan:/}).waitFor({timeout:20000})
   const actual=(await adb.collection(prefix+'/daily_reports').where('dailyPlanId','==','uat-df').get()).docs
   assert.equal(actual.length,1)
   assert.equal(actual[0].data().actualArea100,550)
   assert.equal(actual[0].data().qcFormType,'fertilizer')
  })
  await check('Owner second edit revokes Daily and QC Spray while worker session is stale',async()=>{
   await owner.getByRole('button',{name:'Refresh daftar lifecycle role'}).click()
   await expected(owner.getByTestId('lifecycle-state'),'ready')
   await select(owner)
   await update(owner,{data_plan_daily:'none',qc_spraying:'none',qc_fertilizer:'none'})
   assert.equal((await catalog.get()).data().definition.revision,2)
   assert.equal((await mark('uat-field').get()).data().policyRevision,3)
   assert.equal(await field.getByTestId('menu-daily').count(),1)
  })
  await check('stale visible Daily button cannot bypass backend; failed read hides all menus',async()=>{
   await field.getByRole('button',{name:'Baca Daily UAT'}).click()
   await expected(field.getByTestId('session-state'),'denied')
   assert.equal(await field.getByTestId('menu-daily').count(),0)
   assert.equal(await field.getByTestId('menu-spray').count(),0)
   assert.equal(await field.getByTestId('read-result').innerText(),'request-denied')
  })
  await check('refresh recovers current none-permissions under same UID without role fallback',async()=>{
   await field.getByRole('button',{name:'Refresh permission'}).click()
   await expected(field.getByTestId('session-state'),'confirmed')
   await expected(field.getByTestId('revision'),'3')
   assert.equal(await field.locator('[data-testid^="menu-"]').count(),0)
   assert.equal(await field.getByTestId('role').innerText(),roleId)
  })
  await check('switching accounts never carries previous custom-role menus or Owner panel',async()=>{
   await field.getByRole('button',{name:'Login uat-viewer',exact:true}).click()
   await expected(field.getByTestId('actor'),'uat-viewer')
   await expected(field.getByTestId('session-state'),'confirmed')
   assert.equal(await field.locator('[data-testid^="menu-"]').count(),0)
   assert.equal(await field.getByRole('region',{name:'Edit dan hapus custom role UAT'}).count(),0)
  })
  await check('wrong-origin requests and arbitrary proxy paths rejected without upstream activity',async()=>{
   const forbidden=await fetch(shellOrigin+ownerPrefix+ownerPaths.rolesList,{method:'POST',headers:{Origin:'https://evil.example','Content-Type':'application/json'},body:'{}'})
   assert.equal(forbidden.status,403)
   const missing=await fetch(shellOrigin+'/api/planning/../unauthorized',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'})
   assert.equal(missing.status,404)
   assert.equal(forbidden.headers.get('access-control-allow-origin'),null)
  })
  await check('browser egress/CSP/storage isolation and production root sentinels untouched',async()=>{
   assert.deepEqual(errors,[])
   for(const p of [owner,field,viewer]){
    assert.deepEqual(await p.evaluate(()=>cspViolations),[])
    assert.deepEqual(await p.evaluate(()=>[localStorage.length,sessionStorage.length]),[0,0])
   }
   assert.deepEqual((await adb.doc('users/root-sentinel').get()).data(),{protected:true})
   assert.deepEqual((await adb.doc('monthly_plans/root-sentinel').get()).data(),{protected:true})
   assert.equal((await adb.collection(prefix+'/daily_reports').get()).size,2)
  })
  await check('logout clears authenticated role and permission menus immediately',async()=>{
   await owner.getByRole('button',{name:'Logout'}).click()
   await expected(owner.getByTestId('session-state'),'signed-out')
   assert.equal(await owner.getByRole('region',{name:'Edit dan hapus custom role UAT'}).count(),0)
   await field.getByRole('button',{name:'Logout'}).click()
   await expected(field.getByTestId('session-state'),'signed-out')
   assert.equal(await field.locator('[data-testid^="menu-"]').count(),0)
  })
  console.log('SUCCESS: '+n+' unified UAT portal-shell React browser checks passed (real Auth, Owner UI and Planning HTTP, same token)')
 }finally{
  for(const c of contexts)await c.close()
  if(browser)await browser.close()
  for(const server of [browserHttp,planHttp,ownerHttp])if(server.listening)await new Promise(resolve=>server.close(resolve))
  await adb.terminate();await deleteApp(admin)
 }
}
