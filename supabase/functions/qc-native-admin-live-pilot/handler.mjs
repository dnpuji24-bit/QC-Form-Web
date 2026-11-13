// Stage 19F-C2C1: fixed synthetic pair only. No operational command routes.
import {isOperationalPhotoIdentityAllowed} from '../_shared/qcOperationalPhotoIdentity.mjs'
const uidPattern=/^[A-Za-z0-9_-]{1,128}$/
const paths=new Set(['/qc-native-admin-live-pilot','/functions/v1/qc-native-admin-live-pilot'])
const reply=(status,data,origin)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Vary':'Origin',...(origin?{'Access-Control-Allow-Origin':origin}:{})}})
export function createAdminLivePilotHandler({env,verify,readAccount,readProfile,commitPair,now=()=>Math.floor(Date.now()/1000)}){
 return async request=>{
  if(!paths.has(new URL(request.url).pathname))return reply(404,{error:'NOT_FOUND'})
  const origin=env('QC_NATIVE_ADMIN_LIVE_PILOT_ORIGIN')||''
  let validOrigin=false
  try{const u=new URL(origin);validOrigin=u.protocol==='https:'&&u.origin===origin}catch{}
  if(!validOrigin)return reply(503,{error:'NOT_CONFIGURED'})
  if(request.headers.get('Origin')!==origin)return reply(403,{error:'FORBIDDEN'})
  if(request.method==='OPTIONS')return new Response(null,{status:204,headers:{'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Methods':'POST, OPTIONS','Access-Control-Allow-Headers':'Authorization','Cache-Control':'no-store','Vary':'Origin'}})
  if(request.method!=='POST')return reply(405,{error:'METHOD_NOT_ALLOWED'},origin)
  if(env('QC_NATIVE_ADMIN_LIVE_PILOT_ENABLED')!=='true')return reply(503,{error:'ADMIN_PILOT_DISABLED'},origin)
  // The pilot takes no command, target, body or parameters.
  if(request.body!==null||new URL(request.url).search)return reply(400,{error:'INVALID_REQUEST'},origin)
  const header=request.headers.get('Authorization')||''
  if(header.length>8192||!/^Bearer [A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(header))return reply(401,{error:'UNAUTHORIZED'},origin)
  let actor
  try{actor=await verify(header.slice(7))}catch{return reply(401,{error:'UNAUTHORIZED'},origin)}
  const uid=actor?.sub
  if(typeof uid!=='string'||!uidPattern.test(uid)||typeof actor.email!=='string'||!actor.email.trim()||!Number.isInteger(actor.auth_time)||actor.auth_time<=0||actor.auth_time>now()+5)return reply(401,{error:'UNAUTHORIZED'},origin)
  try{
   const account=await readAccount(uid)
   const rawSince=account?.validSince
   const validSince=typeof rawSince==='string'&&/^\d+$/.test(rawSince)?Number(rawSince):typeof rawSince==='number'?rawSince:NaN
   if(!account||account.localId!==uid||account.disabled===true||!Number.isSafeInteger(validSince)||validSince<0||actor.auth_time<validSince)return reply(401,{error:'UNAUTHORIZED'},origin)
   const profile=await readProfile(uid)
   if(!isOperationalPhotoIdentityAllowed({uid,tokenEmail:actor.email,account,profile})||profile?.role!=='owner')return reply(403,{error:'OWNER_REQUIRED'},origin)
   if(now()-actor.auth_time>300)return reply(401,{error:'RECENT_AUTH_REQUIRED'},origin)
   const result=await commitPair({uid,token:header.slice(7)})
   if(result==='committed')return reply(200,{ok:true,testOnly:true,documentsCreated:2},origin)
   if(result==='denied')return reply(403,{error:'PILOT_WRITE_DENIED'},origin)
   return reply(503,{error:'PILOT_COMMIT_OUTCOME_UNKNOWN'},origin)
  }catch{return reply(503,{error:'ADMIN_PILOT_UNAVAILABLE'},origin)}
 }
}

// No caller-provided document paths, run ID, OAuth credential, or arbitrary writes.
const root='projects/form-qc-unm/databases/(default)/documents'
export async function commitSyntheticAdminPair({uid,token,fetchImpl=fetch}){
 if(typeof uid!=='string'||!uidPattern.test(uid)||typeof token!=='string'||!/^([A-Za-z0-9_-]+\.){2}[A-Za-z0-9_-]+$/.test(token)||token.length>8192)throw Error('INVALID_PILOT_IDENTITY')
 const runId=crypto.randomUUID().replaceAll('-','')
 const writes=['state','audit'].map(kind=>({update:{name:root+'/qc_admin_live_pilot_'+kind+'/'+uid,fields:{ownerUid:{stringValue:uid},runId:{stringValue:runId},kind:{stringValue:kind},testOnly:{booleanValue:true}}},currentDocument:{exists:false},updateTransforms:[{fieldPath:'createdAt',setToServerValue:'REQUEST_TIME'}]}))
 // Use the verified caller's Firebase ID token. Firestore Rules remain authoritative.
 // One attempt only; on ambiguous outcome the operator must read back, never blindly retry.
 try{
  const r=await fetchImpl('https://firestore.googleapis.com/v1/'+root+':commit',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({writes}),signal:AbortSignal.timeout(10000),redirect:'error'})
  if([400,401,403,404,409,412].includes(r.status))return 'denied'
  if(!r.ok)return 'unknown'
  const body=await r.json()
  return Array.isArray(body.writeResults)&&body.writeResults.length===2&&typeof body.commitTime==='string'&&body.commitTime?'committed':'unknown'
 }catch{return 'unknown'}
}
