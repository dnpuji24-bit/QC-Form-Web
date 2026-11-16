// Dedicated full DTO photo candidate. Storage is an injected immutable mock only.
import {createHash} from 'node:crypto'
import {validateSprayDto} from '../../src/qcUatSprayFullDto.mjs'
import {prepareOperationalPhotoManifest,stripOperationalPhotoPayload} from '../../src/qcOperationalPhotoManifest.mjs'
import {roles} from '../../src/qcUatRolePermissions.mjs'
export const demoProject='demo-qc-uat-spray-photo'
export const demoHost='127.0.0.1'
export const firestorePort=9185,authPort=9999
function need(v,code){if(!v)throw Error(code)}
export function guardSprayPhoto(e=process.env){
 need(e.GCLOUD_PROJECT===demoProject,'DEMO_PROJECT_REQUIRED')
 need(e.FIRESTORE_EMULATOR_HOST===demoHost+':'+firestorePort,'FIRESTORE_LOOPBACK_REQUIRED')
 need(e.FIREBASE_AUTH_EMULATOR_HOST===demoHost+':'+authPort,'AUTH_LOOPBACK_REQUIRED')
 for(const k of ['GOOGLE_CLOUD_PROJECT','FIREBASE_PROJECT_ID'])if(e[k])need(e[k]===demoProject,'WRONG_PROJECT')
}
const sid=v=>typeof v==='string'&&/^uat-[a-z0-9-]{1,60}$/.test(v)
const qid=v=>typeof v==='string'&&/^qc-v2-uat-[a-z0-9-]{1,100}$/.test(v)
const plain=v=>v&&Object.getPrototypeOf(v)===Object.prototype
function canonical(v){
 if(v===null||typeof v==='string'||typeof v==='boolean')return JSON.stringify(v)
 if(typeof v==='number'){need(Number.isFinite(v),'INVALID_NUMBER');return JSON.stringify(v)}
 if(Array.isArray(v))return '['+v.map(canonical).join(',')+']'
 need(plain(v),'INVALID_CANONICAL_VALUE')
 return '{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+canonical(v[k])).join(',')+'}'
}
const digest=v=>createHash('sha256').update(v).digest('hex')
export function sprayPhotoFingerprint(record,baseRevision,changes=[]){
 return 'sha256-v1:'+digest(canonical({record,baseRevision,changes}))
}
const equal=(a,b)=>canonical(a)===canonical(b)
const workspace='qc_uat_workspaces/cutover'
const mockBucket='qc-photos-uat-mock'
export const realBucket='qc-photos-uat'
const exts={'image/png':'png','image/jpeg':'jpg','image/webp':'webp'}
const holdId=v=>typeof v==='string'&&/^[A-Za-z0-9_-]{1,160}$/.test(v)
function scope(ref,slot,r,bucket){
 const ext=exts[ref?.contentType],kind=slot==='main'?'main':'hold',id=slot.slice(5)
 need(plain(ref)&&ext&&ref.provider==='supabase'&&ref.bucket===bucket&&ref.uploaderUid===r.ownerUid&&ref.kind===kind&&(kind==='main'?ref.holdId===undefined:holdId(id)&&ref.holdId===id&&r.holdIntervals.some(h=>h.holdId===id)),'PHOTO_SCOPE_INVALID')
 need(typeof ref.sha256==='string'&&/^[a-f0-9]{64}$/.test(ref.sha256)&&Number.isSafeInteger(ref.size)&&ref.size>0&&ref.size<=2097152,'PHOTO_SCOPE_INVALID')
 const photoId=digest(slot).slice(0,24)+'_'+ref.sha256
 need(ref.photoId===photoId&&ref.objectPath===r.ownerUid+'/qc/'+r.id+'/'+photoId+'.'+ext,'PHOTO_SCOPE_INVALID')
}
function checkManifest(manifest,r,bucket){
 need(plain(manifest)&&Object.keys(manifest).length<=21,'PHOTO_MANIFEST_INVALID')
 for(const [slot,ref] of Object.entries(manifest)){need(slot==='main'||slot.startsWith('hold_'),'PHOTO_SLOT_INVALID');scope(ref,slot,r,bucket)}
}
function validateChanges(r,changes){
 need(r.photoDriveUrl===''&&r.holdIntervals.every(h=>h.photoDriveUrl===''),'LEGACY_PHOTO_NOT_ENABLED')
 need(Array.isArray(changes)&&changes.length<=21,'PHOTO_CHANGES_INVALID')
 const slots=new Set(),inline=new Map([['main',r.photoBase64],...r.holdIntervals.map(h=>['hold_'+h.holdId,h.photoBase64])])
 let size=0
 for(const c of changes){
  need(plain(c)&&['main','hold'].includes(c.kind)&&['replace','remove'].includes(c.action),'PHOTO_CHANGE_INVALID')
  const keys=['action','kind',...(c.kind==='hold'?['holdId']:[]),...(c.action==='replace'?['dataUrl']:[])].sort()
  need(Object.keys(c).sort().join(',')===keys.join(','),'PHOTO_CHANGE_INVALID')
  need(c.kind==='main'||holdId(c.holdId),'PHOTO_SLOT_INVALID')
  const slot=c.kind==='main'?'main':'hold_'+c.holdId
  need(!slots.has(slot),'PHOTO_SLOT_DUPLICATE');slots.add(slot)
  if(c.action==='replace'){
   need(inline.has(slot)&&typeof c.dataUrl==='string'&&c.dataUrl===inline.get(slot),'PHOTO_INTENT_MISMATCH')
   size+=c.dataUrl.length
   need(size<=8500000,'PHOTO_TOTAL_TOO_LARGE')
   const match=/^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/]+={0,2})$/.exec(c.dataUrl)
   need(match,'PHOTO_FORMAT_INVALID')
   const bytes=Buffer.from(match[2],'base64')
   need(bytes.toString('base64')===match[2]&&bytes.length>0&&bytes.length<=2097152,'PHOTO_FORMAT_INVALID')
   // Header sanity only, not a full image decoder.
   const valid=match[1]==='image/png'?bytes.subarray(0,8).equals(Buffer.from('89504e470d0a1a0a','hex')):match[1]==='image/jpeg'?bytes.subarray(0,3).equals(Buffer.from('ffd8ff','hex')):bytes.subarray(0,4).toString()==='RIFF'&&bytes.subarray(8,12).toString()==='WEBP'
   need(valid,'PHOTO_FORMAT_INVALID')
  }else need(!inline.get(slot),'PHOTO_INTENT_MISMATCH')
 }
 for(const [slot,value] of inline)if(value)need(slots.has(slot),'PHOTO_INTENT_MISMATCH')
}
export function guardRealPhotoRun(runId,e=process.env){
 guardSprayPhoto(e)
 need(/^[a-f0-9]{32}$/.test(runId??''),'INVALID_REAL_RUN')
 need(e.QC_UAT_STORAGE_ORIGIN==='https://tcmtqgbpafwciaflgsaa.supabase.co'&&e.QC_UAT_STORAGE_WRITE==='synthetic-only','EXPLICIT_UAT_WRITE_REQUIRED')
}
function recordInRun(id,runId){return qid(id)&&new RegExp('^qc-v2-uat-'+runId+'-[a-z0-9]{1,16}$').test(id)}
export function createSprayPhotoService({db,verifyToken,buildActual,photoStore,realRunId=null}){
 if(realRunId!==null)guardRealPhotoRun(realRunId)
 const bucket=realRunId===null?mockBucket:realBucket
 need(typeof photoStore?.putImmutable==='function'&&typeof photoStore?.read==='function','PHOTO_STORE_REQUIRED')
 guardSprayPhoto()
 const at=(col,id)=>db.doc(workspace+'/'+col+'/'+id)
 const actualFor=q=>{
  const a=buildActual(q)
  return a?{...a,testOnly:true,ownerUid:q.ownerUid,clientRevision:q.clientRevision,operationalPayloadFingerprint:q.operationalPayloadFingerprint,photoManifestFingerprint:q.photoManifestFingerprint}:null
 }
 const auditFor=(q,baseRevision)=>({testOnly:true,recordId:q.id,revision:q.clientRevision,baseRevision,actorUid:q.ownerUid,formType:'spray',saveType:q.saveType,operationalPayloadFingerprint:q.operationalPayloadFingerprint,photoManifestFingerprint:q.photoManifestFingerprint})
 return async function save(token,request){
  guardSprayPhoto()
  if(realRunId!==null)guardRealPhotoRun(realRunId)
  need(typeof token==='string'&&token.length>0,'AUTH_REQUIRED')
  let actor;try{actor=await verifyToken(token)}catch{throw Error('INVALID_TOKEN')}
  need(sid(actor?.uid)&&actor.qcUat===true,'UAT_IDENTITY_DENIED')
  need(plain(request)&&Object.keys(request).sort().join(',')==='baseRevision,changes,record','INVALID_REQUEST')
  const {baseRevision}=request,r=structuredClone(request.record),changes=structuredClone(request.changes)
  need(baseRevision===null||sid(baseRevision),'INVALID_BASE_REVISION')
  need(plain(r)&&qid(r.id)&&sid(r.dailyPlanId)&&sid(r.clientRevision),'INVALID_RECORD_SCOPE')
  if(realRunId!==null)need(recordInRun(r.id,realRunId),'REAL_RECORD_SCOPE_DENIED')
  need(r.ownerUid===actor.uid&&r.inputtedBy===actor.uid,'OWNER_REQUIRED')
  const run=commit=>db.runTransaction(async tx=>{
   const qref=at('qc_records',r.id),aref=at('daily_reports','qcactual_'+r.id),uref=at('qc_operational_audit',r.id+':'+r.clientRevision)
   const [m,p,d,q,a,u]=await Promise.all([tx.get(db.doc('qc_uat_identities/'+actor.uid)),tx.get(db.doc('users/'+actor.uid)),tx.get(at('daily_plans',r.dailyPlanId)),tx.get(qref),tx.get(aref),tx.get(uref)])
   const marker=m.data()
   need(!p.exists&&marker?.testOnly===true&&marker.enabled===true&&marker.workspace==='cutover'&&roles.includes(marker.role)&&plain(marker.permissions),'UAT_IDENTITY_DENIED')
   need(marker.permissions.qc_spraying==='edit','FORM_EDIT_REQUIRED')
   need(d.exists,'SOURCE_DP_NOT_FOUND')
   validateSprayDto(r,d.data())
   validateChanges(r,changes)
   // No cap against plannedDailyAreaHa: field over-actual is valid.
   const fingerprint=sprayPhotoFingerprint(r,baseRevision,changes)
   const current=q.data()??null,oldActual=a.data()??null,oldAudit=u.data()??null
   if(current){
    need(current.testOnly===true&&current.ownerUid===actor.uid&&current.inputtedBy===actor.uid&&current.formType==='spray','OWNER_REQUIRED')
    need(current.dailyPlanId===r.dailyPlanId&&current.monthlyPlanLineId===r.monthlyPlanLineId&&current.date===r.date&&current.createdAt===r.createdAt,'SOURCE_LINK_IMMUTABLE')
   }
   const previous=current?.operationalPhotoManifest??{}
   checkManifest(previous,current??r,bucket)
   if(current)need(current.photoManifestFingerprint===digest(canonical(previous)),'STORED_MANIFEST_MISMATCH')
   const {manifest,uploads}=await prepareOperationalPhotoManifest({recordId:r.id,uploaderUid:r.ownerUid,previous,changes,bucket})
   checkManifest(manifest,r,bucket)
   const next={...stripOperationalPhotoPayload(r),operationalPhotoManifest:manifest,photoManifestFingerprint:digest(canonical(manifest)),operationalPayloadFingerprint:fingerprint,operationalSaveId:fingerprint.slice(10),firestoreSaveState:'confirmed'}
   const verifyObjects=async()=>{for(const ref of Object.values(manifest)){const bytes=await photoStore.read(ref);need(bytes instanceof Uint8Array&&bytes.length===ref.size&&digest(bytes)===ref.sha256,'PHOTO_BYTES_UNVERIFIED')}}
   const actual=actualFor(next),audit=auditFor(next,baseRevision)
   if(current?.clientRevision===r.clientRevision){
    need(current.operationalPayloadFingerprint===fingerprint,'QC_REPLAY_PAYLOAD_CONFLICT')
    need(equal(current,next)&&equal(oldActual,actual)&&equal(oldAudit,audit),'QC_REPLAY_PAIR_MISMATCH')
    await verifyObjects()
    return {status:'confirmed',replayed:true,record:current}
   }
   need((current?.clientRevision??null)===baseRevision,'QC_REVISION_CONFLICT')
   need(!oldAudit,'AUDIT_REVISION_EXISTS')
   need(r.saveType!=='uploaded'||['ready','uploaded'].includes(current?.saveType),'READY_REQUIRED_FOR_UPLOAD')
   need(!current||current.saveType!=='ready'||['ready','uploaded'].includes(r.saveType),'QC_STATUS_REGRESSION')
   need(!current||current.saveType!=='uploaded'||r.saveType==='uploaded','QC_STATUS_REGRESSION')
   need(equal(oldActual,current?actualFor(current):null),'QC_ACTUAL_PAIR_MISMATCH')
   need(actual||!oldActual,'QC_ACTUAL_REMOVAL_REQUIRES_REVIEW')
   if(!commit)return {status:'staging',uploads,record:next}
   await verifyObjects()
   tx.set(qref,next)
   if(actual)tx.set(aref,actual)
   tx.create(uref,audit)
   return {status:'confirmed',replayed:false,record:next}
  })
  const pre=await run(false)
  if(pre.status==='confirmed')return pre
  // Immutable staging is outside the retryable transaction. No delete/overwrite.
  for(const u of pre.uploads)await photoStore.putImmutable(u.reference,u.bytes)
  // Re-verify the original token after staging, then re-read current permissions.
  let again;try{again=await verifyToken(token)}catch{throw Error('INVALID_TOKEN')}
  need(again?.uid===actor.uid&&again.qcUat===true,'UAT_IDENTITY_DENIED')
  // Re-read marker, DP, base revision, and verified bytes before atomic commit.
  return run(true)
 }
}

