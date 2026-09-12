import { DRAFT_STORE, IMAGE_STORE, openLocalDb } from './localDb'

type DraftEnvelope<T> = { key:string; value:T; updatedAt:number; schemaVersion:number }
type ImageEnvelope = { key:string; draftKey:string; blob:Blob; name:string; type:string; lastModified:number; updatedAt:number }
type ImageMarker = { __qcDraftImageRef:string; name:string; type:string; lastModified:number }

const DRAFT_SCHEMA_VERSION=2
const pendingWrites = new Map<string, Promise<void>>()

function emitDraftError(error:unknown){
  console.error('[QC autosave] penyimpanan draft gagal',error)
  if(typeof window!=='undefined')window.dispatchEvent(new CustomEvent('qc:draft-error',{detail:error instanceof Error?error.message:String(error||'Penyimpanan draft gagal.')}))
}

async function withStore<T>(storeName:string,mode:IDBTransactionMode,run:(store:IDBObjectStore)=>IDBRequest<T>):Promise<T>{
  const db=await openLocalDb()
  try{
    return await new Promise<T>((resolve,reject)=>{
      const tx=db.transaction(storeName,mode),store=tx.objectStore(storeName),request=run(store)
      request.onsuccess=()=>resolve(request.result)
      request.onerror=()=>reject(request.error||new Error('Penyimpanan lokal gagal.'))
      tx.onabort=()=>reject(tx.error||new Error('Penyimpanan lokal dibatalkan.'))
    })
  }finally{db.close()}
}

function isImageMarker(value:unknown):value is ImageMarker{
  return Boolean(value&&typeof value==='object'&&typeof (value as ImageMarker).__qcDraftImageRef==='string')
}

function imageKey(draftKey:string,path:string){return`${draftKey}::${path||'root'}`}

async function putImage(row:ImageEnvelope):Promise<void>{
  await withStore<IDBValidKey>(IMAGE_STORE,'readwrite',store=>store.put(row))
}

async function getImage(key:string):Promise<ImageEnvelope|undefined>{
  return withStore<ImageEnvelope|undefined>(IMAGE_STORE,'readonly',store=>store.get(key))
}

async function deleteImage(key:string):Promise<void>{
  await withStore<undefined>(IMAGE_STORE,'readwrite',store=>store.delete(key) as IDBRequest<undefined>)
}

async function imageRowsForDraft(draftKey:string):Promise<ImageEnvelope[]>{
  const db=await openLocalDb()
  try{
    return await new Promise<ImageEnvelope[]>((resolve,reject)=>{
      const tx=db.transaction(IMAGE_STORE,'readonly'),store=tx.objectStore(IMAGE_STORE)
      const request=store.indexNames.contains('draftKey')?store.index('draftKey').getAll(draftKey):store.getAll()
      request.onsuccess=()=>resolve(((request.result||[]) as ImageEnvelope[]).filter(row=>row.draftKey===draftKey))
      request.onerror=()=>reject(request.error||new Error('Daftar foto draft tidak dapat dibaca.'))
    })
  }finally{db.close()}
}

async function canDecodeImage(blob:Blob):Promise<boolean>{
  if(!blob||blob.size<=0||!String(blob.type||'').startsWith('image/'))return false
  try{
    if(typeof createImageBitmap==='function'){
      const bitmap=await createImageBitmap(blob)
      const valid=bitmap.width>0&&bitmap.height>0
      bitmap.close?.()
      return valid
    }
    if(typeof document!=='undefined'){
      const url=URL.createObjectURL(blob)
      try{
        return await new Promise<boolean>(resolve=>{const img=new Image();img.onload=()=>resolve(img.naturalWidth>0&&img.naturalHeight>0);img.onerror=()=>resolve(false);img.src=url})
      }finally{URL.revokeObjectURL(url)}
    }
  }catch{}
  return false
}

