// Isolated candidate UI with real permission contract, in-memory adapter only.
import assert from 'node:assert/strict'
import {createRequire} from 'node:module'
import {createServer} from 'node:http'
import {readFileSync} from 'node:fs'
import {fileURLToPath} from 'node:url'
const root=fileURLToPath(new URL('../',import.meta.url)),host='127.0.0.1',port=4797,origin='http://'+host+':'+port
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8')
const allowed=['UatOwnerPermissionPanel.tsx','accessControl.ts','qcUatOwnerPermissionContract.mjs','qcUatRolePermissions.mjs']
const redirects={},stub=''
assert.doesNotMatch(read('src/App.tsx'),/UatOwnerPermissionPanel/)
assert.doesNotMatch(read('src/NativeUsersAccess.tsx'),/UatOwnerPermissionPanel/)
assert.doesNotMatch(read('src/main.tsx'),/uat-owner-permission-lab/)
assert.doesNotMatch(read('src/UatOwnerPermissionPanel.tsx'),/firebase|fetch\(/)
assert.match(read('src/UatOwnerPermissionPanel.tsx'),/expectedRevision:selected.policyRevision/)
assert.ok(process.argv.length===3&&['--self-test','--browser'].includes(process.argv[2]))
console.log('SUCCESS: owner permission UI source and production isolation guards passed (offline)')
if(process.argv[2]==='--browser'){
 const dir=process.env.QC_UAT_PLAYWRIGHT_DIR
 assert.ok(dir?.startsWith('/'),'QC_UAT_PLAYWRIGHT_DIR_REQUIRED')
 const {chromium}=createRequire(dir+'/package.json')('playwright')
 const {build}=await import('vite')
 const seen=new Set()
 const plugin={name:'owner-permission-isolation',enforce:'pre',resolveId(id,importer){
  if(importer?.startsWith(root+'src/')){
   const file=importer.slice((root+'src/').length)
   if(redirects[file]?.includes(id)){seen.add(file+':'+id);return stub}
   if(id==='firebase'||id.startsWith('firebase/')||['./firebase','./offline','./qcOperationalAdapters','./qcFormPhotoStaging'].includes(id))throw Error('UNEXPECTED_LIVE_IMPORT '+file+':'+id)
  }
 },generateBundle(_options,bundle){
  const ids=Object.values(bundle).filter(o=>o.type==='chunk').flatMap(o=>Object.keys(o.modules))
  const src=ids.filter(id=>id.startsWith(root+'src/')).map(id=>id.slice((root+'src/').length))
  for(const id of src)assert.ok(allowed.includes(id),'UNEXPECTED_SOURCE '+id)
  for(const id of allowed)assert.ok(src.includes(id),'MISSING_REAL_COMPONENT '+id)
  for(const [file,imports] of Object.entries(redirects))for(const id of imports)assert.ok(seen.has(file+':'+id),'MISSING_BOUNDARY '+file+':'+id)
  assert.ok(!ids.some(id=>/node_modules\/(?:firebase|@firebase)\//.test(id)),'FIREBASE_BUNDLE_DENIED')
 }}
 const built=await build({root,configFile:false,envDir:false,publicDir:false,logLevel:'warn',plugins:[plugin],build:{write:false,emptyOutDir:false,minify:false,rollupOptions:{input:root+'uat-owner-permission-lab/main.jsx'}}})
 const chunks=(Array.isArray(built)?built:[built]).flatMap(r=>r.output??[]).filter(o=>o.type==='chunk')
 assert.equal(chunks.length,1);assert.equal(chunks[0].imports.length,0);assert.equal(chunks[0].dynamicImports.length,0)
 const csp="default-src 'none'; script-src 'self'; connect-src 'none'; img-src blob: data:; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'"
 const server=createServer((req,res)=>{
  res.setHeader('Content-Security-Policy',csp);res.setHeader('Cache-Control','no-store')
  if(req.method!=='GET'||req.headers.host!==host+':'+port){res.writeHead(403).end();return}
  if(req.url==='/'){res.setHeader('Content-Type','text/html; charset=utf-8');res.end('<!doctype html><meta charset="utf-8"><title>Owner Permission Lab</title><div id="root"></div><script type="module" src="/lab.js"></script>')}
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
  const pick=page.getByRole('combobox',{name:'Pengguna',exact:true})
  const select=k=>page.getByRole('combobox',{name:k,exact:true})
  const save=page.getByRole('button',{name:'Simpan hak akses pengguna'})
  const refresh=page.getByRole('button',{name:'Refresh hak akses'})
  const status=page.getByRole('status')
  const snapshot=()=>page.evaluate(()=>ownerLab.snapshot())
  const waitStatus=async message=>{await page.getByText(message,{exact:true}).waitFor()}
  const choose=async uid=>{await pick.selectOption(uid);await select('qc_spraying').waitFor()}
  const row=(s,uid)=>s.rows.find(r=>r.uid===uid)
  await page.goto(origin);await waitStatus('Hak akses dimuat.')
  await check('owner sees only non-owner users and effective defaults',async()=>{
   assert.equal(await pick.locator('option[value=uat-owner]').count(),0);await choose('uat-spray')
   assert.equal(await page.getByTestId('effective-qc_spraying').innerText(),'edit')
   assert.equal(await page.getByTestId('manual-qc_records').innerText(),'none')
   assert.equal(await save.isDisabled(),true)
  })
  await check('manual view remains local until explicit save; only target changes',async()=>{
   await select('qc_spraying').selectOption('view');assert.equal(await pick.isDisabled(),true);assert.equal((await snapshot()).calls.length,0)
   await save.click();await waitStatus('Hak akses tersimpan.')
   const s=await snapshot();assert.deepEqual(s.calls[0],{targetUid:'uat-spray',expectedRevision:0,patch:{qc_spraying:'view'}})
   assert.equal(row(s,'uat-spray').manualOverrides.qc_records,'none');assert.equal(row(s,'uat-spray').permissions.qc_spraying,'view');assert.equal(row(s,'uat-spray-b').permissions.qc_spraying,'edit');assert.equal(s.audit.length,1)
  })
  await check('refresh and explicit none persist with new revision',async()=>{
   await refresh.click();await waitStatus('Hak akses dimuat.');await choose('uat-spray')
   assert.equal(await page.getByTestId('manual-qc_spraying').innerText(),'view')
   await select('qc_spraying').selectOption('none');await save.click();await waitStatus('Hak akses tersimpan.')
   const s=await snapshot();assert.equal(row(s,'uat-spray').policyRevision,2);assert.equal(row(s,'uat-spray').permissions.qc_spraying,'none')
  })
  await check('cancel discards patch and permits switching target',async()=>{
   await select('qc_spraying').selectOption('edit');await page.getByRole('button',{name:'Batalkan perubahan'}).click();assert.equal(await save.isDisabled(),true)
   await choose('uat-fert');assert.equal(await page.getByTestId('effective-qc_fertilizer').innerText(),'edit');assert.equal((await snapshot()).calls.length,2);await choose('uat-spray')
  })
  await check('stale revision fails closed and requires refresh',async()=>{
   await page.evaluate(()=>ownerLab.externalChange());await select('qc_spraying').selectOption('view');await save.click();await waitStatus('Perubahan tidak terkonfirmasi. Refresh sebelum mencoba lagi.')
   assert.equal(await save.isDisabled(),true);assert.equal(row(await snapshot(),'uat-spray').permissions.qc_spraying,'edit');await refresh.click();await waitStatus('Hak akses dimuat.');await choose('uat-spray')
   assert.equal(await page.getByTestId('manual-qc_spraying').innerText(),'edit')
  })
  await check('lost acknowledgement does not automatically retry; refresh reconciles',async()=>{
   await page.evaluate(()=>ownerLab.setMode('lost'));await select('qc_spraying').selectOption('view');await save.click();await waitStatus('Perubahan tidak terkonfirmasi. Refresh sebelum mencoba lagi.')
   const s=await snapshot();assert.equal(s.calls.length,4);assert.equal(row(s,'uat-spray').permissions.qc_spraying,'view');assert.equal(await save.isDisabled(),true)
   await page.evaluate(()=>ownerLab.setMode('normal'));await refresh.click();await waitStatus('Hak akses dimuat.');await choose('uat-spray');assert.equal(await page.getByTestId('manual-qc_spraying').innerText(),'view')
  })
  await check('non-owner cannot open panel; returning owner retains manual override',async()=>{
   await page.evaluate(()=>ownerLab.setActor('uat-spray'));await page.getByRole('alert').waitFor();assert.equal(await pick.count(),0)
   await page.evaluate(()=>ownerLab.setActor('uat-owner'));await waitStatus('Hak akses dimuat.');await choose('uat-spray');assert.equal(await page.getByTestId('manual-qc_spraying').innerText(),'view')
  })
  await check('revoked owner rejected by contract even with UI still open',async()=>{
   await page.evaluate(()=>ownerLab.disableOwner());await select('qc_spraying').selectOption('edit');await save.click();await waitStatus('Perubahan tidak terkonfirmasi. Refresh sebelum mencoba lagi.')
   assert.equal(row(await snapshot(),'uat-spray').permissions.qc_spraying,'view');await refresh.click();await waitStatus('Hak akses tidak dapat dimuat. Refresh diperlukan.');assert.equal(await pick.isDisabled(),true)
  })
  await check('no external network WebSocket CSP violation or database',async()=>{
   assert.deepEqual(violations,[]);assert.deepEqual(await page.evaluate(()=>cspViolations),[]);assert.deepEqual(await page.evaluate(async()=>await indexedDB.databases()),[])
  })
  console.log('SUCCESS: '+n+' Owner per-user permission UI checks (isolated browser, mock adapter only)')
 }finally{try{if(context)await context.close();if(browser)await browser.close()}finally{if(server.listening)await new Promise(resolve=>server.close(resolve))}}
}
