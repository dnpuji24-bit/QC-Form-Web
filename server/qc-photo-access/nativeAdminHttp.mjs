import {executeNativeAdmin} from './nativeAdminService.mjs'
// HTTP adapter, deliberately separate from the read-only photo signer.
export function createNativeAdminHandler({db,auth,stamp,allowedOrigin,archiveEnabled=false,historicalEnabled=false}){
 if(!allowedOrigin||new URL(allowedOrigin).origin!==allowedOrigin)throw Error('INVALID_ORIGIN')
 return async(req,res)=>{
  const reply=(status,body)=>{res.statusCode=status;res.setHeader('Content-Type','application/json');res.end(JSON.stringify(body))}
  res.setHeader('Cache-Control','no-store');res.setHeader('Vary','Origin')
  if(req.headers.origin!==allowedOrigin)return reply(403,{error:'FORBIDDEN'})
  res.setHeader('Access-Control-Allow-Origin',allowedOrigin)
  res.setHeader('Access-Control-Allow-Headers','Authorization, Content-Type')
  res.setHeader('Access-Control-Allow-Methods','POST, OPTIONS')
  if(req.method==='OPTIONS'){res.statusCode=204;return res.end()}
  if(req.method!=='POST')return reply(405,{error:'METHOD_NOT_ALLOWED'})
  if(!/^application\/json(?:;|$)/i.test(req.headers['content-type']||''))return reply(415,{error:'INVALID_CONTENT_TYPE'})
  try{
   let size=0;const chunks=[]
   for await(const chunk of req){size+=chunk.length;if(size>16384)return reply(413,{error:'BODY_TOO_LARGE'});chunks.push(chunk)}
   let command;try{command=JSON.parse(Buffer.concat(chunks).toString('utf8'))}catch{return reply(400,{error:'INVALID_JSON'})}
   const result=await executeNativeAdmin({db,auth,authorization:req.headers.authorization,command,stamp,archiveEnabled,historicalEnabled})
   return reply(200,result)
  }catch(e){
   const code=String(e?.message||'')
   if(code==='AUTH_REQUIRED'||String(e?.code||'').startsWith('auth/'))return reply(401,{error:'UNAUTHORIZED'})
   if(['QC_ARCHIVE_DISABLED','QC_HISTORICAL_DISABLED'].includes(code))return reply(503,{error:code})
   if(code==='OWNER_REQUIRED')return reply(403,{error:code})
   if(['INVALID_COMMAND','INVALID_TARGET','INVALID_ROLE','INVALID_ACTIVE','INVALID_PERMISSIONS','INVALID_APPROVAL','INVALID_REVIEWER','INVALID_PROFILE','AUTH_IDENTITY_NOT_VERIFIED','DUPLICATE_USERNAME','ROLE_TEMPLATE_REQUIRED','TARGET_PROTECTED','QC_ALREADY_ARCHIVED','QC_ARCHIVE_CONFLICT','QC_HISTORICAL_REVIEW_REQUIRED','QC_REVISION_CONFLICT','QC_ACTUAL_LINK_CONFLICT','QC_RESTORE_CONFLICT','QC_HISTORICAL_CONFLICT','QC_HISTORICAL_INVALID_DATA'].includes(code))return reply(409,{error:code})
   return reply(500,{error:'ADMIN_REQUEST_FAILED'})
  }
 }
}
