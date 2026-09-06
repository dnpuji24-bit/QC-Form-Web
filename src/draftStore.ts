const DB_NAME = 'qc_react_local_v2'
const STORE = 'drafts'
const VERSION = 1

type DraftEnvelope<T> = { key:string; value:T; updatedAt:number }

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve,reject)=>{
    const request=indexedDB.open(DB_NAME,VERSION)
    request.onupgradeneeded=()=>{
      const db=request.result
      if(!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE,{keyPath:'key'})
    }
    request.onsuccess=()=>resolve(request.result)
    request.onerror=()=>reject(request.error||new Error('Penyimpanan lokal tidak tersedia.'))
  })
}

async function withStore<T>(mode:IDBTransactionMode,run:(store:IDBObjectStore)=>IDBRequest<T>):Promise<T>{
  const db=await openDb()
  try{
    return await new Promise<T>((resolve,reject)=>{
      const tx=db.transaction(STORE,mode),store=tx.objectStore(STORE),request=run(store)
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
  }catch{return null}
}

export async function saveDraft<T>(key:string,value:T):Promise<void>{
  try{await withStore<IDBValidKey>('readwrite',store=>store.put({key,value,updatedAt:Date.now()} satisfies DraftEnvelope<T>))}catch{}
}

export async function clearDraft(key:string):Promise<void>{
  try{await withStore<undefined>('readwrite',store=>store.delete(key) as IDBRequest<undefined>)}catch{}
}
