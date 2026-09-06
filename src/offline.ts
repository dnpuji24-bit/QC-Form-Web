import { qcApi } from './api'
import type { QcRecord } from './types'

const DB_NAME='qc_react_local_v2'
const STORE='queue'
const VERSION=2
export type QueueAction='syncRecord'|'finalizeRecord'
type QueueItem={id:string;action:QueueAction;record:QcRecord;createdAt:number}

function openDb():Promise<IDBDatabase>{return new Promise((resolve,reject)=>{const request=indexedDB.open(DB_NAME,VERSION);request.onupgradeneeded=()=>{const db=request.result;if(!db.objectStoreNames.contains('drafts'))db.createObjectStore('drafts',{keyPath:'key'});if(!db.objectStoreNames.contains(STORE))db.createObjectStore(STORE,{keyPath:'id'})};request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error||new Error('Penyimpanan offline tidak tersedia.'))})}
async function allItems():Promise<QueueItem[]>{const db=await openDb();try{return await new Promise((resolve,reject)=>{const tx=db.transaction(STORE,'readonly'),r=tx.objectStore(STORE).getAll();r.onsuccess=()=>resolve((r.result||[]) as QueueItem[]);r.onerror=()=>reject(r.error)})}finally{db.close()}}
async function replaceItems(items:QueueItem[]):Promise<void>{const db=await openDb();try{await new Promise<void>((resolve,reject)=>{const tx=db.transaction(STORE,'readwrite'),store=tx.objectStore(STORE);store.clear();items.forEach(item=>store.put(item));tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error)})}finally{db.close()}}

export async function queueCount(){return(await allItems()).length}
export async function discardQueuedRecord(recordId:string){await replaceItems((await allItems()).filter(item=>item.record.id!==recordId))}
export async function enqueue(action:QueueAction,record:QcRecord){let items=await allItems();if(action==='finalizeRecord')items=items.filter(item=>item.record.id!==record.id);else items=items.filter(item=>!(item.action===action&&item.record.id===record.id));items.push({id:crypto.randomUUID(),action,record,createdAt:Date.now()});await replaceItems(items)}

export async function sendOrQueue(token:string,action:QueueAction,record:QcRecord){
  if(!navigator.onLine){await enqueue(action,record);return{queued:true}}
  try{
    if(action==='finalizeRecord')await qcApi.finalizeRecord(token,record);else await qcApi.syncRecord(token,record)
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
  for(const item of items){try{if(item.action==='finalizeRecord')await qcApi.finalizeRecord(token,item.record);else await qcApi.syncRecord(token,item.record);sent++}catch(error){const message=error instanceof Error?error.message:String(error);if(/sesi|login|izin|password|kata sandi|auth/i.test(message))throw error;left.push(item)}}
  await replaceItems(left);return{sent,left:left.length}
}
