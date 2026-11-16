// Browser + HTTP + trusted transaction, dedicated demo only.
import assert from 'node:assert/strict'
import {createHash} from 'node:crypto'
import {createRequire} from 'node:module'
import {readFileSync} from 'node:fs'
import {fileURLToPath} from 'node:url'
import {createPortalSyncServer} from '../server/qc-photo-access/uat-portal-sync-server.mjs'
import {syncOrigin,syncPath} from '../src/qcUatPortalSyncClient.mjs'
import {marker} from '../src/qcUatRolePermissions.mjs'
import {commitSyntheticQc} from '../src/qcUatQcLifecycleContract.mjs'
import {operationalQueueId} from '../src/qcOperationalSaveTransport.mjs'
import {jobPayload,prepareStrictJob,processStrictSyntheticJob} from '../src/qcUatStrictQueueContract.mjs'
import {prepareOperationalPhotoManifest,stripOperationalPhotoPayload} from '../src/qcOperationalPhotoManifest.mjs'
const projectId='demo-qc-uat-portal-sync',host='127.0.0.1',port=8985,authPort=9799
const config=JSON.parse(readFileSync(new URL('../firebase.uat-portal-sync-emulator.json',import.meta.url),'utf8'))
const rules=readFileSync(new URL('../scripts/firestore.uat-strict-integration-demo.rules',import.meta.url),'utf8')
function guard(e=process.env){
 assert.equal(e.GCLOUD_PROJECT,projectId,'DEMO_PROJECT_REQUIRED')
 assert.equal(e.FIRESTORE_EMULATOR_HOST,host+':'+port,'FIRESTORE_LOOPBACK_REQUIRED')
 assert.equal(e.FIREBASE_AUTH_EMULATOR_HOST,host+':'+authPort,'AUTH_LOOPBACK_REQUIRED')
 for(const k of ['GOOGLE_CLOUD_PROJECT','FIREBASE_PROJECT_ID'])if(e[k])assert.equal(e[k],projectId,'WRONG_PROJECT')
}
const valid={GCLOUD_PROJECT:projectId,FIRESTORE_EMULATOR_HOST:host+':'+port,FIREBASE_AUTH_EMULATOR_HOST:host+':'+authPort}
assert.ok(process.argv.length===3&&['--self-test','--emulator'].includes(process.argv[2]))
guard(valid)
for(const e of [{},{...valid,GCLOUD_PROJECT:'form-qc-unm'},{...valid,FIRESTORE_EMULATOR_HOST:'127.0.0.1:8485'},{...valid,FIREBASE_AUTH_EMULATOR_HOST:'remote:9799'},{...valid,GOOGLE_CLOUD_PROJECT:'form-qc-unm'}])assert.throws(()=>guard(e))
assert.equal(config.firestore.rules,'scripts/firestore.uat-strict-integration-demo.rules')
assert.deepEqual(config.emulators.firestore,{host,port})
assert.deepEqual(config.emulators.auth,{host,port:authPort})
assert.ok(rules.includes("get(p).data == {'testOnly': true, 'baseRevision': base, 'expectedQc': q}"))
assert.ok(rules.includes('qcValid(id,q) && receiptMatches(q,base) && newAudit(q) && pairedActual(q)'))
assert.ok(rules.includes('qcWrite(id,request.resource.data,resource.data.clientRevision)'))
assert.ok(rules.includes('eligible(q) && changedQc(q) && actualMatches(a,q)'))
assert.ok(rules.includes('editForm(q.formType) && changedQc(q) && auditMatches(a,q)'))
const digest=v=>createHash('sha256').update(v).digest('hex')
const syntheticJob=key=>'uat-job-'+digest(key).slice(0,48)
assert.match(syntheticJob(operationalQueueId('uat-spray','uat-q1','uat-r1')), /^uat-[a-z0-9-]{1,60}$/)
assert.notEqual(syntheticJob(operationalQueueId('uat-spray','uat-q1','uat-r1')),syntheticJob(operationalQueueId('uat-spray','uat-q1','uat-r2')))
assert.match(readFileSync(new URL('../src/firebase.ts',import.meta.url),'utf8'),/QC_HOSTED_UAT_ISOLATION_REQUIRED/)
assert.doesNotMatch(readFileSync(new URL('../src/main.tsx',import.meta.url),'utf8'),/qcUatPortalSyncClient|uat-portal-sync-lab/)
assert.equal(syncOrigin,'http://127.0.0.1:4585')
assert.equal(syncPath,'/api/qc-uat/v1/sync')
console.log('SUCCESS: portal sync demo, origin and receipt guards passed (offline)')
if(process.argv[2]==='--emulator'){
 guard()
 const dir=process.env.QC_UAT_PLAYWRIGHT_DIR
 assert.ok(dir?.startsWith('/'),'QC_UAT_PLAYWRIGHT_DIR_REQUIRED')
 const {chromium}=createRequire(dir+'/package.json')('playwright')
 const {build}=await import('vite')
 const root=fileURLToPath(new URL('../',import.meta.url))
 const output=await build({root,configFile:false,envDir:false,publicDir:false,logLevel:'warn',build:{write:false,emptyOutDir:false,minify:false,rollupOptions:{input:root+'uat-portal-sync-lab/main.jsx'}}})
 const chunks=(Array.isArray(output)?output:[output]).flatMap(r=>r.output??[]).filter(o=>o.type==='chunk')
 assert.equal(chunks.length,1);assert.equal(chunks[0].imports.length,0);assert.equal(chunks[0].dynamicImports.length,0)
 const {initializeApp,deleteApp}=await import('firebase/app')
 const {initializeAuth,inMemoryPersistence,connectAuthEmulator,signInWithEmailAndPassword,signOut}=await import('firebase/auth')
 const {initializeFirestore,connectFirestoreEmulator,doc,getDocFromServer,setDoc,writeBatch,runTransaction,terminate}=await import('firebase/firestore')
 const require=createRequire(new URL('../server/qc-photo-access/package.json',import.meta.url))
 const {initializeApp:adminInit,deleteApp:adminDelete}=require('firebase-admin/app')
 const {getAuth}=require('firebase-admin/auth')
 const {getFirestore}=require('firebase-admin/firestore')
 const admin=adminInit({projectId},'photo-integration-admin'),authAdmin=getAuth(admin),adb=getFirestore(admin)
 const prefix='qc_uat_workspaces/cutover',bucket='qc-photos-uat-mock',clients=[],objects=new Map()
 const uid=k=>'uat-'+k
 const email=k=>k+'@qc-photo-integration.example.test'
 const password=k=>'Synthetic-photo-integration-'+k+'-2026'
 const markRef=k=>adb.doc('qc_uat_identities/'+k)
 const ref=(c,id)=>adb.doc(prefix+'/'+c+'/'+id)
 const read=async(c,id)=>{const s=await ref(c,id).get();return s.exists?s.data():null}
 const path=(c,col,id)=>doc(c.db,'qc_uat_workspaces','cutover',col,id)
 const get=async(c,col,id)=>{const s=await getDocFromServer(path(c,col,id));return s.exists()?s.data():null}
 const denied=fn=>assert.rejects(fn,{code:'permission-denied'})
 const png='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jR1sAAAAASUVORK5CYII='
 const qc=(k='spray',kind='spray',id='uat-q-'+k,rev='uat-r1',area=250)=>({testOnly:true,id,ownerUid:uid(k),inputtedBy:uid(k),formType:kind,clientRevision:rev,saveType:'ready',dailyPlanId:'uat-d-'+kind,monthlyPlanLineId:'uat-m-'+kind,pid:'uat-pid',date:'2026-11-12',shift:'2',foreman:'uat-foreman',actualArea100:area,sessionId:'uat-session'})
 const daily=r=>({testOnly:true,dailyPlanId:r.dailyPlanId,monthlyPlanLineId:r.monthlyPlanLineId,pid:r.pid,date:r.date,shift:r.shift,foreman:r.foreman,formType:r.formType,area100:300})
 const changes=[{kind:'main',action:'replace',dataUrl:png},{kind:'hold',holdId:'uat-h1',action:'replace',dataUrl:png},{kind:'scan',action:'replace',dataUrl:png}]
 const job=(r,baseRevision=null,edits=changes)=>({testOnly:true,scope:'uat-strict',record:{...r,photoBase64:png,scanReportPhotoBase64:png},uploaderUid:r.ownerUid,baseRevision,action:'finalizeRecord',changes:edits,id:operationalQueueId(r.ownerUid,r.id,r.clientRevision)})
 const stats={uploads:0,commits:0,failUpload:false,failCommit:false,loseAck:false}
 async function open(k){
  guard()
  const app=initializeApp({projectId,apiKey:'demo-only-not-a-real-key'},'photo-integration-'+crypto.randomUUID())
  const auth=initializeAuth(app,{persistence:inMemoryPersistence});connectAuthEmulator(auth,'http://'+host+':'+authPort,{disableWarnings:true})
  const db=initializeFirestore(app,{});connectFirestoreEmulator(db,host,port)
  const c={app,auth,db};clients.push(c)
  const {user}=await signInWithEmailAndPassword(auth,email(k),password(k))
  assert.equal(user.uid,uid(k));return c
 }
 async function authorize(c,record){
  guard()
  const u=c.auth.currentUser
  if(!u||u.uid!==record.ownerUid)throw Error('MOCK_OWNER_REQUIRED')
  const token=await authAdmin.verifyIdToken(await u.getIdToken(),true)
  const m=(await markRef(token.uid).get()).data()
  const key=record.formType==='spray'?'qc_spraying':'qc_fertilizer'
  if(token.qcUat!==true||!m?.enabled||m.testOnly!==true||m.workspace!=='cutover'||m.permissions?.[key]!=='edit'||(await adb.doc('users/'+token.uid).get()).exists)throw Error('MOCK_PHOTO_PERMISSION_DENIED')
 }
 function verifyObject(r,bytes,record,slot){
  assert.ok(['main','scan','hold_uat-h1'].includes(slot),'MOCK_SLOT')
  assert.equal(r.kind,slot==='hold_uat-h1'?'hold':slot)
  if(r.kind==='hold')assert.equal(r.holdId,'uat-h1')
  else assert.equal(r.holdId,undefined)
  assert.equal(r.provider,'supabase');assert.equal(r.bucket,bucket);assert.equal(r.uploaderUid,record.ownerUid)
  assert.equal(r.sha256,digest(bytes));assert.equal(r.size,bytes.length);assert.ok(bytes.length>0&&bytes.length<=2097152)
  assert.equal(r.photoId,digest(slot).slice(0,24)+'_'+r.sha256)
  const ext={'image/png':'png','image/jpeg':'jpg','image/webp':'webp'}[r.contentType]
  assert.ok(ext)
  assert.equal(r.objectPath,record.ownerUid+'/qc/'+record.id+'/'+r.photoId+'.'+ext)
 }
 // Trusted in-process service: takes the original job, independently hashes it,
 // reconstructs expected manifest and QC from authoritative revision and DP.
 // No caller-supplied fingerprint or processed QC is accepted on trust.
 async function receipt(c,job,claimed){
  const {canonical,id:key}=jobPayload(job)
  const raw=JSON.parse(canonical),fp='sha256-v1:'+digest(canonical)
  assert.equal(claimed,fp,'TRUSTED_FINGERPRINT_MISMATCH')
  if(Object.hasOwn(job,'payloadFingerprint'))assert.equal(job.payloadFingerprint,fp,'TRUSTED_FINGERPRINT_MISMATCH')
  const record=stripOperationalPhotoPayload(raw.record)
  assert.deepEqual(Object.keys(record).sort(),['testOnly','id','ownerUid','inputtedBy','formType','clientRevision','saveType','dailyPlanId','monthlyPlanLineId','pid','date','shift','foreman','actualArea100','sessionId'].sort(),'TRUSTED_RECORD_FIELDS')
  await authorize(c,record)
  const jobId=syntheticJob(key),p=ref('photo_receipts',jobId)
  return adb.runTransaction(async t=>{
   const [old,existing,dp]=await Promise.all([t.get(ref('qc_records',record.id)),t.get(p),record.dailyPlanId?t.get(ref('daily_plans',record.dailyPlanId)):Promise.resolve(null)])
   const current=old.data()
   if(current?.clientRevision===record.clientRevision&&current?.operationalSaveId===jobId){
    const expected=existing.data()
    assert.ok(expected,'TRUSTED_RECEIPT_MISSING')
    assert.equal(current.operationalPayloadFingerprint,fp,'TRUSTED_RECEIPT_CONFLICT')
    assert.equal(expected.baseRevision,raw.baseRevision,'TRUSTED_RECEIPT_CONFLICT')
    assert.deepEqual(expected.expectedQc,current,'TRUSTED_RECEIPT_CONFLICT')
    return expected.expectedQc
   }
   assert.equal(current?.clientRevision??null,raw.baseRevision,'TRUSTED_BASE_REVISION_CONFLICT')
   const {manifest}=await prepareOperationalPhotoManifest({recordId:record.id,uploaderUid:raw.uploaderUid,previous:current?.operationalPhotoManifest??{},changes:raw.changes,bucket})
   for(const [slot,r] of Object.entries(manifest)){
    const bytes=objects.get(r.objectPath)
    assert.ok(bytes,'MOCK_OBJECT_MISSING')
    verifyObject(r,bytes,record,slot)
   }
   const plannedDailyArea100=record.dailyPlanId?dp?.data()?.area100:0
   assert.ok(Number.isSafeInteger(plannedDailyArea100)&&plannedDailyArea100>=0,'TRUSTED_DP_MISSING')
   const expectedQc={...record,saveType:raw.action==='finalizeRecord'?'uploaded':record.saveType,plannedDailyArea100,operationalSaveId:jobId,firestoreSaveState:'confirmed',operationalPhotoManifest:manifest,operationalQueueKey:key,operationalPayloadFingerprint:fp}
   const expected={testOnly:true,baseRevision:raw.baseRevision,expectedQc}
   if(existing.exists)assert.deepEqual(existing.data(),expected,'TRUSTED_RECEIPT_CONFLICT')
   else t.create(p,expected)
   return expectedQc
  })
 }
 const stripFingerprint=r=>{if(!r)return null;const {operationalPayloadFingerprint,...core}=r;return core}
 const stripIntegration=r=>{if(!r)return null;const {operationalPhotoManifest,operationalQueueKey,...core}=stripFingerprint(r);return core}
 const transportView=r=>r?{...r,operationalSaveId:r.operationalQueueKey}:null
 async function commit(c,input,original){
  stats.commits++
  if(stats.failCommit)throw Error('MOCK_COMMIT_OFFLINE')
  const {record,jobId:key,baseRevision,uploaderUid}=input
  const {operationalPhotoManifest:manifest,operationalSaveId,firestoreSaveState,operationalPayloadFingerprint:fp,...canonical}=record
  assert.equal(operationalSaveId,key)
  assert.equal(key,jobPayload(original).id,'TRUSTED_QUEUE_KEY_MISMATCH')
  assert.equal(baseRevision,original.baseRevision,'TRUSTED_BASE_REVISION_CONFLICT')
  assert.equal(uploaderUid,original.uploaderUid,'TRUSTED_OWNER_MISMATCH')
  const expected=await receipt(c,original,fp),jobId=expected.operationalSaveId
  const {plannedDailyArea100,operationalQueueKey,...expectedTransport}=transportView(expected)
  assert.deepEqual(record,expectedTransport,'TRUSTED_PROCESSED_PAYLOAD_MISMATCH')
  const result=await commitSyntheticQc({record:canonical,baseRevision,jobId,uploaderUid},{
   currentUid:async()=>c.auth.currentUser?.uid??null,
   transaction:fn=>runTransaction(c.db,async t=>{
    const readDoc=async(col,id)=>{const s=await t.get(path(c,col,id));return s.exists()?s.data():null}
    return fn({
     readQc:async id=>{const row=await readDoc('qc_records',id);if(row?.clientRevision===canonical.clientRevision)assert.equal(row.operationalPayloadFingerprint,fp,'TRUSTED_REPLAY_CONFLICT');return stripIntegration(row)},
     readActual:async id=>{const row=await readDoc('daily_reports',id);if(row?.clientRevision===canonical.clientRevision)assert.equal(row.operationalPayloadFingerprint,fp,'TRUSTED_REPLAY_CONFLICT');return stripFingerprint(row)},
     readAudit:async id=>{const row=await readDoc('qc_operational_audit',id);if(row)assert.equal(row.operationalPayloadFingerprint,fp,'TRUSTED_REPLAY_CONFLICT');return stripFingerprint(row)},
     readDaily:id=>readDoc('daily_plans',id),
     writeQc:(id,r)=>{const next={...r,operationalPhotoManifest:manifest,operationalQueueKey:key,operationalPayloadFingerprint:fp};assert.deepEqual(next,expected,'TRUSTED_TRANSACTION_PAYLOAD_MISMATCH');t.set(path(c,'qc_records',id),next)},
     writeActual:(id,r)=>t.set(path(c,'daily_reports',id),{...r,operationalPayloadFingerprint:fp}),
     writeAudit:(id,r)=>t.set(path(c,'qc_operational_audit',id),{...r,operationalPayloadFingerprint:fp})
    })
   })
  })
  assert.deepEqual(result,stripIntegration(expected),'TRUSTED_COMMIT_RESULT_MISMATCH')
  if(stats.loseAck){stats.loseAck=false;throw Error('MOCK_ACK_LOST')}
  return transportView(expected)
 }
 const run=(c,j)=>processStrictSyntheticJob(j,{
  currentUid:async()=>c.auth.currentUser?.uid??null,
  readRecord:async id=>{
   const row=await get(c,'qc_records',id)
   if(row?.clientRevision===j.record.clientRevision&&row?.operationalQueueKey===j.id){
    const audit=await get(c,'qc_operational_audit',id+':'+row.clientRevision)
    const actual=await get(c,'daily_reports','qcactual_'+id)
    if(!audit||audit.operationalPayloadFingerprint!==row.operationalPayloadFingerprint||(row.dailyPlanId&&row.actualArea100>0&&row.saveType!=='draft'&&(!actual||actual.clientRevision!==row.clientRevision||actual.operationalPayloadFingerprint!==row.operationalPayloadFingerprint)))throw Error('TRUSTED_REPLAY_PAIR_MISMATCH')
   }
   return transportView(row)
  },
  photoBucket:bucket,
  putVerifiedPhoto:async(r,bytes,j)=>{
   stats.uploads++
   if(stats.failUpload)throw Error('MOCK_UPLOAD_OFFLINE')
   await authorize(c,j.record)
   const slot=r.kind==='hold'?'hold_'+r.holdId:r.kind
   const b=Buffer.from(bytes);verifyObject(r,b,j.record,slot)
   const old=objects.get(r.objectPath)
   if(old)assert.deepEqual(old,b,'MOCK_IMMUTABLE_CONFLICT')
   else objects.set(r.objectPath,b)
  },
  commitRecord:input=>commit(c,input,j)
 })
 let n=0,server,browser,context
 const check=async(name,fn)=>{try{await fn()}catch(e){throw Error('FAIL: '+name,{cause:e})}n++;console.log('PASS: '+name)}
 const q=qc(),j=job(q),aid='qcactual_'+q.id
 const pair=async(r)=>{const a=await read('daily_reports','qcactual_'+r.id),u=await read('qc_operational_audit',r.id+':'+r.clientRevision);assert.equal(a.clientRevision,r.clientRevision);assert.equal(a.actualArea100,r.actualArea100);assert.equal(u.revision,r.clientRevision);const saved=await read('qc_records',r.id);assert.match(saved.operationalPayloadFingerprint,/^sha256-v1:[0-9a-f]{64}$/);assert.equal(a.operationalPayloadFingerprint,saved.operationalPayloadFingerprint);assert.equal(u.operationalPayloadFingerprint,saved.operationalPayloadFingerprint)}
 const absent=async r=>{for(const [c,id] of [['qc_records',r.id],['daily_reports','qcactual_'+r.id],['qc_operational_audit',r.id+':'+r.clientRevision]])assert.equal(await read(c,id),null)}
 try{
  assert.equal((await authAdmin.listUsers(1)).users.length,0,'FRESH_AUTH_REQUIRED')
  for(const col of ['qc_uat_identities','users','daily_plans',prefix+'/qc_records',prefix+'/daily_reports',prefix+'/qc_operational_audit',prefix+'/daily_plans',prefix+'/photo_receipts'])assert.equal((await adb.collection(col).limit(1).get()).size,0,'FRESH_FIRESTORE_REQUIRED')
  for(const [k,role] of [['spray','mandor_spraying'],['fert','mandor_fertilizer'],['visitor','pengunjung'],['other','mandor_spraying']]){
   await authAdmin.createUser({uid:uid(k),email:email(k),password:password(k),emailVerified:true})
   await authAdmin.setCustomUserClaims(uid(k),{qcUat:true})
   await markRef(uid(k)).set(marker(role))
  }
  await adb.doc('daily_plans/root-sentinel').set({testOnly:false,rootSentinel:true})
  for(const r of [q,qc('fert','fertilizer')])await ref('daily_plans',r.dailyPlanId).set(daily(r))
  const spray=await open('spray'),fert=await open('fert'),visitor=await open('visitor'),other=await open('other')
  const byUid=new Map([spray,fert,visitor,other].map(c=>[c.auth.currentUser.uid,c]))
  const tokens=new Map(await Promise.all([...byUid].map(async([id,c])=>[id,await c.auth.currentUser.getIdToken()])))
  server=createPortalSyncServer({
   verifyToken:t=>authAdmin.verifyIdToken(t,true),
   snapshot:(id,recordId)=>adb.runTransaction(async t=>{const [m,p,q]=await Promise.all([t.get(markRef(id)),t.get(adb.doc('users/'+id)),t.get(ref('qc_records',recordId))]);return {marker:m.data(),productionProfile:p.exists,record:q.data()??null}}),
   sync:async(id,token,j)=>{assert.equal(tokens.get(id),token,'FIXTURE_SESSION_REQUIRED');return run(byUid.get(id),j)}
  },chunks[0].code)
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(4585,host,resolve)})
  browser=await chromium.launch({headless:true})
  context=await browser.newContext({serviceWorkers:'block'})
  const violations=[]
  await context.route('**/*',async route=>{if(new URL(route.request().url()).origin===syncOrigin)await route.continue();else{violations.push('external request');await route.abort()}})
  await context.routeWebSocket('**/*',ws=>{violations.push('websocket');ws.close()})
  await context.addInitScript(()=>{globalThis.cspViolations=[];document.addEventListener('securitypolicyviolation',e=>cspViolations.push(e.effectiveDirective))})
  const page=await context.newPage();page.on('pageerror',e=>violations.push(e.message))
  const count=async n=>page.waitForFunction(v=>document.querySelector('#count')?.textContent===String(v),n)
  const result=async s=>{await page.waitForFunction(v=>document.querySelector('#result')?.textContent.includes(v),s);await page.waitForFunction(()=>!document.querySelector('#flush').disabled)}
  const click=id=>page.locator('#'+id).click()
  const field=(id,v)=>page.locator('#'+id).fill(v)
  const login=async uid=>{await page.evaluate(s=>portalSyncLab.installSession(s),{uid,token:tokens.get(uid)});await page.waitForFunction(v=>document.querySelector('#uid')?.textContent===v,uid)}
  const qr=qc('spray','spray','uat-q-browser')
  const queued=uid=>page.evaluate(id=>portalSyncLab.listStrictBrowserJobs(id),uid)
  const raw=async (token,body,path=syncPath)=>{const response=await fetch(syncOrigin+path,{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify(body),redirect:'error'});return {status:response.status,body:await response.json()}}
  await page.goto(syncOrigin);await page.locator('#save').waitFor();await login('uat-spray')
  await check('React offline save durable without HTTP or Firestore write',async()=>{await context.setOffline(true);await click('save');await result('QUEUED');await count(1);await click('flush');await result('OFFLINE');await absent(qr);await context.setOffline(false)})
  await check('reload and fresh fixture session retain same queued payload',async()=>{const before=await queued('uat-spray');await page.reload();await page.locator('#save').waitFor();await login('uat-spray');await count(1);assert.deepEqual(await queued('uat-spray'),before)})
  await check('foreign account cannot see or submit original queue',async()=>{const [j]=await queued('uat-spray');await login('uat-other');await count(0);assert.equal((await raw(tokens.get('uat-other'),{job:j})).status,403);await login('uat-spray');await count(1);await absent(qr)})
  await check('tampered fingerprint and legacy route denied',async()=>{const [j]=await queued('uat-spray');assert.equal((await raw(tokens.get('uat-spray'),{job:{...j,payloadFingerprint:'sha256-v1:'+'0'.repeat(64)}})).status,400);assert.equal((await raw(tokens.get('uat-spray'),{job:j},'/functions/v1/qc-photo-upload-uat')).status,404);await absent(qr)})
  await check('upload failure retains browser queue and no paired records',async()=>{stats.failUpload=true;await click('flush');await result('MOCK_UPLOAD_OFFLINE');await count(1);await absent(qr);stats.failUpload=false})
  await check('commit failure retains queue after immutable mock upload',async()=>{stats.failCommit=true;await click('flush');await result('MOCK_COMMIT_OFFLINE');await count(1);await absent(qr);stats.failCommit=false})
  await check('lost acknowledgement keeps queue but atomically commits QC Actual audit',async()=>{stats.loseAck=true;await click('flush');await result('MOCK_ACK_LOST');await count(1);await pair(qr);const saved=await read('qc_records',qr.id);assert.equal(saved.photoBase64,undefined);assert.ok(saved.operationalPhotoManifest.main)})
  await check('exact HTTP replay deletes queue without another upload or commit',async()=>{const before={...stats};await click('flush');await result('"sent":1');await count(0);assert.deepEqual(stats,before);await pair(qr)})
  await check('manual downgrade rejects even exact committed replay',async()=>{const previous=await prepareStrictJob({testOnly:true,scope:'uat-strict',uploaderUid:qr.ownerUid,record:{...qr,photoBase64:png},baseRevision:null,action:'finalizeRecord',changes:[{kind:'main',action:'replace',dataUrl:png}]});await markRef(qr.ownerUid).set(marker('mandor_spraying',{}, {qc_spraying:'none'}));const response=await raw(tokens.get(qr.ownerUid),{job:previous});assert.equal(response.status,403);assert.equal(response.body.error,'FORM_EDIT_REQUIRED');await markRef(qr.ownerUid).set(marker('mandor_spraying'))})
  await check('new revision updates same Actual and preserves photo',async()=>{const before=await read('qc_records',qr.id);await field('revision','uat-r2');await field('base','uat-r1');await field('area','350');await page.locator('#photo').uncheck();await click('save');await result('QUEUED');await count(1);await click('flush');await result('"sent":1');await count(0);const after=await read('qc_records',qr.id);assert.deepEqual(after.operationalPhotoManifest,before.operationalPhotoManifest);await pair({...qr,clientRevision:'uat-r2',actualArea100:350})})
  await check('manual permission denies queued correction until restored',async()=>{await field('revision','uat-r3');await field('base','uat-r2');await field('area','360');await click('save');await result('QUEUED');await count(1);await markRef(qr.ownerUid).set(marker('mandor_spraying',{}, {qc_spraying:'view'}));await click('flush');await result('FORM_EDIT_REQUIRED');await count(1);assert.equal((await read('qc_records',qr.id)).clientRevision,'uat-r2');await markRef(qr.ownerUid).set(marker('mandor_spraying'));await click('flush');await result('"sent":1');await count(0);await pair({...qr,clientRevision:'uat-r3',actualArea100:360})})
  await check('fertilizer form independent atomic transaction',async()=>{await login('uat-fert');await page.locator('#kind').selectOption('fertilizer');await field('record-id','uat-q-fert-browser');await field('revision','uat-r1');await field('base','');await field('area','250');await page.locator('#photo').check();await click('save');await result('QUEUED');await count(1);await click('flush');await result('"sent":1');await count(0);await pair(qc('fert','fertilizer','uat-q-fert-browser'))})
  await check('root sentinel unchanged and only isolated IndexedDB exists',async()=>{assert.deepEqual((await adb.doc('daily_plans/root-sentinel').get()).data(),{testOnly:false,rootSentinel:true});assert.deepEqual(await page.evaluate(async()=> (await indexedDB.databases()).map(d=>d.name)),['qc_uat_strict_queue_v1'])})
  await check('no external requests WebSockets or CSP violations',async()=>{assert.deepEqual(violations,[]);assert.deepEqual(await page.evaluate(()=>cspViolations),[])})
  console.log('SUCCESS: '+n+' React HTTP sync and atomic Firebase emulator checks passed (mock storage only)')
 }finally{
  try{if(context)await context.close();if(browser)await browser.close()}finally{if(server?.listening)await new Promise(resolve=>server.close(resolve))}
  for(const c of clients){try{await signOut(c.auth)}finally{try{await terminate(c.db)}finally{await deleteApp(c.app)}}}
  await adb.terminate()
  await adminDelete(admin)
 }
}
