import {doc,getDocFromServer,setDoc,serverTimestamp} from 'firebase/firestore'
import {firebaseAuth,firestoreDb} from './firebase'
import {enqueueOperationalBatch,flushOperationalJobs,listOperationalJobs,type OperationalJob} from './qcOperationalQueue.mjs'
import {commitOperationalQc,type AtomicQcInput} from './qcAtomicFirestoreAdapter'
import type {QcSaveIntent} from './qcFormSaveIntent.mjs'
import type {QcRecord} from './types'
import {qcLocalUat,localUatPhotos,localUatPhotoKey} from './qcLocalUat'
import {photoUploadEndpoint as endpoint, operationalPhotoBucket} from './qcPhotoEnvironment'
import {postVerifiedOperationalPhoto} from './qcOperationalPhotoHttp.mjs'

export const operationalSaveEnabled=import.meta.env.VITE_QC_OPERATIONAL_SAVE==='true'
const validId=(s:string)=>/^[A-Za-z0-9_-]{1,160}$/.test(s)&&!/^qc-(operational-pilot|photo-staging)-/.test(s)
type RecordInput=AtomicQcInput['record']
type Job=OperationalJob&{record:RecordInput;scope:'operational';changes:QcSaveIntent['changes']}
type PersistedJob=OperationalJob&{id:string;createdAt:number;lastError?:string}
type PersistedQcJob=Job&{id:string;createdAt:number;lastError?:string}
const acceptJob=(job:OperationalJob):job is Job=>{
  const candidate=job as Partial<Job>
  const record=candidate.record
  return candidate.scope==='operational'&&!!record&&validId(record.id)&&typeof record.clientRevision==='string'&&typeof record.ownerUid==='string'&&record.ownerUid===job.uploaderUid&&typeof record.date==='string'&&typeof record.paddock==='string'&&(record.formType==='spray'||record.formType==='fertilizer')
}
const currentUid=()=>firebaseAuth?.currentUser?.uid??null
function requireSession(){
  if(!operationalSaveEnabled||!firestoreDb||!currentUid())throw Error('Operational save disabled or no Firebase session')
  return {db:firestoreDb,uid:currentUid()!}
}
function assertUid(uid:string){if(currentUid()!==uid)throw Error('QC_QUEUE_ACCOUNT_MISMATCH')}
function makeJob(record:QcRecord,intent:QcSaveIntent,action:Job['action']){
  const {uid}=requireSession()
  if(!validId(record.id)||typeof record.clientRevision!=='string'||!validId(record.clientRevision))throw Error('Invalid operational identity')
  if(intent.baseRevision!==null&&record.ownerUid!==uid)throw Error('QC_VERIFIED_OWNER_REQUIRED')
  const job:Job={scope:'operational',uploaderUid:uid,baseRevision:intent.baseRevision,action,changes:intent.changes,record:{...record,ownerUid:uid,clientRevision:record.clientRevision}}
  return job
}
export async function queueOperationalQc(record:QcRecord,intent:QcSaveIntent,action:Job['action']){
  return (await enqueueOperationalBatch([makeJob(record,intent,action)]))[0]
}
export async function queueOperationalSession(items:Array<{record:QcRecord;intent:QcSaveIntent}>){
  return enqueueOperationalBatch(items.map(({record,intent})=>makeJob(record,intent,'syncRecord')))
}
export async function operationalQueuedRecords():Promise<PersistedQcJob[]>{
  const {uid}=requireSession()
  const jobs=await listOperationalJobs(uid)
  return jobs.filter((job:PersistedJob):job is PersistedQcJob=>acceptJob(job))
}
export async function flushOperationalQc(){
  const {db,uid}=requireSession()
  return flushOperationalJobs(uid,{
    scope:'operational',photoBucket:operationalPhotoBucket,acceptJob,currentUid:async()=>currentUid(),
    async readRecord(id:string,job:Job){
      assertUid(uid)
      if(!acceptJob(job)||id!==job.record.id)throw Error('Invalid operational job')
      const target=doc(db,'qc_records',id)
      if(job.baseRevision===null){
        // A completed retry must read the existing QC first when permitted.
        try{const existing=await getDocFromServer(target);if(existing.exists())return existing.data()}catch(e){
          if((e as {code?:string}).code!=='permission-denied')throw e
        }
        const reservation=doc(db,'qc_photo_upload_intents',id)
        try{await setDoc(reservation,{ownerUid:uid,formType:job.record.formType,clientRevision:job.record.clientRevision,createdAt:serverTimestamp()})}
        catch(e){
          const prev=await getDocFromServer(reservation)
          if(!prev.exists()||prev.data().ownerUid!==uid||prev.data().clientRevision!==job.record.clientRevision||prev.data().formType!==job.record.formType)throw e
        }
      }
      assertUid(uid)
      const snap=await getDocFromServer(target)
      return snap.exists()?snap.data():null
    },
    async putVerifiedPhoto(ref,bytes,job:Job){
      assertUid(uid)
      if(!acceptJob(job))throw Error('Invalid operational job')
      if(qcLocalUat){
        const cache=await localUatPhotos()
        assertUid(uid)
        await cache.put(localUatPhotoKey(uid,job.record.id,ref.photoId),new Response(Uint8Array.from(bytes),{
          headers:{'Content-Type':ref.contentType}
        }))
        return
      }
      const token=await firebaseAuth!.currentUser!.getIdToken()
      assertUid(uid)
      await postVerifiedOperationalPhoto({
        endpoint,bucket:operationalPhotoBucket,token,recordId:job.record.id,
        formType:job.record.formType,baseRevision:job.baseRevision,
        clientRevision:job.record.clientRevision,uploaderUid:uid,
        reference:ref,bytes
      })
      assertUid(uid)
    },
    commitRecord:async(input:AtomicQcInput)=>{assertUid(uid);if(input.uploaderUid!==uid)throw Error('QC_QUEUE_ACCOUNT_MISMATCH');return commitOperationalQc(input)}
  })
}
