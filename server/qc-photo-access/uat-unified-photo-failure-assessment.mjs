// 11D.5c.3b.2f.2 — read-only synthetic UAT photo failure diagnosis.
// This is NOT a deletion authorization. After a failed/aborted process, the
// in-memory upload tracker may be incomplete; a fresh Storage inspection is
// required before any operator considers reconciliation/removal.
// No Supabase API calls, secrets, arbitrary folder listings, or writes here.
import {createHash} from 'node:crypto'
import {photoLedgerEqual} from '../../src/qcUatVerifiedPhotoLedger.mjs'
import {unifiedPhotoBucket,unifiedPhotoPath} from './uat-unified-private-photo-store.mjs'

const need=(ok,code)=>{if(!ok)throw Error(code)}
const plain=v=>v!==null&&typeof v==='object'&&Object.getPrototypeOf(v)===Object.prototype
const hash=v=>createHash('sha256').update(v).digest('hex')
const hex=v=>typeof v==='string'&&/^[a-f0-9]{32}$/.test(v)
const actor=v=>typeof v==='string'&&/^uat-[a-z0-9-]{1,60}$/.test(v)
const uniq=(a,max)=>{
 need(Array.isArray(a)&&a.length<=max&&a.every(x=>typeof x==='string'&&x.length<=230),
  'PHOTO_RECOVERY_INPUT_INVALID')
 return new Set(a)
}
function ledgerPaths(row,runId,actorUid){
 const {id,ledger,audit}=row??{}
 need(typeof id==='string'&&id.startsWith('uat-'+runId+'-')&&
  plain(ledger)&&plain(audit)&&photoLedgerEqual(ledger,audit)&&
  ledger.testOnly===true&&ledger.recordId===id&&
  ledger.fullRecordId==='qc-v2-'+id&&ledger.ownerUid===actorUid&&
  ledger.bucket===unifiedPhotoBucket&&ledger.storageMode==='supabase-private-uat'&&
  ['spray','fertilizer'].includes(ledger.formType)&&
  /^uat-[a-z0-9-]{1,60}$/.test(ledger.clientRevision)&&
  plain(ledger.manifest),'PHOTO_RECOVERY_AUDIT_CONFLICT')
 const slots=Object.entries(ledger.manifest)
 need(slots.length>=1&&slots.length<=4,'PHOTO_RECOVERY_AUDIT_CONFLICT')
 return slots.map(([slot,ref])=>{
  const kind=slot.startsWith('hold_')?'hold':slot
  need(plain(ref)&&ref.kind===kind&&
   (kind==='main'||kind==='scan'&&ledger.formType==='fertilizer'||kind==='hold'&&slot==='hold_'+ref.holdId)&&
   typeof ref.photoId==='string'&&ref.photoId.startsWith(hash(slot).slice(0,24)+'_'),
   'PHOTO_RECOVERY_AUDIT_CONFLICT')
  try{return unifiedPhotoPath(runId,actorUid,ref)}
  catch{throw Error('PHOTO_RECOVERY_AUDIT_CONFLICT')}
 })
}

export function assessFailedPhotoRun({runId,actorUid,touched,owned,ledgerPairs}){
 need(hex(runId)&&actor(actorUid)&&Array.isArray(ledgerPairs)&&ledgerPairs.length<=50,
  'PHOTO_RECOVERY_SCOPE_INVALID')
 const t=uniq(touched,200),o=uniq(owned,200)
 const pathRegex=new RegExp('^'+actorUid+'/qc/qc-v2-uat-'+runId+
  '-[a-z0-9]{1,16}/[a-f0-9]{24}_[a-f0-9]{64}\\.(?:png|jpg|webp)$')
 const valid=p=>pathRegex.test(p)
 const scopeConflictCount=[...new Set([...t,...o])].filter(p=>!valid(p)).length
 const acknowledged=new Set([...o].filter(valid))
 const seen=new Set([...t].filter(valid))
 const audited=new Set()
 let auditConflictCount=0
 for(const pair of ledgerPairs){
  try{
   for(const p of ledgerPaths(pair,runId,actorUid))audited.add(p)
  }catch{auditConflictCount++}
 }
 const unacknowledgedCount=[...seen].filter(p=>!acknowledged.has(p)).length
 const untrackedAcknowledgedCount=[...acknowledged].filter(p=>!seen.has(p)).length
 const stagedUncommittedCount=[...acknowledged].filter(p=>!audited.has(p)).length
 const referenceNotAcknowledgedCount=[...audited].filter(p=>!acknowledged.has(p)).length
 const noEvidence=t.size===0&&o.size===0&&ledgerPairs.length===0
 const status=auditConflictCount?'AUDIT_CONFLICT':
  scopeConflictCount?'SCOPE_CONFLICT':
  unacknowledgedCount||untrackedAcknowledgedCount?'AMBIGUOUS_UPLOAD':
  stagedUncommittedCount?'STAGED_UNCOMMITTED':
  referenceNotAcknowledgedCount?'COMMITTED_REFERENCE_NOT_ACKNOWLEDGED':
  noEvidence?'NO_PROCESS_EVIDENCE':'REFERENCES_MATCH_PROCESS_SNAPSHOT'
 // Deliberately return counts, never object paths, signed URLs or file names.
 return Object.freeze({status,scope:'CURRENT_PROCESS_AND_DEMO_EMULATOR_ONLY',
  touchedCount:t.size,acknowledgedCount:o.size,auditedReferenceCount:audited.size,
  unacknowledgedCount,untrackedAcknowledgedCount,stagedUncommittedCount,
  referenceNotAcknowledgedCount,auditConflictCount,scopeConflictCount,
  requiresManualReconciliation:true,automatedDeletionAllowed:false})
}
