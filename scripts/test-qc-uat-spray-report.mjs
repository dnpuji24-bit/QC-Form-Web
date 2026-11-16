// Execute actual App.tsx report and export function bodies, not the production App.
import assert from 'node:assert/strict'
import {createRequire} from 'node:module'
import {createServer} from 'node:http'
import {readFileSync} from 'node:fs'
import {fileURLToPath} from 'node:url'
import {fixture} from './qc-uat-spray-full-dto-fixture.mjs'
import {prepareOperationalPhotoManifest,stripOperationalPhotoPayload} from '../src/qcOperationalPhotoManifest.mjs'
const root=fileURLToPath(new URL('../',import.meta.url)),host='127.0.0.1',port=4785,origin='http://'+host+':'+port
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8')
const source=read('src/App.tsx')
function between(a,b){assert.equal(source.split(a).length,2,'START_BOUNDARY_CHANGED');const i=source.indexOf(a),j=source.indexOf(b,i+a.length);assert.ok(i>=0&&j>i,'END_BOUNDARY_CHANGED');return source.slice(i,j)}
const report=between('const value=(v:unknown','\nfunction Settings(')
const excel=between('type ExportCell=','function recordSearchText')
const download=between('async function exportExcel(){','function sessionSize(')
assert.match(report,/function RecordReport\(/);assert.match(report,/useOperationalReportPhotos\(record\)/)
assert.match(report,/import\('html2canvas'\)/);assert.match(report,/import\('jspdf'\)/)
assert.match(download,/XLSX.writeFile\(workbook,/)
assert.match(excel,/Daily Plan ID \(Sumber\)/);assert.match(report,/Target Daily Plan/)
assert.doesNotMatch(read('src/main.tsx'),/uat-spray-report-lab/)
assert.match(read('src/firebase.ts'),/QC_HOSTED_UAT_ISOLATION_REQUIRED/)
assert.ok(process.argv.length===3&&['--self-test','--browser'].includes(process.argv[2]))
const extracted="import React,{useState,useEffect} from 'react'\nimport {createPortal} from 'react-dom'\nimport {useOperationalReportPhotos} from '../src/useOperationalReportPhotos'\nimport {uploadStatusInfo} from '../src/UploadStatus'\nimport type {QcRecord} from '../src/types'\nfunction QcSupabasePhotoViewer(){return null}\n"+excel+"\n"+report+"\nexport {RecordReport}\nexport async function downloadExcel(filtered:QcRecord[]){const setExporting=(_v:boolean)=>{};"+download+";return exportExcel()}\n"
console.log('SUCCESS: Spray report source, export and isolation guards passed (offline)')
if(process.argv[2]==='--browser'){
 const dir=process.env.QC_UAT_PLAYWRIGHT_DIR;assert.ok(dir?.startsWith('/'),'QC_UAT_PLAYWRIGHT_DIR_REQUIRED')
 const {chromium}=createRequire(dir+'/package.json')('playwright'),{build}=await import('vite'),XLSX=await import('xlsx')
 const virtual=root+'uat-spray-report-lab/report-extracted.tsx',stub=root+'uat-spray-report-lab/fixtures.mjs'
 const redirects=['./firebase','./qcLocalUat','./qcPhotoEnvironment'],seen=new Set()
 const plugin={name:'report-fixture-boundaries',enforce:'pre',resolveId(id,importer){
  if(id==='./report-extracted'&&importer===root+'uat-spray-report-lab/main.jsx')return virtual
  if(importer===root+'src/useOperationalReportPhotos.ts'&&redirects.includes(id)){seen.add(id);return stub}
  if(id==='firebase'||id.startsWith('firebase/')||id==='./firebase')throw Error('LIVE_IMPORT_DENIED')
 },load(id){if(id===virtual)return extracted},generateBundle(_opts,bundle){
  const ids=Object.values(bundle).filter(o=>o.type==='chunk').flatMap(o=>Object.keys(o.modules))
  for(const id of ids.filter(id=>id.startsWith(root+'src/')))assert.ok(['useOperationalReportPhotos.ts','UploadStatus.tsx','styles.css','theme.css','field-ui.css'].includes(id.slice((root+'src/').length)),'UNEXPECTED_SOURCE '+id)
  assert.ok(ids.includes(virtual)&&ids.includes(root+'src/useOperationalReportPhotos.ts'))
  assert.deepEqual([...seen].sort(),[...redirects].sort());assert.ok(!ids.some(id=>/node_modules\/(?:firebase|@firebase)\//.test(id)))
 }}
 const built=await build({root,configFile:false,envDir:false,publicDir:false,logLevel:'warn',plugins:[plugin],build:{write:false,emptyOutDir:false,minify:false,rollupOptions:{input:root+'uat-spray-report-lab/main.jsx',output:{inlineDynamicImports:true}}}})
 const output=(Array.isArray(built)?built:[built]).flatMap(r=>r.output??[])
 const chunks=output.filter(o=>o.type==='chunk'),css=output.filter(o=>o.type==='asset'&&o.fileName.endsWith('.css'))
 assert.equal(chunks.length,1);assert.equal(chunks[0].imports.length,0);assert.equal(chunks[0].dynamicImports.length,0);assert.ok(css.length)
 const csp="default-src 'none'; script-src 'self'; connect-src 'none'; img-src blob: data:; style-src 'self' 'unsafe-inline'; frame-src 'self' about:; base-uri 'none'; frame-ancestors 'none'; form-action 'none'"
 const server=createServer((req,res)=>{
  res.setHeader('Content-Security-Policy',csp);res.setHeader('Cache-Control','no-store')
  if(req.method!=='GET'||req.headers.host!==host+':'+port){res.writeHead(403).end();return}
  if(req.url==='/'){res.setHeader('Content-Type','text/html; charset=utf-8');res.end('<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Report lab</title><link rel="stylesheet" href="/lab.css"><div id="root"></div><script type="module" src="/lab.js"></script>')}
  else if(req.url==='/lab.js'){res.setHeader('Content-Type','text/javascript; charset=utf-8');res.end(chunks[0].code)}
  else if(req.url==='/lab.css'){res.setHeader('Content-Type','text/css');res.end(css.map(x=>String(x.source)).join('\n'))}
  else res.writeHead(404).end()
 })
 let browser,context,n=0;const violations=[]
 const check=async(name,fn)=>{try{await fn()}catch(e){throw Error('FAIL: '+name,{cause:e})}n++;console.log('PASS: '+name)}
 try{
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,host,resolve)})
  browser=await chromium.launch({headless:true});context=await browser.newContext({serviceWorkers:'block',acceptDownloads:true,viewport:{width:1280,height:900}})
  await context.route('**/*',async route=>{const u=new URL(route.request().url());if(u.origin===origin||['blob:','data:','about:'].includes(u.protocol))await route.continue();else{violations.push('external');await route.abort()}})
  await context.routeWebSocket('**/*',ws=>{violations.push('websocket');ws.close()})
  await context.addInitScript(()=>{globalThis.cspViolations=[];document.addEventListener('securitypolicyviolation',e=>cspViolations.push(e.effectiveDirective))})
  const page=await context.newPage();page.on('pageerror',e=>violations.push(e.message))
  await page.goto(origin);await page.waitForFunction(()=>!!globalThis.reportLab)
  const png=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=120;c.height=80;const x=c.getContext('2d');x.fillStyle='#298050';x.fillRect(0,0,120,80);return c.toDataURL('image/png')})
  const {r}=fixture(),changes=[{kind:'main',action:'replace',dataUrl:png},{kind:'hold',holdId:'uat-h1',action:'replace',dataUrl:png}]
  const {manifest,uploads}=await prepareOperationalPhotoManifest({recordId:r.id,uploaderUid:r.ownerUid,previous:{},changes,bucket:'qc-photos-uat-mock'})
  const record={...stripOperationalPhotoPayload(r),saveType:'uploaded',firestoreSaveState:'confirmed',operationalPhotoManifest:manifest}
  const items=Object.fromEntries(uploads.map(u=>[u.reference.photoId,{base64:Buffer.from(u.bytes).toString('base64'),type:u.reference.contentType}]))
  const show=async(row=record,photos=items,paused=false)=>{await page.evaluate(({row,photos,paused})=>{reportLab.setSession(true);reportLab.setPhotos(row.id,photos);if(paused)reportLab.pause();reportLab.show(row)},{row,photos,paused});await page.getByRole('dialog').waitFor()}
  const button=name=>page.getByRole('button',{name,exact:true})
  const ready=()=>page.waitForFunction(()=>!document.querySelector('.report-toolbar button')?.disabled)
  const close=async()=>{await button('Tutup').click();await page.getByRole('dialog').waitFor({state:'detached'})}
  const downloadBytes=async name=>{const d=page.waitForEvent('download');await button(name).click();const f=await d;assert.equal(await f.failure(),null);return {name:f.suggestedFilename(),bytes:readFileSync(await f.path())}}
  const field=async(label,expected)=>{const row=page.locator('.report-grid>div').filter({has:page.locator('span',{hasText:new RegExp('^'+label.replace(/[.*+?^$\u007b\u007d()|[\]\\]/g,'\\$&')+'$')})});assert.equal(await row.locator('strong').textContent(),expected)}
  await check('preview waits for verified private photo bytes before export',async()=>{await show(record,items,true);assert.ok(await button('JPG').isDisabled());assert.ok(await button('Cetak / PDF').isDisabled());await page.evaluate(()=>reportLab.resume());await ready()})
  await check('report preserves source IDs, actual executor and over-actual',async()=>{await field('Daily Plan ID (Sumber)',r.dailyPlanId);await field('Monthly Plan ID (Sumber)',r.monthlyPlanLineId);await field('Target Daily Plan','8 Ha');await field('Shift','2');await field('Mandor','Mandor B');await field('Luas Aktual','9 Ha')})
  await check('overnight HOLD timing and material values displayed',async()=>{await field('Jam Mulai','15:00');await field('Jam Selesai','01:00');await field('Working Efektif','540 menit');await field('Total HOLD','60 menit');await field('Produktivitas Efektif','1 Ha/Jam');await field('Pesticide 1',r.pesticide1);await page.getByText(/23:30–00:30/).waitFor()})
  await check('main and HOLD images decode from distinct verified blob slots',async()=>{const images=page.locator('#record-report-sheet img');assert.equal(await images.count(),2);const decoded=await images.evaluateAll(async list=>Promise.all(list.map(async i=>{await i.decode();return [i.src,i.naturalWidth]})));assert.ok(decoded.every(([src,w])=>src.startsWith('blob:')&&w===120));assert.notEqual(decoded[0][0],decoded[1][0])})
  await check('actual JPG download is a decodable report',async()=>{const f=await downloadBytes('JPG');assert.match(f.name,/\.jpg$/);assert.equal(f.bytes.subarray(0,2).toString('hex'),'ffd8');const dimensions=await page.evaluate(async b=>{const im=await createImageBitmap(new Blob([Uint8Array.from(atob(b),c=>c.charCodeAt(0))],{type:'image/jpeg'}));const out=[im.width,im.height];im.close();return out},f.bytes.toString('base64'));assert.ok(dimensions[0]>=1500&&dimensions[1]>500);assert.equal(await page.locator('.report-export-capture').count(),0)})
  await check('actual PDF download has PDF header and page objects',async()=>{const f=await downloadBytes('Cetak / PDF');assert.match(f.name,/\.pdf$/);assert.equal(f.bytes.subarray(0,5).toString(),'%PDF-');assert.ok(/\/Type\s*\/Page\b/.test(f.bytes.toString('latin1')));assert.equal(await page.locator('.report-export-capture').count(),0)})
  await check('mobile preview keeps report geometry and JPG remains exportable',async()=>{await page.setViewportSize({width:390,height:844});const cols=await page.locator('.report-grid').evaluate(e=>getComputedStyle(e).gridTemplateColumns.split(' ').length);assert.equal(cols,2);const f=await downloadBytes('JPG');assert.equal(f.bytes.subarray(0,2).toString('hex'),'ffd8');await page.setViewportSize({width:1280,height:900})})
  await check('close via Escape restores body and revokes report display',async()=>{await page.keyboard.press('Escape');await page.getByRole('dialog').waitFor({state:'detached'});assert.notEqual(await page.locator('body').evaluate(e=>e.style.overflow),'hidden')})
  await check('corrupt private photo blocks JPG and PDF without legacy fallback',async()=>{const broken={...items,[manifest.main.photoId]:{...items[manifest.main.photoId],base64:Buffer.alloc(manifest.main.size).toString('base64')}};await show({...record,photoBase64:png},broken);await page.getByRole('alert').waitFor();assert.ok(await button('JPG').isDisabled());assert.ok(await button('Cetak / PDF').isDisabled());assert.equal(await page.getByAltText('Foto QC',{exact:true}).count(),0);await close()})
  await check('sign out removes loaded photos and blocks export',async()=>{await show();await ready();await page.evaluate(()=>reportLab.setSession(false));await page.getByRole('alert').waitFor();assert.ok(await button('JPG').isDisabled());assert.equal(await page.locator('#record-report-sheet img').count(),0);await close()})
  await check('actual Excel workbook retains old columns and appends source and timing',async()=>{await page.evaluate(row=>reportLab.setRows([row]),record);const f=await downloadBytes('Export Excel QC');assert.match(f.name,/\.xlsx$/);const book=XLSX.read(f.bytes,{type:'buffer'});assert.deepEqual(book.SheetNames,['Form QC Spray','Form QC Fertilizer']);const rows=XLSX.utils.sheet_to_json(book.Sheets['Form QC Spray'],{header:1,defval:''});assert.equal(rows.length,2);const [h,v]=rows;assert.equal(h[51],'Record ID (Sistem)');assert.equal(v[51],r.id);for(const [key,expected] of [['Shift','2'],['Name','Mandor B'],['Area (Ha)','9'],['Daily Plan ID (Sumber)',r.dailyPlanId],['Monthly Plan ID (Sumber)',r.monthlyPlanLineId],['Target Daily Plan (Ha)',8],['HOLD (menit)',60],['Working Efektif (menit)',540]])assert.equal(v[h.indexOf(key)],expected,key);assert.equal(v[h.indexOf('Foto QC (Link Drive)')],'');assert.ok(!JSON.stringify(rows).includes('data:image/'));assert.ok(!JSON.stringify(rows).includes('blob:'))})
  await check('no external network, WebSockets or CSP violations',async()=>{assert.deepEqual(violations,[]);assert.deepEqual(await page.evaluate(()=>cspViolations),[])})
  console.log('SUCCESS: '+n+' actual Spray report preview and export checks (isolated browser, fixture photo I/O)')
 }finally{await context?.close();await browser?.close();await new Promise(resolve=>server.close(resolve))}
}
