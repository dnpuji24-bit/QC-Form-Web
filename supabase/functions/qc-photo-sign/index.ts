// Supabase Edge Function: Firebase ID Token -> current Firestore Data QC permission
// -> temporary signed URL to an EXISTING private QC photo. Not deployed by this commit.
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
  if (service.project_id !== projectId || !service.client_email.endsWith('.iam.gserviceaccount.com')) throw new RequestError(500)
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
Deno.serve(async (request:Request)=>{
  const expectedOrigin=Deno.env.get('PHOTO_ACCESS_ALLOWED_ORIGIN')||''
  const origin=request.headers.get('Origin')||''
  const cors=origin&&origin===expectedOrigin?origin:undefined
  if(!/^https:\/\/[^/]+$/.test(expectedOrigin))return json(503,{error:'NOT_CONFIGURED'})
  if(origin!==expectedOrigin)return json(403,{error:'FORBIDDEN'})
  if(request.method==='OPTIONS')return new Response(null,{status:204,headers:{
    'Access-Control-Allow-Origin':expectedOrigin,'Access-Control-Allow-Methods':'POST, OPTIONS',
    'Access-Control-Allow-Headers':'Authorization, Content-Type',
    'Access-Control-Max-Age':'300','Cache-Control':'no-store',
  }})
  if(request.method!=='POST')return json(405,{error:'METHOD_NOT_ALLOWED'},cors)
  try{
    const tokenHeader=request.headers.get('Authorization')||''
    if(!/^Bearer [A-Za-z0-9_.-]+$/.test(tokenHeader))throw new RequestError(401)
    const jwt=tokenHeader.slice(7)
    const verified=await jwtVerify(jwt,jwks,{audience:projectId,issuer:'https://securetoken.google.com/'+projectId,
      algorithms:['RS256'],clockTolerance:5})
    const uid=verified.payload.sub
    if(typeof uid!=='string'||!idPattern.test(uid)||(typeof verified.payload.auth_time !== 'number' || !Number.isInteger(verified.payload.auth_time)))throw new RequestError(401)
    if(!rateLimit(uid))throw new RequestError(429)
    const raw=await request.text()
    if(raw.length>1024)throw new RequestError(413)
    let data:any
    try{data=JSON.parse(raw)}catch{throw new RequestError(400)}
    if(!data||typeof data!=='object'||Object.keys(data).sort().join(',')!=='photoId,recordId'||
      !idPattern.test(data.recordId)||!idPattern.test(data.photoId))throw new RequestError(400)
    const secret=Deno.env.get('SUPABASE_SECRET_KEY')||''
    const accountText=Deno.env.get('GOOGLE_SERVICE_ACCOUNT_JSON')||''
    if(!secret.startsWith('sb_secret_')||!accountText)throw new RequestError(503)
    let account:ServiceAccount
    try{account=JSON.parse(accountText)}catch{throw new RequestError(503)}
    const oauth=await googleAccessToken(account)
    // Firebase Auth authoritative lookup checks disabled state & token revocation.
    const identity=await googleJson('https://identitytoolkit.googleapis.com/v1/projects/'+projectId+'/accounts:lookup',
      oauth,{localId:[uid]})
    const userAccount=identity?.users?.[0]
    const validSince=Number(userAccount?.validSince||0)
    if(!userAccount||userAccount.disabled===true||!Number.isFinite(validSince)||
      Number(verified.payload.auth_time)<validSince)throw new RequestError(401)
    const [u,q,p]=await Promise.all([
      googleJson(docPath('users/'+uid),oauth),
      googleJson(docPath('qc_records/'+data.recordId),oauth),
      googleJson(docPath('qc_photo_metadata/'+data.recordId+'/photos/'+data.photoId),oauth),
    ])
    const profile=decodeFields(u?.fields),qc=decodeFields(q?.fields),photo=decodeFields(p?.fields)
    if(!profile||profile.active!==true||!roles.has(profile.role))throw new RequestError(403)
    if(profile.role!=='owner'){
      const role=decodeFields((await googleJson(docPath('role_access/'+profile.role),oauth))?.fields)
      if(!role||!['view','edit'].includes(role.permissions?.qc_records))throw new RequestError(403)
    }
    if(!qc||!['spray','fertilizer'].includes(qc.formType)||!photo||
      photo.photoId!==data.photoId||photo.qcRecordId!==data.recordId||
      photo.provider!=='supabase'||photo.bucket!==bucket||
      !idPattern.test(photo.ownerUid||'')||photo.ownerUid!==qc.ownerUid||
      !['main','hold','scan'].includes(photo.kind)||
      !Object.hasOwn(allowedTypes,photo.contentType))throw new RequestError(403)
    const prefix=photo.ownerUid+'/qc/'+data.recordId+'/'
    if(typeof photo.objectPath!=='string'||!photo.objectPath.startsWith(prefix))throw new RequestError(403)
    const name=photo.objectPath.slice(prefix.length)
    if(!new RegExp('^[A-Za-z0-9_-]+\\.'+allowedTypes[photo.contentType]+'$').test(name))throw new RequestError(403)
    const client=createClient(storageUrl,secret,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}})
    const {data:signed,error}=await client.storage.from(bucket).createSignedUrl(photo.objectPath,60)
    if(error||!signed?.signedUrl)throw new RequestError(502)
    return json(200,{signedUrl:signed.signedUrl,expiresIn:60},cors)
  }catch(error){
    const status=error instanceof RequestError?error.status:500
    // Never send UID, recordId, signed URLs, Firebase/Supabase errors or credentials.
    return json(status,{error:status===403?'FORBIDDEN':status===401?'UNAUTHORIZED':'REQUEST_FAILED'},cors)
  }
})
