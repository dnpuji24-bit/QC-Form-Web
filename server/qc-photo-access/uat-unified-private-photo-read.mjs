// 11D.5c.3b.2d — private photo reads, exclusively in the unified synthetic UAT.
// Not mounted on public HTTP, Hosting or production. No browser-supplied storage path.
import {createHash} from 'node:crypto'
import {unifiedGuard} from './uat-unified-identity-guard.mjs'
import {operationalPermissions,canReadOperationalPhoto} from './uat-operational-permissions.mjs'
import {roles,keys} from '../../src/qcUatRolePermissions.mjs'
import {permissionsForIdentity} from '../../src/qcUatCustomRoles.mjs'
import {photoLedgerEqual} from '../../src/qcUatVerifiedPhotoLedger.mjs'
import {unifiedPhotoBucket,unifiedPhotoOrigin,unifiedPhotoPath,guardUnifiedPhotoStorage,createUnifiedPhotoSafeFetch} from './uat-unified-private-photo-store.mjs'

const fail=code=>{throw Error(code)}
const need=(condition,code)=>{if(!condition)fail(code)}
const plain=o=>o&&Object.getPrototypeOf(o)===Object.prototype
const exact=(o,ks)=>plain(o)&&Reflect.ownKeys(o).length===ks.length&&ks.every(k=>Object.hasOwn(o,k))
const uidOK=s=>typeof s==='string'&&/^uat-[a-z0-9-]{1,60}$/.test(s)
const refID=s=>typeof s==='string'&&/^[a-f0-9]{24}_[a-f0-9]{64}$/.test(s)
const hex=s=>typeof s==='string'&&/^[a-f0-9]{64}$/.test(s)
const sha=s=>createHash('sha256').update(s).digest('hex')
const extensions=Object.freeze({'image/jpeg':'jpg','image/png':'png','image/webp':'webp'})

export function parseUnifiedPhotoRead(input){
 need(exact(input,['recordId','photoId']),'PHOTO_READ_REQUEST_INVALID')
 const match=/^qc-v2-uat-([a-f0-9]{32})-([a-z0-9]{1,16})$/.exec(input.recordId)
 need(match&&refID(input.photoId),'PHOTO_READ_SCOPE_INVALID')
 return Object.freeze({recordId:input.recordId,photoId:input.photoId,runId:match[1],
  canonicalId:input.recordId.slice('qc-v2-'.length)})
}

// Never accept an arbitrary path or a client-provided metadata object.
// Resolve only one immutable, audited reference attached to a committed QC form.
export function resolveUnifiedPhotoRead(input,rows,actor){
 const q=parseUnifiedPhotoRead(input)
 const {qc,full,ledger,audit}=rows??{}
 const {uid,marker,permissions}=actor??{}
 need(qc?.testOnly===true&&ledger?.testOnly===true&&full?.testOnly===true&&
  ledger?.storageMode==='supabase-private-uat'&&ledger.bucket===unifiedPhotoBucket&&
  qc.id===q.canonicalId&&ledger.recordId===q.canonicalId&&ledger.fullRecordId===q.recordId&&
  ['spray','fertilizer'].includes(qc.formType)&&ledger.formType===qc.formType&&
  full?.form?.formType===qc.formType&&full.form.id===q.recordId&&
  ledger.ownerUid===qc.ownerUid&&full.form.ownerUid===qc.ownerUid&&
  ledger.clientRevision===qc.clientRevision&&full.form.clientRevision===qc.clientRevision&&
  full.clientRevision===qc.clientRevision&&ledger.jobId===full.jobId&&
  qc.operationalSaveId===ledger.jobId&&hex(ledger.manifestSha256)&&
  ledger.dailyPlanId===qc.dailyPlanId&&
  photoLedgerEqual(ledger,audit),
  'PHOTO_READ_LEDGER_INVALID')
 need(uidOK(uid)&&marker?.enabled===true&&permissions&&
  canReadOperationalPhoto(marker,permissions,uid,qc,qc.formType==='spray'?'qc_spraying':'qc_fertilizer'),
  'PHOTO_READ_ACCESS_DENIED')
 const matches=Object.entries(ledger.manifest??{}).filter(([,ref])=>ref?.photoId===q.photoId)
 need(matches.length===1,'PHOTO_READ_NOT_IN_MANIFEST')
 const [slot,entry]=matches[0]
 const kind=slot.startsWith('hold_')?'hold':slot
 need(['main','hold','scan'].includes(kind)&&entry.kind===kind&&
  (kind!=='scan'||qc.formType==='fertilizer')&&
  (kind!=='hold'||slot==='hold_'+entry.holdId&&
    full.form.holdIntervals?.some(h=>h.holdId===entry.holdId))&&
  entry.provider==='supabase'&&entry.bucket===unifiedPhotoBucket&&
  entry.uploaderUid===qc.ownerUid&&
  Number.isInteger(entry.size)&&entry.size>0&&entry.size<=2097152&&
  hex(entry.sha256)&&q.photoId===sha(slot).slice(0,24)+'_'+entry.sha256&&
  Object.hasOwn(extensions,entry.contentType)&&
  entry.objectPath===qc.ownerUid+'/qc/'+q.recordId+'/'+q.photoId+'.'+extensions[entry.contentType],
  'PHOTO_READ_REFERENCE_INVALID')
 // Enforce the EXACT run and owner, not merely a syntactically plausible path.
 unifiedPhotoPath(q.runId,qc.ownerUid,entry)
 return Object.freeze({ref:entry,runId:q.runId,ownerUid:qc.ownerUid,contentType:entry.contentType,
  recordId:q.recordId,photoId:q.photoId})
}

