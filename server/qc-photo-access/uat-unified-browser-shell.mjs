// 11D.5c.1 — local-only, same-origin UAT browser shell proxy.
// No production bootstrap, cloud credentials, Supabase, UAT Hosting or arbitrary outbound URL.
import {createServer} from 'node:http'
import {unifiedGuard,unifiedHost,unifiedAuthPort} from './uat-unified-identity-guard.mjs'
import {origin as ownerOrigin,paths as ownerPaths} from './uat-owner-permission-http.mjs'
import {unifiedPlanningOrigin,unifiedPaths} from './uat-unified-planning-http.mjs'
export const shellPort=4797
export const shellOrigin='http://'+unifiedHost+':'+shellPort
export const ownerPrefix='/api/owner'
export const planningPrefix='/api/planning'
const expandedRoutes=new Set([planningPrefix+unifiedPaths.fullSprayCommit,planningPrefix+unifiedPaths.fullFertilizerCommit])
export function shellRoute(path){
 if(typeof path!=='string'||path.includes('?')||path.includes('#'))return null
 const owner=Object.values(ownerPaths).find(p=>path===ownerPrefix+p)
 if(owner)return Object.freeze({target:ownerOrigin+owner,kind:'owner'})
 const planning=Object.values(unifiedPaths).find(p=>path===planningPrefix+p)
 if(planning)return Object.freeze({target:unifiedPlanningOrigin+planning,kind:'planning'})
 return null
}
function problem(status,code){throw Object.assign(Error(code),{status})}
async function bytes(req,maxBytes=8192){
 let total=0
 const chunks=[]
 for await(const chunk of req){
  total+=chunk.length
  if(total>maxBytes)problem(413,'BODY_TOO_LARGE')
  chunks.push(chunk)
 }
 return Buffer.concat(chunks)
}
export function createUnifiedBrowserShell(assets){
 const project=unifiedGuard()
 if(!(assets instanceof Map)||!assets.has('/'))throw Error('SHELL_ASSETS_REQUIRED')
 return createServer(async(req,res)=>{
  res.setHeader('Cache-Control','no-store')
  res.setHeader('Content-Type','application/json; charset=utf-8')
  res.setHeader('X-Content-Type-Options','nosniff')
  res.setHeader('Referrer-Policy','no-referrer')
  const send=(status,data)=>{res.writeHead(status);res.end(JSON.stringify(data))}
  try{
   if(unifiedGuard()!==project)problem(503,'WRONG_PROJECT')
   if(req.headers.host!==unifiedHost+':'+shellPort||(req.headers.origin&&req.headers.origin!==shellOrigin))problem(403,'ORIGIN_DENIED')
   const asset=assets.get(req.url)
   if(req.method==='GET'&&asset){
    res.setHeader('Content-Type',asset.type)
    res.setHeader('Content-Security-Policy',"default-src 'none'; script-src 'self'; connect-src 'self' http://127.0.0.1:"+unifiedAuthPort+"; style-src 'unsafe-inline'; img-src data:; base-uri 'none'; frame-ancestors 'none'; form-action 'none'")
    res.writeHead(200)
    return res.end(asset.body)
   }
   const mapped=shellRoute(req.url)
   if(!mapped)problem(404,'ROUTE_DENIED')
   if(req.method!=='POST')problem(405,'METHOD_DENIED')
   if(req.headers['content-type']!=='application/json')problem(415,'JSON_REQUIRED')
   const token=/^Bearer ([^\s]+)$/.exec(req.headers.authorization??'')
   if(!token||token[1].length>16384)problem(401,'AUTH_REQUIRED')
   const extended=expandedRoutes.has(req.url)
   const body=await bytes(req,extended?65536:8192)
   if(unifiedGuard()!==project)problem(503,'WRONG_PROJECT')
   // URL is a fixed exact allowlisted loopback destination, not a client-supplied proxy URL.
   const upstream=await fetch(mapped.target,{
    method:'POST',
    headers:{'Content-Type':'application/json',Authorization:'Bearer '+token[1]},
    body,redirect:'error',signal:AbortSignal.timeout(5000)
   })
   const data=await upstream.text()
   if(data.length>(extended?196608:65536))problem(502,'UPSTREAM_TOO_LARGE')
   res.writeHead(upstream.status)
   res.end(data)
  }catch(e){
   if(res.headersSent)return res.end()
   const status=[401,403,404,405,413,415,503].includes(e?.status)?e.status:502
   send(status,{error:status===502?'UPSTREAM_UNAVAILABLE':e.message})
  }
 })
}
