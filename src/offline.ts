import { qcApi } from './api'
import { mirrorRecordToFirestore } from './firestoreStore'
import { openLocalDb, QUEUE_STORE } from './localDb'
import type { QcRecord } from './types'

export type QueueAction='syncRecord'|'finalizeRecord'
export type UploadState='ready'|'queued'|'uploading'|'uploaded'|'failed'
export type SaveTransportResult={queued:boolean;firestoreFirst:boolean;spreadsheetPending:boolean;uploadState?:UploadState}
type QueueItem={id:string;action:QueueAction;record:QcRecord;createdAt:number;attempts?:number;lastAttemptAt?:number;lastError?:string;nextAttemptAt?:number}

type FlushResult={sent:number;left:number}

const FINALIZE_RETRY_BASE_MS=15_000
const FINALIZE_RETRY_MAX_MS=5*60_000
const FINALIZE_STALE_MS=90_000
// Apps Script + Spreadsheet + Drive is intentionally serialized. Multiple concurrent
// final uploads caused long-running requests and intermittent SERVER_ERROR in field tests.
const FINALIZE_WORKERS=1
let activeFlush:Promise<FlushResult>|null=null
let authPausedToken=''
const activeFinalizeIds=new Set<string>()

async function allItems():Promise<QueueItem[]>{
  const db=await openLocalDb()
  try{return await new Promise((resolve,reject)=>{const tx=db.transaction(QUEUE_STORE,'readonly'),r=tx.objectStore(QUEUE_STORE).getAll();r.onsuccess=()=>resolve(((r.result||[]) as QueueItem[]).sort((a,b)=>a.createdAt-b.createdAt));r.onerror=()=>reject(r.error)})}
  finally{db.close()}
}

async function replaceItems(items:QueueItem[]):Promise<void>{
  const db=await openLocalDb()
  try{await new Promise<void>((resolve,reject)=>{const tx=db.transaction(QUEUE_STORE,'readwrite'),store=tx.objectStore(QUEUE_STORE);store.clear();items.forEach(item=>store.put(item));tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error)})}
  finally{db.close()}
}

async function putItem(item:QueueItem):Promise<void>{
  const db=await openLocalDb()
  try{await new Promise<void>((resolve,reject)=>{const tx=db.transaction(QUEUE_STORE,'readwrite'),r=tx.objectStore(QUEUE_STORE).put(item);r.onsuccess=()=>resolve();r.onerror=()=>reject(r.error)})}
  finally{db.close()}
}

async function removeItem(queueId:string):Promise<void>{
  const db=await openLocalDb()
  try{await new Promise<void>((resolve,reject)=>{const tx=db.transaction(QUEUE_STORE,'readwrite'),r=tx.objectStore(QUEUE_STORE).delete(queueId);r.onsuccess=()=>resolve();r.onerror=()=>reject(r.error)})}
  finally{db.close()}
}

function errorMessage(error:unknown){return error instanceof Error?error.message:String(error||'')}
function isAuthError(error:unknown){return /AUTH_REQUIRED|AUTH_EXPIRED|AUTH_FORBIDDEN|sesi|login|izin|password|kata sandi|auth/i.test(errorMessage(error))}
function nowIso(){return new Date().toISOString()}
function retryDelayMs(attempts:number){return Math.min(FINALIZE_RETRY_MAX_MS,FINALIZE_RETRY_BASE_MS*Math.pow(2,Math.max(0,attempts-1)))}
function emitUploadState(record:QcRecord){if(typeof window!=='undefined')window.dispatchEvent(new CustomEvent('qc:upload-state',{detail:record}))}

function uploadRecord(record:QcRecord,state:UploadState,error=''):QcRecord{
  const stamp=nowIso(),attempts=Number(record.uploadAttempts||0)
  const next:QcRecord={
    ...record,
    saveType:state==='uploaded'?'uploaded':state==='ready'?'ready':'upload_queued',
    uploadState:state,
    uploadStateUpdatedAt:stamp,
    uploadLastError:error,
  }
  if(state==='queued'){
    next.uploadQueuedAt=String(record.uploadQueuedAt||stamp)
    next.uploadNextRetryAt=''
  }
  if(state==='uploading'){
    next.uploadStartedAt=stamp
    next.uploadAttempts=attempts+1
    next.uploadNextRetryAt=''
  }
  if(state==='uploaded'){
    next.uploadedAt=String(record.uploadedAt||stamp)
    next.uploadLastError=''
    next.uploadNextRetryAt=''
  }
  if(state==='failed')next.uploadFailedAt=stamp
  return next
}

async function mirrorSafely(record:QcRecord,message:string):Promise<void>{
  try{await mirrorRecordToFirestore(record)}catch(error){console.info(message,error)}
}

async function mirrorAfterServerSave(action:QueueAction,record:QcRecord):Promise<void>{
  const mirrored:QcRecord=action==='finalizeRecord'?uploadRecord(record,'uploaded'):record
  await mirrorSafely(mirrored,'Mirror Firestore dilewati; Apps Script tetap menjadi sumber aman.')
}

