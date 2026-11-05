import { collection, doc, getDoc, onSnapshot, query, where } from 'firebase/firestore'
import { firebaseAuth, firestoreDb } from './firebase'
import { hydrateReportPhotoPreviews } from './reportPhoto'
import type { QcRecord } from './types'

export type RealtimeState={
  source:'firestore'|'apps-script'
  connected:boolean
  error?:string
}

type FirebaseProfile={
  active?:boolean
  role?:string
  username?:string
}

export function subscribeQcRecords(
  onRecords:(records:QcRecord[])=>void,
  onState?:(state:RealtimeState)=>void,
):()=>void{
  if(!firestoreDb||!firebaseAuth?.currentUser){
    onState?.({source:'apps-script',connected:false,error:'Firebase Auth/Firestore belum siap.'})
    return()=>{}
  }

  let stopped=false
  let stopSnapshot:()=>void=()=>{}

  void (async()=>{
    try{
      const current=firebaseAuth.currentUser
      if(!current)throw new Error('Firebase Auth belum login.')
      const profileSnap=await getDoc(doc(firestoreDb,'users',current.uid))
      if(!profileSnap.exists())throw new Error('Profil Firebase user belum tersedia.')
      const profile=profileSnap.data() as FirebaseProfile
      if(profile.active!==true)throw new Error('Profil Firebase user belum aktif.')

      const base=collection(firestoreDb,'qc_records')
      const role=String(profile.role||'')
      const username=String(profile.username||'')
      const ref=role.startsWith('mandor_')
        ? query(base,where('inputtedBy','==',username))
        : query(base)

      if(stopped)return
      stopSnapshot=onSnapshot(ref,snapshot=>{
        const records=snapshot.docs.map(docSnap=>hydrateReportPhotoPreviews({id:docSnap.id,...docSnap.data()} as QcRecord))
        records.sort((a,b)=>String(b.createdAt||b.date||'').localeCompare(String(a.createdAt||a.date||'')))
        onRecords(records)
        onState?.({source:'firestore',connected:true})
      },error=>{
        onState?.({source:'apps-script',connected:false,error:error instanceof Error?error.message:String(error)})
      })
    }catch(error){
      onState?.({source:'apps-script',connected:false,error:error instanceof Error?error.message:String(error)})
    }
  })()

  return()=>{stopped=true;stopSnapshot()}
}
