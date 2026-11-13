const idPattern=/^[A-Za-z0-9_-]{1,160}$/
const allowedTypes:Record<string,string>={'image/jpeg':'jpg','image/png':'png','image/webp':'webp'}
export async function resolveOperationalPhotoPath(qc:any,reservation:any,recordId:string,photoId:string,pilot=false):Promise<string|null>{
  const bucket=pilot?'qc-photos-test':'qc-photos'
  const prefix=pilot?'qc-live-photo-pilot-':'qc-v2-'
  if(!idPattern.test(recordId)||!recordId.startsWith(prefix)||!idPattern.test(photoId))return null
  const manifest=qc?.operationalPhotoManifest
    if(!qc||!['spray','fertilizer'].includes(qc.formType)||qc.firestoreSaveState!=='confirmed'||!manifest||!idPattern.test(qc.ownerUid||'')||!reservation||reservation.ownerUid!==qc.ownerUid||reservation.formType!==qc.formType)return null
    const matches=Object.entries(manifest).filter(([,value]:[string,any])=>value?.photoId===photoId)
    if(matches.length!==1)return null
    const [slot,photo]=matches[0] as [string,any]
    if(photo.provider!=='supabase'||photo.bucket!==bucket||photo.uploaderUid!==qc.ownerUid||
      !['main','hold','scan'].includes(photo.kind)||!Object.hasOwn(allowedTypes,photo.contentType)||
      !/^[a-f0-9]{64}$/.test(photo.sha256||'')||!Number.isInteger(photo.size)||photo.size<1||photo.size>2097152)return null
    const expectedSlot=photo.kind==='hold'&&idPattern.test(photo.holdId||'')?'hold_'+photo.holdId:photo.kind
    if(slot!==expectedSlot||!['main','scan'].includes(slot)&&!slot.startsWith('hold_'))return null
    const slotHash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(slot))),b=>b.toString(16).padStart(2,'0')).join('')
    if(photoId!==slotHash.slice(0,24)+'_'+photo.sha256)return null
    const expectedPath=qc.ownerUid+'/qc/'+recordId+'/'+photoId+'.'+allowedTypes[photo.contentType]
    if(photo.objectPath!==expectedPath)return null
  return expectedPath
}
