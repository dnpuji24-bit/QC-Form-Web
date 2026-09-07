import { collection, onSnapshot, query } from 'firebase/firestore'
import { firestoreDb } from './firebase'
import type { QcRecord } from './types'

export type RealtimeState={
  source:'firestore'|'apps-script'
  connected:boolean
  error?:string
}

export function subscribeQcRecords(
  onRecords:(records:QcRecord[])=>void,
  onState?:(state:RealtimeState)=>void,
):()=>void{
  if(!firestoreDb){
    onState?.({source:'apps-script',connected:false,error:'Firestore belum terkonfigurasi.'})
    return()=>{}
  }

  const ref=query(collection(firestoreDb,'qc_records'))
  const unsubscribe=onSnapshot(ref,snapshot=>{
    const records=snapshot.docs.map(docSnap=>({id:docSnap.id,...docSnap.data()} as QcRecord))
    records.sort((a,b)=>String(b.createdAt||b.date||'').localeCompare(String(a.createdAt||a.date||'')))
    onRecords(records)
    onState?.({source:'firestore',connected:true})
  },error=>{
    onState?.({source:'apps-script',connected:false,error:error instanceof Error?error.message:String(error)})
  })

  return unsubscribe
}
