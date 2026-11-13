// Stage 19F-A: read-only readiness. No administrative write routes exist.
import {isOperationalPhotoIdentityAllowed} from '../_shared/qcOperationalPhotoIdentity.mjs'
const uidPattern=/^[A-Za-z0-9_-]{1,128}$/
const paths=new Set(['/qc-native-admin-readiness','/functions/v1/qc-native-admin-readiness'])
const reply=(status,data,origin)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Vary':'Origin',...(origin?{'Access-Control-Allow-Origin':origin}:{})}})
export function createAdminReadinessHandler({env,verify,readAccount,readProfile,now=()=>Math.floor(Date.now()/1000)}){
 return async request=>{
  if(!paths.has(new URL(request.url).pathname))return reply(404,{error:'NOT_FOUND'})
  const origin=env('QC_NATIVE_ADMIN_READINESS_ORIGIN')||''
  let validOrigin=false
  try{const u=new URL(origin);validOrigin=u.protocol==='https:'&&u.origin===origin}catch{}
  if(!validOrigin)return reply(503,{error:'NOT_CONFIGURED'})
  if(request.headers.get('Origin')!==origin)return reply(403,{error:'FORBIDDEN'})
  if(request.method==='OPTIONS')return new Response(null,{status:204,headers:{'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Methods':'POST, OPTIONS','Access-Control-Allow-Headers':'Authorization','Cache-Control':'no-store','Vary':'Origin'}})
  if(request.method!=='POST')return reply(405,{error:'METHOD_NOT_ALLOWED'},origin)
  if(env('QC_NATIVE_ADMIN_READINESS_ENABLED')!=='true')return reply(503,{error:'READINESS_DISABLED'},origin)
  // A readiness request takes no command, target, body or parameters.
  if(request.body!==null||new URL(request.url).search)return reply(400,{error:'INVALID_REQUEST'},origin)
  const header=request.headers.get('Authorization')||''
  if(header.length>8192||!/^Bearer [A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(header))return reply(401,{error:'UNAUTHORIZED'},origin)
  let actor
  try{actor=await verify(header.slice(7))}catch{return reply(401,{error:'UNAUTHORIZED'},origin)}
  const uid=actor?.sub
  if(typeof uid!=='string'||!uidPattern.test(uid)||typeof actor.email!=='string'||!actor.email.trim()||!Number.isInteger(actor.auth_time)||actor.auth_time<=0||actor.auth_time>now()+5)return reply(401,{error:'UNAUTHORIZED'},origin)
  try{
   const account=await readAccount(uid)
   const validSince=Number(account?.validSince)
   if(!account||account.localId!==uid||account.disabled===true||!Number.isSafeInteger(validSince)||validSince<0||actor.auth_time<validSince)return reply(401,{error:'UNAUTHORIZED'},origin)
   const profile=await readProfile(uid)
   if(!isOperationalPhotoIdentityAllowed({uid,tokenEmail:actor.email,account,profile})||profile?.role!=='owner')return reply(403,{error:'OWNER_REQUIRED'},origin)
   return reply(200,{ok:true,role:'owner',profileVerified:true,writesEnabled:false},origin)
  }catch{return reply(503,{error:'READINESS_UNAVAILABLE'},origin)}
 }
}
