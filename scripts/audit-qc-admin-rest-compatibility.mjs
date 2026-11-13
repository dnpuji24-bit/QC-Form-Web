// Production read-only, aggregate output only. Never logs document IDs, fields, values or tokens.
import {execFileSync} from 'node:child_process'
import assert from 'node:assert/strict'
import {inspectAdminRestDocument} from '../server/qc-photo-access/adminRestTransactionEmulator.mjs'
const project='form-qc-unm',root='https://firestore.googleapis.com/v1/projects/'+project+'/databases/(default)/documents/'
const collections=['users','role_access','firebase_registration_requests','qc_records','daily_reports','qc_admin_audit','qc_native_name_requests','qc_native_name_pending','qc_historical_correction_locks','qc_archived_records','qc_archived_actuals','qc_archive_markers','qc_archive_history','qc_archive_history_records','qc_archive_history_actuals','qc_operational_audit']
const caps={total:3000,collection:1500,page:100}
const empty=()=>({scanned:0,compatible:0,incompatible:0,reasons:{},complete:false})
function assess(doc,collection,summary){
 const prefix='projects/'+project+'/databases/(default)/documents/'+collection+'/'
 const id=typeof doc?.name==='string'&&doc.name.startsWith(prefix)?doc.name.slice(prefix.length):''
 if(!id||!doc.updateTime)throw Error('INVALID_DOCUMENT_RESPONSE')
 const result=inspectAdminRestDocument(id,doc.fields??{})
 summary.scanned++
 if(result==='COMPATIBLE')summary.compatible++
 else{summary.incompatible++;summary.reasons[result]=(summary.reasons[result]||0)+1}
}
async function scan({token,fetchImpl=fetch,readTime,limits=caps,targets=collections}){
 const report={project,mode:'production-read-only',readTime,documentLimit:limits.total,scanned:0,collections:{},blockers:[],writes:0,releaseApproved:false}
 for(const collection of targets){
  if(!collections.includes(collection))throw Error('INVALID_COLLECTION')
  const summary=report.collections[collection]=empty()
  let cursor='',pages=0
  const seen=new Set()
  do{
   const size=Math.min(limits.page,limits.total-report.scanned,limits.collection-summary.scanned)
   if(size<=0)break
   if(++pages>100)throw Error('PAGE_LIMIT_EXCEEDED')
   const url=new URL(root+collection)
   url.searchParams.set('pageSize',String(size))
   url.searchParams.set('readTime',readTime)
   if(cursor)url.searchParams.set('pageToken',cursor)
   const response=await fetchImpl(url,{method:'GET',headers:{Authorization:'Bearer '+token},redirect:'error',signal:AbortSignal.timeout(20000)})
   if(!response.ok)throw Error('FIRESTORE_READ_HTTP_'+response.status)
   const body=await response.json(),docs=body.documents??[]
   if(!Array.isArray(docs)||docs.length>size||typeof (body.nextPageToken??'')!=='string')throw Error('INVALID_PAGE_RESPONSE')
   for(const doc of docs){assess(doc,collection,summary);report.scanned++}
   cursor=body.nextPageToken??''
   if(cursor){if(seen.has(cursor))throw Error('REPEATED_PAGE_TOKEN');seen.add(cursor)}
   else summary.complete=true
  }while(cursor)
  if(!summary.complete)report.blockers.push('INCOMPLETE_SCAN:'+collection)
  if(summary.incompatible)report.blockers.push('CODEC_INCOMPATIBLE:'+collection)
  if(collection==='users'&&summary.scanned>500)report.blockers.push('USER_QUERY_LIMIT')
 }
 return report
}
async function selfTest(){
 let n=0
 const check=(label,fn)=>Promise.resolve().then(fn).then(()=>{console.log('PASS: '+label);n++})
 await check('compatible nested HOLD manifest and timestamp',()=>assert.equal(inspectAdminRestDocument('qc-v2-1',{manifest:{mapValue:{fields:{'hold-a':{stringValue:'synthetic'}}}},at:{timestampValue:'2026-11-13T00:00:00.123456Z'}}),'COMPATIBLE'))
 await check('unsupported integral double, bytes, reference, geopoint and large integer rejected',()=>{for(const v of [{doubleValue:1},{bytesValue:'AA=='},{referenceValue:'synthetic'},{geoPointValue:{latitude:1,longitude:2}},{integerValue:'9007199254740993'}])assert.equal(inspectAdminRestDocument('x',{v}),'UNSUPPORTED_REST_VALUE')})
 await check('unsupported ID and top-level field rejected',()=>{assert.equal(inspectAdminRestDocument('x.y',{}),'UNSUPPORTED_REST_ID');assert.equal(inspectAdminRestDocument('x',{'field.with.dot':{stringValue:'x'}}),'UNSUPPORTED_TOP_LEVEL_FIELD')})
 const readTime='2026-11-13T00:00:00.000Z',doc=(id,fields)=>({name:'projects/'+project+'/databases/(default)/documents/qc_records/'+id,fields,updateTime:readTime})
 await check('paginated GET only and aggregate results without sensitive data',async()=>{
  const calls=[],result=await scan({token:'synthetic',readTime,targets:['qc_records'],fetchImpl:async(url,opts)=>{
   assert.equal(opts.method,'GET');assert.equal(opts.headers.Authorization,'Bearer synthetic');assert.equal(url.origin,'https://firestore.googleapis.com');assert.equal(url.searchParams.get('readTime'),readTime);calls.push(url)
   return Response.json(calls.length===1?{documents:[doc('private-id',{email:{stringValue:'private@example.test'}})],nextPageToken:'p2'}:{documents:[doc('private-id2',{v:{doubleValue:1}})]})
  }})
  assert.equal(calls[1].searchParams.get('pageToken'),'p2');assert.equal(result.scanned,2);assert.equal(result.collections.qc_records.incompatible,1);assert.equal(result.collections.qc_records.complete,true);assert.ok(!JSON.stringify(result).includes('private'));assert.equal(result.writes,0)
 })
 await check('scan cap is explicit blocker, never false complete',async()=>{
  const r=await scan({token:'synthetic',readTime,targets:['qc_records'],limits:{total:1,collection:1,page:1},fetchImpl:async()=>Response.json({documents:[doc('x',{})],nextPageToken:'more'})})
  assert.equal(r.scanned,1);assert.deepEqual(r.blockers,['INCOMPLETE_SCAN:qc_records']);assert.equal(r.releaseApproved,false)
 })
 await check('repeated page token fails closed',()=>assert.rejects(scan({token:'synthetic',readTime,targets:['qc_records'],fetchImpl:async()=>Response.json({nextPageToken:'repeat'})}),/REPEATED_PAGE_TOKEN/))
 await check('HTTP failure sanitized; no remote error body printed',()=>assert.rejects(scan({token:'synthetic',readTime,targets:['qc_records'],fetchImpl:async()=>new Response('secret error',{status:403})}),{message:'FIRESTORE_READ_HTTP_403'}))
 console.log('SUCCESS: '+n+' read-only compatibility audit checks passed (mock only)')
}
async function main(){
 if(process.argv.length!==3)throw Error('USAGE')
 if(process.argv[2]==='--self-test')return selfTest()
 if(process.argv[2]!=='--read-only-confirmed')throw Error('USAGE')
 if(process.env.FIRESTORE_EMULATOR_HOST||process.env.FIREBASE_AUTH_EMULATOR_HOST)throw Error('EMULATOR_ENVIRONMENT')
 const cli=args=>{try{return execFileSync('gcloud',args,{encoding:'utf8',stdio:['ignore','pipe','ignore'],timeout:30000}).trim()}catch{throw Error('GCLOUD_AUTH_OR_PROJECT_UNAVAILABLE')}}
 if(cli(['config','get-value','project','--quiet'])!==project)throw Error('WRONG_PROJECT')
 const token=cli(['auth','print-access-token','--quiet'])
 if(!token||/\s/.test(token))throw Error('GCLOUD_AUTH_UNAVAILABLE')
 // Same historical readTime for all pages; within one-hour standard retention.
 const readTime=new Date(Date.now()-30000).toISOString()
 const report=await scan({token,readTime})
 console.log(JSON.stringify(report,null,2))
 console.log('SUCCESS: read-only compatibility audit completed; not deployment approval')
}
main().catch(error=>{console.error(typeof error?.message==='string'&&/^[A-Z0-9_]+$/.test(error.message)?error.message:'COMPATIBILITY_AUDIT_FAILED');process.exitCode=1})
