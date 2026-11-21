// 11D.5c.2b.3 — focused actual React full-form browser -> trusted HTTP -> Firestore emulator.
// No production, no photos, no Supabase, no storage, no invented real-world field records.
import assert from 'node:assert/strict'
import {createRequire} from 'node:module'
import {readFileSync} from 'node:fs'
import {fileURLToPath} from 'node:url'
import {marker} from '../src/qcUatRolePermissions.mjs'
import {permissionsForIdentity} from '../src/qcUatCustomRoles.mjs'
import {unifiedGuard,unifiedProjectId,unifiedHost,unifiedAuthPort} from '../server/qc-photo-access/uat-unified-identity-guard.mjs'
import {createOwnerHttp,createOwnerService} from '../server/qc-photo-access/uat-owner-permission-http.mjs'
import {createPlanningMasterSnapshotService} from '../server/qc-photo-access/uat-planning-role-service.mjs'
import {createUnifiedPlanningHttp} from '../server/qc-photo-access/uat-unified-planning-http.mjs'
import {createUnifiedBrowserShell,shellPort,shellOrigin,shellRoute} from '../server/qc-photo-access/uat-unified-browser-shell.mjs'
const root=fileURLToPath(new URL('../',import.meta.url)),read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8')
assert.equal(process.argv.length,3)
assert.ok(['--self-test','--browser'].includes(process.argv[2]))
assert.doesNotMatch(read('src/App.tsx'),/UatUnifiedFullOperationalForm|uat-unified-portal-lab/)
assert.doesNotMatch(read('src/main.tsx'),/UatUnifiedFullOperationalForm|uat-unified-portal-lab/)
assert.match(read('uat-unified-portal-lab/main.jsx'),/UatUnifiedFullOperationalForm/)
for(const p of ['/api/planning/uat/unified/qc/full/source','/api/planning/uat/unified/qc/full/spray/commit','/api/planning/uat/unified/qc/full/fertilizer/commit']){
 assert.equal(shellRoute(p)?.kind,'planning')
 assert.equal(shellRoute(p+'?x=1'),null)
}
console.log('SUCCESS: focused full QC browser test isolation and explicit routes passed (offline)')
if(process.argv[2]==='--browser'){
 unifiedGuard()
 const pw=process.env.QC_UAT_PLAYWRIGHT_DIR
 assert.ok(pw?.startsWith('/'),'QC_UAT_PLAYWRIGHT_DIR_REQUIRED')
 const {chromium}=createRequire(pw+'/package.json')('playwright')
 const {build}=await import('vite')
 const allow=['UatRoleLifecyclePanel.tsx','accessControl.ts','qcUatSessionPermissions.mjs','qcUatRolePermissions.mjs','qcUatCustomRoles.mjs','UatUnifiedOperationalForm.jsx','qcUatUnifiedOperationalForm.mjs','UatUnifiedFullOperationalForm.jsx','qcUatUnifiedFullQcFormBuilder.mjs','qcUatSprayFullDto.mjs','qcUatFertilizerFullDto.mjs']
 const plugin={name:'full-qc-browser-exact-src-allowlist',enforce:'pre',generateBundle(_opts,bundle){
  const ids=Object.values(bundle).filter(x=>x.type==='chunk').flatMap(x=>Object.keys(x.modules))
  const paths=ids.filter(x=>x.startsWith(root+'src/')).map(x=>x.slice((root+'src/').length))
  for(const p of paths)assert.ok(allow.includes(p),'UNEXPECTED_SOURCE '+p)
  for(const p of allow)assert.ok(paths.includes(p),'MISSING_SOURCE '+p)
  assert.ok(!ids.some(x=>/node_modules\/(?:@firebase\/firestore|firebase\/firestore|@supabase)\//.test(x)),'UNEXPECTED_DATA_SDK')
 }}
 const bundle=await build({root,configFile:false,envDir:false,publicDir:false,base:'/',logLevel:'warn',plugins:[plugin],build:{write:false,emptyOutDir:false,minify:false,modulePreload:false,rollupOptions:{input:root+'uat-unified-portal-lab/main.jsx'}}})
 const chunks=(Array.isArray(bundle)?bundle:[bundle]).flatMap(b=>b.output??[]),assets=new Map(),entries=[]
 for(const c of chunks){
  assert.equal(c.type,'chunk');assert.match(c.fileName,/\.m?js$/)
  assert.ok(c.fileName.split('/').every(x=>/^[A-Za-z0-9_-][A-Za-z0-9_.-]*$/.test(x)))
  assets.set('/'+c.fileName,{type:'text/javascript; charset=utf-8',body:c.code})
  if(c.isEntry)entries.push(c.fileName)
 }
 assert.equal(entries.length,1)
 for(const c of chunks)for(const x of [...c.imports,...c.dynamicImports])assert.ok(assets.has('/'+x),'NONLOCAL_IMPORT')
 assets.set('/',{type:'text/html; charset=utf-8',body:'<!doctype html><meta charset="utf-8"><link rel="icon" href="data:,"><div id="root"></div><script type="module" src="/'+entries[0]+'"></script>'})
 const require=createRequire(new URL('../server/qc-photo-access/package.json',import.meta.url))
 const {initializeApp:adminInit,deleteApp:adminDelete}=require('firebase-admin/app')
 const {getAuth}=require('firebase-admin/auth'),{getFirestore}=require('firebase-admin/firestore')
 const {initializeApp:clientInit,deleteApp:clientDelete}=await import('firebase/app')
 const {initializeAuth,inMemoryPersistence,connectAuthEmulator,signInWithEmailAndPassword,signOut}=await import('firebase/auth')
 const admin=adminInit({projectId:unifiedProjectId},'uat-full-ui-browser'),adb=getFirestore(admin),authAdmin=getAuth(admin)
 const ownerHttp=createOwnerHttp(createOwnerService({adb,authAdmin}))
 const planningHttp=createUnifiedPlanningHttp({adb,authAdmin})
 const shell=createUnifiedBrowserShell(assets)
 const base='qc_uat_workspaces/cutover',ref=(c,id)=>adb.doc(base+'/'+c+'/'+id)
 const mark=uid=>adb.doc('qc_uat_identities/'+uid),uid='uat-field'
 const servers=[ownerHttp,planningHttp,shell],errors=[],contexts=[]
 let setupApp,setupAuth,browser,n=0
 const check=async(label,fn)=>{try{await fn()}catch(cause){throw Error('FAIL: '+label,{cause})}n++;console.log('PASS: '+label)}
 const expected=async(locator,pattern)=>locator.filter({hasText:pattern}).waitFor({timeout:20000})
 const listen=(server,port)=>new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,unifiedHost,resolve)})
 try{
  assert.equal((await authAdmin.listUsers(1)).users.length,0,'FRESH_AUTH_REQUIRED')
  for(const path of ['users','qc_uat_identities','monthly_plans','daily_plans',...['monthly_plans','daily_plans','daily_work_groups','daily_group_members','monthly_plan_snapshots','daily_plan_snapshots','daily_group_snapshots','qc_records','daily_reports','qc_spray_full','qc_fertilizer_full','qc_operational_audit','qc_spray_full_audit','qc_fertilizer_full_audit'].map(x=>base+'/'+x)])
   assert.equal((await adb.collection(path).limit(1).get()).size,0,'FRESH_FIRESTORE_REQUIRED '+path)
  await authAdmin.createUser({uid,email:uid+'@unified-ui.example.test',password:'Synthetic-2026-'+uid,emailVerified:true})
  await authAdmin.setCustomUserClaims(uid,{qcUat:true})
  const m={...marker('asisten'),policyRevision:0,roleOverrides:{},manualOverrides:{}}
  await mark(uid).set({...m,permissions:permissionsForIdentity(m)})
  await adb.doc('users/root-sentinel').set({protected:true})
  await adb.doc('monthly_plans/root-sentinel').set({protected:true})
  const put=(c,id,row)=>ref(c,id).set(row)
  await put('master_companies','uat-company',{testOnly:true,code:'uat-company',active:true})
  await put('master_paddocks','uat-p1',{testOnly:true,pid:'uat-p1',active:true,companyCode:'uat-company',farm:'Farm A',stage:'Ratoon',variety:'V1/V2',areaPaddock100:2000,plantArea100:1800,varietyBreakdown:[{variety:'V1',area100:800},{variety:'V2',area100:1000}]})
  await put('master_foremen','uat-f1',{testOnly:true,id:'uat-f1',active:true,name:'Mandor A'})
  await put('master_shifts','1',{testOnly:true,code:'1',active:true})
  await put('master_units','uat-unit',{testOnly:true,id:'uat-unit',name:'Unit 01',active:true})
  await put('master_activities','uat-as',{testOnly:true,id:'uat-as',active:true,formType:'spray',companyScope:'GLOBAL',activity:'Spray',description:'Post Emergence',components:[{materialId:'uat-herb',dosePerHa:'1.2345',unit:'L'}]})
  await put('master_materials','uat-herb',{testOnly:true,id:'uat-herb',active:true,materialName:'Synthetic Herbicide',unit:'L'})
  await put('master_activities','uat-af',{testOnly:true,id:'uat-af',active:true,formType:'fertilizer',companyScope:'GLOBAL',activity:'Fertilizer',description:'Top Dressing',components:[{materialId:'uat-nk',dosePerHa:450,unit:'kg'},{materialId:'uat-dap',dosePerHa:150,unit:'kg'}]})
  for(const [id,name] of [['uat-nk','NK'],['uat-dap','DAP']])await put('master_materials',id,{testOnly:true,id,active:true,materialName:name,unit:'kg'})
  for(const [productId,name,componentId,material] of [['uat-brand-nk','Synthetic NK','uat-nk','NK'],['uat-brand-dap','Synthetic DAP','uat-dap','DAP']])
   await put('master_fertilizer_products',productId,{testOnly:true,productId,name,componentId,material,active:true})
  setupApp=clientInit({projectId:unifiedProjectId,apiKey:'demo-only-not-a-real-key'},'uat-full-ui-seeder')
  setupAuth=initializeAuth(setupApp,{persistence:inMemoryPersistence})
  connectAuthEmulator(setupAuth,'http://'+unifiedHost+':'+unifiedAuthPort,{disableWarnings:true})
  await signInWithEmailAndPassword(setupAuth,uid+'@unified-ui.example.test','Synthetic-2026-'+uid)
  const token=await setupAuth.currentUser.getIdToken()
  const snapshot=createPlanningMasterSnapshotService({adb,authAdmin})
  const mpfields={pid:'uat-p1',monthKey:'2026-11',week:'W1',targetArea100:1000,activityId:'uat-as'}
  for(const [mid,activityId] of [['uat-ms','uat-as'],['uat-mf','uat-af']])
   await snapshot.createMonthly(token,{id:mid,fields:{...mpfields,activityId},selectedVarieties:['V1']})
  const group=(id,activityId,formType,mid,did)=>({
   workGroupId:id,planningOrder:1,date:'2026-11-03',shift:'1',foreman:'uat-f1',activityId,formType,sourceType:'MONTHLY',
   manpower:7,unitName:'Unit 01',unitReady:1,unitStandby:0,unitBreakdown:0,notes:'',
   rows:[{dailyPlanId:did,pid:'uat-p1',monthlyPlanLineId:mid,area100:1000}]
  })
  await snapshot.createGroup(token,group('uat-gs','uat-as','spray','uat-ms','uat-ds'))
  await snapshot.createGroup(token,group('uat-gf','uat-af','fertilizer','uat-mf','uat-df'))
  await listen(ownerHttp,4497);await listen(planningHttp,4697);await listen(shell,shellPort)
  browser=await chromium.launch({headless:true})
  const ctx=await browser.newContext({serviceWorkers:'block'});contexts.push(ctx)
  await ctx.route('**/*',async route=>{
   const u=new URL(route.request().url())
   if((u.origin===shellOrigin&&!u.search&&(assets.has(u.pathname)||shellRoute(u.pathname)))||
     u.origin==='http://'+unifiedHost+':'+unifiedAuthPort||u.protocol==='data:')await route.continue()
   else{errors.push('EGRESS '+u.origin+u.pathname);await route.abort()}
  })
  await ctx.routeWebSocket('**/*',ws=>{errors.push('WEBSOCKET');ws.close()})
  await ctx.addInitScript(()=>{globalThis.cspViolations=[];document.addEventListener('securitypolicyviolation',event=>cspViolations.push(event.effectiveDirective))})
  const page=await ctx.newPage()
  page.on('pageerror',e=>errors.push(e.message))
  await page.goto(shellOrigin)
  const spray=page.getByTestId('uat-full-spray'),fert=page.getByTestId('uat-full-fertilizer')
  await check('real Auth login, permission-gated full editors and trusted complete Planning source',async()=>{
   await page.getByRole('button',{name:'Login uat-field',exact:true}).click()
   await expected(page.getByTestId('session-state'),/^confirmed$/)
   assert.equal(await spray.count(),1);assert.equal(await fert.count(),1)
   await spray.getByRole('textbox',{name:'Full spray Daily Plan ID'}).fill('uat-ds')
   await spray.getByRole('button',{name:'Full spray periksa sumber'}).click()
   await expected(spray.getByTestId('uat-full-spray-status'),/sumber lengkap terverifikasi/)
   assert.match(await spray.getByTestId('uat-full-spray-source').innerText(),/PID uat-p1/)
   assert.match(await spray.innerText(),/Synthetic Herbicide/)
   await fert.getByRole('textbox',{name:'Full fertilizer Daily Plan ID'}).fill('uat-ds')
   await fert.getByRole('button',{name:'Full fertilizer periksa sumber'}).click()
   await expected(fert.getByTestId('uat-full-fertilizer-status'),/sumber ditolak/)
   assert.equal((await ref('qc_records','uat-ds').get()).exists,false)
   await fert.getByRole('textbox',{name:'Full fertilizer Daily Plan ID'}).fill('uat-df')
   await fert.getByRole('button',{name:'Full fertilizer periksa sumber'}).click()
   await expected(fert.getByTestId('uat-full-fertilizer-status'),/sumber lengkap terverifikasi/)
   assert.match(await fert.innerText(),/NK, DAP/)
  })
  const fill=async(panel,kind,label,value)=>panel.getByLabel('Full '+kind+' '+label,{exact:true}).fill(value)
  await check('React Spray ready saves exact full source, measured usage and 12 Ha, but lost HTTP reply retains original retry',async()=>{
   for(const [label,value] of [['Nama asisten','Asisten UAT'],['Unit','Boom Sprayer'],['Nomor unit','BS001'],['Jam mulai','08:00'],['Jam selesai','17:00'],['Luas aktual Ha','12.00'],['Water rate L/Ha','350'],['Dosis adjuvant','0.5'],['Adjuvant','Synthetic']])
    await fill(spray,'spray',label,value)
   await spray.getByRole('textbox',{name:'Full spray measured Synthetic Herbicide'}).fill('14.7')
   await spray.getByRole('button',{name:'Tambah hold'}).click()
   for(const [name,value] of [['start','12:00'],['end','13:00'],['reason','Break']])
    await spray.getByLabel('Full spray hold '+name+' 1',{exact:true}).fill(value)
   const url='**/api/planning/uat/unified/qc/full/spray/commit'
   let committed=false
   await page.route(url,async route=>{
    const response=await route.fetch()
    if(response.status()===200){committed=true;await route.abort('failed')}
    else await route.fulfill({response})
   })
   await spray.getByRole('button',{name:'Full spray simpan ready'}).click()
   await expected(spray.getByTestId('uat-full-spray-status'),/hasil belum terkonfirmasi/)
   await page.unroute(url)
   assert.equal(committed,true,'TRUSTED_COMMIT_MUST_RETURN_200')
   const docs=(await adb.collection(base+'/qc_spray_full').get()).docs
   assert.equal(docs.length,1)
   const id=docs[0].id,full=docs[0].data().form
   assert.equal(full.dailyPlanId,'uat-ds');assert.equal(full.paddock,'uat-p1')
   assert.equal(full.actUsagePesticide1,'14.7')
   assert.equal(full.actualAreaHa,12);assert.equal(full.plannedDailyAreaHa,10)
   assert.equal(full.actualPlanMaterials[0].totalMaterial,14.814)
   assert.equal(full.holdTotalMinutes,60);assert.equal(full.effectiveWorkingMinutes,480)
   const actual=(await ref('daily_reports','qcactual_'+id).get()).data()
   assert.equal(actual.actualArea100,1200)
   assert.equal(actual.plannedDailyArea100,1000)
   assert.equal((await ref('qc_operational_audit',id+':'+full.clientRevision).get()).exists,true)
  })
  await check('retry the SAME client request after response loss: no duplicated Spray QC, Actual, detail or audit',async()=>{
   await spray.getByRole('button',{name:'Full spray ulang request identik'}).click()
   await expected(spray.getByTestId('uat-full-spray-status'),/QC lengkap ready tersimpan:/)
   assert.equal((await adb.collection(base+'/qc_records').get()).size,1)
   assert.equal((await adb.collection(base+'/qc_spray_full').get()).size,1)
   assert.equal((await adb.collection(base+'/qc_spray_full_audit').get()).size,1)
   assert.equal((await adb.collection(base+'/daily_reports').get()).size,1)
   assert.equal((await adb.collection(base+'/qc_operational_audit').get()).size,1)
  })
  await check('React Fertilizer two separate NK/DAP fillings commit application area only, component amounts, immutable full DTO',async()=>{
   for(const [label,value] of [['Nama asisten','Asisten UAT'],['Unit','Stool Splitter'],['Nomor unit','SS001'],['Jam mulai','08:00'],['Jam selesai','17:00']])
    await fill(fert,'fertilizer',label,value)
   for(const [key,value] of [['productName','Synthetic NK'],['kg','3500.00'],['areaHa','8.00'],['statusHose','Lancar'],['distribution','2']])
    await fert.getByLabel('Full fertilizer '+key+' 1',{exact:true}).fill(value)
   await fert.getByRole('button',{name:'Tambah pengisian'}).click()
   await fert.getByRole('combobox',{name:'Full fertilizer komponen 2'}).selectOption('uat-dap')
   for(const [key,value] of [['productName','Synthetic DAP'],['kg','750.00'],['areaHa','5.00'],['statusHose','Lancar'],['distribution','2']])
    await fert.getByLabel('Full fertilizer '+key+' 2',{exact:true}).fill(value)
   await fert.getByRole('button',{name:'Full fertilizer simpan ready'}).click()
   await expected(fert.getByTestId('uat-full-fertilizer-status'),/QC lengkap ready tersimpan:/)
   const docs=(await adb.collection(base+'/qc_fertilizer_full').get()).docs
   assert.equal(docs.length,1)
   const id=docs[0].id,full=docs[0].data().form
   assert.equal(full.dailyPlanId,'uat-df')
   assert.deepEqual(full.pengisianList.map(v=>[v.jenisPupuk,v.jumlah,v.hasilKerja,v.dosisAktual]),[['Synthetic NK',3500,8,437.5],['Synthetic DAP',750,5,150]])
   const actual=(await ref('daily_reports','qcactual_'+id).get()).data()
   assert.equal(actual.areaSemantics,'APPLICATION_HA_ONLY')
   assert.equal(actual.applicationArea100,1300)
   assert.deepEqual(actual.fertilizerComponents.map(v=>[v.material,v.actualArea100,v.actualKg100]),[['NK',800,350000],['DAP',500,75000]])
   assert.ok(!Object.hasOwn(actual,'actualArea100'),'NO_FALSE_PHYSICAL_AREA')
   assert.equal((await ref('qc_fertilizer_full_audit',id+':'+full.clientRevision).get()).exists,true)
   assert.equal((await ref('qc_operational_audit',id+':'+full.clientRevision).get()).exists,true)
  })
  await check('full end-to-end source permission revocation, root isolation and zero browser storage/network escapes',async()=>{
   const old=(await mark(uid).get()).data()
   const newMarker={...old,policyRevision:old.policyRevision+1,manualOverrides:{qc_spraying:'none',qc_fertilizer:'none'}}
   await mark(uid).set({...newMarker,permissions:permissionsForIdentity(newMarker)})
   await spray.getByRole('textbox',{name:'Full spray Daily Plan ID'}).fill('uat-ds')
   await spray.getByRole('button',{name:'Full spray periksa sumber'}).click()
   await expected(spray.getByTestId('uat-full-spray-status'),/sumber ditolak/)
   await page.getByRole('button',{name:'Refresh permission'}).click()
   await expected(page.getByTestId('session-state'),/^confirmed$/)
   assert.equal(await spray.count(),0);assert.equal(await fert.count(),0)
   assert.equal((await adb.collection(base+'/qc_records').get()).size,2)
   assert.equal((await adb.collection(base+'/daily_reports').get()).size,2)
   assert.deepEqual((await adb.doc('users/root-sentinel').get()).data(),{protected:true})
   assert.deepEqual((await adb.doc('monthly_plans/root-sentinel').get()).data(),{protected:true})
   assert.deepEqual(await page.evaluate(()=>[localStorage.length,sessionStorage.length]),[0,0])
   assert.deepEqual(await page.evaluate(()=>cspViolations),[])
   assert.deepEqual(errors,[])
  })
  console.log('SUCCESS: '+n+' focused full QC React browser -> trusted Planning HTTP -> actual/audit emulator checks passed')
 }finally{
  for(const c of contexts)await c.close()
  if(browser)await browser.close()
  for(const s of servers)if(s.listening)await new Promise(resolve=>s.close(resolve))
  if(setupAuth)await signOut(setupAuth)
  if(setupApp)await clientDelete(setupApp)
  await adb.terminate();await adminDelete(admin)
 }
}
