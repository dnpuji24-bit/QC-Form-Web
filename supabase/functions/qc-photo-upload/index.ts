// Candidate operational upload: requires an authorized existing QC or staging parent.
// Platform verify_jwt is disabled only because callers send Firebase JWTs; this
// handler verifies signature, audience, issuer, disabled/revoked state itself.
import { createRemoteJWKSet, jwtVerify } from 'npm:jose@6.1.0'
import { createClient } from 'npm:@supabase/supabase-js@2.80.0'

const projectId = 'form-qc-unm'
const storageUrl = 'https://mcfwnstdfhhtcbksgrlj.supabase.co'
const bucket = 'qc-photos-test'
const idPattern = /^[A-Za-z0-9_-]{1,160}$/
const jwks = createRemoteJWKSet(new URL('https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com'))
const allowedTypes: Record<string,string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }
const roles = new Set(['owner','manager','admin','asisten','mandor_spraying','mandor_fertilizer','pengunjung'])

type ServiceAccount = { project_id: string; client_email: string; private_key: string }
class RequestError extends Error {
  constructor(public status: number) { super('Request denied') }
}
const json = (status:number, data:unknown, origin?:string) => new Response(JSON.stringify(data), {
  status, headers: { 'Content-Type':'application/json; charset=utf-8',
    'Cache-Control':'no-store', 'X-Content-Type-Options':'nosniff', 'Referrer-Policy':'no-referrer',
    'Vary':'Origin', ...(origin ? { 'Access-Control-Allow-Origin':origin } : {}) },
})
function encode(value:string|Uint8Array) {
  const input = typeof value === 'string' ? new TextEncoder().encode(value) : value
  let binary = ''
  for (const b of input) binary += String.fromCharCode(b)
  return btoa(binary).replace(/=/g,'').replace(/\+/g,'-').replace(/\//g,'_')
}
async function googleAccessToken(service:ServiceAccount):Promise<string> {
  if (service.project_id !== projectId || service.client_email !== 'qc-photo-reader@form-qc-unm.iam.gserviceaccount.com') throw new RequestError(500)
  const raw = service.private_key.replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\s/g,'')
  const der = Uint8Array.from(atob(raw), character=>character.charCodeAt(0))
  const key = await crypto.subtle.importKey('pkcs8',der,{name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['sign'])
  const now = Math.floor(Date.now()/1000)
  const header = encode(JSON.stringify({alg:'RS256',typ:'JWT'}))
  const body = encode(JSON.stringify({
    iss:service.client_email,scope:'https://www.googleapis.com/auth/cloud-platform',
    aud:'https://oauth2.googleapis.com/token',iat:now,exp:now+300,
  }))
  const input = header+'.'+body
  const signature = new Uint8Array(await crypto.subtle.sign('RSASSA-PKCS1-v1_5',key,new TextEncoder().encode(input)))
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},
    body:new URLSearchParams({grant_type:'urn:ietf:params:oauth:grant-type:jwt-bearer',assertion:input+'.'+encode(signature)}),
    signal:AbortSignal.timeout(10000),
  })
  if (!response.ok) throw new RequestError(503)
  const result = await response.json()
  if (typeof result.access_token!=='string') throw new RequestError(503)
  return result.access_token
}
async function googleJson(url:string, oauth:string, body?:unknown):Promise<any|null> {
  const response = await fetch(url,{
    method:body===undefined?'GET':'POST',
    headers:{Authorization:'Bearer '+oauth,...(body===undefined?{}:{'Content-Type':'application/json'})},
    ...(body===undefined?{}:{body:JSON.stringify(body)}),signal:AbortSignal.timeout(10000),
  })
  if(response.status===404)return null
  if(!response.ok)throw new RequestError(503)
  return response.json()
}
const docPath = (path:string) => 'https://firestore.googleapis.com/v1/projects/'+projectId+'/databases/(default)/documents/'+path
function decodeFields(fields:Record<string,any>|undefined):Record<string,any>|null {
  if(!fields)return null
  const out:Record<string,any>={}
  for(const [key,value] of Object.entries(fields)){
    if ('stringValue' in value)out[key]=value.stringValue
    else if ('booleanValue' in value)out[key]=value.booleanValue
    else if ('integerValue' in value)out[key]=Number(value.integerValue)
    else if ('mapValue' in value)out[key]=decodeFields(value.mapValue.fields)||{}
  }
  return out
}
const counts = new Map<string,{count:number;reset:number}>()
function rateLimit(uid:string) {
  const now=Date.now()
  const old=counts.get(uid)
  const state=!old||old.reset<=now?{count:0,reset:now+60000}:old
  if (state.count>=30)return false
  state.count++
  counts.delete(uid)
  counts.set(uid,state)
  if(counts.size>3000)counts.delete(counts.keys().next().value!)
  return true
}

