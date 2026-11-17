// Execute actual App.tsx report and export function bodies, not the production App.
import assert from 'node:assert/strict'
import {createRequire} from 'node:module'
import {createServer} from 'node:http'
import {readFileSync} from 'node:fs'
import {fileURLToPath} from 'node:url'
import {multi,row} from './qc-uat-fertilizer-material-fixture.mjs'
import {prepareOperationalPhotoManifest,stripOperationalPhotoPayload} from '../src/qcOperationalPhotoManifest.mjs'
const root=fileURLToPath(new URL('../',import.meta.url)),host='127.0.0.1',port=4786,origin='http://'+host+':'+port
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
assert.doesNotMatch(read('src/main.tsx'),/uat-fertilizer-report-lab/)
assert.match(read('src/firebase.ts'),/QC_HOSTED_UAT_ISOLATION_REQUIRED/)
assert.ok(process.argv.length===3&&['--self-test','--browser'].includes(process.argv[2]))
const extracted="import React,{useState,useEffect} from 'react'\nimport {createPortal} from 'react-dom'\nimport {useOperationalReportPhotos} from '../src/useOperationalReportPhotos'\nimport {uploadStatusInfo} from '../src/UploadStatus'\nimport type {QcRecord} from '../src/types'\nfunction QcSupabasePhotoViewer(){return null}\n"+excel+"\n"+report+"\nexport {RecordReport}\nexport async function downloadExcel(filtered:QcRecord[]){const setExporting=(_v:boolean)=>{};"+download+";return exportExcel()}\n"
// Serve only emitted JS/CSS at their original names, including local lazy chunks.
// No filesystem request handler or external module resolution.
function reportBundle(output){
 const files=new Map()
 for(const o of output){
  assert.ok(typeof o.fileName==='string'&&o.fileName.split('/').every(p=>/^[A-Za-z0-9_-][A-Za-z0-9_.-]*$/.test(p)),'UNSAFE_BUNDLE_PATH')
  assert.ok(!files.has(o.fileName),'DUPLICATE_BUNDLE_PATH')
  if(o.type==='chunk'){
   assert.match(o.fileName,/\.m?js$/)
   files.set(o.fileName,{type:'text/javascript; charset=utf-8',body:o.code,chunk:o})
  }else{
   assert.equal(o.type,'asset')
   assert.match(o.fileName,/\.css$/,'UNEXPECTED_BUNDLE_ASSET')
   files.set(o.fileName,{type:'text/css; charset=utf-8',body:o.source})
  }
 }
 const entries=[...files].filter(([,f])=>f.chunk?.isEntry)
 assert.equal(entries.length,1,'EXPECTED_ONE_REPORT_ENTRY')
 const css=[...files].filter(([,f])=>!f.chunk).map(([name])=>name)
 assert.ok(css.length,'REPORT_CSS_MISSING')
 for(const [name,f] of files)if(f.chunk){
  for(const dep of [...f.chunk.imports,...f.chunk.dynamicImports]){
   assert.ok(files.get(dep)?.chunk,'NONLOCAL_BUNDLE_IMPORT '+name+' -> '+dep)
  }
 }
 return {files,entry:entries[0][0],css}
}
const bundleFixture=[{type:'chunk',fileName:'assets/main.js',isEntry:true,code:'',imports:[],dynamicImports:['assets/lazy.js']},{type:'chunk',fileName:'assets/lazy.js',isEntry:false,code:'',imports:['assets/main.js'],dynamicImports:[]},{type:'asset',fileName:'assets/main.css',source:''}]
assert.equal(reportBundle(bundleFixture).entry,'assets/main.js')
assert.throws(()=>reportBundle([{...bundleFixture[0],dynamicImports:['https://example.test/lazy.js']},...bundleFixture.slice(1)]),/NONLOCAL_BUNDLE_IMPORT/)
assert.throws(()=>reportBundle([{...bundleFixture[0],fileName:'../main.js'},...bundleFixture.slice(1)]),/UNSAFE_BUNDLE_PATH/)
assert.throws(()=>reportBundle(bundleFixture.filter(o=>o.fileName!=='assets/lazy.js')),/NONLOCAL_BUNDLE_IMPORT/)
assert.throws(()=>reportBundle([...bundleFixture,bundleFixture[0]]),/DUPLICATE_BUNDLE_PATH/)
console.log('SUCCESS: Fertilizer report source, export and isolation guards passed (offline)')
console.log('SUCCESS: local emitted report bundle dependency guards passed (offline)')
if(process.argv[2]==='--browser'){
 const dir=process.env.QC_UAT_PLAYWRIGHT_DIR;assert.ok(dir?.startsWith('/'),'QC_UAT_PLAYWRIGHT_DIR_REQUIRED')
 const {chromium}=createRequire(dir+'/package.json')('playwright'),{build}=await import('vite'),XLSX=await import('xlsx')
 const virtual=root+'uat-fertilizer-report-lab/report-extracted.tsx',stub=root+'uat-fertilizer-report-lab/fixtures.mjs'
 const redirects=['./firebase','./qcLocalUat','./qcPhotoEnvironment'],seen=new Set()
 const plugin={name:'report-fixture-boundaries',enforce:'pre',resolveId(id,importer){
  if(id==='./report-extracted'&&importer===root+'uat-fertilizer-report-lab/main.jsx')return virtual
  if(importer===root+'src/useOperationalReportPhotos.ts'&&redirects.includes(id)){seen.add(id);return stub}
  if(id==='firebase'||id.startsWith('firebase/')||id==='./firebase')throw Error('LIVE_IMPORT_DENIED')
 },load(id){if(id===virtual)return extracted},generateBundle(_opts,bundle){
  const ids=Object.values(bundle).filter(o=>o.type==='chunk').flatMap(o=>Object.keys(o.modules))
  for(const id of ids.filter(id=>id.startsWith(root+'src/')))assert.ok(['useOperationalReportPhotos.ts','UploadStatus.tsx','styles.css','theme.css','field-ui.css'].includes(id.slice((root+'src/').length)),'UNEXPECTED_SOURCE '+id)
  assert.ok(ids.includes(virtual)&&ids.includes(root+'src/useOperationalReportPhotos.ts'))
  assert.deepEqual([...seen].sort(),[...redirects].sort());assert.ok(!ids.some(id=>/node_modules\/(?:firebase|@firebase)\//.test(id)))
 }}
 const built=await build({root,configFile:false,envDir:false,publicDir:false,base:'/',logLevel:'warn',plugins:[plugin],build:{write:false,emptyOutDir:false,minify:false,modulePreload:false,rollupOptions:{input:root+'uat-fertilizer-report-lab/main.jsx'}}})
 const output=(Array.isArray(built)?built:[built]).flatMap(r=>r.output??[])
 const {files,entry,css}=reportBundle(output)
 console.log('SUCCESS: report bundle contains only local emitted dependencies ('+files.size+' JS/CSS files)')
 const csp="default-src 'none'; script-src 'self'; connect-src 'none'; img-src blob: data:; style-src 'self' 'unsafe-inline'; frame-src 'self' about:; base-uri 'none'; frame-ancestors 'none'; form-action 'none'"
 const server=createServer((req,res)=>{
  res.setHeader('Content-Security-Policy',csp);res.setHeader('Cache-Control','no-store')
  if(req.method!=='GET'||req.headers.host!==host+':'+port){res.writeHead(403).end();return}
  if(req.url==='/'){
   res.setHeader('Content-Type','text/html; charset=utf-8')
   res.end('<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Report lab</title><link rel="icon" href="data:,">'+css.map(name=>'<link rel="stylesheet" href="/'+name+'">').join('')+'<div id="root"></div><script type="module" src="/'+entry+'"></script>')
  }else{
   const f=files.get(req.url?.slice(1))
   if(!f){res.writeHead(404).end();return}
   res.setHeader('Content-Type',f.type);res.end(typeof f.body==='string'?f.body:Buffer.from(f.body))
  }
 })
 let browser,context,n=0;const violations=[]
 const check=async(name,fn)=>{try{await fn()}catch(e){throw Error('FAIL: '+name,{cause:e})}n++;console.log('PASS: '+name)}
 try{
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,host,resolve)})
  browser=await chromium.launch({headless:true});context=await browser.newContext({serviceWorkers:'block',acceptDownloads:true,viewport:{width:1280,height:900}})
  await context.route('**/*',async route=>{const u=new URL(route.request().url());if((u.origin===origin&&!u.search&&(u.pathname==='/'||files.has(u.pathname.slice(1))))||['blob:','data:','about:'].includes(u.protocol))await route.continue();else{violations.push('unexpected-request '+u.origin+u.pathname);await route.abort()}})
  await context.routeWebSocket('**/*',ws=>{violations.push('websocket');ws.close()})
  await context.addInitScript(()=>{globalThis.cspViolations=[];document.addEventListener('securitypolicyviolation',e=>cspViolations.push(e.effectiveDirective))})
  const page=await context.newPage();page.on('pageerror',e=>violations.push(e.message))
  await page.goto(origin);await page.waitForFunction(()=>!!globalThis.reportLab)
  const png=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=120;c.height=80;const x=c.getContext('2d');x.fillStyle='#298050';x.fillRect(0,0,120,80);return c.toDataURL('image/png')})
  const {r}=multi([row(1,9400,21),row(2,3225,21.5,'Synthetic DAP',150)]),changes=[{kind:'main',action:'replace',dataUrl:png},{kind:'hold',holdId:'uat-h1',action:'replace',dataUrl:png},{kind:'scan',action:'replace',dataUrl:png}]
  const {manifest,uploads}=await prepareOperationalPhotoManifest({recordId:r.id,uploaderUid:r.ownerUid,previous:{},changes,bucket:'qc-photos-uat-mock'})
  const record={...stripOperationalPhotoPayload(r),saveType:'uploaded',firestoreSaveState:'confirmed',operationalPhotoManifest:manifest}
  const items=Object.fromEntries(uploads.map(u=>[u.reference.photoId,{base64:Buffer.from(u.bytes).toString('base64'),type:u.reference.contentType}]))
  const show=async(row=record,photos=items,paused=false)=>{await page.evaluate(({row,photos,paused})=>{reportLab.setSession(true);reportLab.setPhotos(row.id,photos);if(paused)reportLab.pause();reportLab.show(row)},{row,photos,paused});await page.getByRole('dialog').waitFor()}
  const button=name=>page.getByRole('button',{name,exact:true})
  const ready=()=>page.waitForFunction(()=>!document.querySelector('.report-toolbar button')?.disabled)
  const close=async()=>{await button('Tutup').click();await page.getByRole('dialog').waitFor({state:'detached'})}
  const downloadBytes=async name=>{const d=page.waitForEvent('download');await button(name).click();const f=await d;assert.equal(await f.failure(),null);return {name:f.suggestedFilename(),bytes:readFileSync(await f.path())}}
  const field=async(label,expected)=>{const row=page.locator('.report-grid>div').filter({has:page.locator('span').filter({hasText:new RegExp('^'+label.replace(/[.*+?^$\u007b\u007d()|[\]\\]/g,'\\$&')+'$')})});assert.equal(await row.count(),1,'REPORT_FIELD '+label);assert.equal(await row.locator('strong').textContent(),expected)}
  await check('preview waits for verified private photo bytes before export',async()=>{await show(record,items,true);assert.ok(await button('JPG').isDisabled());assert.ok(await button('Cetak / PDF').isDisabled());await page.evaluate(()=>reportLab.resume());await ready()})
  await check('report preserves source IDs, actual executor and over-actual',async()=>{await field('Daily Plan ID (Sumber)',r.dailyPlanId);await field('Monthly Plan ID (Sumber)',r.monthlyPlanLineId);await field('Target Daily Plan','20 Ha');await field('Shift','2');await field('Mandor','Mandor B');await field('Jumlah Aplikasi','42.5 Ha');await field('Total Pupuk','12625 Kg');await page.getByText(/bukan luas fisik lahan/).waitFor();const rows=await page.locator('.report-table tbody tr').allTextContents();assert.equal(rows.length,2);assert.match(rows[0],/Synthetic NK.*9400 Kg.*21 Ha.*447.62 Kg\/Ha/);assert.match(rows[1],/Synthetic DAP.*3225 Kg.*21.5 Ha.*150 Kg\/Ha/)})
  await check('overnight HOLD timing and material values displayed',async()=>{await field('Jam Mulai','15:00');await field('Jam Selesai','01:00');await field('Working Efektif','540 menit');await field('Total HOLD','60 menit');await field('Produktivitas Aplikasi','4.72 Ha/Jam');await field('Rata-rata Dosis Aktual','298.81 Kg/Ha');await field('Dosis Total/Ha (aplikasi)','297.06 Kg/Ha');assert.ok(await page.getByText(/23:30–00:30/).count()>=1)})
  await check('main HOLD and historical scan images decode from distinct verified blob slots',async()=>{const images=page.locator('#record-report-sheet img');assert.equal(await images.count(),3);assert.equal(await page.getByAltText('Scan Report',{exact:true}).count(),1);assert.equal(await page.getByAltText('Foto HOLD 1',{exact:true}).count(),1);const decoded=await images.evaluateAll(async list=>Promise.all(list.map(async i=>{await i.decode();return [i.src,i.naturalWidth]})));assert.ok(decoded.every(([src,w])=>src.startsWith('blob:')&&w===120));assert.equal(new Set(decoded.map(d=>d[0])).size,3)})
  await check('actual JPG download is a decodable report',async()=>{const f=await downloadBytes('JPG');assert.match(f.name,/\.jpg$/);assert.equal(f.bytes.subarray(0,2).toString('hex'),'ffd8');const dimensions=await page.evaluate(async b=>{const im=await createImageBitmap(new Blob([Uint8Array.from(atob(b),c=>c.charCodeAt(0))],{type:'image/jpeg'}));const out=[im.width,im.height];im.close();return out},f.bytes.toString('base64'));assert.ok(dimensions[0]>=1500&&dimensions[1]>500);assert.equal(await page.locator('.report-export-capture').count(),0)})
  await check('actual PDF download has PDF header and page objects',async()=>{const f=await downloadBytes('Cetak / PDF');assert.match(f.name,/\.pdf$/);assert.equal(f.bytes.subarray(0,5).toString(),'%PDF-');assert.ok(/\/Type\s*\/Page\b/.test(f.bytes.toString('latin1')));assert.equal(await page.locator('.report-export-capture').count(),0)})
  await check('mobile preview keeps report geometry and JPG remains exportable',async()=>{await page.setViewportSize({width:390,height:844});const cols=await page.locator('.report-grid').evaluate(e=>getComputedStyle(e).gridTemplateColumns.split(' ').length);assert.equal(cols,2);const f=await downloadBytes('JPG');assert.equal(f.bytes.subarray(0,2).toString('hex'),'ffd8');await page.setViewportSize({width:1280,height:900})})
  await check('close via Escape restores body and revokes report display',async()=>{await page.keyboard.press('Escape');await page.getByRole('dialog').waitFor({state:'detached'});assert.notEqual(await page.locator('body').evaluate(e=>e.style.overflow),'hidden')})
  await check('corrupt private photo blocks JPG and PDF without legacy fallback',async()=>{const broken={...items,[manifest.main.photoId]:{...items[manifest.main.photoId],base64:Buffer.alloc(manifest.main.size).toString('base64')}};await show({...record,photoBase64:png},broken);await page.getByRole('alert').waitFor();assert.ok(await button('JPG').isDisabled());assert.ok(await button('Cetak / PDF').isDisabled());assert.equal(await page.getByAltText('Foto QC',{exact:true}).count(),0);await close()})
  await check('sign out removes loaded photos and blocks export',async()=>{await show();await ready();await page.evaluate(()=>reportLab.setSession(false));await page.getByRole('alert').waitFor();assert.ok(await button('JPG').isDisabled());assert.equal(await page.locator('#record-report-sheet img').count(),0);await close()})
  await check('legacy inline report keeps historical scan and single filling without scanner',async()=>{
   const legacy={...r,id:'fert_legacy_report',pengisianList:undefined,jenisPupuk:'Legacy NK',jumlah:9000,hasilKerja:20,dosisAktual:450,scanReportPhotoBase64:png,photoBase64:png,holdIntervals:[{...r.holdIntervals[0],photoBase64:png}]}
   await show(legacy,{});await ready()
   assert.equal(await page.getByAltText('Scan Report',{exact:true}).count(),1)
   assert.equal(await page.getByAltText('Foto HOLD 1',{exact:true}).count(),1)
   assert.match(await page.locator('.report-table tbody tr').innerText(),/Legacy NK/)
   assert.equal(await page.getByRole('button',{name:'Scan Laporan',exact:true}).count(),0)
   assert.equal((await downloadBytes('JPG')).bytes.subarray(0,2).toString('hex'),'ffd8')
   await close()
  })
  await check('manual Fertilizer record without scan still exports and does not invent photo',async()=>{
   const {scan,...manualManifest}=manifest
   await show({...record,operationalPhotoManifest:manualManifest});await ready()
   assert.equal(await page.getByAltText('Scan Report',{exact:true}).count(),0)
   assert.equal(await page.locator('#record-report-sheet img').count(),2)
   assert.equal((await downloadBytes('JPG')).bytes.subarray(0,2).toString('hex'),'ffd8');await close()
  })
  await check('actual Excel keeps legacy columns and separate material rows with exact source and timing',async()=>{
   const legacy={...r,id:'fert_legacy_excel',pengisianList:undefined,jenisPupuk:'Legacy NK',jumlah:9000,hasilKerja:20,dosisAktual:450,photoDriveUrl:'https://drive.google.com/file/d/fixture/view'}
   await page.evaluate(rows=>reportLab.setRows(rows),[record,legacy])
   const f=await downloadBytes('Export Excel QC');assert.match(f.name,/\.xlsx$/);const book=XLSX.read(f.bytes,{type:'buffer'})
   assert.deepEqual(book.SheetNames,['Form QC Spray','Form QC Fertilizer'])
   const rows=XLSX.utils.sheet_to_json(book.Sheets['Form QC Fertilizer'],{header:1,defval:''});assert.equal(rows.length,4)
   const [h,nk,dap,old]=rows
   assert.deepEqual(h.slice(0,23),['Tanggal','Shift','Name','Name of Assistan','Status','Start Time ','End Time','Paddock','Unit','No. Unit','Type','Activity','Jenis Pupuk','Dosis (Kg/Ha)','Status Hose','Pengisian Ke -','Jumlah (Kg)','Hasil Kerja (Ha)','Dosis Aktual (Kg/ha)','Perataan Pupuk','Catatan','Foto QC (Link Drive)','Record ID (Sistem)'])
   assert.equal(nk[22],r.id);assert.equal(dap[22],r.id);assert.equal(old[22],legacy.id)
   assert.deepEqual(nk.slice(12,19),['Synthetic NK',450,'Lancar',1,9400,21,447.62])
   assert.deepEqual(dap.slice(12,19),['Synthetic DAP',150,'Lancar',2,3225,21.5,150])
   for(const v of [nk,dap])for(const [key,expected] of [['Shift','2'],['Name','Mandor B'],['Daily Plan ID (Sumber)',r.dailyPlanId],['Monthly Plan ID (Sumber)',r.monthlyPlanLineId],['Target Daily Plan (Ha)',20],['HOLD (menit)',60],['Working Efektif (menit)',540],['Produktivitas Aplikasi (Ha/Jam)',4.72]])assert.equal(v[h.indexOf(key)],expected,key)
   assert.equal(old[12],'Legacy NK');assert.equal(old[21],legacy.photoDriveUrl);assert.equal(nk[21],'')
   assert.ok(!JSON.stringify(rows).includes('data:image/'));assert.ok(!JSON.stringify(rows).includes('blob:'))
  })
  await check('no external network, WebSockets or CSP violations',async()=>{assert.deepEqual(violations,[]);assert.deepEqual(await page.evaluate(()=>cspViolations),[])})
  console.log('SUCCESS: '+n+' actual Fertilizer report preview and export checks (isolated browser, fixture photo I/O)')
 }finally{await context?.close();await browser?.close();await new Promise(resolve=>server.close(resolve))}
}
