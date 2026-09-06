import { collection, deleteDoc, doc, limit, onSnapshot, orderBy, query, serverTimestamp, setDoc } from 'firebase/firestore'
import { firebaseConfigured, firestoreDb, firestoreFeatureEnabled } from './firebase'
import type { QcRecord, User } from './types'

export type FirestoreMode = 'disabled'|'configured'|'active'

export function getFirestoreMode(): FirestoreMode {
  if (!firebaseConfigured) return 'disabled'
  return firestoreFeatureEnabled ? 'active' : 'configured'
}

function requireDb(){
  if(!firestoreDb) throw new Error('Firebase belum dikonfigurasi.')
  return firestoreDb
}

function stripLargePayload(record:QcRecord){
  const clean = JSON.parse(JSON.stringify(record)) as QcRecord
  clean.photoBase64=''
  if(Array.isArray(clean.holdIntervals)) clean.holdIntervals=clean.holdIntervals.map(hold=>({...hold,photoBase64:''}))
  return clean
}

export async function mirrorRecordToFirestore(record:QcRecord,user:User){
  if(!firestoreFeatureEnabled) return
  const db=requireDb(),payload=stripLargePayload(record)
  await setDoc(doc(db,'qc_records',record.id),{
    ...payload,
    updatedBy:user.username,
    updatedAt:serverTimestamp(),
  },{merge:true})
}

export async function removeRecordFromFirestore(recordId:string){
  if(!firestoreFeatureEnabled) return
  await deleteDoc(doc(requireDb(),'qc_records',recordId))
}

export function subscribeQcRecords(onRecords:(records:QcRecord[])=>void,onError?:(error:Error)=>void){
  if(!firestoreFeatureEnabled||!firestoreDb) return ()=>{}
  const q=query(collection(firestoreDb,'qc_records'),orderBy('updatedAt','desc'),limit(1000))
  return onSnapshot(q,snapshot=>{
    onRecords(snapshot.docs.map(item=>({id:item.id,...item.data()}) as QcRecord))
  },error=>onError?.(error))
}