const operationalBucket='qc-photos'
const stagingId=/^qc-photo-staging-[A-Za-z0-9_-]{1,120}$/
const digest=async (bytes:Uint8Array)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new Uint8Array(bytes))),b=>b.toString(16).padStart(2,'0')).join('')
Deno.serve(async(request:Request)=>{
  const origin=request.headers.get('Origin')||''
  const allowed=Deno.env.get('PHOTO_ACCESS_ALLOWED_ORIGIN')||''
  if(!allowed||origin!==allowed)return json(403,{error:'FORBIDDEN'})
  if(request.method==='OPTIONS')return new Response(null,{status:204,headers:{
    'Access-Control-Allow-Origin':allowed,'Access-Control-Allow-Methods':'POST, OPTIONS',
    'Access-Control-Allow-Headers':'Authorization, Content-Type','Cache-Control':'no-store'
  }})
  if(request.method!=='POST')return json(405,{error:'METHOD_NOT_ALLOWED'},origin)
  try{
    const header=request.headers.get('Authorization')||''
    if(!/^Bearer [A-Za-z0-9_.-]+$/.test(header))throw new RequestError(401)
    const {payload}=await jwtVerify(header.slice(7),jwks,{audience:projectId,issuer:'https://securetoken.google.com/'+projectId,algorithms:['RS256'],requiredClaims:['exp','iat','sub','auth_time']})
    const uid=payload.sub
    if(typeof uid!=='string'||!idPattern.test(uid)||typeof payload.auth_time!=='number'||!Number.isInteger(payload.auth_time))throw new RequestError(401)
    if(!rateLimit(uid))throw new RequestError(429)
    const account=JSON.parse(Deno.env.get('GOOGLE_SERVICE_ACCOUNT_JSON')||'{}')
    const oauth=await googleAccessToken(account)
    const identity=await googleJson('https://identitytoolkit.googleapis.com/v1/projects/'+projectId+'/accounts:lookup',oauth,{localId:[uid]})
    const user=identity?.users?.[0],validSince=Number(user?.validSince||0)
    if(!user||user.disabled===true||!Number.isFinite(validSince)||payload.auth_time<validSince)throw new RequestError(401)
    const profile=decodeFields((await googleJson(docPath('users/'+uid),oauth))?.fields)
    if(!profile||profile.active!==true||!roles.has(profile.role))throw new RequestError(403)
    const rawLength=Number(request.headers.get('Content-Length')||0)
    if(rawLength>2900000)throw new RequestError(413)
    const reader=request.body?.getReader()
    if(!reader)throw new RequestError(400)
    const chunks:Uint8Array[]=[];let total=0
    while(true){const {done,value}=await reader.read();if(done)break;total+=value.length;if(total>2900000){await reader.cancel();throw new RequestError(413)}chunks.push(value)}
    const raw=new Uint8Array(total);let offset=0
    for(const chunk of chunks){raw.set(chunk,offset);offset+=chunk.length}
    let data:any
    try{data=JSON.parse(new TextDecoder().decode(raw))}catch{throw new RequestError(400)}
    if(!data||typeof data.recordId!=='string'||!idPattern.test(data.recordId)||
      !['spray','fertilizer'].includes(data.formType)||!['main','hold','scan'].includes(data.kind)||
      !Object.hasOwn(allowedTypes,data.contentType)||typeof data.base64!=='string'||
      !/^[A-Za-z0-9+/=]+$/.test(data.base64))throw new RequestError(400)
    if(data.baseRevision!==null&&(typeof data.baseRevision!=='string'||!idPattern.test(data.baseRevision)))throw new RequestError(400)
    if(typeof data.clientRevision!=='string'||!idPattern.test(data.clientRevision))throw new RequestError(400)
    const staging=stagingId.test(data.recordId)
    let parent=decodeFields((await googleJson(docPath((staging?'qc_photo_staging_records/':'qc_records/')+data.recordId),oauth))?.fields)
    if(!parent&&!staging&&data.baseRevision===null){
      parent=decodeFields((await googleJson(docPath('qc_photo_upload_intents/'+data.recordId),oauth))?.fields)
      if(!parent||parent.clientRevision!==data.clientRevision)throw new RequestError(409)
    }else if(!parent||parent.clientRevision!==data.baseRevision)throw new RequestError(409)
    if(parent.formType!==data.formType)throw new RequestError(409)
    if(staging&&parent.testOnly!==true)throw new RequestError(403)
    if(!staging&&data.recordId.startsWith('qc-operational-pilot-'))throw new RequestError(403)
    const template=decodeFields((await googleJson(docPath('role_access/'+profile.role),oauth))?.fields)
    const key=data.formType==='spray'?'qc_spraying':'qc_fertilizer'
    const edit=profile.role==='owner'||(template?.role===profile.role&&template?.permissions?.[key]==='edit')
    if(!edit||parent.ownerUid!==uid)throw new RequestError(403)
    if(data.kind==='hold'&&(typeof data.holdId!=='string'||!idPattern.test(data.holdId)))throw new RequestError(400)
    if(data.kind!=='hold'&&data.holdId!==undefined)throw new RequestError(400)
    let bytes:Uint8Array
    try{bytes=Uint8Array.from(atob(data.base64),c=>c.charCodeAt(0))}catch{throw new RequestError(400)}
    if(!bytes.length||bytes.length>2097152)throw new RequestError(413)
    const ascii=(start:number,end:number)=>String.fromCharCode(...bytes.slice(start,end))
    const validImage=data.contentType==='image/png'?bytes.length>=8&&bytes[0]===137&&ascii(1,4)==='PNG'&&bytes[4]===13&&bytes[5]===10&&bytes[6]===26&&bytes[7]===10:data.contentType==='image/jpeg'?bytes[0]===255&&bytes[1]===216&&bytes[2]===255:ascii(0,4)==='RIFF'&&ascii(8,12)==='WEBP'
    if(!validImage)throw new RequestError(400)
    const slot=data.kind==='hold'?'hold_'+data.holdId:data.kind
    const sha256=await digest(bytes),slotHash=await digest(new TextEncoder().encode(slot))
    const photoId=slotHash.slice(0,24)+'_'+sha256
    const path=uid+'/qc/'+data.recordId+'/'+photoId+'.'+allowedTypes[data.contentType]
    const secret=JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS')||'{}').default||Deno.env.get('SUPABASE_SECRET_KEY')||''
    if(!secret.startsWith('sb_secret_'))throw new RequestError(503)
    const storage=createClient(storageUrl,secret,{auth:{persistSession:false,autoRefreshToken:false}}).storage.from(operationalBucket)
    // No overwrite, and even a duplicate must match the expected bytes.
    await storage.upload(path,new Blob([new Uint8Array(bytes)],{type:data.contentType}),{contentType:data.contentType,upsert:false})
    const downloaded=await storage.download(path)
    if(downloaded.error||!downloaded.data)throw new RequestError(502)
    const actual=new Uint8Array(await downloaded.data.arrayBuffer())
    if(actual.length!==bytes.length||await digest(actual)!==sha256)throw new RequestError(409)
    return json(200,{photoId,objectPath:path,sha256,size:bytes.length,bucket:operationalBucket},origin)
  }catch(error){
    const status=error instanceof RequestError?error.status:error instanceof Error&&/^(JWT|JWS)/.test(error.name)?401:500
    return json(status,{error:'REQUEST_FAILED'},origin)
  }
})
