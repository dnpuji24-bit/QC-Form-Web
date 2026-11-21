// 11D.5c.3b.1 — trusted synthetic-photo staging candidate (no QC commit or HTTP route).
// NEVER treat its returned proof as an authorized Firestore receipt until an atomic
// QC/Actual/full-detail/photo transaction validates it in the next checkpoint.
import {createHash} from 'node:crypto'
import {isDeepStrictEqual} from 'node:util'
import {prepareOperationalPhotoManifest} from '../../src/qcOperationalPhotoManifest.mjs'
import {prepareUnifiedFullQc} from '../../src/qcUatUnifiedFullQcTransport.mjs'
import {matchesUatPhotoSignature} from '../../src/qcUatUnifiedPhotoPreflight.mjs'

const need=(ok,code)=>{if(!ok)throw Error(code)}
const exact=(o,ks)=>o&&Object.getPrototypeOf(o)===Object.prototype&&Reflect.ownKeys(o).length===ks.length&&ks.every(k=>Object.hasOwn(o,k))
const sid=v=>typeof v==='string'&&/^uat-[a-z0-9-]{1,60}$/.test(v)
const recordId=v=>typeof v==='string'&&/^qc-v2-uat-[a-z0-9-]{1,100}$/.test(v)
const hash=v=>createHash('sha256').update(v).digest('hex')
const hex=v=>typeof v==='string'&&/^[0-9a-f]{64}$/.test(v)
export const mockBucket='qc-photos-uat-mock'
const signature=(b,t)=>{
 if(t==='image/png')return b.length>=8&&[137,80,78,71,13,10,26,10].every((n,i)=>b[i]===n)
 if(t==='image/jpeg')return b.length>=4&&b[0]===255&&b[1]===216&&b[2]===255
 if(t==='image/webp')return b.length>=12&&Buffer.from(b.subarray(0,4)).toString()==='RIFF'&&Buffer.from(b.subarray(8,12)).toString()==='WEBP'
 return false
}
function stable(value){
 if(value===null||typeof value==='string'||typeof value==='number'||typeof value==='boolean')return JSON.stringify(value)
 if(Array.isArray(value))return '['+value.map(stable).join(',')+']'
 need(value&&Object.getPrototypeOf(value)===Object.prototype,'INVALID_RECEIPT_SHAPE')
 return '{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+stable(value[k])).join(',')+'}'
}
export function createMemoryPhotoObjectStore(){
 const data=new Map(),stats={puts:0,reuses:0,reads:0}
 const key=r=>{need(r?.bucket===mockBucket&&typeof r.objectPath==='string','PHOTO_MOCK_SCOPE');return r.objectPath}
 return Object.freeze({
  bucket:mockBucket,stats,
  async putImmutable(ref,bytes){
   const k=key(ref),next=Buffer.from(bytes),old=data.get(k)
   if(old){need(old.equals(next),'PHOTO_IMMUTABLE_CONFLICT');stats.reuses++;return}
   data.set(k,Buffer.from(next));stats.puts++
  },
  async read(ref){stats.reads++;const v=data.get(key(ref));return v?Buffer.from(v):null},
  inspect(){return [...data.keys()]},tamperForTest(ref,bytes){data.set(key(ref),Buffer.from(bytes))}
 })
}
export function createTrustedPhotoStage({authenticatedUid,readSource,store}){
 need(typeof authenticatedUid==='function'&&typeof readSource==='function'&&
  store?.bucket===mockBucket&&typeof store.putImmutable==='function'&&typeof store.read==='function','PHOTO_STAGE_DEPENDENCY_REQUIRED')
 return Object.freeze({
  async stage(raw,input){
   need(exact(input,['sourceRequest','request','photos']),'PHOTO_STAGE_FIELDS')
   need(exact(input.request,['record','baseRevision','jobId','uploaderUid','expectedDailyRevision','foremanId']),'PHOTO_REQUEST_FIELDS')
   const q=input.request,r=q.record,uid=await authenticatedUid(raw)
   need(sid(uid)&&uid===q.uploaderUid&&r?.ownerUid===uid&&r.inputtedBy===uid,'PHOTO_OWNER_DENIED')
   need(recordId(r.id)&&sid(r.clientRevision)&&sid(q.jobId),'PHOTO_SYNTHETIC_ONLY')
   need(['spray','fertilizer'].includes(r.formType),'PHOTO_FORM_DENIED')
   need(r.saveType==='draft'||r.saveType==='ready','PHOTO_STAGE_STATUS')
   const source=await readSource(raw,input.sourceRequest)
   const canonicalRequest=prepareUnifiedFullQc({...q,source})
   need(isDeepStrictEqual(canonicalRequest,q),'PHOTO_REQUEST_MISMATCH')
   need(Array.isArray(input.photos)&&input.photos.length>=1&&input.photos.length<=4,'PHOTO_CHANGE_COUNT')
   const holdIds=new Set(r.holdIntervals.map(h=>h.holdId))
   for(const change of input.photos){
    const fields=change?.kind==='hold'?['action','kind','holdId','dataUrl']:['action','kind','dataUrl']
    need(exact(change,fields)&&change.action==='replace','PHOTO_CHANGE_FIELDS')
    need(change.kind==='main'||change.kind==='hold'||change.kind==='scan'&&r.formType==='fertilizer','PHOTO_SLOT_DENIED')
    if(change.kind==='hold')need(holdIds.has(change.holdId),'PHOTO_HOLD_NOT_IN_FORM')
    need(typeof change.dataUrl==='string'&&change.dataUrl.length<=2800000,'PHOTO_DATA_INVALID')
    const m=/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/]+={0,2})$/.exec(change.dataUrl)
    need(m&&m[2].length%4===0,'PHOTO_DATA_INVALID')
    const bytes=Buffer.from(m[2],'base64')
    need(bytes.length>=1&&bytes.length<=2097152&&bytes.toString('base64')===m[2]&&signature(bytes,m[1])&&matchesUatPhotoSignature(bytes,m[1]),'PHOTO_BYTES_INVALID')
   }
   const {manifest,uploads}=await prepareOperationalPhotoManifest({
    recordId:r.id,uploaderUid:uid,changes:input.photos,bucket:mockBucket
   })
   need(uploads.length===input.photos.length&&uploads.reduce((s,u)=>s+u.bytes.length,0)<=6291456,'PHOTO_AGGREGATE_LIMIT')
   for(const upload of uploads){
    const ref=upload.reference
    need(ref.bucket===mockBucket&&ref.uploaderUid===uid&&ref.objectPath.startsWith(uid+'/qc/'+r.id+'/')&&
     hex(ref.sha256)&&hash(upload.bytes)===ref.sha256&&ref.size===upload.bytes.length,'PHOTO_REF_INVALID')
    await store.putImmutable(ref,upload.bytes)
    const got=await store.read(ref)
    need(got&&Buffer.from(got).length===ref.size&&hash(Buffer.from(got))===ref.sha256&&
      Buffer.from(got).equals(Buffer.from(upload.bytes)),'PHOTO_READBACK_MISMATCH')
   }
   // Recheck current actor + permission/source after all storage side-effects.
   need(await authenticatedUid(raw)===uid,'PHOTO_SESSION_REVOKED')
   const latest=await readSource(raw,input.sourceRequest)
   need(isDeepStrictEqual(source,latest),'PHOTO_SOURCE_CHANGED')
   prepareUnifiedFullQc({...q,source:latest})
   const receipt={testOnly:true,storageMode:'in-memory-mock',formType:r.formType,ownerUid:uid,
    recordId:r.id,clientRevision:r.clientRevision,jobId:q.jobId,baseRevision:q.baseRevision,
    dailyPlanId:r.dailyPlanId,expectedDailyRevision:q.expectedDailyRevision,
    bucket:mockBucket,manifest}
   return Object.freeze({...receipt,manifestSha256:hash(stable(receipt)),status:'verified-staged-only'})
  }
 })
}
