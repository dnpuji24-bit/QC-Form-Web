// Mount real FertilizerForm.tsx, real PhotoPicker, DP normalization, draftStore,
// actual form bridge and batch queue. Only I/O boundaries are fixture substitutes.
import assert from 'node:assert/strict'
import {createRequire} from 'node:module'
import {createServer} from 'node:http'
import {readFileSync} from 'node:fs'
import {fileURLToPath} from 'node:url'
const root=fileURLToPath(new URL('../',import.meta.url)),host='127.0.0.1',port=4795,origin='http://'+host+':'+port
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8')
const allowed=['FertilizerForm.tsx','PhotoPicker.tsx','qcDailyPlanSource.ts','masterOperationalResources.ts','draftStore.ts','localDb.ts','qcOperationalFormBridge.ts','qcFertilizerProducts.ts','qcFormSaveIntent.mjs','qcOperationalQueue.mjs','qcOperationalSaveTransport.mjs','qcOperationalPhotoManifest.mjs']
const redirects={
 'FertilizerForm.tsx':['./firebase','firebase/firestore','./offline','./qcOperationalAdapters','./qcFormPhotoStaging','./FertilizerReportScanner'],
 'qcOperationalFormBridge.ts':['./qcOperationalAdapters'],
 'qcDailyPlanSource.ts':['./firebase','firebase/firestore'],
 'masterOperationalResources.ts':['./firebase','firebase/firestore']
}
const stub=root+'uat-fertilizer-form-lab/fixtures.mjs'
assert.match(read('src/FertilizerForm.tsx'),/queueFormSession\(operationalItems\)/)
assert.match(read('src/FertilizerForm.tsx'),/dailyPlansForQcSession\(dailyPlanRows,'fertilizer',date,shift,mandor\)/)
assert.doesNotMatch(read('src/FertilizerForm.tsx'),/resolveQcDailyPlan\(/)
assert.match(read('src/FertilizerForm.tsx'),/qcShiftOneCarryoverCandidates\(dailyPlanRows,'fertilizer',date,shift,mandor\)/)
assert.match(read('src/firebase.ts'),/QC_HOSTED_UAT_ISOLATION_REQUIRED/)
assert.doesNotMatch(read('src/main.tsx'),/uat-fertilizer-form-lab/)
assert.ok(process.argv.length===3&&['--self-test','--browser'].includes(process.argv[2]))
console.log('SUCCESS: real FertilizerForm source and production isolation guards passed (offline)')
if(process.argv[2]==='--browser'){
 const dir=process.env.QC_UAT_PLAYWRIGHT_DIR
 assert.ok(dir?.startsWith('/'),'QC_UAT_PLAYWRIGHT_DIR_REQUIRED')
 const {chromium}=createRequire(dir+'/package.json')('playwright')
 const {build}=await import('vite')
 const seen=new Set()
 const plugin={name:'fertilizer-form-fixture-boundaries',enforce:'pre',resolveId(id,importer){
  if(importer?.startsWith(root+'src/')){
   const file=importer.slice((root+'src/').length)
   if(redirects[file]?.includes(id)){seen.add(file+':'+id);return stub}
   if(id==='firebase'||id.startsWith('firebase/')||['./firebase','./offline','./qcOperationalAdapters','./qcFormPhotoStaging'].includes(id))throw Error('UNEXPECTED_LIVE_IMPORT '+file+':'+id)
  }
 },generateBundle(_options,bundle){
  const ids=Object.values(bundle).filter(o=>o.type==='chunk').flatMap(o=>Object.keys(o.modules))
  const src=ids.filter(id=>id.startsWith(root+'src/')).map(id=>id.slice((root+'src/').length))
  for(const id of src)assert.ok(allowed.includes(id),'UNEXPECTED_SOURCE '+id)
  for(const id of ['FertilizerForm.tsx','PhotoPicker.tsx','qcDailyPlanSource.ts','masterOperationalResources.ts','draftStore.ts','localDb.ts','qcOperationalFormBridge.ts','qcOperationalQueue.mjs'])assert.ok(src.includes(id),'MISSING_REAL_COMPONENT '+id)
  for(const [file,imports] of Object.entries(redirects))for(const id of imports)assert.ok(seen.has(file+':'+id),'MISSING_BOUNDARY '+file+':'+id)
  assert.ok(!ids.some(id=>/node_modules\/(?:firebase|@firebase)\//.test(id)),'FIREBASE_BUNDLE_DENIED')
 }}
 const built=await build({root,configFile:false,envDir:false,publicDir:false,logLevel:'warn',plugins:[plugin],build:{write:false,emptyOutDir:false,minify:false,rollupOptions:{input:root+'uat-fertilizer-form-lab/main.jsx'}}})
 const chunks=(Array.isArray(built)?built:[built]).flatMap(r=>r.output??[]).filter(o=>o.type==='chunk')
 assert.equal(chunks.length,1);assert.equal(chunks[0].imports.length,0);assert.equal(chunks[0].dynamicImports.length,0)
 const csp="default-src 'none'; script-src 'self'; connect-src 'none'; img-src blob: data:; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'"
 const server=createServer((req,res)=>{
  res.setHeader('Content-Security-Policy',csp);res.setHeader('Cache-Control','no-store')
  if(req.method!=='GET'||req.headers.host!==host+':'+port){res.writeHead(403).end();return}
  if(req.url==='/'){res.setHeader('Content-Type','text/html; charset=utf-8');res.end('<!doctype html><meta charset="utf-8"><title>Fertilizer Form Lab</title><div id="root"></div><script type="module" src="/lab.js"></script>')}
  else if(req.url==='/lab.js'){res.setHeader('Content-Type','text/javascript; charset=utf-8');res.end(chunks[0].code)}
  else res.writeHead(404).end()
 })
 let browser,context,n=0
 const violations=[]
 const check=async(name,fn)=>{try{await fn()}catch(e){throw Error('FAIL: '+name,{cause:e})}n++;console.log('PASS: '+name)}
 try{
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,host,resolve)})
  browser=await chromium.launch({headless:true})
  context=await browser.newContext({serviceWorkers:'block'})
  await context.route('**/*',async route=>{const u=new URL(route.request().url());if(u.origin===origin||u.protocol==='blob:'||u.protocol==='data:')await route.continue();else{violations.push('external');await route.abort()}})
  await context.routeWebSocket('**/*',ws=>{violations.push('websocket');ws.close()})
  await context.addInitScript(()=>{globalThis.cspViolations=[];document.addEventListener('securitypolicyviolation',e=>cspViolations.push(e.effectiveDirective))})
  const page=await context.newPage();page.on('pageerror',e=>violations.push(e.message))
  const card=()=>page.locator('.active-unit-card')
  const field=name=>card().getByLabel(name,{exact:true})
  const button=name=>page.getByRole('button',{name,exact:true})
  const picker=()=>card().getByRole('combobox',{name:'Daily Plan sumber Shift 1'})
  const msg=value=>page.waitForFunction(v=>[...document.querySelectorAll('.alert')].some(el=>el.textContent.includes(v)),value)
  const queue=()=>page.evaluate(()=>fertLab.queue())
  const session=async()=>{await page.locator('.session-bar input[type=date]').fill('2026-11-12');await page.locator('.session-bar select').first().selectOption('2');await page.locator('.session-bar input[placeholder="Ketik nama mandor"]').fill('Mandor B');await page.locator('.session-bar select').last().selectOption('Asisten A');await msg('Daily Plan Fertilizer tersedia')}
  const link=async id=>page.waitForFunction(id=>[...document.querySelectorAll('.active-unit-card label')].some(x=>x.textContent==='Daily Plan ID'&&x.querySelector('input')?.value===id),id)
  await page.goto(origin);await page.locator('.qc-fertilizer-form').waitFor()
  await check('own session maps same paddock to Shift 2 source and DAP',async()=>{await session();await field('Paddock').selectOption('C-003');await link('DP-F2');assert.equal(await field('Monthly Plan ID').inputValue(),'MP-DP-F2');assert.equal(await field('Dosis Target').inputValue(),'150');const opts=await field('Paddock').locator('option').allTextContents();assert.ok(!opts.includes('OLD-001')&&!opts.includes('SPRAY-001')&&!opts.includes('NO-SHIFT'))})
  await check('explicit Shift 1 carryover keeps actual executor and switches material',async()=>{await picker().selectOption('DP-F1');await link('DP-F1');assert.equal(await field('Monthly Plan ID').inputValue(),'MP-DP-F1');assert.equal(await field('Dosis Target').inputValue(),'450');await page.waitForFunction(()=>document.querySelector('.filling-row input[list]')?.value==='Synthetic NK');assert.equal(await page.locator('.session-bar select').first().inputValue(),'2');assert.equal(await page.locator('.session-bar input[placeholder="Ketik nama mandor"]').inputValue(),'Mandor B')})
  await check('ambiguous own DP requires explicit ID and draft stays local',async()=>{await field('Paddock').selectOption('D-004');assert.equal(await field('Daily Plan ID').inputValue(),'');await button('Simpan Draft Semua Unit').click();await msg('Draft lokal tersimpan');assert.equal((await queue()).length,0);await card().getByRole('combobox',{name:'Pilih Daily Plan ID'}).selectOption('DP-A2');await link('DP-A2');assert.equal(await field('Dosis Target').inputValue(),'150')})
  await check('changing shift and mandor invalidates source without reassignment',async()=>{await page.locator('.session-bar select').first().selectOption('1');assert.equal(await field('Daily Plan ID').inputValue(),'');assert.equal(await picker().count(),0);await page.locator('.session-bar input[placeholder="Ketik nama mandor"]').fill('Mandor A');assert.equal(await field('Daily Plan ID').inputValue(),'');await session();await picker().selectOption('DP-F1');await link('DP-F1');await page.locator('.session-bar input[placeholder="Ketik nama mandor"]').fill('Mandor A');assert.equal(await field('Daily Plan ID').inputValue(),'');await session()})
  await check('carryover overnight HOLD and Over Actual survive reload and queue',async()=>{await picker().selectOption('DP-F1');await link('DP-F1');await field('Jenis Unit').fill('Stool Splitter');await field('No. Unit').selectOption('SS001');await card().locator('.fertilizer-working-time input').nth(0).fill('15:00');await card().locator('.fertilizer-working-time input').nth(1).fill('01:00');await field('Jumlah (Kg)').fill('4050');await field('Hasil Kerja (Ha)').fill('9');await button('+ Tambah Issue').click();await card().getByPlaceholder('Jenis issue').fill('Downtime');await card().getByLabel('Jam mulai issue').fill('23:30');await card().getByLabel('Jam selesai issue').fill('00:30');await page.waitForFunction(async()=>{await fertLab.waitDraft();return (await fertLab.readDraft())?.cards[0]?.downtime[0]?.end==='00:30'});await page.reload();await page.locator('.qc-fertilizer-form').waitFor();await link('DP-F1');assert.equal(await field('Hasil Kerja (Ha)').inputValue(),'9');await button('Simpan Semua Unit').click();await msg('1 unit tersimpan dalam antrean');const row=(await queue()).find(j=>j.record.dailyPlanId==='DP-F1');assert.ok(row);const q=row.record;assert.equal(q.formType,'fertilizer');assert.equal(q.monthlyPlanLineId,'MP-DP-F1');assert.equal(q.shift,'2');assert.equal(q.name,'Mandor B');assert.equal(q.actualAreaHa,9);assert.equal(q.plannedDailyAreaHa,8);assert.equal(q.holdTotalMinutes,60);assert.equal(q.effectiveWorkingMinutes,540);assert.equal(q.productivityHaPerHour,1);assert.equal(q.pengisianList[0].dosisAktual,450);assert.equal(q.actualPlanMaterials[0].totalMaterial,4050)})
  await check('Uploaded correction cannot silently change source',async()=>{const q=(await queue()).find(j=>j.record.dailyPlanId==='DP-F1').record;await page.evaluate(q=>fertLab.editFixture([{...q,saveType:'uploaded',firestoreSaveState:'confirmed'}]),q);await page.getByRole('heading',{name:'Koreksi Fertilizer Uploaded'}).waitFor();await link('DP-F1');const count=(await queue()).length;await picker().selectOption('');await field('Paddock').selectOption('C-003');await link('DP-F2');await button('Simpan Koreksi Uploaded').click();await msg('Daily Plan QC Uploaded tidak boleh dipindah');assert.equal((await queue()).length,count)})
  await check('browser only uses fixture queue and local draft DB; no external connections',async()=>{const dbs=await page.evaluate(async()=> (await indexedDB.databases()).map(d=>d.name).sort());assert.deepEqual(dbs,['qc_react_local_v2','qc_uat_fertilizer_form_capture_v1']);assert.deepEqual(violations,[]);assert.deepEqual(await page.evaluate(()=>cspViolations),[])})
  console.log('SUCCESS: '+n+' actual FertilizerForm session mapping and carryover checks (no backend sync)')
 }finally{try{if(context)await context.close();if(browser)await browser.close()}finally{if(server.listening)await new Promise(resolve=>server.close(resolve))}}
}