async function serializeValue(draftKey:string,value:unknown,path:string,used:Set<string>):Promise<unknown>{
  if(value instanceof Blob){
    if(!(await canDecodeImage(value)))return undefined
    const key=imageKey(draftKey,path),file=value instanceof File?value:undefined
    await putImage({key,draftKey,blob:value,name:file?.name||'foto-draft',type:value.type,lastModified:file?.lastModified||Date.now(),updatedAt:Date.now()})
    used.add(key)
    return{__qcDraftImageRef:key,name:file?.name||'foto-draft',type:value.type,lastModified:file?.lastModified||Date.now()} satisfies ImageMarker
  }
  if(isImageMarker(value)){used.add(value.__qcDraftImageRef);return value}
  if(typeof value==='string'&&value.startsWith('blob:'))return''
  if(Array.isArray(value))return Promise.all(value.map((item,index)=>serializeValue(draftKey,item,`${path}[${index}]`,used)))
  if(value&&typeof value==='object'){
    const output:Record<string,unknown>={}
    for(const[key,item]of Object.entries(value as Record<string,unknown>)){
      const serialized=await serializeValue(draftKey,item,path?`${path}.${key}`:key,used)
      if(serialized!==undefined)output[key]=serialized
    }
    return output
  }
  return value
}

async function hydrateValue(value:unknown):Promise<unknown>{
  if(isImageMarker(value)){
    try{
      const row=await getImage(value.__qcDraftImageRef)
      if(!row||!(await canDecodeImage(row.blob))){if(row)await deleteImage(row.key);return undefined}
      try{return new File([row.blob],row.name||value.name,{type:row.type||value.type,lastModified:row.lastModified||value.lastModified})}
      catch{return row.blob}
    }catch(error){console.warn('[QC autosave] foto draft tidak dapat dipulihkan dan dilepas',error);return undefined}
  }
  if(value instanceof Blob)return(await canDecodeImage(value))?value:undefined
  if(typeof value==='string'&&value.startsWith('blob:'))return''
  if(Array.isArray(value))return Promise.all(value.map(item=>hydrateValue(item)))
  if(value&&typeof value==='object'){
    const output:Record<string,unknown>={}
    for(const[key,item]of Object.entries(value as Record<string,unknown>)){
      const hydrated=await hydrateValue(item)
      if(hydrated!==undefined)output[key]=hydrated
    }
    return output
  }
  return value
}

async function pruneDraftImages(draftKey:string,used:Set<string>):Promise<void>{
  const rows=await imageRowsForDraft(draftKey)
  await Promise.all(rows.filter(row=>!used.has(row.key)).map(row=>deleteImage(row.key)))
}

export async function loadDraft<T>(key:string):Promise<T|null>{
  try{
    const row=await withStore<DraftEnvelope<T>|undefined>(DRAFT_STORE,'readonly',store=>store.get(key))
    if(!row)return null
    return await hydrateValue(row.value) as T
  }catch(error){
    console.error('[QC autosave] loadDraft gagal',error)
    return null
  }
}

export function saveDraft<T>(key:string,value:T):Promise<void>{
  const previous=pendingWrites.get(key)||Promise.resolve()
  const next=previous.catch(()=>undefined).then(async()=>{
    const used=new Set<string>()
    const serialized=await serializeValue(key,value,'',used) as T
    await withStore<IDBValidKey>(DRAFT_STORE,'readwrite',store=>store.put({key,value:serialized,updatedAt:Date.now(),schemaVersion:DRAFT_SCHEMA_VERSION} satisfies DraftEnvelope<T>))
    await pruneDraftImages(key,used)
  })
  pendingWrites.set(key,next)
  void next.catch(emitDraftError).finally(()=>{if(pendingWrites.get(key)===next)pendingWrites.delete(key)})
  return next
}

export async function flushDraftWrite(key:string):Promise<void>{
  await (pendingWrites.get(key)||Promise.resolve())
}

export async function clearDraft(key:string):Promise<void>{
  await flushDraftWrite(key)
  await withStore<undefined>(DRAFT_STORE,'readwrite',store=>store.delete(key) as IDBRequest<undefined>)
  const rows=await imageRowsForDraft(key)
  await Promise.all(rows.map(row=>deleteImage(row.key)))
}