function validateSignedUrl(signed,ref){
 need(typeof signed==='string'&&signed.length<4096,'PHOTO_READ_SIGN_FAILED')
 let u
 try{u=new URL(signed)}catch{fail('PHOTO_READ_SIGN_FAILED')}
 const prefix='/storage/v1/object/sign/'+unifiedPhotoBucket+'/'
 let decoded
 try{decoded=decodeURIComponent(u.pathname)}catch{fail('PHOTO_READ_SIGN_FAILED')}
 need(u.origin===unifiedPhotoOrigin&&!u.username&&!u.password&&!u.hash&&
  decoded===prefix+ref.objectPath&&
  typeof u.searchParams.get('token')==='string'&&u.searchParams.get('token').length>0,
  'PHOTO_READ_SIGN_FAILED')
 return signed
}

// Only the backend may construct this signer. Its secret and signed URL are NEVER logged.
export async function createUnifiedUatPhotoSigner({client=null,env=process.env}={}){
 guardUnifiedPhotoStorage(env)
 if(!client){
  const {createClient}=await import('@supabase/supabase-js')
  client=createClient(unifiedPhotoOrigin,env.QC_UAT_STORAGE_SECRET,{
   auth:{autoRefreshToken:false,persistSession:false,detectSessionInUrl:false},
   global:{fetch:createUnifiedPhotoSafeFetch()}
  })
 }
 need(typeof client?.storage?.from==='function','PHOTO_READ_STORAGE_REQUIRED')
 const storage=client.storage.from(unifiedPhotoBucket)
 return Object.freeze({
  bucket:unifiedPhotoBucket,
  async sign(ref,runId,ownerUid){
   guardUnifiedPhotoStorage(env)
   unifiedPhotoPath(runId,ownerUid,ref)
   const answer=await storage.createSignedUrl(ref.objectPath,60)
   need(!answer?.error&&answer?.data?.signedUrl,'PHOTO_READ_SIGN_FAILED')
   return validateSignedUrl(answer.data.signedUrl,ref)
  }
 })
}

export function createPlanningPhotoReadService({adb,authAdmin,signer}){
 const project=unifiedGuard()
 need(adb?.projectId===project&&authAdmin?.app?.options?.projectId===project,'WRONG_PROJECT')
 need(signer?.bucket===unifiedPhotoBucket&&typeof signer.sign==='function','PHOTO_READ_SIGNER_REQUIRED')
 const root=(c,id)=>adb.doc('qc_uat_workspaces/cutover/'+c+'/'+id)
 async function identify(token){
  need(typeof token==='string'&&token.length>0&&token.length<=16384,'INVALID_TOKEN')
  let account
  try{account=await authAdmin.verifyIdToken(token,true)}catch{fail('INVALID_TOKEN')}
  need(uidOK(account?.uid)&&account.qcUat===true,'UAT_IDENTITY_DENIED')
  return account.uid
 }
 async function authorize(token,request,uid){
  return adb.runTransaction(async tx=>{
   const identityRef=adb.doc('qc_uat_identities/'+uid),profileRef=adb.doc('users/'+uid)
   const [identity,production,qcRow]=await Promise.all([
    tx.get(identityRef),tx.get(profileRef),tx.get(root('qc_records',request.canonicalId))
   ])
   const marker=identity.data(),qc=qcRow.data()
   const permissions=await operationalPermissions({tx,db:adb,marker,productionProfile:production.exists})
   need(Number.isSafeInteger(marker.policyRevision)&&marker.policyRevision>=0&&marker.policyRevision<1000000,
    'UAT_IDENTITY_DENIED')
   if(roles.includes(marker.role)){
    let expected
    try{expected=permissionsForIdentity(marker)}catch{fail('UAT_IDENTITY_DENIED')}
    need(Object.keys(permissions).length===keys.length&&
      keys.every(k=>permissions[k]===expected[k]),'UAT_IDENTITY_DENIED')
   }
   need(qc?.testOnly===true&&['spray','fertilizer'].includes(qc.formType),'PHOTO_READ_NOT_COMMITTED')
   const [fullDoc,ledgerDoc,auditDoc]=await Promise.all([
    tx.get(root(qc.formType==='spray'?'qc_spray_full':'qc_fertilizer_full',request.canonicalId)),
    tx.get(root('qc_photo_manifests',request.canonicalId)),
    tx.get(root('qc_photo_manifest_audit',request.canonicalId+':'+qc.clientRevision))
   ])
   return resolveUnifiedPhotoRead({recordId:request.recordId,photoId:request.photoId},
    {qc,full:fullDoc.data(),ledger:ledgerDoc.data(),audit:auditDoc.data()},
    {uid,marker,permissions})
  })
 }
 return Object.freeze({
  async sign(raw,input){
   unifiedGuard()
   const request=parseUnifiedPhotoRead(input)
   const uid=await identify(raw)
   const first=await authorize(raw,request,uid)
   // A fresh token + permission/ledger read immediately before issuing a bearer URL.
   need(await identify(raw)===uid,'PHOTO_READ_SESSION_CHANGED')
   const next=await authorize(raw,request,uid)
   need(next.ref.objectPath===first.ref.objectPath&&next.ref.sha256===first.ref.sha256&&
    next.contentType===first.contentType,'PHOTO_READ_LEDGER_CHANGED')
   const signedUrl=await signer.sign(next.ref,next.runId,next.ownerUid)
   return {signedUrl,expiresIn:60,contentType:next.contentType}
  }
 })
}