async function enqueueInternal(action:QueueAction,record:QcRecord):Promise<QueueItem>{
  let items=await allItems()
  const existing=items.find(item=>item.action===action&&item.record.id===record.id)
  if(action==='finalizeRecord')items=items.filter(item=>item.record.id!==record.id)
  else items=items.filter(item=>!(item.action===action&&item.record.id===record.id))
  const item:QueueItem={
    id:existing?.id||crypto.randomUUID(),
    action,
    record,
    createdAt:existing?.createdAt||Date.now(),
    attempts:existing?.attempts||0,
    lastAttemptAt:existing?.lastAttemptAt,
    lastError:existing?.lastError,
    nextAttemptAt:existing?.nextAttemptAt,
  }
  items.push(item)
  await replaceItems(items)
  return item
}

async function setFinalizeQueueState(item:QueueItem,state:UploadState,error=''):Promise<QueueItem>{
  let record=uploadRecord(item.record,state,error)
  const attemptCount=state==='uploading'?Number(item.attempts||0)+1:Number(item.attempts||0)
  const nextAttemptAt=state==='failed'?Date.now()+retryDelayMs(attemptCount):state==='uploading'?undefined:item.nextAttemptAt
  if(state==='failed'&&nextAttemptAt)record={...record,uploadNextRetryAt:new Date(nextAttemptAt).toISOString()}
  const next:QueueItem={
    ...item,
    record,
    attempts:attemptCount,
    lastAttemptAt:state==='uploading'?Date.now():item.lastAttemptAt,
    lastError:error,
    nextAttemptAt,
  }
  await putItem(next)
  await mirrorSafely(record,`Status upload ${state} belum dapat dimirror ke Firestore.`)
  emitUploadState(record)
  return next
}

function staleUploading(item:QueueItem){
  return item.action==='finalizeRecord'&&String(item.record.uploadState||'')==='uploading'&&!activeFinalizeIds.has(item.record.id)&&(!item.lastAttemptAt||Date.now()-item.lastAttemptAt>FINALIZE_STALE_MS)
}

async function recoverInterruptedItem(item:QueueItem):Promise<QueueItem>{
  if(!staleUploading(item))return item
  const recovered=uploadRecord(item.record,'queued')
  const next:QueueItem={...item,record:recovered,lastError:'',nextAttemptAt:0}
  await putItem(next)
  await mirrorSafely(recovered,'Status upload terputus belum dapat dikembalikan ke antrean di Firestore.')
  emitUploadState(recovered)
  return next
}

async function recoverInterruptedUploads(items:QueueItem[]):Promise<QueueItem[]>{
  const recovered:QueueItem[]=[]
  for(const item of items)recovered.push(await recoverInterruptedItem(item))
  return recovered
}

async function attemptFinalize(token:string,item:QueueItem):Promise<SaveTransportResult>{
  item=await recoverInterruptedItem(item)
  if(item.nextAttemptAt&&item.nextAttemptAt>Date.now())return{queued:true,firestoreFirst:false,spreadsheetPending:true,uploadState:'failed'}
  if(activeFinalizeIds.has(item.record.id))return{queued:true,firestoreFirst:false,spreadsheetPending:true,uploadState:'uploading'}
  activeFinalizeIds.add(item.record.id)
  let current=item
  try{
    current=await setFinalizeQueueState(item,'uploading')
    await qcApi.finalizeRecord(token,current.record)
    const uploaded=uploadRecord(current.record,'uploaded')
    await mirrorSafely(uploaded,'Upload ke Spreadsheet berhasil, tetapi status Firestore belum terbarui.')
    await removeItem(current.id)
    emitUploadState(uploaded)
    return{queued:false,firestoreFirst:false,spreadsheetPending:false,uploadState:'uploaded'}
  }catch(error){
    current=await setFinalizeQueueState(current,'failed',errorMessage(error))
    if(isAuthError(error))throw error
    return{queued:true,firestoreFirst:false,spreadsheetPending:true,uploadState:'failed'}
  }finally{
    activeFinalizeIds.delete(item.record.id)
  }
}

function kickQueue(token:string){
  // If another flush is already running, a second pass picks up records queued while
  // that flush was in progress. This avoids waiting for the periodic timer.
  void flushQueue(token).then(()=>flushQueue(token)).catch(error=>console.info('Upload tetap aman di antrean; percobaan berikutnya akan dilakukan otomatis.',error))
}

async function sendFinalizeStateMachine(token:string,record:QcRecord):Promise<SaveTransportResult>{
  const queued=uploadRecord(record,'queued')
  await enqueueInternal('finalizeRecord',queued)
  await mirrorSafely(queued,'Status upload queued belum dapat dimirror ke Firestore.')
  emitUploadState(queued)
  if(navigator.onLine)kickQueue(token)
  // Return immediately after durable queueing. The single worker owns the actual
  // Apps Script upload and publishes queued -> uploading -> uploaded/failed states.
  return{queued:true,firestoreFirst:false,spreadsheetPending:true,uploadState:'queued'}
}

