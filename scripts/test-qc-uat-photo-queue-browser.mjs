// Dedicated loopback browser origin: real IndexedDB, mock storage and mock CAS only.
import assert from 'node:assert/strict'
import {createRequire} from 'node:module'
import {createServer} from 'node:http'
import {readFileSync} from 'node:fs'
const host='127.0.0.1',port=4285,origin='http://'+host+':'+port
const modules=['qcOperationalQueue.mjs','qcOperationalSaveTransport.mjs','qcOperationalPhotoManifest.mjs']
const sources=new Map(modules.map(name=>['/src/'+name,readFileSync(new URL('../src/'+name,import.meta.url),'utf8')]))
const csp="default-src 'none'; script-src 'self'; connect-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'"
const html='<!doctype html><meta charset="utf-8"><title>QC synthetic queue lab</title><script type="module" src="/lab.mjs"></script>'
const entry="import * as queue from '/src/qcOperationalQueue.mjs'; import * as transport from '/src/qcOperationalSaveTransport.mjs'; globalThis.qcLab={queue,transport};"
assert.ok(process.argv.length===3&&['--self-test','--browser'].includes(process.argv[2]))
for(const source of sources.values())assert.doesNotMatch(source,/\b(?:fetch|XMLHttpRequest|WebSocket)\s*\(|https?:\/\//)
assert.ok(csp.includes("connect-src 'none'"))
assert.equal(sources.size,3)
console.log('SUCCESS: photo queue loopback and module allowlist guards passed (offline)')
if(process.argv[2]==='--browser'){
 const dir=process.env.QC_UAT_PLAYWRIGHT_DIR
 assert.ok(dir?.startsWith('/'),'QC_UAT_PLAYWRIGHT_DIR_REQUIRED')
 const {chromium}=createRequire(dir+'/package.json')('playwright')
 const server=createServer((req,res)=>{
  res.setHeader('Content-Security-Policy',csp)
  res.setHeader('Cache-Control','no-store')
  if(req.method!=='GET'||req.headers.host!==host+':'+port){res.writeHead(403).end();return}
  const body=req.url==='/'?html:req.url==='/lab.mjs'?entry:sources.get(req.url)
  if(body===undefined){res.writeHead(404).end();return}
  res.setHeader('Content-Type',req.url==='/'?'text/html; charset=utf-8':'text/javascript; charset=utf-8')
  res.end(body)
 })
 let browser,context
 const violations=[]
 const start=()=>new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,host,resolve)})
 try{
  await start()
  browser=await chromium.launch({headless:true})
  context=await browser.newContext({serviceWorkers:'block'})
  await context.route('**/*',async route=>{const u=new URL(route.request().url());if(u.origin===origin)await route.continue();else{violations.push('external '+u.origin);await route.abort()}})
  await context.routeWebSocket('**/*',ws=>{violations.push('unexpected websocket');ws.close()})
  await context.addInitScript(()=>{globalThis.cspViolations=[];document.addEventListener('securitypolicyviolation',e=>globalThis.cspViolations.push(e.effectiveDirective))})
  const page=await context.newPage()
  page.on('pageerror',e=>violations.push(e.name+': '+e.message))
  page.setDefaultTimeout(30000)
  const load=async()=>{await page.goto(origin);await page.waitForFunction(()=>!!globalThis.qcLab)}
  await load()
  const png='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jR1sAAAAASUVORK5CYII='
  const job=(recordId='uat-q1',revision='uat-r1',baseRevision=null,uid='uat-spray')=>({uploaderUid:uid,baseRevision,record:{id:recordId,clientRevision:revision,ownerUid:uid,saveType:'ready',photoBase64:png,holdIntervals:[{holdId:'uat-h1',photoBase64:png}]},action:'finalizeRecord',changes:[{kind:'main',action:'replace',dataUrl:png},{kind:'hold',holdId:'uat-h1',action:'replace',dataUrl:png},{kind:'scan',action:'replace',dataUrl:png}]})
  let n=0
  async function check(name,fn){try{await fn()}catch(e){throw Error('FAIL: '+name,{cause:e})}n++;console.log('PASS: '+name)}
  const q=job()
  await check('queue persists real photo job while browser offline',async()=>{
   await context.setOffline(true)
   const result=await page.evaluate(async j=>{const {queue}=qcLab;await queue.enqueueOperationalJob(j);return await queue.listOperationalJobs(j.uploaderUid)},q)
   assert.equal(result.length,1);assert.equal(result[0].changes.length,3);assert.equal(result[0].record.photoBase64,png)
   await context.setOffline(false)
  })
  await check('reload retains queued bytes and revision',async()=>{await page.reload();await page.waitForFunction(()=>!!globalThis.qcLab);const rows=await page.evaluate(()=>qcLab.queue.listOperationalJobs('uat-spray'));assert.equal(rows.length,1);assert.deepEqual(rows[0].changes,q.changes);assert.equal(rows[0].record.clientRevision,'uat-r1')})
  await page.evaluate(()=>{
   const {queue,transport}=qcLab
   const state={uid:'uat-spray',records:new Map(),objects:new Map(),putAttempts:0,commitAttempts:0,failUpload:false,failCommit:false,loseAck:false,flipAccount:false,unconfirmed:false}
   const hex=bytes=>Array.from(bytes,x=>x.toString(16).padStart(2,'0')).join('')
   const deps={scope:'isolated-browser',photoBucket:'qc-photos-uat-mock',currentUid:async()=>state.uid,
    readRecord:async id=>state.records.get(id)??null,
    putVerifiedPhoto:async(ref,bytes)=>{
     state.putAttempts++
     if(state.failUpload)throw Error('MOCK_UPLOAD_OFFLINE')
     if(state.uid!==ref.uploaderUid||!ref.objectPath.startsWith(state.uid+'/qc/')||ref.bucket!=='qc-photos-uat-mock')throw Error('MOCK_PHOTO_SCOPE')
     const hash=hex(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)))
     if(hash!==ref.sha256||bytes.length!==ref.size)throw Error('MOCK_HASH_MISMATCH')
     const old=state.objects.get(ref.objectPath),encoded=hex(bytes)
     if(old!==undefined&&old!==encoded)throw Error('MOCK_IMMUTABLE_CONFLICT')
     state.objects.set(ref.objectPath,encoded)
     if(state.flipAccount)state.uid='uat-other'
    },
    commitRecord:async({record,baseRevision,jobId,uploaderUid})=>{
     state.commitAttempts++
     if(state.failCommit)throw Error('MOCK_COMMIT_OFFLINE')
     if(state.uid!==uploaderUid||record.ownerUid!==uploaderUid)throw Error('MOCK_ACCOUNT')
     if((state.records.get(record.id)?.clientRevision??null)!==baseRevision)throw Error('MOCK_CAS')
     if(state.unconfirmed)return null
     for(const r of Object.values(record.operationalPhotoManifest)){
      const bytes=state.objects.get(r.objectPath)
      if(!bytes||r.uploaderUid!==uploaderUid)throw Error('MOCK_PHOTO_MISSING')
     }
     state.records.set(record.id,structuredClone(record))
     if(state.loseAck){state.loseAck=false;throw Error('MOCK_ACK_LOST')}
     return record
    }
   }
   globalThis.lab={state,deps,enqueue:j=>queue.enqueueOperationalJob(j),batch:jobs=>queue.enqueueOperationalBatch(jobs),list:uid=>queue.listOperationalJobs(uid),flush:uid=>queue.flushOperationalJobs(uid,deps),id:transport.operationalQueueId}
  })
  const enqueue=j=>page.evaluate(j=>lab.enqueue(j),j)
  const flush=()=>page.evaluate(()=>lab.flush('uat-spray'))
  const set=(key,value)=>page.evaluate(({key,value})=>{lab.state[key]=value},{key,value})
  const snapshot=()=>page.evaluate(()=>({records:[...lab.state.records],objects:[...lab.state.objects],put:lab.state.putAttempts,commit:lab.state.commitAttempts}))
  await check('same queue identity does not overwrite original bytes',async()=>{const saved=await enqueue({...q,changes:[]});assert.deepEqual(saved.changes,q.changes);assert.equal((await page.evaluate(()=>lab.list('uat-spray'))).length,1)})
  await check('another account cannot flush owner queue',async()=>{await set('uid','uat-other');const r=await flush();assert.equal(r.sent,0);assert.equal(r.left,1);assert.equal((await snapshot()).put,0);await set('uid','uat-spray')})
  await check('upload failure retains job and prevents commit',async()=>{await set('failUpload',true);const r=await flush();assert.equal(r.sent,0);assert.equal(r.left,1);assert.match(r.failures[0].error,/MOCK_UPLOAD_OFFLINE/);assert.equal((await snapshot()).commit,0);await set('failUpload',false)})
  await check('account switch during photo upload stops before commit',async()=>{await set('flipAccount',true);const r=await flush();assert.equal(r.sent,0);assert.equal(r.left,1);assert.match(r.failures[0].error,/ACCOUNT_MISMATCH/);assert.equal((await snapshot()).commit,0);await set('flipAccount',false);await set('uid','uat-spray')})
  await check('commit failure retains job after three immutable uploads',async()=>{await set('failCommit',true);const r=await flush();assert.equal(r.sent,0);assert.equal(r.left,1);const s=await snapshot();assert.equal(s.records.length,0);assert.equal(s.objects.length,3);await set('failCommit',false)})
  await check('unconfirmed response retains job',async()=>{await set('unconfirmed',true);const r=await flush();assert.equal(r.left,1);assert.match(r.failures[0].error,/QC_COMMIT_UNCONFIRMED/);await set('unconfirmed',false)})
  await check('lost commit ACK retains queue but server has record',async()=>{await set('loseAck',true);const r=await flush();assert.equal(r.left,1);const s=await snapshot();assert.equal(s.records.length,1);assert.equal(s.objects.length,3);const record=s.records[0][1];assert.equal(record.saveType,'uploaded');assert.equal(record.photoBase64,undefined);assert.equal(record.holdIntervals[0].photoBase64,undefined);assert.equal(Object.keys(record.operationalPhotoManifest).length,3)})
  await check('retry confirms existing commit without reupload and deletes queue',async()=>{const before=await snapshot(),r=await flush(),after=await snapshot();assert.equal(r.sent,1);assert.equal(r.left,0);assert.deepEqual(after,before)})
  await check('correction keeps all untouched photo references',async()=>{const old=(await snapshot()).records[0][1].operationalPhotoManifest;await enqueue({...job('uat-q1','uat-r2','uat-r1'),changes:[]});assert.equal((await flush()).sent,1);assert.deepEqual((await snapshot()).records[0][1].operationalPhotoManifest,old)})
  await check('explicit HOLD removal preserves main and scan and does not delete storage',async()=>{const old=(await snapshot()).records[0][1].operationalPhotoManifest;await enqueue({...job('uat-q1','uat-r3','uat-r2'),changes:[{kind:'hold',holdId:'uat-h1',action:'remove'}]});assert.equal((await flush()).sent,1);const s=await snapshot();assert.deepEqual(s.records[0][1].operationalPhotoManifest,{main:old.main,scan:old.scan});assert.equal(s.objects.length,3)})
  await check('failed stale revision blocks same record but not unrelated record',async()=>{await enqueue({...job('uat-q1','uat-r4','uat-r1'),changes:[]});await enqueue({...job('uat-q1','uat-r5','uat-r3'),changes:[]});await enqueue(job('uat-q2'));const r=await flush();assert.equal(r.sent,1);assert.equal(r.left,2);assert.match(r.failures[0].error,/QC_REVISION_CONFLICT/);assert.equal((await snapshot()).records.find(([id])=>id==='uat-q1')[1].clientRevision,'uat-r3')})
  await check('batch enqueue aborts when a record already has a pending job',async()=>{await assert.rejects(page.evaluate(async jobs=>lab.batch(jobs),[job('uat-q1','uat-r6','uat-r3'),job('uat-q3')]));const rows=await page.evaluate(()=>lab.list('uat-spray'));assert.equal(rows.length,2);assert.ok(rows.every(j=>j.record.id==='uat-q1'))})
  await check('atomic batch stores both jobs and separate UID remains isolated',async()=>{const rows=await page.evaluate(jobs=>lab.batch(jobs),[job('uat-q3'),job('uat-q4')]);assert.equal(rows.length,2);await enqueue(job('uat-other-q','uat-r1',null,'uat-other'));const a=await page.evaluate(()=>lab.list('uat-spray')),b=await page.evaluate(()=>lab.list('uat-other'));assert.equal(a.length,4);assert.equal(b.length,1);assert.ok(a.every(j=>j.uploaderUid==='uat-spray'))})
  await check('no external request websocket or CSP violation',async()=>{assert.deepEqual(violations,[]);assert.deepEqual(await page.evaluate(()=>cspViolations),[])})
  console.log('SUCCESS: '+n+' browser photo queue and offline checks passed (real IndexedDB, mock storage/CAS only)')
 }finally{try{if(context)await context.close();if(browser)await browser.close()}finally{if(server.listening)await new Promise(resolve=>server.close(resolve))}}
}
