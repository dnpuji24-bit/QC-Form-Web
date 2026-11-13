// Production HTTP routing for the independent native admin service.
// First release is read-only. No operational mutations unless explicitly enabled.
import {createNativeAdminHandler} from './nativeAdminHttp.mjs'
const norm=v=>String(v??'').trim().toLowerCase()
export function createNativeAdminRuntime({db,auth,stamp,allowedOrigin,writesEnabled=false,archiveEnabled=false,historicalEnabled=false,nameRequestsEnabled=false}){
 const origin=new URL(allowedOrigin)
 if(origin.protocol!=='https:'||origin.origin!==allowedOrigin)throw Error('INVALID_HTTPS_ORIGIN')
 if(!writesEnabled&&(archiveEnabled||historicalEnabled||nameRequestsEnabled))throw Error('WRITE_GATE_REQUIRED')
 const admin=createNativeAdminHandler({db,auth,stamp,allowedOrigin,archiveEnabled,historicalEnabled,nameRequestsEnabled})
 return async(req,res)=>{
  const reply=(status,data)=>{res.statusCode=status;res.setHeader('Content-Type','application/json');res.end(JSON.stringify(data))}
  res.setHeader('Cache-Control','no-store')
  res.setHeader('X-Content-Type-Options','nosniff')
  if(req.url==='/healthz'&&req.method==='GET')return reply(200,{ok:true,service:'qc-native-admin',writesEnabled})
  if(!['/native-admin','/native-admin/readiness'].includes(req.url))return reply(404,{error:'NOT_FOUND'})
  if(req.headers.origin!==allowedOrigin)return reply(403,{error:'FORBIDDEN'})
  res.setHeader('Vary','Origin')
  res.setHeader('Access-Control-Allow-Origin',allowedOrigin)
  res.setHeader('Access-Control-Allow-Headers','Authorization, Content-Type')
  res.setHeader('Access-Control-Allow-Methods','POST, OPTIONS')
  if(req.method==='OPTIONS'){res.statusCode=204;return res.end()}
  if(req.method!=='POST')return reply(405,{error:'METHOD_NOT_ALLOWED'})
  if(req.url==='/native-admin'){
   if(!writesEnabled)return reply(503,{error:'NATIVE_ADMIN_WRITES_DISABLED'})
   return admin(req,res)
  }
  const header=req.headers.authorization
  if(typeof header!=='string'||!/^Bearer [^\s]+$/.test(header))return reply(401,{error:'UNAUTHORIZED'})
  let actor
  try{actor=await auth.verifyIdToken(header.slice(7),true)}catch{return reply(401,{error:'UNAUTHORIZED'})}
  if(!actor?.uid||!actor.email)return reply(403,{error:'OWNER_REQUIRED'})
  try{
   const p=(await db.collection('users').doc(actor.uid).get()).data()
   if(!p||p.role!=='owner'||p.active!==true||!['approved','APPROVED'].includes(p.status)||norm(p.email)!==norm(actor.email))return reply(403,{error:'OWNER_REQUIRED'})
   return reply(200,{ok:true,role:'owner',profileVerified:true,writesEnabled})
  }catch{return reply(503,{error:'READINESS_UNAVAILABLE'})}
 }
}
