import { qcApi } from './api'
import { mirrorRecordToFirestore } from './firestoreStore'
import { openLocalDb, QUEUE_STORE } from './localDb'
import type { QcRecord } from './types'

export type QueueAction='syncRecord'|'finalizeRecord'
export type SaveTransportResult={queued:boolean;firestoreFirst:boolean;spreadsheetPending:boolean}
type QueueItem={id:string;action:QueueAction;record:QcRecord;createdAt:number}

async function allItems():Promise<QueueItem[]>{
  const db=await openLocalDb()
  try{return await new Promise((resolve,reject)=>{const tx=db.transaction(QUEUE_STORE,'readonly'),r=tx.objectStore(QUEUE_STORE).getAll();r.onsuccess=()=>resolve((r.result||[]) as QueueItem[]);r.onerror=()=>reject(r.error)})}
  finally{db.close()}
}

async function replaceItems(items:QueueItem[]):Promise<void>{
  const db=await openLocalDb()
  try{await new Promise<void>((resolve,reject)=>{const tx=db.transaction(QUEUE_STORE,'readwrite'),store=tx.objectStore(QUEUE_STORE);store.clear();items.forEach(item=>store.put(item));tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error)})}
  finally{db.close()}
}

async function mirrorAfterServerSave(action:QueueAction,record:QcRecord):Promise<void>{
  const mirrored:QcRecord=action==='finalizeRecord'?{...record,saveType:'uploaded'}:record
  try{await mirrorRecordToFirestore(mirrored)}catch(error){console.info('Mirror Firestore dilewati; Apps Script tetap menjadi sumber aman.',error)}
}

function isAuthError(error:unknown){
  const message=error instanceof Error?error.message:String(error)
  return /sesi|login|izin|password|kata sandi|auth/i.test(message)
}

export async function queueCount(){return(await allItems()).length}
export async function discardQueuedRecord(recordId:string){await replaceItems((await allItems()).filter(item=>item.record.id!==recordId))}
export async function enqueue(action:QueueAction,record:QcRecord){let items=await allItems();if(action==='finalizeRecord')items=items.filter(item=>item.record.id!==record.id);else items=items.filter(item=>!(item.action===action&&item.record.id===record.id));items.push({id:crypto.randomUUID(),action,record,createdAt:Date.now()});await replaceItems(items)}

async function sendServerFirst(token:string,action:QueueAction,record:QcRecord):Promise<SaveTransportResult>{
  if(!navigator.onLine){await enqueue(action,record);return{queued:true,firestoreFirst:false,spreadsheetPending:true}}
  try{
    if(action==='finalizeRecord')await qcApi.finalizeRecord(token,record);else await qcApi.syncRecord(token,record)
    await mirrorAfterServerSave(action,record)
    const items=await allItems();await replaceItems(action==='finalizeRecord'?items.filter(item=>item.record.id!==record.id):items.filter(item=>!(item.action===action&&item.record.id===record.id)))
    return{queued:false,firestoreFirst:false,spreadsheetPending:false}
  }catch(error){
    if(isAuthError(error))throw error
    await enqueue(action,record)
    return{queued:true,firestoreFirst:false,spreadsheetPending:true}
  }
}

export async function saveRecordFirestoreFirst(token:string,record:QcRecord):Promise<SaveTransportResult>{
  if(!navigator.onLine){await enqueue('syncRecord',record);return{queued:true,firestoreFirst:false,spreadsheetPending:true}}
  try{
    const mirrored=await mirrorRecordToFirestore(record)
    if(!mirrored)return sendServerFirst(token,'syncRecord',record)
    // Persist the Spreadsheet handoff before returning success. This protects edits/ready records if the tab closes immediately.
    await enqueue('syncRecord',record)
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
  // All non-upload saves (Draft and Ready, including edits) acknowledge Firestore first.
  if(action==='syncRecord')return saveRecordFirestoreFirst(token,record)
  // Final upload/correction remains Apps Script-first until the Upload State Machine stage.
  return sendServerFirst(token,action,record)
}

export async function flushQueue(token:string){
  const items=await allItems();if(!navigator.onLine)return{sent:0,left:items.length}
  const left:QueueItem[]=[];let sent=0
  for(const item of items){try{if(item.action==='finalizeRecord')await qcApi.finalizeRecord(token,item.record);else await qcApi.syncRecord(token,item.record);await mirrorAfterServerSave(item.action,item.record);sent++}catch(error){if(isAuthError(error))throw error;left.push(item)}}
  await replaceItems(left);return{sent,left:left.length}
}
