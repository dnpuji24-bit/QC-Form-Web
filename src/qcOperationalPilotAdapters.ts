import {doc,getDocFromServer,runTransaction} from 'firebase/firestore'
import {firebaseAuth,firestoreDb} from './firebase'
import {enqueueOperationalJob,flushOperationalJobs} from './qcOperationalQueue.mjs'

const prefix=/^qc-operational-pilot-[A-Za-z0-9_-]{1,120}$/
const collection='qc_operational_pilot_records'
const endpoint='https://mcfwnstdfhhtcbksgrlj.supabase.co/functions/v1/qc-photo-upload-pilot'
export const operationalPilotEnabled=import.meta.env.VITE_QC_OPERATIONAL_PILOT==='true'
type PhotoChange={kind:'main'|'hold'|'scan';holdId?:string;action:'keep'|'remove'|'replace';dataUrl?:string}
type PilotRecord={id:string;clientRevision:string;formType:'spray'|'fertilizer';saveType:'draft'|'ready';testOnly:true;ownerUid:string}
type Job={record:PilotRecord;uploaderUid:string;baseRevision:string|null;action:'syncRecord'|'finalizeRecord';changes:PhotoChange[]}
type Ref={photoId:string;objectPath:string;sha256:string;size:number;bucket:string;contentType:string;kind:string;holdId?:string}
function checkedDb(){if(!operationalPilotEnabled||!firestoreDb||!firebaseAuth?.currentUser)throw Error('Operational pilot disabled or not signed in');return firestoreDb}
function checkedId(id:string){if(!prefix.test(id))throw Error('Pilot ID only');return id}
function currentUid(){return firebaseAuth?.currentUser?.uid||null}
function assertUid(uid:string){if(currentUid()!==uid)throw Error('QC_QUEUE_ACCOUNT_MISMATCH')}
const allowedKeys=new Set(['id','clientRevision','formType','saveType','testOnly','ownerUid'])
export async function enqueuePilotQc(job:Job){
  checkedDb();checkedId(job.record.id);assertUid(job.uploaderUid)
  if(job.record.testOnly!==true||job.record.ownerUid!==job.uploaderUid||Object.keys(job.record).some(k=>!allowedKeys.has(k)))throw Error('Synthetic pilot fields only')
  if(!['spray','fertilizer'].includes(job.record.formType)||!['draft','ready'].includes(job.record.saveType))throw Error('Invalid pilot record')
  return enqueueOperationalJob(job)
}
export async function flushPilotQc(){
  const db=checkedDb(),uid=currentUid()!
  return flushOperationalJobs(uid,{
    scope:'pilot',acceptJob:job=>prefix.test(job.record.id),
    currentUid:async()=>currentUid(),
    async readRecord(id:string){
      assertUid(uid)
      const snap=await getDocFromServer(doc(db,collection,checkedId(id)))
      return snap.exists()?snap.data():null
    },
    async putVerifiedPhoto(ref:Ref,bytes:Uint8Array,job:Job){
      assertUid(uid);checkedId(job.record.id)
      const user=firebaseAuth!.currentUser!,token=await user.getIdToken()
      assertUid(uid)
      let binary=''
      for(let i=0;i<bytes.length;i+=16384)binary+=String.fromCharCode(...bytes.subarray(i,i+16384))
      const response=await fetch(endpoint,{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({
        recordId:job.record.id,formType:job.record.formType,kind:ref.kind,contentType:ref.contentType,
        ...(ref.kind==='hold'?{holdId:ref.holdId}:{}),base64:btoa(binary)
      }),cache:'no-store',signal:AbortSignal.timeout(60000)})
      if(!response.ok)throw Error('Pilot upload HTTP '+response.status)
      const result=await response.json()
      for(const key of ['photoId','objectPath','sha256','size','bucket'] as const)if(result[key]!==ref[key])throw Error('Photo verification mismatch')
    },
    async commitRecord({record,baseRevision,jobId,uploaderUid}:{record:PilotRecord&{operationalSaveId:string};baseRevision:string|null;jobId:string;uploaderUid:string}){
      assertUid(uid);if(uid!==uploaderUid||record.ownerUid!==uid||record.testOnly!==true)throw Error('Invalid pilot ownership')
      const target=doc(db,collection,checkedId(record.id))
      return runTransaction(db,async tx=>{
        assertUid(uid)
        const snap=await tx.get(target),current=snap.data()
        if(current?.operationalSaveId===jobId&&current?.clientRevision===record.clientRevision)return current
        if((current?.clientRevision??null)!==baseRevision)throw Error('QC_REVISION_CONFLICT')
        if(current&&current.ownerUid!==uid)throw Error('Invalid pilot ownership')
        tx.set(target,record)
        return record
      })
    }
  })
}
