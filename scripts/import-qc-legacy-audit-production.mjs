// Explicitly gated, create-only historical import. Never run --apply without a reviewed final snapshot.
import {readFileSync,statSync,realpathSync} from 'node:fs'
import {createHash} from 'node:crypto'
import {createRequire} from 'node:module'
import {homedir} from 'node:os'
import {resolve,relative,isAbsolute} from 'node:path'
import {isDeepStrictEqual} from 'node:util'
import assert from 'node:assert/strict'
import {prepareLegacyAudit,importLegacyAudit} from '../server/qc-photo-access/qcLegacyAudit.mjs'
import {checkLiveRules} from './check-qc-live-firestore-rules.mjs'
const PROJECT='form-qc-unm', COLLECTION='qc_legacy_activity_logs'
const sha=v=>createHash('sha256').update(v).digest('hex')
const abort=code=>{throw Error(code)}

function reconcile(prepared,actual,sourceKey){
 const expected=new Map(prepared.logs.map(r=>[r.id,r.data]))
 const found=new Map(actual.map(r=>[r.id,r.data]))
 let unchanged=0,missing=0,conflicts=0,unexpected=0
 for(const [id,data] of expected){
  if(!found.has(id))missing++
  else if(isDeepStrictEqual(found.get(id),data))unchanged++
  else conflicts++
 }
 for(const [id,data] of found)if(data.sourceKey===sourceKey&&!expected.has(id))unexpected++
 return {expected:expected.size,unchanged,missing,conflicts,unexpected}
}
function assertClean(r){if(r.conflicts||r.unexpected)abort('HISTORICAL_SOURCE_CONFLICT')}
function parseArgs(args){
 if(args.length===1&&args[0]==='--self-test')return {mode:'test'}
 if(args.length===2&&args[0]==='--plan')return {mode:'plan',file:args[1]}
 if(args.length===6&&args[0]==='--apply'&&args[2]==='--snapshot-sha256'&&/^[a-f0-9]{64}$/.test(args[3])&&args[4]==='--source-frozen-confirmed'&&args[5]==='--backup-confirmed')return {mode:'apply',file:args[1],expectedSha:args[3]}
 abort('USAGE')
}
function selfTest(){
 const p={logs:[{id:'a',data:{sourceKey:'s',sourceHash:'one'}}]}
 const a=p.logs[0]
 assert.deepEqual(reconcile(p,[a],'s'),{expected:1,unchanged:1,missing:0,conflicts:0,unexpected:0})
 assert.equal(reconcile(p,[],'s').missing,1)
 assert.throws(()=>assertClean(reconcile(p,[{id:'a',data:{sourceKey:'s',sourceHash:'two'}}],'s')),/HISTORICAL_SOURCE_CONFLICT/)
 assert.throws(()=>assertClean(reconcile(p,[a,{id:'b',data:{sourceKey:'s'}}],'s')),/HISTORICAL_SOURCE_CONFLICT/)
 assert.equal(reconcile(p,[a,{id:'b',data:{sourceKey:'other'}}],'s').unexpected,0)
 assert.throws(()=>parseArgs(['--apply','x']),/USAGE/)
 assert.throws(()=>parseArgs(['--apply','x','--snapshot-sha256','0'.repeat(64),'--source-frozen-confirmed']),/USAGE/)
 assert.equal(parseArgs(['--apply','x','--snapshot-sha256','0'.repeat(64),'--source-frozen-confirmed','--backup-confirmed']).mode,'apply')
 assert.equal(parseArgs(['--plan','x']).mode,'plan')
 assert.equal(parseArgs(['--self-test']).mode,'test')
 console.log('SUCCESS: 10 production-import guard logic checks passed (offline)')
}

