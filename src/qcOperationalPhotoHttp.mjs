// Stage 22 — fail-closed browser -> trusted Supabase Edge Function upload contract.
// This module contains no secret key, does not read Google Drive and does not
// enable an endpoint. Callers must pass a current Firebase ID token explicitly.
export const operationalPhotoUploadDestinations=Object.freeze({
 production:Object.freeze({endpoint:'https://mcfwnstdfhhtcbksgrlj.supabase.co/functions/v1/qc-photo-upload',bucket:'qc-photos'}),
 uat:Object.freeze({endpoint:'https://tcmtqgbpafwciaflgsaa.supabase.co/functions/v1/qc-photo-upload-uat',bucket:'qc-photos-uat'})
})
const need=(ok,code)=>{if(!ok)throw Error(code)}
const id=v=>typeof v==='string'&&/^[A-Za-z0-9_-]{1,160}$/.test(v)
const mime=Object.freeze({'image/jpeg':'jpg','image/png':'png','image/webp':'webp'})
const digest=async value=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',value)),b=>b.toString(16).padStart(2,'0')).join('')
const b64=bytes=>{
 let binary=''
 for(let i=0;i<bytes.length;i+=16384)binary+=String.fromCharCode(...bytes.subarray(i,i+16384))
 return btoa(binary)
}
export async function postVerifiedOperationalPhoto({endpoint,bucket,token,recordId,formType,
 baseRevision,clientRevision,uploaderUid,reference,bytes,fetchImpl=fetch}){
 const destination=Object.values(operationalPhotoUploadDestinations).find(v=>
  v.endpoint===endpoint&&v.bucket===bucket)
 need(!!destination,'QC_PHOTO_BACKEND_NOT_APPROVED')
 need(id(recordId)&&recordId.startsWith('qc-v2-')&&id(clientRevision)&&
  (baseRevision===null||id(baseRevision))&&id(uploaderUid)&&
  ['spray','fertilizer'].includes(formType),'QC_PHOTO_REQUEST_INVALID')
 need(typeof token==='string'&&token.length>0&&typeof fetchImpl==='function','QC_PHOTO_TOKEN_REQUIRED')
 const ref=reference
 need(ref&&typeof ref==='object'&&ref.provider==='supabase'&&ref.bucket===bucket&&
  ref.uploaderUid===uploaderUid&&['main','scan','hold'].includes(ref.kind)&&
  Object.hasOwn(mime,ref.contentType)&&ref.size>0&&ref.size<=2097152&&
  Number.isSafeInteger(ref.size)&&bytes instanceof Uint8Array&&bytes.byteLength===ref.size,
  'QC_PHOTO_REFERENCE_INVALID')
 const slot=ref.kind==='hold'&&id(ref.holdId)?'hold_'+ref.holdId:ref.kind
 need(ref.kind!=='hold'||id(ref.holdId),'QC_PHOTO_REFERENCE_INVALID')
 const hash=await digest(bytes),slotHash=await digest(new TextEncoder().encode(slot))
 const photoId=slotHash.slice(0,24)+'_'+hash
 const path=uploaderUid+'/qc/'+recordId+'/'+photoId+'.'+mime[ref.contentType]
 need(ref.sha256===hash&&ref.photoId===photoId&&ref.objectPath===path,
  'QC_PHOTO_REFERENCE_MISMATCH')
 const body={recordId,formType,baseRevision,clientRevision,kind:ref.kind,
  contentType:ref.contentType,...(ref.kind==='hold'?{holdId:ref.holdId}:{}),base64:b64(bytes)}
 const response=await fetchImpl(endpoint,{
  method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},
  body:JSON.stringify(body),cache:'no-store',signal:AbortSignal.timeout(60000)
 })
 if(!response.ok)throw Error('QC photo upload HTTP '+response.status)
 const receipt=await response.json()
 need(receipt&&typeof receipt==='object'&&
  ['photoId','objectPath','sha256','size','bucket'].every(k=>receipt[k]===ref[k]),
  'QC_PHOTO_VERIFICATION_MISMATCH')
 return true
}
