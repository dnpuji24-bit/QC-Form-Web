// Loopback-only synthetic HTTP sync lab. No standalone startup, no cloud SDK.
import {createServer} from 'node:http'
import {syncOrigin,syncPath} from '../../src/qcUatPortalSyncClient.mjs'
import {prepareStrictJob,assertConfirmation} from '../../src/qcUatStrictQueueContract.mjs'
import {actorAllowed,editAllowed,exact} from './uat-endpoint-server.mjs'
const max=10*1024*1024
function failure(status,code){throw Object.assign(Error(code),{status})}
async function parse(req){
 if(req.headers['content-type']!=='application/json')failure(415,'JSON_REQUIRED')
 const length=Number(req.headers['content-length']??0)
 if(!Number.isFinite(length)||length<0||length>max)failure(413,'BODY_TOO_LARGE')
 let n=0;const parts=[]
 for await(const part of req){n+=part.length;if(n>max)failure(413,'BODY_TOO_LARGE');parts.push(part)}
 try{return JSON.parse(Buffer.concat(parts).toString('utf8'))}catch{failure(400,'INVALID_JSON')}
}
export function createPortalSyncServer(deps,bundle){
 return createServer(async(req,res)=>{
  res.setHeader('Cache-Control','no-store')
  res.setHeader('X-Content-Type-Options','nosniff')
  res.setHeader('Content-Security-Policy',"default-src 'none'; script-src 'self'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'")
  const send=(status,data)=>{res.writeHead(status,{'Content-Type':'application/json'});res.end(JSON.stringify(data))}
  try{
   if(req.headers.host!=='127.0.0.1:4585'||(req.headers.origin!==undefined&&req.headers.origin!==syncOrigin))failure(403,'SYNC_ORIGIN_DENIED')
   if(req.method==='GET'&&req.url==='/'){res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});return res.end('<!doctype html><meta charset="utf-8"><title>QC Sync Lab</title><div id="root"></div><script type="module" src="/lab.js"></script>')}
   if(req.method==='GET'&&req.url==='/lab.js'){res.writeHead(200,{'Content-Type':'text/javascript; charset=utf-8'});return res.end(bundle)}
   if(req.url!==syncPath)failure(404,'SYNC_ROUTE_DENIED')
   if(req.method!=='POST')failure(405,'METHOD_DENIED')
   const match=/^Bearer ([^\s]+)$/.exec(req.headers.authorization??'')
   if(!match)failure(401,'AUTH_REQUIRED')
   let token;try{token=await deps.verifyToken(match[1])}catch{failure(401,'INVALID_TOKEN')}
   if(token?.qcUat!==true||typeof token.uid!=='string'||!/^uat-[a-z0-9-]{1,60}$/.test(token.uid))failure(403,'UAT_IDENTITY_DENIED')
   const body=await parse(req)
   if(!exact(body,['job']))failure(400,'INVALID_SYNC_REQUEST')
   let job;try{job=await prepareStrictJob(body.job)}catch{failure(400,'INVALID_STRICT_JOB')}
   if(body.job.payloadFingerprint!==job.payloadFingerprint)failure(400,'FINGERPRINT_REQUIRED')
   if(job.uploaderUid!==token.uid)failure(403,'OWNER_REQUIRED')
   const {marker,productionProfile,record,catalog}=await deps.snapshot(token.uid,job.record.id)
   if(!actorAllowed(token.uid,token.qcUat,marker,productionProfile,catalog))failure(403,'UAT_IDENTITY_DENIED')
   if(!editAllowed(token.uid,marker,job.record))failure(403,'FORM_EDIT_REQUIRED')
   if(record&&(!editAllowed(token.uid,marker,record)||record.formType!==job.record.formType))failure(403,'OWNER_REQUIRED')
   // Allow replay only through the strict trusted verifier, never by ID alone.
   const result=await deps.sync(token.uid,match[1],job)
   if(result?.status!=='confirmed')failure(409,'QC_COMMIT_UNCONFIRMED')
   assertConfirmation(result.record,job,job.payloadFingerprint)
   // A late revocation must not acknowledge the queue; an already committed revision remains durable.
   const latest=await deps.snapshot(token.uid,job.record.id)
   if(!actorAllowed(token.uid,token.qcUat,latest.marker,latest.productionProfile,latest.catalog))failure(403,'UAT_IDENTITY_DENIED')
   if(!editAllowed(token.uid,latest.marker,job.record)||!editAllowed(token.uid,latest.marker,latest.record))failure(403,'FORM_EDIT_REQUIRED')
   send(200,result)
  }catch(e){
   const known=['MOCK_UPLOAD_OFFLINE','MOCK_COMMIT_OFFLINE','MOCK_ACK_LOST','QC_REVISION_CONFLICT','QC_REPLAY_PAYLOAD_CONFLICT','QC_REPLAY_FINGERPRINT_MISSING','QC_QUEUE_ACCOUNT_MISMATCH','TRUSTED_REPLAY_PAIR_MISMATCH','MOCK_PHOTO_PERMISSION_DENIED']
   const status=[400,401,403,404,405,409,413,415].includes(e?.status)?e.status:e?.code==='permission-denied'?403:known.includes(e?.message)?409:500
   const code=status===500?'SYNC_INTERNAL_ERROR':e?.code==='permission-denied'?'FORM_EDIT_REQUIRED':/^[A-Z_]+$/.test(e?.message??'')?e.message:'SYNC_FAILED'
   // Dedicated synthetic lab diagnostics: classify failures, never log request content or tokens.
   if(status===500||e?.code==='permission-denied'){
    const message=String(e?.message??'')
    const classification=/maximum.*(expression|evaluation)|expression.*(limit|1000)/i.test(message)?'RULE_EXPRESSION_LIMIT':/permission.denied/i.test(message)||e?.code==='permission-denied'?'RULE_PERMISSION_DENIED':/^[A-Z_]+$/.test(message)?message:'UNCLASSIFIED'
    console.error('UAT_SYNC_DIAGNOSTIC status='+status+' classification='+classification)
   }
   if(!res.headersSent)send(status,{error:code});else res.end()
  }
 })
}
