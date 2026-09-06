import { DRAFT_STORE, openLocalDb } from './localDb'

type DraftEnvelope<T> = { key:string; value:T; updatedAt:number }

const pendingWrites = new Map<string, Promise<void>>()

async function withStore<T>(mode:IDBTransactionMode,run:(store:IDBObjectStore)=>IDBRequest<T>):Promise<T>{
  const db=await openLocalDb()
  try{
    return await new Promise<T>((resolve,reject)=>{
      const tx=db.transaction(DRAFT_STORE,mode),store=tx.objectStore(DRAFT_STORE),request=run(store)
      request.onsuccess=()=>resolve(request.result)
      request.onerror=()=>reject(request.error||new Error('Penyimpanan lokal gagal.'))
      tx.onabort=()=>reject(tx.error||new Error('Penyimpanan lokal dibatalkan.'))
    })
  }finally{db.close()}
}

export async function loadDraft<T>(key:string):Promise<T|null>{
  try{
    const row=await withStore<DraftEnvelope<T>|undefined>('readonly',store=>store.get(key))
    return row?.value??null
  }catch(error){
    console.error('[QC autosave] loadDraft gagal',error)
    return null
  }
}

export function saveDraft<T>(key:string,value:T):Promise<void>{
  const previous=pendingWrites.get(key)||Promise.resolve()
  const next=previous.catch(()=>undefined).then(async()=>{
    await withStore<IDBValidKey>('readwrite',store=>store.put({key,value,updatedAt:Date.now()} satisfies DraftEnvelope<T>))
  }).catch(error=>{console.error('[QC autosave] saveDraft gagal',error)})
  pendingWrites.set(key,next)
  void next.finally(()=>{if(pendingWrites.get(key)===next)pendingWrites.delete(key)})
  return next
}

export async function flushDraftWrite(key:string):Promise<void>{
  await (pendingWrites.get(key)||Promise.resolve())
}

export async function clearDraft(key:string):Promise<void>{
  try{
    await flushDraftWrite(key)
    await withStore<undefined>('readwrite',store=>store.delete(key) as IDBRequest<undefined>)
  }catch(error){
    console.error('[QC autosave] clearDraft gagal',error)
  }
}
