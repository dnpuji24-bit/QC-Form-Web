// Local HTTP service candidate. Injected trusted backend only, never imported by the live portal.
import {createServer} from 'node:http'
import {createHash} from 'node:crypto'
import {endpointOrigin,endpointPaths} from '../../src/qcUatEndpointRouting.mjs'
import {prepareStrictJob} from '../../src/qcUatStrictQueueContract.mjs'
import {prepareOperationalPhotoManifest} from '../../src/qcOperationalPhotoManifest.mjs'
const roles=["owner","asisten","manager","admin","mandor_spraying","mandor_fertilizer","pengunjung"]
function fail(status,code){throw Object.assign(Error(code),{status})}

function sid(v){return typeof v==='string'&&/^uat-[a-z0-9-]{1,60}$/.test(v)}

function formKey(f){return f==='spray'?'qc_spraying':f==='fertilizer'?'qc_fertilizer':null}

export function actorAllowed(uid,claim,m,profile){
 return sid(uid)&&claim===true&&profile===false&&m?.testOnly===true&&m.workspace==='cutover'&&m.enabled===true&&roles.includes(m.role)&&m.permissions&&Object.getPrototypeOf(m.permissions)===Object.prototype
}

export function editAllowed(uid,m,q){const key=formKey(q?.formType);return !!key&&q.testOnly===true&&sid(q.id)&&q.ownerUid===uid&&m.permissions[key]==='edit'}

export function readAllowed(uid,m,q){return !!q&&q.testOnly===true&&sid(q.id)&&sid(q.ownerUid)&&!!formKey(q.formType)&&(editAllowed(uid,m,q)||(['view','edit'].includes(m.permissions.qc_records)&&(q.ownerUid===uid||['owner','asisten','manager','admin','pengunjung'].includes(m.role))))}

export function exact(v,keys){return !!v&&Object.getPrototypeOf(v)===Object.prototype&&Object.keys(v).length===keys.length&&keys.every(k=>Object.hasOwn(v,k))}

export function slotAllowed(s){return ['main','scan','hold_uat-h1'].includes(s)}

