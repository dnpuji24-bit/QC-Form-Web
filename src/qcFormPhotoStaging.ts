import { doc, setDoc, writeBatch } from 'firebase/firestore'
import { firebaseAuth, firestoreDb } from './firebase'
import { requestQcPhotoPreviewUrl } from './qcPhotoSignedRead'

export const qcFormPhotoStagingEnabled = import.meta.env.VITE_QC_FORM_PHOTO_STAGING === 'true'
type Input = {kind:'main'|'hold'|'scan'; dataUrl:string; holdId?:string}
const bucket = 'qc-photos-test'
const endpoint = 'https://mcfwnstdfhhtcbksgrlj.supabase.co'
const idPattern = /^[A-Za-z0-9_-]{1,160}$/
const extensions:Record<string,string> = {'image/jpeg':'jpg','image/png':'png','image/webp':'webp'}
export async function testFormPhotos(formType:'spray'|'fertilizer', inputs:Input[]):Promise<{recordId:string;count:number}> {
  if (!qcFormPhotoStagingEnabled || !firestoreDb || !firebaseAuth?.currentUser) throw new Error('Mode foto staging belum aktif atau belum login.')
  if (!navigator.onLine) throw new Error('Uji staging memerlukan koneksi internet. Form tidak dihapus.')
  const user = firebaseAuth.currentUser
  const key = String(import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || '')
  if (!key.startsWith('sb_publishable_')) throw new Error('Publishable key Supabase belum tersedia.')
  if (!inputs.length || inputs.length > 20) throw new Error('Pilih 1–20 foto uji per unit.')
  const photos = inputs.map(input=>{
    const match = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(input.dataUrl)
    if (!match) throw new Error('Format foto uji tidak didukung.')
    if (input.kind==='hold' && !idPattern.test(input.holdId||'')) throw new Error('ID HOLD tidak valid.')
    const raw=atob(match[2])
    if (!raw.length || raw.length>2097152) throw new Error('Foto uji maksimal 2 MB.')
    const bytes=Uint8Array.from(raw,c=>c.charCodeAt(0))
    return {...input,contentType:match[1],bytes,photoId:crypto.randomUUID()}
  })
  const token=await user.getIdTokenResult(true)
  if(token.claims.role!=='authenticated') throw new Error('Akun belum memiliki Firebase claim authenticated.')
  const recordId='qc-photo-staging-'+crypto.randomUUID(),revision=crypto.randomUUID()
  const parent=doc(firestoreDb,'qc_photo_staging_records',recordId)
  // Create the isolated parent first; Firestore rules validate input permission.
  // No operational QC data, names, paddocks, or plan IDs are copied.
  await setDoc(parent,{formType,ownerUid:user.uid,clientRevision:revision,testOnly:true})
  const batch=writeBatch(firestoreDb)
  for(const photo of photos){
    if(firebaseAuth.currentUser?.uid!==user.uid) throw new Error('Akun berubah; hentikan uji.')
    const objectPath=user.uid+'/qc/'+recordId+'/'+photo.photoId+'.'+extensions[photo.contentType]
    const response=await fetch(endpoint+'/storage/v1/object/'+bucket+'/'+objectPath,{
      method:'POST',headers:{apikey:key,Authorization:'Bearer '+token.token,'Content-Type':photo.contentType,'x-upsert':'false'},
      body:new Blob([photo.bytes],{type:photo.contentType}),
    })
    if(!response.ok) throw new Error('Upload foto staging gagal: HTTP '+response.status+'; record uji '+recordId)
    batch.set(doc(firestoreDb,'qc_photo_staging_metadata',recordId,'photos',photo.photoId),{
      photoId:photo.photoId,qcRecordId:recordId,ownerUid:user.uid,recordRevision:revision,
      provider:'supabase',bucket,objectPath,kind:photo.kind,contentType:photo.contentType,
      ...(photo.kind==='hold'?{holdId:photo.holdId}:{}),testOnly:true,
    })
  }
  await batch.commit()
  // Real signed endpoint and byte-for-byte read proof, not a public URL.
  for(const photo of photos){
    const {signedUrl}=await requestQcPhotoPreviewUrl(recordId,photo.photoId)
    const response=await fetch(signedUrl,{cache:'no-store',referrerPolicy:'no-referrer'})
    if(!response.ok) throw new Error('Foto staging belum dapat dibaca: HTTP '+response.status)
    const result=new Uint8Array(await response.arrayBuffer())
    if(result.length!==photo.bytes.length || result.some((b,i)=>b!==photo.bytes[i])) throw new Error('Isi foto hasil baca berbeda.')
  }
  return {recordId,count:photos.length}
}
