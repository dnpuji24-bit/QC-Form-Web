// Cloud Shell operator-only adapter. Never imported by browser or hosted Edge Functions.
const root='https://firestore.googleapis.com/v1/projects/form-qc-unm/databases/(default)/documents'
const id=/^[A-Za-z0-9_-]{1,160}$/
const fixtureId=/^qc-live-photo-pilot-[0-9a-f-]{36}$/
function encode(v){
 if(typeof v==='string')return {stringValue:v}
 if(typeof v==='boolean')return {booleanValue:v}
 if(Number.isSafeInteger(v))return {integerValue:String(v)}
 if(v===null)return {nullValue:null}
 if(Array.isArray(v))return {arrayValue:{values:v.map(encode)}}
 if(v&&typeof v==='object')return {mapValue:{fields:encodeFields(v)}}
 throw Error('UNSUPPORTED_FIXTURE_VALUE')
}
function encodeFields(v){return Object.fromEntries(Object.entries(v).map(([k,x])=>[k,encode(x)]))}
function decode(v){
 if(!v||typeof v!=='object')throw Error('INVALID_FIRESTORE_VALUE')
 if('stringValue' in v)return v.stringValue
 if('booleanValue' in v)return v.booleanValue
 if('integerValue' in v)return Number(v.integerValue)
 if('doubleValue' in v)return Number(v.doubleValue)
 if('nullValue' in v)return null
 if('mapValue' in v)return decodeFields(v.mapValue.fields||{})
 if('arrayValue' in v)return (v.arrayValue.values||[]).map(decode)
 for(const k of ['timestampValue','referenceValue','bytesValue','geoPointValue'])if(k in v)return v[k]
 throw Error('UNSUPPORTED_FIRESTORE_VALUE')
}
function decodeFields(v){return Object.fromEntries(Object.entries(v||{}).map(([k,x])=>[k,decode(x)]))}
export function createPilotFirestoreRest({recordId,accessToken,fetchImpl=fetch}){
 if(!fixtureId.test(recordId))throw Error('INVALID_PILOT_ID')
 const fixtures=new Set(['qc_photo_live_pilot_intents/'+recordId,'qc_photo_live_pilot_records/'+recordId])
 const created=new Map()
 async function request(method,path,query='',body){
  const token=await accessToken()
  if(typeof token!=='string'||!token||/\s/.test(token))throw Error('GCLOUD_ACCESS_TOKEN_UNAVAILABLE')
  const r=await fetchImpl(root+'/'+path+query,{method,headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)}),signal:AbortSignal.timeout(20000),redirect:'error'})
  if(method==='GET'&&r.status===404)return null
  if(!r.ok)throw Error('FIRESTORE_'+method+'_HTTP_'+r.status)
  if(method==='DELETE')return null
  return r.json()
 }
 return {doc(path){
  const [collection,key,...rest]=path.split('/')
  const fixture=fixtures.has(path)
  if(rest.length||!id.test(key||'')||(!fixture&&!['users','role_access'].includes(collection)))throw Error('PILOT_PATH_DENIED')
  return {
   async get(){const row=await request('GET',path);return {data:()=>row?decodeFields(row.fields):undefined}},
   async create(data){
    if(!fixture||data?.testOnly!==true||created.has(path))throw Error('PILOT_WRITE_DENIED')
    const row=await request('POST',collection,'?documentId='+encodeURIComponent(key),{fields:encodeFields(data)})
    if(row?.name!=='projects/form-qc-unm/databases/(default)/documents/'+path||typeof row.updateTime!=='string'||!row.updateTime)throw Error('PILOT_CREATE_RESPONSE_INVALID')
    created.set(path,row.updateTime)
   },
   async delete(){
    if(!fixture||!created.has(path))throw Error('PILOT_DELETE_DENIED')
    await request('DELETE',path,'?currentDocument.updateTime='+encodeURIComponent(created.get(path)))
    created.delete(path)
   }
  }
 }}
}
