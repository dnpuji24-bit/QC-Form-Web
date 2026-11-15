// Standalone synthetic-only candidate; no live queue, Firebase or Supabase adapter is wired here.
import {operationalQueueId as queueId,processOperationalQcJob} from './qcOperationalSaveTransport.mjs'

export function need(ok,code){if(!ok)throw Error(code)}

function sid(v){need(typeof v==='string'&&/^uat-[a-z0-9-]{1,60}$/.test(v),'SYNTHETIC_ID_REQUIRED');return v}

export function canonicalJson(value){
 const active=new Set()
 function visit(v,depth){
  need(depth<=40,'PAYLOAD_TOO_DEEP')
  if(v===null||typeof v==='boolean'||typeof v==='string')return JSON.stringify(v)
  if(typeof v==='number'){need(Number.isFinite(v)&&!Object.is(v,-0),'NON_JSON_NUMBER');return JSON.stringify(v)}
  need(v&&typeof v==='object'&&!active.has(v),'NON_JSON_PAYLOAD')
  active.add(v)
  let result
  if(Array.isArray(v)){
   need(Reflect.ownKeys(v).length===v.length+1&&Array.from({length:v.length},(_,i)=>Object.hasOwn(v,i)&&Object.hasOwn(Object.getOwnPropertyDescriptor(v,i),'value')).every(Boolean),'NON_JSON_ARRAY')
   result='['+v.map(x=>visit(x,depth+1)).join(',')+']'
  }else{
   need(Object.getPrototypeOf(v)===Object.prototype,'NON_JSON_OBJECT')
   const keys=Reflect.ownKeys(v)
   need(keys.every(k=>typeof k==='string'&&!['__proto__','constructor','prototype'].includes(k)&&Object.hasOwn(Object.getOwnPropertyDescriptor(v,k),'value')),'NON_JSON_FIELD')
   result='{'+keys.sort().map(k=>JSON.stringify(k)+':'+visit(v[k],depth+1)).join(',')+'}'
  }
  active.delete(v)
  return result
 }
 return visit(value,0)
}

export function jobPayload(job){
 need(job&&Object.getPrototypeOf(job)===Object.prototype,'INVALID_JOB')
 const required=['uploaderUid','record','baseRevision','action','changes','testOnly']
 const allowed=[...required,'id','createdAt','payloadFingerprint','scope']
 need(required.every(k=>Object.hasOwn(job,k))&&Reflect.ownKeys(job).every(k=>typeof k==='string'&&allowed.includes(k)&&Object.hasOwn(Object.getOwnPropertyDescriptor(job,k),'value')),'INVALID_JOB_FIELDS')
 need(job.testOnly===true,'SYNTHETIC_ONLY')
 const uid=sid(job.uploaderUid),r=job.record
 need(r&&Object.getPrototypeOf(r)===Object.prototype&&r.testOnly===true,'SYNTHETIC_RECORD_REQUIRED')
 need(Object.hasOwn(r,'id')&&Object.hasOwn(r,'ownerUid')&&Object.hasOwn(r,'clientRevision')&&Object.hasOwn(r,'saveType'),'INVALID_RECORD')
 const id=queueId(uid,sid(r.id),sid(r.clientRevision))
 need(r.ownerUid===uid,'QC_OWNER_MISMATCH')
 need(['draft','ready','uploaded'].includes(r.saveType),'INVALID_STATUS')
 need(!Object.hasOwn(r,'operationalPayloadFingerprint'),'RESERVED_FINGERPRINT_FIELD')
 need(job.baseRevision===null||sid(job.baseRevision),'INVALID_BASE_REVISION')
 need(job.baseRevision!==r.clientRevision,'SAME_BASE_AND_REVISION')
 need(['syncRecord','finalizeRecord'].includes(job.action)&&Array.isArray(job.changes),'INVALID_JOB_ACTION')
 need(!Object.hasOwn(job,'id')||job.id===id,'QUEUE_ID_MISMATCH')
 need(!Object.hasOwn(job,'scope')||job.scope==='uat-strict','INVALID_SCOPE')
 const payload={testOnly:true,scope:'uat-strict',uploaderUid:uid,record:r,baseRevision:job.baseRevision,action:job.action,changes:job.changes}
 const canonical=canonicalJson(payload)
 need(canonical.length<=24000000,'PAYLOAD_TOO_LARGE')
 return {id,payload,canonical}
}

export function assertSameQueuedPayload(a,b){const x=jobPayload(a),y=jobPayload(b);need(x.id===y.id&&x.canonical===y.canonical,'QC_QUEUE_PAYLOAD_CONFLICT');return true}

export function assertConfirmation(current,job,fingerprint){
 need(current&&current.id===job.record.id&&current.ownerUid===job.uploaderUid&&current.clientRevision===job.record.clientRevision&&current.operationalSaveId===job.id&&current.firestoreSaveState==='confirmed','QC_COMMIT_UNCONFIRMED')
 need(typeof current.operationalPayloadFingerprint==='string','QC_REPLAY_FINGERPRINT_MISSING')
 need(current.operationalPayloadFingerprint===fingerprint,'QC_REPLAY_PAYLOAD_CONFLICT')
 need(current.saveType===(job.action==='finalizeRecord'?'uploaded':job.record.saveType),'QC_REPLAY_STATUS_CONFLICT')
 return current
}

export async function prepareStrictJob(job){
 const {id,payload,canonical}=jobPayload(job)
 const bytes=new TextEncoder().encode(canonical)
 const hex=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('')
 const payloadFingerprint='sha256-v1:'+hex
 need(!Object.hasOwn(job,'payloadFingerprint')||job.payloadFingerprint===payloadFingerprint,'QC_QUEUE_FINGERPRINT_MISMATCH')
 return {...JSON.parse(canonical),id,payloadFingerprint}
}

// The injected enqueue must atomically keep the first row for a queue identity.
// A legacy pending row can be compared from its actual bytes, not from metadata.
export async function enqueueStrictSyntheticJob(job,enqueue){
 const next=await prepareStrictJob(job)
 const stored=await enqueue(next)
 assertSameQueuedPayload(next,stored)
 const checked=await prepareStrictJob(stored)
 need(checked.payloadFingerprint===next.payloadFingerprint,'QC_QUEUE_PAYLOAD_CONFLICT')
 return stored
}

// The trusted commit adapter MUST bind the fingerprint to the actual payload
// and persist it atomically with QC/Actual/audit; this wrapper is not a security boundary.
export async function processStrictSyntheticJob(job,deps){
 const next=await prepareStrictJob(job),fp=next.payloadFingerprint
 const assertUid=async()=>need(await deps.currentUid()===next.uploaderUid,'QC_QUEUE_ACCOUNT_MISMATCH')
 await assertUid()
 const result=await processOperationalQcJob(next,{
  ...deps,
  readRecord:async(id,j)=>{
   const current=await deps.readRecord(id,j)
   await assertUid()
   if(current&&(current.clientRevision===next.record.clientRevision||current.operationalSaveId===next.id))assertConfirmation(current,next,fp)
   return current
  },
  commitRecord:async input=>{
   await assertUid()
   const committed=await deps.commitRecord({...input,record:{...input.record,operationalPayloadFingerprint:fp}})
   await assertUid()
   return assertConfirmation(committed,next,fp)
  }
 })
 await assertUid()
 assertConfirmation(result.record,next,fp)
 return result
}
