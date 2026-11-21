// 11D.5c.3b.2e.1: browser-only, lossless photo-inclusive QC envelope.
// No Storage SDK, no secret, and no network calls. The server must revalidate
// the entire full DTO, fresh Planning source, identity, photo bytes and SHA256.
import {qcSourceRequest} from './qcUatPlanningQcSource.mjs'
import {uatPhotoSlot} from './qcUatUnifiedPhotoPreflight.mjs'

const need=(ok,code)=>{if(!ok)throw Error(code)}
const exact=(v,ks)=>v&&Object.getPrototypeOf(v)===Object.prototype&&Reflect.ownKeys(v).length===ks.length&&ks.every(k=>Object.hasOwn(v,k))
const types=['image/jpeg','image/png','image/webp']
const maxOne=2097152,maxSum=6291456

export function buildUnifiedPhotoCommitEnvelope(request,stagedPhotos){
 need(exact(request,['record','baseRevision','jobId','uploaderUid','expectedDailyRevision','foremanId']),
  'PHOTO_FULL_REQUEST_INVALID')
 const r=request.record
 need(r?.testOnly===true&&['spray','fertilizer'].includes(r.formType)&&
  typeof r.id==='string'&&/^qc-v2-uat-[a-z0-9-]{1,60}$/.test(r.id)&&
  r.ownerUid===request.uploaderUid&&r.inputtedBy===request.uploaderUid&&
  r.saveType!=='uploaded'&&['draft','ready'].includes(r.saveType)&&
  Array.isArray(r.holdIntervals),'PHOTO_FULL_REQUEST_INVALID')
 need(Array.isArray(stagedPhotos)&&stagedPhotos.length>=1&&stagedPhotos.length<=4,
  'PHOTO_STAGE_COUNT_INVALID')
 const sourceRequest=qcSourceRequest({
  dailyPlanId:r.dailyPlanId,expectedDailyRevision:request.expectedDailyRevision,
  formType:r.formType,date:r.date,shift:r.shift,foreman:request.foremanId
 })
 const slots=new Set(),holds=new Set(r.holdIntervals.map(h=>h.holdId)),photos=[]
 let totalBytes=0
 for(const p of stagedPhotos){
  need(p&&typeof p==='object'&&!Array.isArray(p)&&
   typeof p.dataUrl==='string'&&typeof p.sha256==='string'&&/^[0-9a-f]{64}$/.test(p.sha256)&&
   Number.isSafeInteger(p.size)&&p.size>0&&p.size<=maxOne&&types.includes(p.contentType),
   'PHOTO_STAGE_INVALID')
  const kind=p.kind,holdId=kind==='hold'?p.holdId:''
  const slot=uatPhotoSlot(r.formType,kind,holdId)
  need(!slots.has(slot)&&p.slot===slot&&(kind!=='hold'||holds.has(holdId)),
   'PHOTO_STAGE_SLOT_INVALID')
  slots.add(slot)
  const head='data:'+p.contentType+';base64,'
  need(p.dataUrl.startsWith(head)&&p.dataUrl.length<=2800000&&
   /^[A-Za-z0-9+/]+={0,2}$/.test(p.dataUrl.slice(head.length))&&
   p.dataUrl.slice(head.length).length%4===0,
   'PHOTO_STAGE_DATA_INVALID')
  // Validate declared decoded length without duplicating the 2MiB allocation.
  const encoded=p.dataUrl.slice(head.length)
  const pad=encoded.endsWith('==')?2:encoded.endsWith('=')?1:0
  const bytes=encoded.length/4*3-pad
  need(bytes===p.size,'PHOTO_STAGE_SIZE_INVALID')
  totalBytes+=bytes
  need(totalBytes<=maxSum,'PHOTO_STAGE_TOTAL_LIMIT')
  photos.push(Object.freeze({action:'replace',kind,dataUrl:p.dataUrl,
   ...(kind==='hold'?{holdId}:{})}))
 }
 return Object.freeze({sourceRequest,request,photos:Object.freeze(photos)})
}