const bucket='qc-photos-uat-mock'
const sha=bytes=>createHash('sha256').update(bytes).digest('hex')
const maxBody=10*1024*1024
async function bodyJson(req){
 if(req.headers['content-type']!=='application/json')fail(415,'JSON_REQUIRED')
 const size=Number(req.headers['content-length']??0)
 if(!Number.isFinite(size)||size<0||size>maxBody)fail(413,'BODY_TOO_LARGE')
 let count=0;const parts=[]
 for await(const chunk of req){count+=chunk.length;if(count>maxBody){fail(413,'BODY_TOO_LARGE')}parts.push(chunk)}
 try{return JSON.parse(Buffer.concat(parts).toString('utf8'))}catch{fail(400,'INVALID_JSON')}
}
function checkReferenceScope(r,q,slot){
 const ext={'image/jpeg':'jpg','image/png':'png','image/webp':'webp'}[r?.contentType]
 if(!r||!ext||!slotAllowed(slot)||!sid(q.id)||!sid(q.ownerUid)||r.provider!=='supabase'||r.bucket!==bucket||r.uploaderUid!==q.ownerUid||typeof r.sha256!=='string'||!/^[a-f0-9]{64}$/.test(r.sha256)||!Number.isSafeInteger(r.size)||r.size<=0||r.size>2097152)fail(409,'PHOTO_REFERENCE_INVALID')
 const photoId=sha(slot).slice(0,24)+'_'+r.sha256
 if(r.photoId!==photoId||r.objectPath!==q.ownerUid+'/qc/'+q.id+'/'+photoId+'.'+ext||r.kind!==(slot==='hold_uat-h1'?'hold':slot)||(r.kind==='hold'?r.holdId!=='uat-h1':r.holdId!==undefined))fail(409,'PHOTO_REFERENCE_INVALID')
}
function checkReference(r,q,slot,bytes){
 checkReferenceScope(r,q,slot)
 if(r.sha256!==sha(bytes)||r.size!==bytes.length)fail(409,'PHOTO_REFERENCE_INVALID')
}
export function createUatEndpointServer(deps){
 return createServer(async(req,res)=>{
  res.setHeader('Cache-Control','no-store');res.setHeader('Content-Type','application/json');res.setHeader('X-Content-Type-Options','nosniff')
  const send=(status,data)=>{res.writeHead(status);res.end(JSON.stringify(data))}
  try{
   if(req.headers.host!=='127.0.0.1:4485'||(req.headers.origin!==undefined&&req.headers.origin!==endpointOrigin))fail(403,'UAT_ORIGIN_DENIED')
   if(!Object.values(endpointPaths).includes(req.url))fail(404,'UAT_ROUTE_DENIED')
   if(req.method!=='POST')fail(405,'METHOD_DENIED')
   const match=/^Bearer ([^\s]+)$/.exec(req.headers.authorization??'')
   if(!match)fail(401,'AUTH_REQUIRED')
   let token;try{token=await deps.verifyToken(match[1])}catch{fail(401,'INVALID_TOKEN')}
   if(!sid(token?.uid)||token.qcUat!==true)fail(403,'UAT_IDENTITY_DENIED')
   const body=await bodyJson(req)
   const upload=req.url===endpointPaths.upload
   let job,id,slot
   if(upload){
    if(!exact(body,['job']))fail(400,'INVALID_UPLOAD_REQUEST')
    try{job=await prepareStrictJob(body.job)}catch{fail(400,'INVALID_STRICT_JOB')}
    if(body.job.payloadFingerprint!==job.payloadFingerprint)fail(400,'FINGERPRINT_REQUIRED')
    if(job.uploaderUid!==token.uid)fail(403,'OWNER_REQUIRED')
    id=job.record.id
   }else{
    if(!exact(body,['recordId','slot'])||!sid(body.recordId)||!slotAllowed(body.slot))fail(400,'INVALID_SIGN_REQUEST')
    id=body.recordId;slot=body.slot
   }
   // Trusted adapter must read current marker, production-profile absence and
   // current record in one consistent snapshot, never use client role/claims alone.
   const {marker,productionProfile,record}=await deps.snapshot(token.uid,id)
   if(!actorAllowed(token.uid,token.qcUat,marker,productionProfile))fail(403,'UAT_IDENTITY_DENIED')
   if(upload){
    const q=job.record
    if(!editAllowed(token.uid,marker,q))fail(403,'FORM_EDIT_REQUIRED')
    if(record&&(!editAllowed(token.uid,marker,record)||record.formType!==q.formType))fail(403,'OWNER_REQUIRED')
    if((record?.clientRevision??null)!==job.baseRevision)fail(409,'STALE_BASE')
    if(job.changes.length>3||job.changes.some(c=>!c||!slotAllowed(c.kind==='hold'?'hold_'+c.holdId:c.kind)))fail(400,'INVALID_SLOT')
    let prepared;try{prepared=await prepareOperationalPhotoManifest({recordId:id,uploaderUid:token.uid,previous:record?.operationalPhotoManifest??{},changes:job.changes,bucket})}catch{fail(400,'INVALID_PHOTO_CHANGE')}
    for(const u of prepared.uploads)checkReference(u.reference,q,u.slot,u.bytes)
    // This is upload staging, not a QC commit or a trusted receipt. Immutable
    // storage adapter must enforce no overwrite; final commit revalidates all.
    for(const u of prepared.uploads)await deps.putImmutable(u.reference,u.bytes)
    return send(200,{payloadFingerprint:job.payloadFingerprint,manifest:prepared.manifest})
   }
   if(!readAllowed(token.uid,marker,record))fail(403,'QC_READ_REQUIRED')
   if(record.firestoreSaveState!=='confirmed'||record.saveType!=='uploaded')fail(409,'QC_NOT_CONFIRMED')
   const reference=record.operationalPhotoManifest?.[slot]
   if(!reference)fail(404,'PHOTO_SLOT_MISSING')
   checkReferenceScope(reference,record,slot)
   const bytes=await deps.readObject(reference)
   if(!(bytes instanceof Uint8Array))fail(409,'PHOTO_BYTES_MISSING')
   checkReference(reference,record,slot,bytes)
   // Mock opaque ticket only. Real signer integration is a separate gate.
   const ticket=await deps.issueTicket(reference,30)
   if(typeof ticket!=='string'||!/^mock-[a-f0-9]{32}$/.test(ticket))fail(500,'SIGNER_RESPONSE_INVALID')
   return send(200,{ticket,expiresIn:30})
  }catch(e){
   const status=[400,401,403,404,405,409,413,415].includes(e?.status)?e.status:500
   const code=status!==500&&/^[A-Z_]+$/.test(e.message)?e.message:'UAT_INTERNAL_ERROR'
   if(!res.headersSent)send(status,{error:code});else res.end()
  }
 })
}
