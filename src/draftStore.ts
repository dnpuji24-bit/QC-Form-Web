import { DRAFT_STORE, openLocalDb } from './localDb'

type DraftEnvelope<T> = { key:string; value:T; updatedAt:number }

const pendingWrites = new Map<string, Promise<void>>()

async function withStore<T>(mode:IDBTransactionMode,run:(store:IDBObjectStore)=>IDBRequest<T>):Promise<T>{
  const db=await openLocalDb()
  try{
    return await new Promise<T>((resolve,reject)=>{
      const tx=db.transaction(DRAFT_STORE,mode),store=tx.objectStore(DRAFT_STORE),request=run(store)
      let settled=false
      const fail=(error:unknown)=>{if(settled)return;settled=true;reject(error instanceof Error?error:new Error('Penyimpanan lokal gagal.'))}
      request.onsuccess=()=>{if(settled)return;settled=true;resolve(request.result)}
      request.onerror=()=>fail(request.error||new Error('Penyimpanan lokal gagal.'))
      tx.onabort=()=>fail(tx.error||new Error('Penyimpanan lokal dibatalkan.'))
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

function queueDraftWrite<T>(key:string,value:T):Promise<void>{
  const previous=pendingWrites.get(key)||Promise.resolve()
  const next=previous.catch(()=>undefined).then(async()=>{
    await withStore<IDBValidKey>('readwrite',store=>store.put({key,value,updatedAt:Date.now()} satisfies DraftEnvelope<T>))
  })
  pendingWrites.set(key,next)
  void next.finally(()=>{if(pendingWrites.get(key)===next)pendingWrites.delete(key)})
  return next
}

/** Autosave helper: logs failures so typing is never interrupted. */
export function saveDraft<T>(key:string,value:T):Promise<void>{
  return queueDraftWrite(key,value).catch(error=>{
    console.error('[QC autosave] saveDraft gagal',error)
  })
}

/** Manual save helper: propagates IndexedDB/quota errors to the form. */
export function saveDraftStrict<T>(key:string,value:T):Promise<void>{
  return queueDraftWrite(key,value)
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
