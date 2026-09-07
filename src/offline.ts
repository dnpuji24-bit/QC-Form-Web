import { qcApi } from './api'
import { mirrorRecordToFirestore } from './firestoreStore'
import { openLocalDb, QUEUE_STORE } from './localDb'
import type { QcRecord } from './types'

export type QueueAction='syncRecord'|'finalizeRecord'
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

export async function queueCount(){return(await allItems()).length}
export async function discardQueuedRecord(recordId:string){await replaceItems((await allItems()).filter(item=>item.record.id!==recordId))}
export async function enqueue(action:QueueAction,record:QcRecord){let items=await allItems();if(action==='finalizeRecord')items=items.filter(item=>item.record.id!==record.id);else items=items.filter(item=>!(item.action===action&&item.record.id===record.id));items.push({id:crypto.randomUUID(),action,record,createdAt:Date.now()});await replaceItems(items)}

export async function sendOrQueue(token:string,action:QueueAction,record:QcRecord){
  if(!navigator.onLine){await enqueue(action,record);return{queued:true}}
  try{
    if(action==='finalizeRecord')await qcApi.finalizeRecord(token,record);else await qcApi.syncRecord(token,record)
    await mirrorAfterServerSave(action,record)
    const items=await allItems();await replaceItems(action==='finalizeRecord'?items.filter(item=>item.record.id!==record.id):items.filter(item=>!(item.action===action&&item.record.id===record.id)))
    return{queued:false}
  }catch(error){
    const message=error instanceof Error?error.message:String(error)
    if(/sesi|login|izin|password|kata sandi|auth/i.test(message))throw error
    await enqueue(action,record)
    return{queued:true}
  }
}

export async function flushQueue(token:string){
  const items=await allItems();if(!navigator.onLine)return{sent:0,left:items.length}
  const left:QueueItem[]=[];let sent=0
  for(const item of items){try{if(item.action==='finalizeRecord')await qcApi.finalizeRecord(token,item.record);else await qcApi.syncRecord(token,item.record);await mirrorAfterServerSave(item.action,item.record);sent++}catch(error){const message=error instanceof Error?error.message:String(error);if(/sesi|login|izin|password|kata sandi|auth/i.test(message))throw error;left.push(item)}}
  await replaceItems(left);return{sent,left:left.length}
}