// Ticket policy matches previous isolated endpoint: own form edit, or Data QC
// view/edit for own record or authorized supervisory/viewer roles.
export function createSprayPhotoSigner({db,verifyToken,photoStore,realRunId}){
 guardRealPhotoRun(realRunId)
 return async function sign(token,request){
  guardRealPhotoRun(realRunId)
  let actor;try{actor=await verifyToken(token)}catch{throw Error('INVALID_TOKEN')}
  need(sid(actor?.uid)&&actor.qcUat===true,'UAT_IDENTITY_DENIED')
  need(plain(request)&&Object.keys(request).sort().join(',')==='recordId,slot'&&recordInRun(request.recordId,realRunId)&&typeof request.slot==='string'&&(request.slot==='main'||request.slot.startsWith('hold_')),'INVALID_SIGN_REQUEST')
  const ref=await db.runTransaction(async tx=>{
   const [m,p,q]=await Promise.all([tx.get(db.doc('qc_uat_identities/'+actor.uid)),tx.get(db.doc('users/'+actor.uid)),tx.get(db.doc(workspace+'/qc_records/'+request.recordId))])
   const marker=m.data(),row=q.data()
   need(!p.exists&&marker?.testOnly===true&&marker.enabled===true&&marker.workspace==='cutover'&&roles.includes(marker.role)&&plain(marker.permissions),'UAT_IDENTITY_DENIED')
   need(row?.testOnly===true&&row.formType==='spray'&&row.id===request.recordId&&sid(row.ownerUid)&&row.firestoreSaveState==='confirmed','PHOTO_RECORD_UNAVAILABLE')
   const own=row.ownerUid===actor.uid
   need((own&&marker.permissions.qc_spraying==='edit')||(['view','edit'].includes(marker.permissions.qc_records)&&(own||['owner','asisten','manager','admin','pengunjung'].includes(marker.role))),'PHOTO_READ_DENIED')
   const manifest=row.operationalPhotoManifest
   checkManifest(manifest,row,realBucket)
   need(row.photoManifestFingerprint===digest(canonical(manifest)),'STORED_MANIFEST_MISMATCH')
   need(Object.hasOwn(manifest,request.slot),'PHOTO_SLOT_NOT_FOUND')
   return manifest[request.slot]
  })
  // A previously issued URL is a bearer capability until expiry.
  return {signedUrl:await photoStore.sign(ref,30),expiresIn:30}
 }
}
