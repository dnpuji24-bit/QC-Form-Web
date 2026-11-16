// Isolated React bundle and real browser IndexedDB, simulated backend.
import assert from 'node:assert/strict'
import {createRequire} from 'node:module'
import {createServer} from 'node:http'
import {readFileSync} from 'node:fs'
import {fileURLToPath} from 'node:url'
import {STRICT_DB,isolatedQueueFactory} from '../src/qcUatStrictBrowserQueue.mjs'
const root=fileURLToPath(new URL('../',import.meta.url)),host='127.0.0.1',port=4385,origin='http://'+host+':'+port
const source=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8')
const csp="default-src 'none'; script-src 'self'; connect-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'"
const fake={open(name,v){return [name,v]}}
assert.equal(STRICT_DB,'qc_uat_strict_queue_v1')
assert.deepEqual(isolatedQueueFactory(fake).open('qc_operational_queue_v1',1),[STRICT_DB,1])
assert.throws(()=>isolatedQueueFactory(fake).open('legacy',1),/STRICT_DB_SCOPE/)
for(const path of ['uat-strict-portal-lab/main.jsx','src/qcUatStrictBrowserQueue.mjs'])assert.doesNotMatch(source(path),/\b(?:fetch|XMLHttpRequest|WebSocket)\s*\(|from ['"].*(?:\/firebase|\/App|\/offline|\/qcOperationalAdapters)/)
assert.match(source('src/firebase.ts'),/QC_HOSTED_UAT_ISOLATION_REQUIRED/)
assert.doesNotMatch(source('src/main.tsx'),/uat-strict-portal-lab|qcUatStrictBrowserQueue/)
assert.match(source('supabase/functions/_shared/qcPhotoUat.ts'),/daily-plan-and-report-unm/)
assert.ok(process.argv.length===3&&['--self-test','--browser'].includes(process.argv[2]))
console.log('SUCCESS: strict portal lab origin, isolated database and production hold guards passed (offline)')
if(process.argv[2]==='--browser'){
 const dir=process.env.QC_UAT_PLAYWRIGHT_DIR
 assert.ok(dir?.startsWith('/'),'QC_UAT_PLAYWRIGHT_DIR_REQUIRED')
 const {chromium}=createRequire(dir+'/package.json')('playwright')
 const {build}=await import('vite')
 // Build only this lab in memory. No normal Vite config, env file or output.
 const result=await build({root,configFile:false,envFile:false,publicDir:false,logLevel:'warn',build:{write:false,emptyOutDir:false,minify:false,rollupOptions:{input:root+'uat-strict-portal-lab/main.jsx'}}})
 const outputs=(Array.isArray(result)?result:[result]).flatMap(r=>r.output??[])
 const chunks=outputs.filter(o=>o.type==='chunk')
 assert.equal(chunks.length,1,'LAB_SINGLE_BUNDLE_REQUIRED')
 assert.equal(chunks[0].imports.length,0)
 assert.equal(chunks[0].dynamicImports.length,0)
 const html='<!doctype html><meta charset="utf-8"><title>Strict queue lab</title><div id="root"></div><script type="module" src="/lab.js"></script>'
 const server=createServer((req,res)=>{
  res.setHeader('Content-Security-Policy',csp);res.setHeader('Cache-Control','no-store')
  if(req.method!=='GET'||req.headers.host!==host+':'+port){res.writeHead(403).end();return}
  if(req.url==='/'){res.setHeader('Content-Type','text/html; charset=utf-8');res.end(html)}
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
  await context.route('**/*',async route=>{if(new URL(route.request().url()).origin===origin)await route.continue();else{violations.push('external request');await route.abort()}})
  await context.routeWebSocket('**/*',ws=>{violations.push('websocket');ws.close()})
  await context.addInitScript(()=>{globalThis.cspViolations=[];document.addEventListener('securitypolicyviolation',e=>cspViolations.push(e.effectiveDirective))})
  const page=await context.newPage()
  page.on('pageerror',e=>violations.push(e.message))
  const waitCount=async expected=>{await page.waitForFunction(v=>document.querySelector('#count')?.textContent===v,String(expected))}
  const waitResult=async text=>{await page.waitForFunction(v=>document.querySelector('#result')?.textContent.includes(v),text);await page.waitForFunction(()=>!document.querySelector('#flush').disabled)}
  const click=async id=>{await page.locator('#'+id).click()}
  await page.goto(origin);await page.locator('#save').waitFor()
  await check('real React form enqueues while offline',async()=>{await context.setOffline(true);await click('save');await waitResult('QUEUED sha256-v1:');await waitCount(1);await click('flush');await waitResult('GAGAL: OFFLINE');await waitCount(1);await context.setOffline(false)})
  await check('reload retains exact job and fingerprint in isolated IndexedDB',async()=>{await page.reload();await waitCount(1);const rows=await page.evaluate(()=>strictLab.listStrictBrowserJobs('uat-spray'));assert.equal(rows[0].record.actualArea100,250);assert.match(rows[0].payloadFingerprint,/^sha256-v1:[a-f0-9]{64}$/);assert.equal(rows[0].changes.length,1)})
  await check('identical enqueue is idempotent',async()=>{await click('save');await waitResult('QUEUED');await waitCount(1)})
  await check('different area with same ID rejected and first row kept',async()=>{await page.locator('#area').fill('350');await click('save');await waitResult('QC_QUEUE_PAYLOAD_CONFLICT');const rows=await page.evaluate(()=>strictLab.listStrictBrowserJobs('uat-spray'));assert.equal(rows.length,1);assert.equal(rows[0].record.actualArea100,250)})
  await check('different photo intent same ID rejected',async()=>{await page.locator('#area').fill('250');await page.locator('#photo').uncheck();await click('save');await waitResult('QC_QUEUE_PAYLOAD_CONFLICT');await waitCount(1);await page.locator('#photo').check()})
  await check('other account sees no queued QC and wrong form disabled',async()=>{await page.locator('#account').selectOption('uat-fert');await waitCount(0);assert.equal(await page.locator('#save').isDisabled(),true);await click('flush');await waitResult('"sent":0');await page.locator('#account').selectOption('uat-spray');await waitCount(1)})
  await check('failed upload retains queue',async()=>{await page.locator('#fail-upload').check();await click('flush');await waitResult('MOCK_UPLOAD_OFFLINE');await waitCount(1);await page.locator('#fail-upload').uncheck()})
  await check('lost ACK retains durable row with confirmed server record',async()=>{await page.locator('#lose-ack').check();await click('flush');await waitResult('MOCK_ACK_LOST');await waitCount(1);const row=await page.evaluate(()=>strictLab.state.records.get('uat-q1'));assert.equal(row.saveType,'uploaded');assert.match(row.operationalPayloadFingerprint,/^sha256-v1:/)})
  await check('exact retry deletes row only after matching confirmation',async()=>{const before=await page.evaluate(()=>[strictLab.state.uploads,strictLab.state.commits]);await click('flush');await waitResult('"sent":1');await waitCount(0);assert.deepEqual(await page.evaluate(()=>[strictLab.state.uploads,strictLab.state.commits]),before)})
  await check('new revision corrects area and preserves manifest',async()=>{const before=await page.evaluate(()=>strictLab.state.records.get('uat-q1'));await page.locator('#revision').fill('uat-r2');await page.locator('#base').fill('uat-r1');await page.locator('#area').fill('350');await page.locator('#photo').uncheck();await click('save');await waitResult('QUEUED');await waitCount(1);await click('flush');await waitResult('"sent":1');await waitCount(0);const after=await page.evaluate(()=>strictLab.state.records.get('uat-q1'));assert.equal(after.actualArea100,350);assert.deepEqual(after.operationalPhotoManifest,before.operationalPhotoManifest);assert.notEqual(after.operationalPayloadFingerprint,before.operationalPayloadFingerprint)})
  await check('view-only account cannot create a form',async()=>{await page.locator('#account').selectOption('uat-view');await waitCount(0);assert.equal(await page.locator('#save').isDisabled(),true)})
  await check('fertilizer form creates own independent job',async()=>{await page.locator('#account').selectOption('uat-fert');await page.locator('#kind').selectOption('fertilizer');await page.locator('#record-id').fill('uat-q2');await page.locator('#revision').fill('uat-r1');await page.locator('#base').fill('');await click('save');await waitResult('QUEUED');await waitCount(1);await click('flush');await waitResult('"sent":1');await waitCount(0);assert.equal(await page.evaluate(()=>strictLab.state.records.get('uat-q2').ownerUid),'uat-fert')})
  await check('strict queue does not open operational or legacy databases',async()=>{const dbs=await page.evaluate(()=>indexedDB.databases());assert.deepEqual(dbs.map(d=>d.name).sort(),['qc_uat_strict_queue_v1'])})
  await check('no external requests WebSockets or CSP violations',async()=>{assert.deepEqual(violations,[]);assert.deepEqual(await page.evaluate(()=>cspViolations),[])})
  console.log('SUCCESS: '+n+' strict React portal lab and IndexedDB checks passed (mock backend only)')
 }finally{try{if(context)await context.close();if(browser)await browser.close()}finally{if(server.listening)await new Promise(resolve=>server.close(resolve))}}
}
