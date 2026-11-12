import {doc,runTransaction,serverTimestamp} from 'firebase/firestore'
import {firebaseAuth,firestoreDb} from './firebase'
import {buildQcActualPayload} from './firestoreStore'
import {commitQcAndActual} from './qcAtomicCommit.mjs'
import type {QcRecord} from './types'

type AtomicRecord=QcRecord&{ownerUid:string;clientRevision:string;operationalSaveId?:string;firestoreSaveState?:string}
export type AtomicQcInput={record:AtomicRecord;baseRevision:string|null;jobId:string;uploaderUid:string}
export async function commitOperationalQc(input:AtomicQcInput){
  // Candidate adapter only; do not call from legacy production save path.
  if(import.meta.env.VITE_QC_OPERATIONAL_SAVE!=='true')throw Error('Operational save disabled')
  const db=firestoreDb
  if(!db||!firebaseAuth?.currentUser)throw Error('Firebase login required')
  const currentUid=async()=>firebaseAuth?.currentUser?.uid??null
  return commitQcAndActual(input,{
    currentUid,
    buildActual:(record:AtomicRecord)=>buildQcActualPayload(record),
    transaction:fn=>runTransaction(db,async tx=>fn({
      readQc:async id=>{const s=await tx.get(doc(db,'qc_records',id));return s.exists()?s.data():null},
      readActual:async id=>{const s=await tx.get(doc(db,'daily_reports',id));return s.exists()?s.data():null},
      writeQc:(id,row)=>tx.set(doc(db,'qc_records',id),{...row,updatedAt:serverTimestamp()}),
      writeActual:(id,row)=>tx.set(doc(db,'daily_reports',id),row,{merge:true})
    }))
  })
}
