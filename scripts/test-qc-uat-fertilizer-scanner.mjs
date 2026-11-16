// Actual React scanner + parser; synthetic external I/O boundaries.
import assert from 'node:assert/strict'
import {createRequire} from 'node:module'
import {createServer} from 'node:http'
import {readFileSync} from 'node:fs'
import {fileURLToPath} from 'node:url'
const root=fileURLToPath(new URL('../',import.meta.url)),host='127.0.0.1',port=4796,origin='http://'+host+':'+port
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8')
const allowed=['FertilizerReportScanner.tsx']
const redirects={'FertilizerReportScanner.tsx':['./fertilizerAiScan','./fertilizerScanFeedback','./fertilizerOcrLearning','tesseract.js']}
const stub=root+'uat-fertilizer-scanner-lab/fixtures.mjs'
assert.match(read('src/FertilizerReportScanner.tsx'),/parseFertilizerReportText/)
assert.match(read('src/FertilizerReportScanner.tsx'),/onApply\(\{\.\.\.result,learningFeedbackSaved,learningChangedFields,learningEngine\},mode,file\)/)
assert.match(read('src/FertilizerForm.tsx'),/onApply=\{applyScan\}/)
assert.match(read('src/firebase.ts'),/QC_HOSTED_UAT_ISOLATION_REQUIRED/)
assert.doesNotMatch(read('src/main.tsx'),/uat-fertilizer-scanner-lab/)
assert.ok(process.argv.length===3&&['--self-test','--browser'].includes(process.argv[2]))
console.log('SUCCESS: Fertilizer scanner source and production isolation guards passed (offline)')
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
   if(id==='firebase'||id.startsWith('firebase/')||id==='tesseract.js'||['./firebase','./fertilizerAiScan','./fertilizerScanFeedback','./fertilizerOcrLearning'].includes(id))throw Error('UNEXPECTED_LIVE_IMPORT '+file+':'+id)
  }
 },generateBundle(_options,bundle){
  const ids=Object.values(bundle).filter(o=>o.type==='chunk').flatMap(o=>Object.keys(o.modules))
  const src=ids.filter(id=>id.startsWith(root+'src/')).map(id=>id.slice((root+'src/').length))
  for(const id of src)assert.ok(allowed.includes(id),'UNEXPECTED_SOURCE '+id)
  for(const id of allowed)assert.ok(src.includes(id),'MISSING_REAL_COMPONENT '+id)
  for(const [file,imports] of Object.entries(redirects))for(const id of imports)assert.ok(seen.has(file+':'+id),'MISSING_BOUNDARY '+file+':'+id)
  assert.ok(!ids.some(id=>/node_modules\/(?:firebase|@firebase)\//.test(id)),'FIREBASE_BUNDLE_DENIED')
 }}
 const built=await build({root,configFile:false,envDir:false,publicDir:false,logLevel:'warn',plugins:[plugin],build:{write:false,emptyOutDir:false,minify:false,rollupOptions:{input:root+'uat-fertilizer-scanner-lab/main.jsx'}}})
 const chunks=(Array.isArray(built)?built:[built]).flatMap(r=>r.output??[]).filter(o=>o.type==='chunk')
 assert.equal(chunks.length,1);assert.equal(chunks[0].imports.length,0);assert.equal(chunks[0].dynamicImports.length,0)
 const csp="default-src 'none'; script-src 'self'; connect-src 'none'; img-src blob: data:; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'"
 const server=createServer((req,res)=>{
  res.setHeader('Content-Security-Policy',csp);res.setHeader('Cache-Control','no-store')
  if(req.method!=='GET'||req.headers.host!==host+':'+port){res.writeHead(403).end();return}
  if(req.url==='/'){res.setHeader('Content-Type','text/html; charset=utf-8');res.end('<!doctype html><meta charset="utf-8"><title>Fertilizer Scanner Lab</title><div id="root"></div><script type="module" src="/lab.js"></script>')}
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
  const button=name=>page.getByRole('button',{name,exact:true})
  const snapshot=()=>page.evaluate(()=>scanLab.snapshot())
  const reset=async()=>{await page.evaluate(()=>scanLab.reset());await page.getByRole('dialog').waitFor()}
  const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jR1sAAAAASUVORK5CYII=','base64')
  const choose=async(name='synthetic-report.png')=>{await page.locator('input[type=file]').last().setInputFiles({name,mimeType:'image/png',buffer:png});await page.getByAltText('Preview laporan').waitFor()}
  const scan=async()=>{await button('Scan dengan AI').click();await page.locator('.scan-review').waitFor();await button('Ganti Form dengan Hasil Scan').waitFor({state:'visible'})}
  const fillRow=i=>page.locator('.scan-filling-row').nth(i)
  const value=(i,label)=>fillRow(i).getByLabel(label,{exact:true}).inputValue()
  await page.goto(origin);await page.getByRole('dialog').waitFor()
  await check('actual scanner opens without AI or automatic application',async()=>{assert.equal(await button('Scan dengan AI').isDisabled(),true);assert.equal((await snapshot()).calls.length,0);assert.equal((await snapshot()).applied.length,0)})
  await check('actual parser preserves separate materials and decimal comma',async()=>{const p=await page.evaluate(()=>scanLab.parse());assert.equal(p.date,'2026-11-12');assert.equal(p.shift,'2');assert.equal(p.mandor,'Mandor B');assert.equal(p.units[0].paddock,'C-003');assert.deepEqual(p.units[0].fillings.map(f=>[f.jenisPupuk,f.dosis,f.jumlah,f.hasilKerja]),[['Synthetic NK','450','9400','21'],['Synthetic DAP','150','3225','21.5']])})
  await check('AI result only appears for review; no feedback or Apply yet',async()=>{await choose();await scan();assert.equal(await value(0,'Pupuk'),'Synthetic NK');assert.equal(await value(1,'Pupuk'),'Synthetic DAP');assert.equal(await value(1,'Hasil Ha'),'21.5');assert.equal(await value(0,'Dosis Aktual'),(9400/21).toFixed(2));const s=await snapshot();assert.equal(s.applied.length,0);assert.equal(s.feedback.length,0);assert.equal(s.calls[0].engine,'ai')})
  await check('reviewed correction recomputes dose and explicit replace preserves both materials',async()=>{await fillRow(1).getByLabel('Hasil Ha',{exact:true}).fill('18');assert.equal(await value(1,'Dosis Aktual'),(3225/18).toFixed(2));await button('Ganti Form dengan Hasil Scan').click();await page.getByText('Scanner closed').waitFor();const s=await snapshot();assert.equal(s.applied.length,1);assert.equal(s.applied[0].mode,'replace');assert.equal(s.applied[0].name,'synthetic-report.png');assert.equal(s.applied[0].size,png.length);assert.deepEqual(s.applied[0].result.units[0].fillings.map(f=>[f.jenisPupuk,f.hasilKerja]),[['Synthetic NK','21'],['Synthetic DAP','18']]);assert.equal(s.feedback.length,1);assert.equal(s.feedback[0].original.units[0].fillings[1].hasilKerja,'21.5');assert.equal(s.feedback[0].corrected.units[0].fillings[1].hasilKerja,'18')})
  await check('append mode explicitly returns reviewed unit without implicit save',async()=>{await reset();await choose();await scan();await button('Tambahkan ke Form').click();await page.getByText('Scanner closed').waitFor();const s=await snapshot();assert.equal(s.applied[0].mode,'append');assert.equal(s.feedback[0].mode,'append')})
  await check('AI failure falls back through real parser and mock OCR worker',async()=>{await reset();await page.evaluate(()=>scanLab.mode('fail'));await choose();await scan();assert.equal(await value(1,'Pupuk'),'Synthetic DAP');assert.equal(await value(1,'Hasil Ha'),'21.5');assert.equal(await value(0,'Jumlah Kg'),'9400');const s=await snapshot();assert.deepEqual(s.calls.map(x=>x.engine),['ai','ocr','memory','terminate']);assert.equal(s.applied.length,0);await button('Ganti Form dengan Hasil Scan').click();await page.getByText('Scanner closed').waitFor();assert.equal((await snapshot()).feedback[0].engine,'ocr')})
  await check('new image clears earlier result; close without Apply writes nothing',async()=>{await reset();await choose();await scan();await choose('second-report.png');assert.equal(await page.locator('.scan-review').count(),0);await button('Tutup').click();await page.getByText('Scanner closed').waitFor();const s=await snapshot();assert.equal(s.applied.length,0);assert.equal(s.feedback.length,0)})
  await check('raw text reparse and manual extra filling remain editable',async()=>{await reset();await choose();await scan();await page.getByText('Teks OCR mentah / koreksi parser',{exact:true}).click();const textarea=page.locator('.scan-raw textarea');await textarea.fill((await textarea.inputValue()).replace('21,5','21,75'));await button('Parse Ulang Teks').click();assert.equal(await value(1,'Hasil Ha'),'21.75');await button('+ Pengisian').click();assert.equal(await page.locator('.scan-filling-row').count(),3);assert.equal(await value(2,'Pupuk'),'Synthetic DAP');assert.equal((await snapshot()).applied.length,0)})
  await check('fresh dual engine failure does not create result or apply',async()=>{await reset();await page.evaluate(()=>scanLab.mode('fail','fail'));await choose();await button('Scan dengan AI').click();await page.getByText(/OCR Lokal juga gagal/).waitFor();assert.equal(await page.locator('.scan-review').count(),0);assert.equal((await snapshot()).applied.length,0)})
  await check('isolated browser makes no external request or WebSocket; no database',async()=>{assert.deepEqual(violations,[]);assert.deepEqual(await page.evaluate(()=>cspViolations),[]);assert.deepEqual(await page.evaluate(async()=> (await indexedDB.databases()).map(d=>d.name)),[])})
  console.log('SUCCESS: '+n+' actual Fertilizer scanner review and parser checks (mock AI/OCR/feedback only)')
 }finally{try{if(context)await context.close();if(browser)await browser.close()}finally{if(server.listening)await new Promise(resolve=>server.close(resolve))}}
}