async function main(){
 const args=parseArgs(process.argv.slice(2))
 if(args.mode==='test')return selfTest()
 if(process.env.FIRESTORE_EMULATOR_HOST||process.env.FIREBASE_AUTH_EMULATOR_HOST)abort('EMULATOR_ENVIRONMENT')
 for(const k of ['GCLOUD_PROJECT','GOOGLE_CLOUD_PROJECT','FIREBASE_PROJECT_ID'])if(process.env[k]!==PROJECT)abort('PROJECT_CONFIRMATION_REQUIRED')
 // Restrict source to the owner's private directory, not Git.
 const privateDir=realpathSync(resolve(homedir(),'qc-migration-private'))
 const file=realpathSync(args.file), rel=relative(privateDir,file)
 if(!rel||rel==='..'||rel.startsWith('../')||isAbsolute(rel)||(statSync(privateDir).mode&0o077)||(statSync(file).mode&0o077)||!statSync(file).isFile())abort('PRIVATE_SNAPSHOT_REQUIRED')
 const bytes=readFileSync(file),snapshotSha256=sha(bytes)
 if(args.mode==='apply'&&snapshotSha256!==args.expectedSha)abort('SNAPSHOT_HASH_MISMATCH')
 const snapshot=JSON.parse(bytes.toString('utf8')),prepared=prepareLegacyAudit(snapshot)
 if(!prepared.logs.length)abort('EMPTY_SNAPSHOT')
 if(prepared.summary.pendingCount)abort('LEGACY_PENDING_REQUESTS')
 const sourceKey=sha(JSON.stringify([snapshot.sourceId,snapshot.logSheetId]))
 const requireAdmin=createRequire(new URL('../server/qc-photo-access/package.json',import.meta.url))
 const {initializeApp,applicationDefault,deleteApp}=requireAdmin('firebase-admin/app')
 const {getFirestore,FieldPath}=requireAdmin('firebase-admin/firestore')
 // Stage 18F: require the isolated historical rules release, not the full cutover candidate.
 const credential=applicationDefault()
 const rules=await checkLiveRules(credential,readFileSync(new URL('./firestore.legacy-audit-release.rules',import.meta.url),'utf8'))
 const app=initializeApp({credential,projectId:PROJECT})
 const db=getFirestore(app),collection=db.collection(COLLECTION)
 async function scan(){
  const actual=[]
  let last
  while(true){
   let q=collection.where('sourceKey','==',sourceKey).orderBy(FieldPath.documentId()).limit(200)
   if(last)q=q.startAfter(last)
   const page=await q.get()
   for(const d of page.docs)actual.push({id:d.id,data:d.data()})
   if(page.size<200)break
   last=page.docs.at(-1)
  }
  const known=new Set(actual.map(r=>r.id))
  const absent=prepared.logs.filter(r=>!known.has(r.id))
  for(let i=0;i<absent.length;i+=100){
   const docs=await db.getAll(...absent.slice(i,i+100).map(r=>collection.doc(r.id)))
   for(const d of docs)if(d.exists)actual.push({id:d.id,data:d.data()})
  }
  return reconcile(prepared,actual,sourceKey)
 }
 try{
  const before=await scan()
  const nativePending=(await db.collection('qc_native_name_requests').where('status','==','pending').count().get()).data().count
  const nativeLocks=(await db.collection('qc_native_name_pending').count().get()).data().count
  const blockers=[]
  if(!rules.exactMatch)blockers.push('DEPLOYED_RULES_MISMATCH')
  if(before.conflicts||before.unexpected)blockers.push('HISTORICAL_SOURCE_CONFLICT')
  if(nativePending||nativeLocks)blockers.push('NATIVE_REQUESTS_PRESENT')
  console.log(JSON.stringify({project:PROJECT,collection:COLLECTION,mode:args.mode,snapshotSha256,summary:prepared.summary,before,rules,nativePending,nativeLocks,blockers,writes:0,releaseApproved:false},null,2))
  if(args.mode==='plan'){
   console.log('SUCCESS: read-only historical import plan; no documents written')
   if(blockers.length)process.exitCode=2
   return
  }
  if(blockers.length)abort('IMPORT_BLOCKED')
  assertClean(before)
  // Recheck release just before writing. Operator must prevent concurrent deployments/writers.
  const latest=await checkLiveRules(credential,readFileSync(new URL('./firestore.legacy-audit-release.rules',import.meta.url),'utf8'))
  if(!latest.exactMatch||latest.ruleset!==rules.ruleset)abort('RULES_CHANGED')
  console.log('Beginning create-only import; a failure may leave completed chunks. Re-run plan before retry.')
  const result=await importLegacyAudit(db,prepared)
  const after=await scan()
  assertClean(after)
  if(after.missing||after.unchanged!==prepared.logs.length)abort('POST_IMPORT_VERIFICATION_FAILED')
  console.log(JSON.stringify({result,after,releaseApproved:false},null,2))
  console.log('SUCCESS: historical import reconciled; this does not activate features or approve cutover')
 }finally{await deleteApp(app)}
}
main().catch(e=>{
 const m=String(e?.message||'')
 console.error(/^[A-Z][A-Z0-9_]+$/.test(m)?m:'IMPORT_FAILED_REVIEW_PLAN_BEFORE_RETRY')
 process.exitCode=1
})
