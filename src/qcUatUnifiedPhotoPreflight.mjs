// Isolated UAT photo PRE-FLIGHT ONLY. No upload, persistence, Supabase SDK or Firestore writes.
// Reuse the existing deterministic operational manifest for slot+bytes identity.
import {prepareOperationalPhotoManifest} from './qcOperationalPhotoManifest.mjs'
const need=(ok,code)=>{if(!ok)throw Error(code)}
const sid=v=>typeof v==='string'&&/^uat-[a-z0-9-]{1,60}$/.test(v)
const mimeMap={'image/png':'png','image/jpeg':'jpg','image/webp':'webp'}
const matches=(bytes,type)=>{
 if(type==='image/png')return bytes.length>=8&&[137,80,78,71,13,10,26,10].every((v,i)=>bytes[i]===v)
 if(type==='image/jpeg')return bytes.length>=4&&bytes[0]===255&&bytes[1]===216&&bytes[2]===255
 if(type==='image/webp')return bytes.length>=12&&[82,73,70,70].every((v,i)=>bytes[i]===v)&&[87,69,66,80].every((v,i)=>bytes[i+8]===v)
 return false
}
export function uatPhotoSlot(formType,kind,holdId=''){
 need(['spray','fertilizer'].includes(formType),'PHOTO_FORM_DENIED')
 need(['main','hold','scan'].includes(kind),'PHOTO_SLOT_DENIED')
 need(kind!=='scan'||formType==='fertilizer','PHOTO_SCAN_ONLY_FERTILIZER')
 if(kind==='hold'){need(typeof holdId==='string'&&/^uat-h(?:[1-9]|1\d|20)$/.test(holdId),'PHOTO_HOLD_SOURCE_REQUIRED')}
 else need(holdId==='','PHOTO_HOLD_UNEXPECTED')
 return kind==='hold'?'hold_'+holdId:kind
}
function data64(bytes){
 let binary=''
 for(let i=0;i<bytes.length;i+=8190)binary+=String.fromCharCode(...bytes.subarray(i,i+8190))
 return btoa(binary)
}
export async function stageUatPhoto({file,uploaderUid,formType,kind,holdId='',recordId='qc-v2-uat-preview'}){
 need(sid(uploaderUid)&&typeof recordId==='string'&&/^qc-v2-uat-[a-z0-9-]{1,100}$/.test(recordId),'PHOTO_SYNTHETIC_ONLY')
 const slot=uatPhotoSlot(formType,kind,holdId)
 need(file&&typeof file.arrayBuffer==='function'&&Number.isSafeInteger(file.size)&&file.size>0&&file.size<=2097152,'PHOTO_SIZE_LIMIT')
 need(Object.hasOwn(mimeMap,file.type),'PHOTO_MIME_DENIED')
 need(typeof file.name==='string'&&file.name.length>0&&file.name.length<=160&&!/[\\/\u0000-\u001f]/.test(file.name),'PHOTO_FILENAME_INVALID')
 const bytes=new Uint8Array(await file.arrayBuffer())
 need(bytes.length===file.size&&matches(bytes,file.type),'PHOTO_SIGNATURE_INVALID')
 const dataUrl='data:'+file.type+';base64,'+data64(bytes)
 const changes=[{action:'replace',kind,dataUrl,...(kind==='hold'?{holdId}:{})}]
 const {manifest,uploads}=await prepareOperationalPhotoManifest({recordId,uploaderUid,changes,bucket:'qc-photos-uat-mock'})
 need(uploads.length===1&&uploads[0].slot===slot&&manifest[slot]?.sha256===uploads[0].reference.sha256,'PHOTO_MANIFEST_MISMATCH')
 const reference=manifest[slot]
 return {slot,kind,holdId,fileName:file.name,size:bytes.length,contentType:file.type,sha256:reference.sha256,photoId:reference.photoId,dataUrl}
}
