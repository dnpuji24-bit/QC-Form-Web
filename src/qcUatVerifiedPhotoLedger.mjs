// 11D.5c.3b.2b — immutable photo ledger binding for unified UAT full Spray/Fertilizer.
// Never accepts arbitrary photo paths, unsigned URL, bytes or a browser-chosen receipt.
// The only caller must supply a fresh server-side createTrustedPhotoStage() result.
import {createHash} from 'node:crypto'
const need=(v,c)=>{if(!v)throw Error(c)}
const plain=o=>o&&Object.getPrototypeOf(o)===Object.prototype
const exact=(o,keys)=>plain(o)&&Reflect.ownKeys(o).length===keys.length&&keys.every(k=>Object.hasOwn(o,k))
const sid=v=>typeof v==='string'&&/^uat-[a-z0-9-]{1,60}$/.test(v)
const hash=v=>createHash('sha256').update(v).digest('hex')
const hex=v=>typeof v==='string'&&/^[0-9a-f]{64}$/.test(v)
const ext=Object.freeze({'image/jpeg':'jpg','image/png':'png','image/webp':'webp'})
export function stablePhotoLedger(value){
 if(value===null||typeof value==='string'||typeof value==='boolean')return JSON.stringify(value)
 if(typeof value==='number'){need(Number.isFinite(value),'PHOTO_LEDGER_VALUE_INVALID');return JSON.stringify(value)}
 if(Array.isArray(value))return '['+value.map(stablePhotoLedger).join(',')+']'
 need(plain(value),'PHOTO_LEDGER_VALUE_INVALID')
 return '{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+stablePhotoLedger(value[k])).join(',')+'}'
}
export const photoLedgerEqual=(a,b)=>stablePhotoLedger(a)===stablePhotoLedger(b)
export function verifiedPhotoLedger(request,proof,expectedBucket,expectedMode){
 need(exact(request,['record','baseRevision','jobId','uploaderUid','expectedDailyRevision','foremanId']),
  'PHOTO_LEDGER_REQUEST_INVALID')
 const r=request.record
 const keys=['testOnly','storageMode','formType','ownerUid','recordId','clientRevision','jobId','baseRevision','dailyPlanId','expectedDailyRevision','bucket','manifest','manifestSha256','status']
 need(exact(proof,keys)&&proof.testOnly===true&&proof.status==='verified-staged-only'&&
  proof.storageMode===expectedMode&&proof.bucket===expectedBucket&&
  ['in-memory-mock','supabase-private-uat'].includes(expectedMode),'PHOTO_PROOF_UNTRUSTED')
 need(r&&typeof r.id==='string'&&/^qc-v2-uat-[a-z0-9-]{1,60}$/.test(r.id)&&
  proof.recordId===r.id&&proof.ownerUid===request.uploaderUid&&
  proof.clientRevision===r.clientRevision&&proof.jobId===request.jobId&&
  proof.baseRevision===request.baseRevision&&
  proof.dailyPlanId===r.dailyPlanId&&
  proof.expectedDailyRevision===request.expectedDailyRevision&&
  proof.formType===r.formType&&
  ['spray','fertilizer'].includes(r.formType)&&
  sid(r.ownerUid)&&r.ownerUid===request.uploaderUid&&r.inputtedBy===r.ownerUid,
  'PHOTO_PROOF_REQUEST_MISMATCH')
 need(hex(proof.manifestSha256),'PHOTO_PROOF_DIGEST_INVALID')
 const {status,manifestSha256,...base}=proof
 need(hash(stablePhotoLedger(base))===proof.manifestSha256,'PHOTO_PROOF_DIGEST_INVALID')
 const manifest=proof.manifest,slots=Object.keys(manifest??{})
 need(plain(manifest)&&slots.length>=1&&slots.length<=4,'PHOTO_LEDGER_SLOTS_INVALID')
 const holdIds=new Set(Array.isArray(r.holdIntervals)?r.holdIntervals.map(x=>x.holdId):[])
 const entries={}
 for(const slot of slots){
  const entry=manifest[slot],hasHold=slot.startsWith('hold_')
  const k=hasHold?'hold':slot
  const names=['photoId','provider','bucket','objectPath','uploaderUid','kind','contentType','sha256','size',...(hasHold?['holdId']:[])]
  need(exact(entry,names)&&['main','hold','scan'].includes(k)&&entry.kind===k&&
   (k!=='scan'||r.formType==='fertilizer')&&(!hasHold||slot==='hold_'+entry.holdId&&holdIds.has(entry.holdId)),
   'PHOTO_LEDGER_SLOT_MISMATCH')
  need(entry.provider==='supabase'&&entry.bucket===expectedBucket&&entry.uploaderUid===r.ownerUid&&
   hex(entry.sha256)&&typeof entry.photoId==='string'&&
   /^[0-9a-f]{24}_[0-9a-f]{64}$/.test(entry.photoId)&&
   entry.photoId.endsWith('_'+entry.sha256)&&
   entry.photoId.startsWith(hash(slot).slice(0,24)+'_')&&
   Number.isSafeInteger(entry.size)&&entry.size>0&&entry.size<=2097152&&
   Object.hasOwn(ext,entry.contentType)&&
   entry.objectPath===r.ownerUid+'/qc/'+r.id+'/'+entry.photoId+'.'+ext[entry.contentType],
   'PHOTO_LEDGER_REFERENCE_INVALID')
  entries[slot]=entry
 }
 // The full record remains exactly photo-free; only the separately verified manifest carries refs.
 const canonicalId=r.id.slice('qc-v2-'.length)
 const ledger={testOnly:true,recordId:canonicalId,fullRecordId:r.id,ownerUid:r.ownerUid,
  formType:r.formType,clientRevision:r.clientRevision,jobId:request.jobId,
  baseRevision:request.baseRevision,dailyPlanId:r.dailyPlanId,expectedDailyRevision:request.expectedDailyRevision,
  bucket:proof.bucket,storageMode:proof.storageMode,manifestSha256:proof.manifestSha256,manifest:entries}
 return Object.freeze(ledger)
}
export function verifyPhotoLedgerPair(current,audit,ledger){
 need(current&&audit&&photoLedgerEqual(current,ledger)&&photoLedgerEqual(audit,ledger),
  'PHOTO_LEDGER_PAIR_MISMATCH')
 return current
}