async function sendServerFirst(token:string,action:QueueAction,record:QcRecord):Promise<SaveTransportResult>{
  if(action==='finalizeRecord')return sendFinalizeStateMachine(token,record)
  if(!navigator.onLine){await enqueueInternal(action,record);return{queued:true,firestoreFirst:false,spreadsheetPending:true}}
  try{
    await qcApi.syncRecord(token,record)
    await mirrorAfterServerSave(action,record)
    const items=await allItems();await replaceItems(items.filter(item=>!(item.action===action&&item.record.id===record.id)))
    return{queued:false,firestoreFirst:false,spreadsheetPending:false}
  }catch(error){
    if(isAuthError(error))throw error
    await enqueueInternal(action,record)
    return{queued:true,firestoreFirst:false,spreadsheetPending:true}
  }
}

export async function queueCount(){return(await allItems()).length}
export async function queuedRecords(){return(await recoverInterruptedUploads(await allItems())).map(item=>item.record)}
export async function discardQueuedRecord(recordId:string){await replaceItems((await allItems()).filter(item=>item.record.id!==recordId))}
export async function enqueue(action:QueueAction,record:QcRecord){await enqueueInternal(action,record)}

export async function retryQueuedRecord(recordId:string,token:string):Promise<boolean>{
  const item=(await allItems()).find(entry=>entry.action==='finalizeRecord'&&entry.record.id===recordId)
  if(!item)return false
  const queued=uploadRecord(item.record,'queued')
  await putItem({...item,record:queued,lastError:'',nextAttemptAt:0})
  await mirrorSafely(queued,'Status retry upload belum dapat dimirror ke Firestore.')
  emitUploadState(queued)
  kickQueue(token)
  return true
}

export async function saveRecordFirestoreFirst(token:string,record:QcRecord):Promise<SaveTransportResult>{
  if(!navigator.onLine){await enqueueInternal('syncRecord',record);return{queued:true,firestoreFirst:false,spreadsheetPending:true}}
  try{
    const mirrored=await mirrorRecordToFirestore(record)
    if(!mirrored)return sendServerFirst(token,'syncRecord',record)
    await enqueueInternal('syncRecord',record)
    void flushQueue(token).catch(error=>console.info('Sinkronisasi Spreadsheet akan dicoba ulang dari antrean.',error))
    return{queued:false,firestoreFirst:true,spreadsheetPending:true}
  }catch(error){
    console.info('Firestore-first tidak tersedia; memakai jalur Apps Script yang aman.',error)
    return sendServerFirst(token,'syncRecord',record)
  }
}

export async function saveDraftFirestoreFirst(token:string,record:QcRecord):Promise<SaveTransportResult>{
  return saveRecordFirestoreFirst(token,record)
}

export async function sendOrQueue(token:string,action:QueueAction,record:QcRecord):Promise<SaveTransportResult>{
  if(action==='syncRecord')return saveRecordFirestoreFirst(token,record)
  return sendFinalizeStateMachine(token,record)
}

async function runFinalizeWorkers(token:string,items:QueueItem[]):Promise<number>{
  let cursor=0,sent=0
  async function worker(){
    while(cursor<items.length){
      const index=cursor++
      const item=items[index]
      if(item.nextAttemptAt&&item.nextAttemptAt>Date.now())continue
      const result=await attemptFinalize(token,item)
      if(!result.queued)sent++
    }
  }
  await Promise.all(Array.from({length:Math.min(FINALIZE_WORKERS,items.length)},()=>worker()))
  return sent
}

async function flushQueueInternal(token:string):Promise<FlushResult>{
  const items=await recoverInterruptedUploads(await allItems());if(!navigator.onLine)return{sent:0,left:items.length}
  let sent=0
  const finalizeItems=items.filter(item=>item.action==='finalizeRecord')
  const syncItems=items.filter(item=>item.action!=='finalizeRecord')
  // Final uploads are user-visible and heavier; process them first and one at a time.
  sent+=await runFinalizeWorkers(token,finalizeItems)
  for(const original of syncItems){
    try{
      await qcApi.syncRecord(token,original.record)
      await mirrorAfterServerSave(original.action,original.record)
      await removeItem(original.id)
      sent++
    }catch(error){
      if(isAuthError(error))throw error
      await putItem({...original,lastAttemptAt:Date.now(),attempts:Number(original.attempts||0)+1,lastError:errorMessage(error)})
    }
  }
  return{sent,left:await queueCount()}
}

export async function flushQueue(token:string):Promise<FlushResult>{
  if(activeFlush)return activeFlush
  activeFlush=flushQueueInternal(token).finally(()=>{activeFlush=null})
  return activeFlush
}

async function autoFlushQueue(){
  if(typeof window==='undefined'||!navigator.onLine)return
  const token=localStorage.getItem('qc_token')||sessionStorage.getItem('qc_token')||''
  if(!token||token===authPausedToken)return
  try{await flushQueue(token)}catch(error){if(isAuthError(error))authPausedToken=token;else console.info('Auto flush antrean tertunda.',error)}
}

if(typeof window!=='undefined'){
  window.addEventListener('online',()=>{void autoFlushQueue()})
  window.setInterval(()=>{void autoFlushQueue()},15_000)
}
