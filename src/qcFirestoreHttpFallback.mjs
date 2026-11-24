// Read-only fallback for Firestore WebChannel transport failures.
// Uses the *same* authenticated Firebase ID token, Firestore Security Rules,
// and optional Firebase App Check token as the SDK. Never uses Admin privileges.
const codeByStatus={400:'invalid-argument',401:'unauthenticated',403:'permission-denied',408:'deadline-exceeded',409:'aborted',429:'resource-exhausted',500:'internal',502:'unavailable',503:'unavailable',504:'deadline-exceeded'}

export function isRetryableFirestoreTransportError(error){
  const code=String(error?.code??'').replace(/^firestore\//,'')
  return code==='unavailable'||code==='deadline-exceeded'
}
export function decodeFirestoreValue(raw){
  if(!raw||typeof raw!=='object')return null
  if(Object.prototype.hasOwnProperty.call(raw,'stringValue'))return String(raw.stringValue)
  if(Object.prototype.hasOwnProperty.call(raw,'booleanValue'))return raw.booleanValue===true
  if(Object.prototype.hasOwnProperty.call(raw,'integerValue'))return Number(raw.integerValue)
  if(Object.prototype.hasOwnProperty.call(raw,'doubleValue'))return Number(raw.doubleValue)
  if(Object.prototype.hasOwnProperty.call(raw,'nullValue'))return null
  if(Object.prototype.hasOwnProperty.call(raw,'timestampValue'))return String(raw.timestampValue)
  if(Object.prototype.hasOwnProperty.call(raw,'mapValue'))
    return Object.fromEntries(Object.entries(raw.mapValue?.fields||{}).map(([key,value])=>[key,decodeFirestoreValue(value)]))
  if(Object.prototype.hasOwnProperty.call(raw,'arrayValue'))
    return (raw.arrayValue?.values||[]).map(value=>decodeFirestoreValue(value))
  return null
}
export function decodeFirestoreDocument(json){
  if(!json||typeof json!=='object'||typeof json.fields!=='object')return null
  return Object.fromEntries(Object.entries(json.fields).map(([key,value])=>[key,decodeFirestoreValue(value)]))
}
export async function fetchFirestoreDocumentViaREST({
  projectId,databaseId='(default)',collection,documentId,idToken,
  appCheckToken='',fetchImpl=fetch,timeoutMs=12000
}){
  if(!/^[a-z][a-z0-9-]{3,50}$/i.test(projectId)||
     !/^\(default\)$|^[a-z0-9-]{1,50}$/i.test(databaseId)||
     !/^[a-zA-Z_][a-zA-Z0-9_]{0,70}$/.test(collection)||
     !/^[A-Za-z0-9_-]{1,128}$/.test(documentId)||
     typeof idToken!=='string'||!idToken)throw Object.assign(new Error('Invalid server verification parameters'),{code:'invalid-argument'})
  const url='https://firestore.googleapis.com/v1/projects/'+encodeURIComponent(projectId)+
    '/databases/'+encodeURIComponent(databaseId)+'/documents/'+
    encodeURIComponent(collection)+'/'+encodeURIComponent(documentId)
  const headers={Authorization:'Bearer '+idToken}
  if(appCheckToken)headers['X-Firebase-AppCheck']=appCheckToken
  const controller=new AbortController()
  const timer=setTimeout(()=>controller.abort(),timeoutMs)
  let response
  try{
    response=await fetchImpl(url,{method:'GET',headers,cache:'no-store',credentials:'omit',redirect:'error',signal:controller.signal})
  }catch{
    throw Object.assign(new Error('Firestore HTTPS transport unavailable'),{code:'unavailable'})
  }finally{clearTimeout(timer)}
  if(response.status===404)return undefined
  if(!response.ok)throw Object.assign(new Error('Firestore HTTPS returned '+response.status),{
    code:codeByStatus[response.status]||'unknown'
  })
  try{
    const data=decodeFirestoreDocument(await response.json())
    if(!data)throw Error('Missing Firestore fields')
    return data
  }catch{
    throw Object.assign(new Error('Invalid Firestore HTTPS response'),{code:'data-loss'})
  }
}
