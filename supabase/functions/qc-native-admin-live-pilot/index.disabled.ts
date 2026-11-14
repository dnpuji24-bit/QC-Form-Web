// Isolated synthetic pilot; Google OAuth reader is used only for identity checks.
import {createRemoteJWKSet,jwtVerify,importPKCS8,SignJWT} from 'npm:jose@6.1.0'
import {createAdminLivePilotHandler,commitSyntheticAdminPair} from './handler.mjs'
const project='form-qc-unm'
const reader='qc-photo-reader@form-qc-unm.iam.gserviceaccount.com'
const jwks=createRemoteJWKSet(new URL('https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com'))
// Deployment quarantine: no environment setting can enable this entrypoint.
const env=(name:string)=>name==='QC_NATIVE_ADMIN_LIVE_PILOT_ENABLED'?'false':Deno.env.get(name)
let cached:{value:string;expires:number}|undefined
async function accessToken(){
 if(cached&&cached.expires>Date.now()+30000)return cached.value
 const service=JSON.parse(env('GOOGLE_SERVICE_ACCOUNT_JSON')||'{}')
 if(service.project_id!==project||service.client_email!==reader||typeof service.private_key!=='string')throw Error('INVALID_READER')
 const key=await importPKCS8(service.private_key,'RS256')
 const assertion=await new SignJWT({scope:'https://www.googleapis.com/auth/cloud-platform'}).setProtectedHeader({alg:'RS256',typ:'JWT'}).setIssuer(reader).setAudience('https://oauth2.googleapis.com/token').setIssuedAt().setExpirationTime('5m').sign(key)
 const r=await fetch('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'urn:ietf:params:oauth:grant-type:jwt-bearer',assertion}),signal:AbortSignal.timeout(10000),redirect:'error'})
 if(!r.ok)throw Error('READER_UNAVAILABLE')
 const data=await r.json()
 if(typeof data.access_token!=='string'||!data.access_token||!Number.isFinite(data.expires_in)||data.expires_in<=0)throw Error('READER_UNAVAILABLE')
 cached={value:data.access_token,expires:Date.now()+Math.min(data.expires_in,300)*1000}
 return cached.value
}
async function readAccount(uid:string){
 const token=await accessToken()
 const r=await fetch('https://identitytoolkit.googleapis.com/v1/projects/'+project+'/accounts:lookup',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({localId:[uid]}),signal:AbortSignal.timeout(10000),redirect:'error'})
 if(!r.ok)throw Error('AUTH_LOOKUP_UNAVAILABLE')
 const data=await r.json()
 return data.users?.[0]??null
}
async function readProfile(uid:string){
 const token=await accessToken()
 const url=new URL('https://firestore.googleapis.com/v1/projects/'+project+'/databases/(default)/documents/users/'+encodeURIComponent(uid))
 for(const field of ['role','status','active','email'])url.searchParams.append('mask.fieldPaths',field)
 const r=await fetch(url,{method:'GET',headers:{Authorization:'Bearer '+token},signal:AbortSignal.timeout(10000),redirect:'error'})
 if(r.status===404)return null
 if(!r.ok)throw Error('PROFILE_UNAVAILABLE')
 const f=(await r.json()).fields
 return {role:f?.role?.stringValue,status:f?.status?.stringValue,active:f?.active?.booleanValue,email:f?.email?.stringValue}
}
Deno.serve(createAdminLivePilotHandler({env,verify:async(token:string)=>(await jwtVerify(token,jwks,{issuer:'https://securetoken.google.com/'+project,audience:project,algorithms:['RS256'],requiredClaims:['sub','iat','exp','auth_time'],clockTolerance:5})).payload,readAccount,readProfile,commitPair:commitSyntheticAdminPair}))
