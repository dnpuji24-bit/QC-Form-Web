// Stage 19F-B1. Emulator-only candidate. No production URL or credentials accepted.
const project='demo-qc-photo-test',root='projects/'+project+'/databases/(default)/documents'
const collections=new Set(['users','role_access','firebase_registration_requests','qc_admin_audit','qc_native_name_requests','qc_native_name_pending','qc_records','daily_reports','qc_historical_correction_locks','qc_archived_records','qc_archived_actuals','qc_archive_markers','qc_archive_history','qc_archive_history_records','qc_archive_history_actuals','qc_operational_audit'])
const validId=v=>typeof v==='string'&&/^[A-Za-z0-9_:-]{1,200}$/.test(v)&&!/^__.*__$/.test(v)
const validField=v=>typeof v==='string'&&/^[A-Za-z_][A-Za-z0-9_]*$/.test(v)&&!/^__.*__$/.test(v)&&!['__proto__','constructor','prototype'].includes(v)
const stampToken=Symbol('SERVER_TIMESTAMP')
export const restServerTimestamp=()=>stampToken
class RestTimestamp{
 constructor(value){
  const m=/^(\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d)(?:\.(\d{1,9}))?Z$/.exec(value)
  if(!m||!Number.isFinite(Date.parse(m[1]+'Z')))throw Error('INVALID_REST_TIMESTAMP')
  this.seconds=Date.parse(m[1]+'Z')/1000;this.nanoseconds=Number((m[2]||'').padEnd(9,'0'));this.value=value
  Object.freeze(this)
 }
}
function fields(data){
 if(!data||Object.getPrototypeOf(data)!==Object.prototype)throw Error('UNSUPPORTED_REST_MAP')
 return Object.fromEntries(Object.entries(data).map(([k,v])=>{if(!validField(k))throw Error('UNSUPPORTED_REST_FIELD');return [k,encode(v)]}))
}
function encode(v){
 if(v===null)return {nullValue:null}
 if(typeof v==='string')return {stringValue:v}
 if(typeof v==='boolean')return {booleanValue:v}
 if(typeof v==='number'&&Number.isFinite(v)){
  if(Number.isSafeInteger(v)&&!Object.is(v,-0))return {integerValue:String(v)}
  if(!Number.isInteger(v))return {doubleValue:v}
  throw Error('UNSUPPORTED_REST_NUMBER')
 }
 if(v instanceof RestTimestamp)return {timestampValue:v.value}
 if(Array.isArray(v)){if(v.some(Array.isArray))throw Error('UNSUPPORTED_NESTED_ARRAY');return {arrayValue:{values:v.map(encode)}}}
 if(v&&typeof v==='object')return {mapValue:{fields:fields(v)}}
 throw Error('UNSUPPORTED_REST_VALUE')
}
function decodeFields(data={}){
 return Object.fromEntries(Object.entries(data).map(([k,v])=>{if(!validField(k))throw Error('UNSUPPORTED_REST_FIELD');return [k,decode(v)]}))
}
function decode(v){
 if('nullValue'in v)return null
 if('stringValue'in v&&typeof v.stringValue==='string')return v.stringValue
 if('booleanValue'in v&&typeof v.booleanValue==='boolean')return v.booleanValue
 if('integerValue'in v&&/^-?\d+$/.test(v.integerValue)&&Number.isSafeInteger(Number(v.integerValue)))return Number(v.integerValue)
 // Reject integral doubles for now rather than silently changing their stored type.
 if('doubleValue'in v&&typeof v.doubleValue==='number'&&Number.isFinite(v.doubleValue)&&!Number.isInteger(v.doubleValue))return v.doubleValue
 if('timestampValue'in v)return new RestTimestamp(v.timestampValue)
 if('arrayValue'in v)return (v.arrayValue.values||[]).map(decode)
 if('mapValue'in v)return decodeFields(v.mapValue.fields||{})
 throw Error('UNSUPPORTED_REST_VALUE')
}
class RestError extends Error{constructor(code){super(code);this.code=code}}
export function createAdminRestEmulator({host,projectId,fetchImpl=fetch,maxAttempts=3}){
 if(projectId!==project||!/^127\.0\.0\.1:\d{1,5}$/.test(host||'')||Number(host.split(':')[1])<1||Number(host.split(':')[1])>65535)throw Error('DEMO_LOOPBACK_REQUIRED')
 if(!Number.isInteger(maxAttempts)||maxAttempts<1||maxAttempts>3)throw Error('INVALID_RETRY_LIMIT')
 const base='http://'+host+'/v1/'+root
 const refs=new WeakSet()
 const ref=(kind,collection,id,filter)=>{const r=Object.freeze({kind,collection,id,filter:filter?Object.freeze({...filter}):undefined});refs.add(r);return r}
 const name=r=>root+'/'+r.collection+'/'+r.id
 const checkRef=(r,kind)=>{if(!r||!refs.has(r)||(kind&&r.kind!==kind))throw Error('INVALID_REST_REF')}
 const collection=c=>{
  if(!collections.has(c))throw Error('COLLECTION_DENIED')
  return Object.assign(refCollection(c),{doc:(id=crypto.randomUUID())=>{if(!validId(id))throw Error('INVALID_REST_ID');return ref('doc',c,id)},where:(field,op,value)=>{if(c!=='daily_reports'||field!=='qcRecordId'||op!=='=='||!validId(value))throw Error('QUERY_DENIED');return ref('query',c,undefined,{field,value})}})
 }
 // Collection references must retain object identity and cannot be mutated after creation.
 function refCollection(c){const r={kind:'query',collection:c};refs.add(r);return r}
 async function rpc(method,body){
  const response=await fetchImpl(base+':'+method,{method:'POST',headers:{Authorization:'Bearer owner','Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(15000),redirect:'error'})
  const data=await response.json()
  if(!response.ok){const code=data?.error?.status;throw new RestError(typeof code==='string'&&/^[A-Z_]+$/.test(code)?code:'REST_HTTP_'+response.status)}
  return data
 }
 const snapshot=(r,document)=>{
  if(document&&(document.name!==name(r)||!document.updateTime))throw Error('INVALID_REST_SNAPSHOT')
  const value=document?decodeFields(document.fields):undefined
  return {id:r.id,exists:!!document,updateTime:document?new RestTimestamp(document.updateTime):undefined,data:()=>value}
 }
 async function runTransaction(fn){
  for(let attempt=0;attempt<maxAttempts;attempt++){
   let transaction,commitStarted=false
   try{
    transaction=(await rpc('beginTransaction',{options:{readWrite:{}}})).transaction
    if(typeof transaction!=='string'||!transaction)throw Error('INVALID_REST_TRANSACTION')
    const writes=[],readVersions=new Map(),written=new Set()
    let sealed=false
    const remember=(r,d)=>{readVersions.set(name(r),d?.updateTime??null);return snapshot(r,d)}
    const write=(kind,r,value)=>{
     checkRef(r,'doc')
     if(sealed||written.has(name(r))||writes.length>=100)throw Error('REST_WRITE_LIMIT_OR_DUPLICATE')
     const key=name(r),version=readVersions.get(key)
     if(kind!=='create'&&!readVersions.has(key))throw Error('REST_WRITE_REQUIRES_READ')
     if(['update','delete'].includes(kind)&&!version)throw Error('REST_DOCUMENT_MISSING')
     if(kind==='create'&&version)throw Error('REST_DOCUMENT_EXISTS')
     const currentDocument=kind==='create'||version===null?{exists:false}:{updateTime:version}
     if(kind==='delete')writes.push({delete:key,currentDocument})
     else{
      if(!value||Object.getPrototypeOf(value)!==Object.prototype)throw Error('UNSUPPORTED_REST_MAP')
      const normal={},transforms=[]
      for(const [k,v] of Object.entries(value)){
       if(!validField(k))throw Error('UNSUPPORTED_REST_FIELD')
       if(v===stampToken)transforms.push({fieldPath:k,setToServerValue:'REQUEST_TIME'})
       else normal[k]=v
      }
      const w={update:{name:key,fields:fields(normal)},currentDocument}
      if(kind==='update'){if(!Object.keys(normal).length)throw Error('EMPTY_REST_UPDATE');w.updateMask={fieldPaths:Object.keys(normal)}}
      if(transforms.length)w.updateTransforms=transforms
      writes.push(w)
     }
     written.add(key)
    }
    let inFlight=0
    const tx={
     async get(r){
      checkRef(r)
      if(sealed||writes.length)throw Error('REST_READ_AFTER_WRITE')
      inFlight++
      try{
       if(r.kind==='doc'){
        const rows=await rpc('batchGet',{documents:[name(r)],transaction})
        if(!Array.isArray(rows)||rows.length!==1)throw Error('INVALID_REST_BATCH')
        const row=rows[0]
        if(row.found)return remember(r,row.found)
        if(row.missing===name(r))return remember(r,null)
        throw Error('INVALID_REST_BATCH')
       }
       if(r.kind!=='query')throw Error('INVALID_REST_REF')
       const query={from:[{collectionId:r.collection}],limit:501}
       if(r.filter)query.where={fieldFilter:{field:{fieldPath:r.filter.field},op:'EQUAL',value:encode(r.filter.value)}}
       const rows=await rpc('runQuery',{structuredQuery:query,transaction})
       if(!Array.isArray(rows))throw Error('INVALID_REST_QUERY')
       const docs=[]
       for(const row of rows){
        if(!row.document){if(!row.readTime)throw Error('INVALID_REST_QUERY');continue}
        const prefix=root+'/'+r.collection+'/',id=row.document.name?.slice(prefix.length)
        if(!row.document.name?.startsWith(prefix)||!validId(id))throw Error('INVALID_REST_QUERY')
        docs.push(remember(ref('doc',r.collection,id),row.document))
       }
       if(docs.length>500)throw Error('REST_QUERY_LIMIT')
       return {docs,size:docs.length,empty:docs.length===0}
      }finally{inFlight--}
     },
     create(r,d){if(inFlight)throw Error('REST_READ_IN_PROGRESS');write('create',r,d)},
     update(r,d){if(inFlight)throw Error('REST_READ_IN_PROGRESS');write('update',r,d)},
     set(r,d){if(inFlight)throw Error('REST_READ_IN_PROGRESS');write('set',r,d)},
     delete(r){if(inFlight)throw Error('REST_READ_IN_PROGRESS');write('delete',r)}
    }
    const result=await fn(tx);sealed=true
    if(inFlight)throw Error('REST_READ_IN_PROGRESS')
    commitStarted=true
    const committed=await rpc('commit',{writes,transaction})
    if(!Array.isArray(committed.writeResults??[])||(committed.writeResults??[]).length!==writes.length||!committed.commitTime)throw Error('REST_COMMIT_RESPONSE_UNKNOWN')
    return result
   }catch(error){
    if(transaction)try{await rpc('rollback',{transaction})}catch{}
    // Retry only explicit ABORTED. Network/unknown commit outcome is never replayed.
    if(error instanceof RestError&&error.code==='ABORTED'&&attempt+1<maxAttempts)continue
    if(commitStarted&&(!(error instanceof RestError)||!['ABORTED','FAILED_PRECONDITION','ALREADY_EXISTS','NOT_FOUND','PERMISSION_DENIED','INVALID_ARGUMENT','UNAUTHENTICATED'].includes(error.code)))throw Error('REST_COMMIT_OUTCOME_UNKNOWN')
    throw error
   }
  }
  throw Error('REST_RETRY_LIMIT')
 }
 return {collection:c=>Object.freeze(collection(c)),runTransaction}
}
