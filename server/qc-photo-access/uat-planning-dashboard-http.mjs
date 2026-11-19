// Loopback-only synthetic HTTP adapter. No production entrypoint or write routes.
import {createServer} from 'node:http'
import {guard,createPlanningFilteredDashboardService,host} from './uat-planning-role-service.mjs'
import {filteredDashboardRequest} from '../../src/qcUatPlanningDashboardFilters.mjs'
import {dashboardOrigin,dashboardPath} from '../../src/qcUatPlanningDashboardClient.mjs'
const port=4597,authority=host+':'+port
const html='<!doctype html><html lang="id"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Planning Dashboard UAT</title><link rel="stylesheet" href="/lab.css"><div id="root"></div><script type="module" src="/lab.js"></script></html>'
const csp="default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'"
const error=(res,status,code)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify({error:code}))}
const classify=e=>{
 const code=e?.message
 if(code==='INVALID_TOKEN')return [401,'AUTH_REQUIRED']
 if(['UAT_IDENTITY_DENIED','PLANNING_PERMISSION_DENIED'].includes(code))return [403,'ACCESS_DENIED']
 if(['DASHBOARD_SCOPE_LIMIT','SUMMARY_SCOPE_LIMIT'].includes(code))return [422,'SCOPE_LIMIT']
 if(typeof code==='string'&&/RECONCILIATION|INVALID_ACTUAL|ENRICHED_SOURCE|MISSING_|MISMATCH|INVALID_.*SNAPSHOT|CANCELLED_PLAN_HAS_ACTUAL/.test(code))return [409,'REVIEW_REQUIRED']
 return [500,'DASHBOARD_UNAVAILABLE']
}
async function body(req){
 let size=0,parts=[]
 for await(const chunk of req){size+=chunk.length;if(size>4096)throw Error('BODY_LIMIT');parts.push(chunk)}
 return JSON.parse(Buffer.concat(parts).toString('utf8'))
}
export function createDashboardHttpServer(deps,js,css){
 guard()
 const service=createPlanningFilteredDashboardService(deps)
 return createServer({requestTimeout:15000,headersTimeout:10000},async(req,res)=>{
  res.setHeader('Cache-Control','no-store')
  res.setHeader('Content-Security-Policy',csp)
  res.setHeader('X-Content-Type-Options','nosniff')
  res.setHeader('Referrer-Policy','no-referrer')
  if(req.headers.host!==authority||req.socket.remoteAddress!==host)return error(res,403,'ACCESS_DENIED')
  try{guard()}catch{return error(res,503,'DASHBOARD_UNAVAILABLE')}
  if(req.method==='GET'){
   const files={'/':[html,'text/html'],'/lab.js':[js,'text/javascript'],'/lab.css':[css,'text/css']}
   if(!Object.hasOwn(files,req.url))return error(res,404,'NOT_FOUND')
   const [data,type]=files[req.url];res.writeHead(200,{'Content-Type':type+'; charset=utf-8'});return res.end(data)
  }
  if(req.url!==dashboardPath)return error(res,404,'NOT_FOUND')
  if(req.method!=='POST')return error(res,405,'METHOD_NOT_ALLOWED')
  if(req.headers.origin!==dashboardOrigin)return error(res,403,'ACCESS_DENIED')
  const auth=req.headers.authorization
  if(typeof auth!=='string'||!/^Bearer [^\s]+$/.test(auth)||auth.length>16391)return error(res,401,'AUTH_REQUIRED')
  if(req.headers['content-type']!=='application/json')return error(res,415,'INVALID_FILTERS')
  if(Number(req.headers['content-length'])>4096)return error(res,413,'INVALID_FILTERS')
  let q
  try{q=await body(req);filteredDashboardRequest(q)}catch{return error(res,400,'INVALID_FILTERS')}
  try{const data=await service.readPeriod(auth.slice(7),q);res.writeHead(200,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify(data))}
  catch(e){const [status,code]=classify(e);error(res,status,code)}
 })
}
export async function listenDashboard(server){
 guard()
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,host,resolve)})
 return server
}
