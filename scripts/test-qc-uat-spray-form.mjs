// Mount real SprayForm.tsx, real PhotoPicker, DP normalization, draftStore,
// actual form bridge and batch queue. Only I/O boundaries are fixture substitutes.
import assert from 'node:assert/strict'
import {createRequire} from 'node:module'
import {createServer} from 'node:http'
import {readFileSync} from 'node:fs'
import {fileURLToPath} from 'node:url'
const root=fileURLToPath(new URL('../',import.meta.url)),host='127.0.0.1',port=4685,origin='http://'+host+':'+port
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8')
const allowed=['SprayForm.tsx','PhotoPicker.tsx','qcDailyPlanSource.ts','masterOperationalResources.ts','draftStore.ts','localDb.ts','qcOperationalFormBridge.ts','qcFormSaveIntent.mjs','qcOperationalQueue.mjs','qcOperationalSaveTransport.mjs','qcOperationalPhotoManifest.mjs']
const redirects={
 'SprayForm.tsx':['./firebase','./offline','./qcOperationalAdapters','./qcFormPhotoStaging'],
 'qcOperationalFormBridge.ts':['./qcOperationalAdapters'],
 'qcDailyPlanSource.ts':['./firebase','firebase/firestore'],
 'masterOperationalResources.ts':['./firebase','firebase/firestore']
}
const stub=root+'uat-spray-form-lab/fixtures.mjs'
assert.match(read('src/SprayForm.tsx'),/queueFormSession\(operationalItems\)/)
assert.match(read('src/SprayForm.tsx'),/dailyPlansForQcSession\(dailyPlanRows,'spray',date,shift,mandor\)/)
assert.doesNotMatch(read('src/SprayForm.tsx'),/resolveQcDailyPlan\(/)
assert.match(read('src/firebase.ts'),/QC_HOSTED_UAT_ISOLATION_REQUIRED/)
assert.doesNotMatch(read('src/main.tsx'),/uat-spray-form-lab/)
assert.ok(process.argv.length===3&&['--self-test','--browser'].includes(process.argv[2]))
console.log('SUCCESS: real SprayForm source and production isolation guards passed (offline)')
if(process.argv[2]==='--browser'){
 const dir=process.env.QC_UAT_PLAYWRIGHT_DIR
 assert.ok(dir?.startsWith('/'),'QC_UAT_PLAYWRIGHT_DIR_REQUIRED')
 const {chromium}=createRequire(dir+'/package.json')('playwright')
 const {build}=await import('vite')
 const seen=new Set()
 const plugin={name:'spray-form-fixture-boundaries',enforce:'pre',resolveId(id,importer){
  if(importer?.startsWith(root+'src/')){
   const file=importer.slice((root+'src/').length)
   if(redirects[file]?.includes(id)){seen.add(file+':'+id);return stub}
   if(id==='firebase'||id.startsWith('firebase/')||['./firebase','./offline','./qcOperationalAdapters','./qcFormPhotoStaging'].includes(id))throw Error('UNEXPECTED_LIVE_IMPORT '+file+':'+id)
  }
 },generateBundle(_options,bundle){
  const ids=Object.values(bundle).filter(o=>o.type==='chunk').flatMap(o=>Object.keys(o.modules))
  const src=ids.filter(id=>id.startsWith(root+'src/')).map(id=>id.slice((root+'src/').length))
  for(const id of src)assert.ok(allowed.includes(id),'UNEXPECTED_SOURCE '+id)
  for(const id of ['SprayForm.tsx','PhotoPicker.tsx','qcDailyPlanSource.ts','masterOperationalResources.ts','draftStore.ts','localDb.ts','qcOperationalFormBridge.ts','qcOperationalQueue.mjs'])assert.ok(src.includes(id),'MISSING_REAL_COMPONENT '+id)
  for(const [file,imports] of Object.entries(redirects))for(const id of imports)assert.ok(seen.has(file+':'+id),'MISSING_BOUNDARY '+file+':'+id)
  assert.ok(!ids.some(id=>/node_modules\/(?:firebase|@firebase)\//.test(id)),'FIREBASE_BUNDLE_DENIED')
 }}
 const built=await build({root,configFile:false,envDir:false,publicDir:false,logLevel:'warn',plugins:[plugin],build:{write:false,emptyOutDir:false,minify:false,rollupOptions:{input:root+'uat-spray-form-lab/main.jsx'}}})
 const chunks=(Array.isArray(built)?built:[built]).flatMap(r=>r.output??[]).filter(o=>o.type==='chunk')
 assert.equal(chunks.length,1);assert.equal(chunks[0].imports.length,0);assert.equal(chunks[0].dynamicImports.length,0)
 const csp="default-src 'none'; script-src 'self'; connect-src 'none'; img-src blob: data:; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'"
 const server=createServer((req,res)=>{
  res.setHeader('Content-Security-Policy',csp);res.setHeader('Cache-Control','no-store')
  if(req.method!=='GET'||req.headers.host!==host+':'+port){res.writeHead(403).end();return}
  if(req.url==='/'){res.setHeader('Content-Type','text/html; charset=utf-8');res.end('<!doctype html><meta charset="utf-8"><title>Spray Form Lab</title><div id="root"></div><script type="module" src="/lab.js"></script>')}
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
  const label=(name)=>name==='No. Unit'?card().locator('.working-section select'):card().getByLabel(name,{exact:true})
  const selectUnit=async value=>{
   const field=label('No. Unit')
   assert.equal(await field.count(),1,'EXPECTED_ONE_UNIT_SELECTOR')
   await field.locator('option').filter({hasText:new RegExp('^'+value+'$')}).waitFor({state:'attached'})
   assert.deepEqual(await field.selectOption({label:value}),[value])
   assert.equal(await field.inputValue(),value)
  }
  const button=(name)=>page.getByRole('button',{name,exact:true})
  const choice=(legend,name)=>card().locator('fieldset').filter({has:page.locator('legend',{hasText:new RegExp('^'+legend+'$')})}).getByRole('button',{name,exact:true})
  const msg=async value=>page.waitForFunction(v=>[...document.querySelectorAll('.alert')].some(el=>el.textContent.includes(v)),value)
  const queue=()=>page.evaluate(()=>sprayLab.queue())
  const waitSaved=async count=>page.waitForFunction(n=>document.querySelector('#saved-count')?.textContent===String(n),count)
  const draft=()=>page.evaluate(async()=>{await sprayLab.waitDraft();return sprayLab.readDraft()})
  const waitDraft=async()=>{await page.waitForFunction(async()=>{await sprayLab.waitDraft();return !!(await sprayLab.readDraft())?.date})}
  const setSession=async()=>{await page.locator('.session-bar input[type=date]').fill('2026-11-12');await page.locator('.session-bar select').first().selectOption('2');await page.locator('.session-bar input[placeholder="Ketik nama mandor"]').fill('Mandor B');await page.locator('.session-bar select').last().selectOption('Asisten A');await msg('Daily Plan Spraying tersedia')}
  const selectPlan=async pid=>{await choice('Activity','Post Emergence').click();await choice('Deskripsi','Post A').click();await choice('Paddock',pid).click()}
  const setTimes=async (start,end)=>{await card().locator('.working-section input[type=time]').nth(0).fill(start);await card().locator('.working-section input[type=time]').nth(1).fill(end)}
  const stat=async (name,value)=>{const row=card().locator('.stat').filter({has:page.locator('span',{hasText:new RegExp('^'+name+'$')})});await row.getByText(value,{exact:true}).waitFor()}
  await page.goto(origin);await page.locator('.qc-spray-form').waitFor()
  await check('actual SprayForm mounts and date filters real normalized DP rows',async()=>{await setSession();await choice('Activity','Post Emergence').waitFor();await choice('Activity','Post Emergence').click();await choice('Deskripsi','Post A').click();assert.equal(await choice('Paddock','F-004').count(),0);assert.equal(await choice('Paddock','OLD-001').count(),0);await choice('Paddock','B-002').click();assert.equal(await label('Daily Plan ID').inputValue(),'DP-2');assert.equal(await label('Monthly Plan ID').inputValue(),'MP-DP-2');assert.equal(await label('Variety').inputValue(),'UAT-V1')})
  await check('master unit mapping and required field validation',async()=>{await button('Simpan Semua Unit').click();await msg('lengkapi Jenis Unit');assert.equal((await queue()).length,0);await label('Jenis Unit').fill('Boom Sprayer');await selectUnit('SP001');await label('Luas aktual (Ha)').fill('9');await setTimes('15:00','01:00');await stat('Rentang Working · lintas hari','10j 00m')})
  await check('cross-midnight HOLD produces actual effective time and productivity',async()=>{await card().getByRole('button',{name:'⏸ Tambah HOLD',exact:true}).click();const h=card().locator('.hold-card').first();await h.getByLabel('Mulai',{exact:true}).fill('23:30');await h.getByLabel('Selesai',{exact:true}).fill('00:30');await h.getByLabel('Alasan',{exact:true}).fill('Synthetic downtime');await stat('Total HOLD','1j 00m');await stat('Working Efektif','9j 00m');await stat('Produktivitas Efektif','1,00 Ha/Jam')})
  await check('overlapping HOLD blocks save',async()=>{await card().getByRole('button',{name:'⏸ Tambah HOLD',exact:true}).click();const h=card().locator('.hold-card').last();await h.getByLabel('Mulai',{exact:true}).fill('23:45');await h.getByLabel('Selesai',{exact:true}).fill('00:45');await button('Simpan Semua Unit').click();await msg('Waktu HOLD tidak boleh bertumpuk');assert.equal((await queue()).length,0);await h.getByRole('button',{name:'Hapus',exact:true}).click()})
  await check('material estimates and adjuvant calculation use actual form controls',async()=>{const materials=card().locator('.material-card');assert.equal(await materials.count(),2);assert.equal(await materials.nth(0).getByLabel('Dosis/Ha').inputValue(),'2');assert.equal(await materials.nth(0).getByLabel('Estimated Usage').inputValue(),'18.00');assert.equal(await materials.nth(1).getByLabel('Estimated Usage').inputValue(),'4.50');await materials.nth(0).getByLabel('Actual Used').fill('17.5');await label('Dosis Adjuvant (mL/L)').fill('0.5');await label('Water Rate (L/Ha)').fill('350');assert.equal(await label('Estimated Adjuvant (L)').inputValue(),'1.57');await label('Actual Usage Air (L)').fill('3150')})
  const image=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=8;c.height=8;const x=c.getContext('2d');x.fillStyle='#328645';x.fillRect(0,0,8,8);return c.toDataURL('image/png').split(',')[1]})
  const photo={name:'synthetic.png',mimeType:'image/png',buffer:Buffer.from(image,'base64')}
  await check('actual PhotoPicker accepts main and HOLD and shows previews',async()=>{await card().locator('.photo-picker').last().locator('input[type=file]').last().setInputFiles(photo);await card().locator('.hold-card .photo-picker input[type=file]').last().setInputFiles(photo);await card().locator('.photo-picker img').first().waitFor();await page.waitForFunction(()=>document.querySelectorAll('.active-unit-card .photo-picker img').length===2);await waitDraft();await page.waitForFunction(async()=>{await sprayLab.waitDraft();const d=await sprayLab.readDraft();return d?.cards?.[0]?.photo instanceof File&&d.cards[0].holds[0].file instanceof File})})
  await check('real draftStore restores photo files and form state after reload',async()=>{await page.reload();await page.locator('.qc-spray-form').waitFor();await page.waitForFunction(()=>document.querySelector('.session-bar select')?.value==='2');await page.waitForFunction(()=>document.querySelectorAll('.active-unit-card .photo-picker').length===2);await page.waitForFunction(()=>document.querySelector('.active-unit-card .working-section select')?.value==='SP001');assert.equal(await label('No. Unit').inputValue(),'SP001');assert.equal(await label('Luas aktual (Ha)').inputValue(),'9');const restored=await page.evaluate(async()=>{const d=await sprayLab.readDraft();return {main:d.cards[0].photo.name,hold:d.cards[0].holds[0].file.name}});assert.deepEqual(restored,{main:'synthetic.png',hold:'synthetic.png'});await stat('Working Efektif','9j 00m')})
  await check('duplicate unit card copies plan but resets actual data',async()=>{await button('Duplikat').click();assert.equal(await page.getByRole('tab').count(),2);assert.equal(await label('Daily Plan ID').inputValue(),'DP-2');assert.equal(await label('No. Unit').inputValue(),'');assert.equal(await label('Luas aktual (Ha)').inputValue(),'');assert.equal(await card().locator('.hold-card').count(),0);await selectUnit('SP001');await label('Luas aktual (Ha)').fill('3');await setTimes('15:00','18:00');await button('Simpan Semua Unit').click();await msg('sudah digunakan pada unit lain');assert.equal((await queue()).length,0);await selectUnit('SP002')})
  await check('real form bridge persists two full ready DTOs atomically while offline',async()=>{await context.setOffline(true);await button('Simpan Semua Unit').click();await waitSaved(2);await msg('2 unit tersimpan dalam antrean');const rows=await queue();assert.equal(rows.length,2);const a=rows.find(x=>x.record.noUnit==='SP001'),b=rows.find(x=>x.record.noUnit==='SP002');assert.ok(a&&b);assert.equal(a.record.sessionId,b.record.sessionId);assert.notEqual(a.record.id,b.record.id);assert.equal(a.record.shift,'2');assert.equal(a.record.name,'Mandor B');assert.equal(a.record.dailyPlanId,'DP-2');assert.equal(a.record.monthlyPlanLineId,'MP-DP-2');assert.equal(a.record.actualAreaHa,9);assert.equal(a.record.workingDurationMinutes,600);assert.equal(a.record.holdTotalMinutes,60);assert.equal(a.record.effectiveWorkingMinutes,540);assert.equal(a.record.productivityHaPerHour,1);assert.equal(a.record.estUsagePesticide1,'18.00');assert.equal(a.record.actUsagePesticide1,'17.5');assert.equal(a.record.actualPlanMaterials[1].totalMaterial,4.5);assert.match(a.record.photoBase64,/^data:image\/jpeg;base64,/);assert.equal(a.record.holdIntervals.length,1);assert.deepEqual(a.changes.map(x=>x.kind).sort(),['hold','main']);assert.equal(a.record.saveType,'ready');assert.equal(b.record.actualAreaHa,3);assert.equal(b.changes.length,0);assert.equal((await page.evaluate(()=>sprayLab.getSaved())).every(r=>r.firestoreSaveState==='queued'),true);await context.setOffline(false)})
  await check('full draft save retains incomplete unit as draft without ready validation',async()=>{await setSession();await selectPlan('B-002');await button('Simpan Draft Semua Unit').click();await msg('1 unit tersimpan dalam antrean');const rows=await queue();assert.equal(rows.length,3);const d=rows.find(x=>x.record.saveType==='draft');assert.ok(d);assert.equal(d.record.paddock,'B-002');assert.equal(d.record.actualAreaHa,0);assert.equal(d.record.effectiveWorkingMinutes,0)})
  await check('confirmed fixture correction preserves owner and base revision via actual bridge',async()=>{const source=(await queue()).find(x=>x.record.noUnit==='SP001').record;const previous={...source,id:'qc-v2-fixture-correction',clientRevision:'fixture-base',saveType:'uploaded',firestoreSaveState:'confirmed',createdAt:'2026-11-12T00:00:00Z',photoBase64:'',photoDriveUrl:'',holdIntervals:[]};await page.evaluate(row=>sprayLab.editFixture([row]),previous);await page.getByRole('heading',{name:'Koreksi Spraying Uploaded'}).waitFor();await page.waitForFunction(()=>[...document.querySelectorAll('.qc-daily-link-grid input')].some(el=>el.value==='DP-2'));await label('Luas aktual (Ha)').fill('10');await button('Simpan Koreksi Uploaded').click();await msg('1 unit tersimpan dalam antrean');const row=(await queue()).find(x=>x.record.id===previous.id);assert.ok(row);assert.equal(row.baseRevision,'fixture-base');assert.equal(row.record.ownerUid,'uat-spray');assert.equal(row.record.createdAt,previous.createdAt);assert.equal(row.record.saveType,'uploaded');assert.equal(row.record.actualAreaHa,10);assert.equal(row.changes.length,0)})
  await page.evaluate(()=>sprayLab.editFixture([]));await page.getByRole('heading',{name:'Input Spraying per Unit'}).waitFor();await setSession()
  const shiftField=page.locator('.session-bar select').first(),mandorField=page.locator('.session-bar input[placeholder="Ketik nama mandor"]'),dateField=page.locator('.session-bar input[type=date]')
  const waitLink=async value=>page.waitForFunction(v=>[...document.querySelectorAll('.qc-daily-link-grid label')].find(l=>l.firstChild?.textContent==='Daily Plan ID')?.querySelector('input')?.value===v,value)
  await check('shift 2 Mandor B resolves DP-C2 instead of DP-C1',async()=>{await selectPlan('C-003');await waitLink('DP-C2');assert.equal(await label('Monthly Plan ID').inputValue(),'MP-DP-C2');assert.equal(await choice('Paddock','A-001').count(),0);assert.equal(await choice('Paddock','NO-SHIFT').count(),0);assert.equal(await choice('Paddock','NO-MANDOR').count(),0)})
  await check('changing mandor hides stale link and requires explicit reselection',async()=>{await label('Jenis Unit').fill('Boom Sprayer');await selectUnit('SP001');await label('Luas aktual (Ha)').fill('5');await setTimes('15:00','18:00');await mandorField.fill('Mandor A');await waitLink('');assert.equal(await label('Luas aktual (Ha)').inputValue(),'5');const before=await queue();await button('Simpan Semua Unit').click();await msg('pilih ulang Daily Plan');assert.deepEqual(await queue(),before);await button('Simpan Draft Semua Unit').click();await msg('Draft lokal tersimpan.');assert.deepEqual(await queue(),before);await choice('Paddock','C-003').click();await waitLink('DP-C3')})
  await check('changing shift cannot silently reassign selected plan',async()=>{await shiftField.selectOption('1');await waitLink('');await choice('Paddock','C-003').click();await waitLink('DP-C1');await shiftField.selectOption('2');await waitLink('');await mandorField.fill('  mandor   b  ');await choice('Paddock','C-003').click();await waitLink('DP-C2')})
  await check('date change cannot reuse old Daily Plan or materials',async()=>{await dateField.fill('2026-11-11');await waitLink('');await choice('Paddock','OLD-001').waitFor();assert.equal(await choice('Paddock','C-003').count(),0);assert.equal(await card().locator('.material-card').count(),0);await choice('Paddock','OLD-001').click();await waitLink('DP-OLD');await dateField.fill('2026-11-12');await waitLink('');await choice('Paddock','D-004').waitFor()})
  await check('ambiguous Daily Plan requires explicit ID and uses its exact materials',async()=>{await choice('Paddock','D-004').click();await waitLink('');const before=await queue();await button('Simpan Semua Unit').click();await msg('pilih ulang Daily Plan');assert.deepEqual(await queue(),before);await choice('Pilih Daily Plan','DP-D2').click();await waitLink('DP-D2');assert.equal(await label('Variety').inputValue(),'UAT-V2');assert.equal(await card().locator('.material-card').count(),1);assert.equal(await card().locator('.material-card').getByLabel('Dosis/Ha').inputValue(),'3');assert.equal(await card().locator('.material-card').getByLabel('Estimated Usage').inputValue(),'15.00')})
  await check('selected ambiguous plan persists correct ID and dose in queued DTO',async()=>{await button('Simpan Semua Unit').click();await msg('1 unit tersimpan dalam antrean');const rows=await queue();const row=rows.find(x=>x.record.dailyPlanId==='DP-D2');assert.ok(row);assert.equal(row.record.monthlyPlanLineId,'MP-DP-D2');assert.equal(row.record.actualPlanMaterials[0].material,'Synthetic C');assert.equal(row.record.actualPlanMaterials[0].totalMaterial,15)})
  await check('uploaded QC correction cannot silently reassign historical Daily Plan',async()=>{const source=(await queue()).find(x=>x.record.noUnit==='SP001'&&x.record.dailyPlanId==='DP-2').record;const previous={...source,id:'qc-v2-fixture-relink',clientRevision:'fixture-base',saveType:'uploaded',firestoreSaveState:'confirmed',photoBase64:'',photoDriveUrl:'',holdIntervals:[]};await page.evaluate(row=>sprayLab.editFixture([row]),previous);await page.getByRole('heading',{name:'Koreksi Spraying Uploaded'}).waitFor();await waitLink('DP-2');await choice('Paddock','C-003').click();await waitLink('DP-C2');const before=await queue();await button('Simpan Koreksi Uploaded').click();await msg('Daily Plan QC Uploaded tidak boleh dipindah');assert.deepEqual(await queue(),before)})
  await check('browser only uses fixture queue and local draft DB; no external connections',async()=>{const dbs=await page.evaluate(async()=> (await indexedDB.databases()).map(d=>d.name).sort());assert.deepEqual(dbs,['qc_react_local_v2','qc_uat_spray_form_capture_v1']);assert.deepEqual(violations,[]);assert.deepEqual(await page.evaluate(()=>cspViolations),[])})
  console.log('SUCCESS: '+n+' actual SprayForm browser capture and session mapping checks passed (no backend sync)')
 }finally{try{if(context)await context.close();if(browser)await browser.close()}finally{if(server.listening)await new Promise(resolve=>server.close(resolve))}}
}
