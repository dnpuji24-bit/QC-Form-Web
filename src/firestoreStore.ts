import { collection, deleteDoc, doc, limit, onSnapshot, orderBy, query, serverTimestamp, setDoc } from 'firebase/firestore'
import { firebaseAuth, firebaseConfigured, firestoreDb, firestoreFeatureEnabled } from './firebase'
import { hydrateReportPhotoPreviews, makeReportPhotoPreview } from './reportPhoto'
import type { QcRecord, User } from './types'

export type FirestoreMode = 'disabled'|'configured'|'active'

export function getFirestoreMode(): FirestoreMode {
  if (!firebaseConfigured) return 'disabled'
  return firebaseAuth?.currentUser || firestoreFeatureEnabled ? 'active' : 'configured'
}

function requireDb(){
  if(!firestoreDb) throw new Error('Firebase belum dikonfigurasi.')
  return firestoreDb
}

async function stripLargePayload(record:QcRecord):Promise<QcRecord>{
  const clean = JSON.parse(JSON.stringify(record)) as QcRecord
  const fullMain=String(clean.photoBase64||'')
  const mainDrive=String(clean.photoDriveUrl||'')
  if(fullMain.startsWith('data:image/')){
    const preview=await makeReportPhotoPreview(fullMain)
    clean.photoPreviewBase64=preview
  }else if(!mainDrive){
    clean.photoPreviewBase64=''
  }
  clean.photoBase64=''

  if(Array.isArray(clean.holdIntervals)){
    clean.holdIntervals=await Promise.all(clean.holdIntervals.map(async hold=>{
      const full=String(hold.photoBase64||'')
      const drive=String(hold.photoDriveUrl||'')
      let preview=String(hold.photoPreviewBase64||'')
      if(full.startsWith('data:image/'))preview=await makeReportPhotoPreview(full)
      else if(!drive)preview=''
      return{...hold,photoBase64:'',photoPreviewBase64:preview}
    }))
  }
  return clean
}

export async function mirrorRecordToFirestore(record:QcRecord,user?:User):Promise<boolean>{
  if(!firestoreDb||!firebaseAuth?.currentUser) return false
  const db=requireDb(),payload=await stripLargePayload(record)
  await setDoc(doc(db,'qc_records',record.id),{
    ...payload,
    updatedBy:user?.username||String(record.inputtedBy||firebaseAuth.currentUser.email||'firebase-user'),
    updatedAt:serverTimestamp(),
  },{merge:true})
  return true
}

export async function removeRecordFromFirestore(recordId:string):Promise<boolean>{
  if(!firestoreDb||!firebaseAuth?.currentUser) return false
  await deleteDoc(doc(requireDb(),'qc_records',recordId))
  return true
}

export function subscribeQcRecords(onRecords:(records:QcRecord[])=>void,onError?:(error:Error)=>void){
  if(!firestoreDb||!firebaseAuth?.currentUser) return ()=>{}
  const q=query(collection(firestoreDb,'qc_records'),orderBy('updatedAt','desc'),limit(1000))
  return onSnapshot(q,snapshot=>{
    onRecords(snapshot.docs.map(item=>hydrateReportPhotoPreviews({id:item.id,...item.data()} as QcRecord)))
  },error=>onError?.(error))
}
