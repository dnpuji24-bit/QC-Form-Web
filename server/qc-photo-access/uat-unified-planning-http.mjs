// 11D.5b: isolated same-project Planning+QC HTTP adapter, never mounted in production.
// Owner HTTP stays on 4497; this trusted Planning adapter listens only on 127.0.0.1:4697.
import {createServer} from 'node:http'
import {unifiedGuard,unifiedHost} from './uat-unified-identity-guard.mjs'
import {createPlanningService,createPlanningWriteService,createPlanningQcService,createPlanningQcSelectionService,createPlanningQcSourceService,createPlanningSprayCommitService,createPlanningFertilizerCommitService} from './uat-planning-role-service.mjs'
export const unifiedPlanningPort=4697
export const unifiedPlanningOrigin='http://'+unifiedHost+':'+unifiedPlanningPort
export const unifiedPaths=Object.freeze({
 check:'/uat/unified/planning/check',
 read:'/uat/unified/planning/read',
 mutate:'/uat/unified/planning/mutate',
 qcCommit:'/uat/unified/qc/commit',
 qcSource:'/uat/unified/qc/source',
 fullSource:'/uat/unified/qc/full/source',
 fullSprayCommit:'/uat/unified/qc/full/spray/commit',
 fullFertilizerCommit:'/uat/unified/qc/full/fertilizer/commit'
})
const exact=(v,ks)=>v&&Object.getPrototypeOf(v)===Object.prototype&&Reflect.ownKeys(v).length===ks.length&&ks.every(k=>Object.hasOwn(v,k))
function error(status,code){throw Object.assign(Error(code),{status})}
async function parseJson(req,maxBytes=8192){
 if(req.headers['content-type']!=='application/json')error(415,'JSON_REQUIRED')
 let size=0,chunks=[]
 for await(const chunk of req){size+=chunk.length;if(size>maxBytes)error(413,'BODY_TOO_LARGE');chunks.push(chunk)}
 try{return JSON.parse(Buffer.concat(chunks).toString('utf8'))}catch{error(400,'INVALID_JSON')}
}
function classify(e){
 const code=e?.message
 if(e?.status)return [e.status,code]
 if(code==='INVALID_TOKEN')return [401,'AUTH_REQUIRED']
 if(['UAT_IDENTITY_DENIED','PLANNING_PERMISSION_DENIED','QC_PERMISSION_DENIED','QC_OWNER_ONLY'].includes(code))return [403,'ACCESS_DENIED']
 if(code==='WRONG_PROJECT'||code==='UNIFIED_DEMO_EMULATORS_REQUIRED')return [503,'EMULATOR_GUARD_DENIED']
 if(typeof code==='string'&&/^(?:INVALID_|MISSING_|PLAN_|MONTHLY_|DAILY_|QC_|GROUP_)/.test(code))return [409,'CONTRACT_REJECTED']
 return [500,'SERVICE_UNAVAILABLE']
}
export function createUnifiedPlanningHttp({adb,authAdmin}){
 const boundProject=unifiedGuard()
 if(adb.projectId!==boundProject||authAdmin.app.options.projectId!==boundProject)error(503,'WRONG_PROJECT')
 const planner=createPlanningService({adb,authAdmin}),writer=createPlanningWriteService({adb,authAdmin}),qc=createPlanningQcService({adb,authAdmin}),selector=createPlanningQcSelectionService({adb,authAdmin}),fullSource=createPlanningQcSourceService({adb,authAdmin}),fullSpray=createPlanningSprayCommitService({adb,authAdmin}),fullFertilizer=createPlanningFertilizerCommitService({adb,authAdmin})
 return createServer(async(req,res)=>{
  res.setHeader('Content-Type','application/json; charset=utf-8')
  res.setHeader('Cache-Control','no-store')
  res.setHeader('X-Content-Type-Options','nosniff')
  const send=(status,data)=>{res.writeHead(status);res.end(JSON.stringify(data))}
  try{
   if(unifiedGuard()!==boundProject)error(503,'WRONG_PROJECT')
   if(req.headers.host!==unifiedHost+':'+unifiedPlanningPort||(req.headers.origin&&req.headers.origin!==unifiedPlanningOrigin))error(403,'ORIGIN_DENIED')
   if(!Object.values(unifiedPaths).includes(req.url))error(404,'ROUTE_DENIED')
   if(req.method!=='POST')error(405,'METHOD_DENIED')
   const auth=/^Bearer ([^\s]+)$/.exec(req.headers.authorization??'')
   if(!auth)error(401,'AUTH_REQUIRED')
   const fullSubmit=[unifiedPaths.fullSprayCommit,unifiedPaths.fullFertilizerCommit].includes(req.url)
   const input=await parseJson(req,fullSubmit?65536:8192)
   if(req.url===unifiedPaths.check){
    if(!exact(input,['scope','operation']))error(400,'INVALID_REQUEST')
    return send(200,{capability:await planner.check(auth[1],input.scope,input.operation)})
   }
   if(req.url===unifiedPaths.read){
    if(!exact(input,['scope','id']))error(400,'INVALID_REQUEST')
    return send(200,{plan:await planner.readPlan(auth[1],input.scope,input.id)})
   }
   if(req.url===unifiedPaths.mutate){
    if(!exact(input,['scope','request']))error(400,'INVALID_REQUEST')
    return send(200,{plan:await writer.mutate(auth[1],input.scope,input.request)})
   }
   if(req.url===unifiedPaths.qcSource){
    if(!exact(input,['request']))error(400,'INVALID_REQUEST')
    return send(200,{source:await selector.readSource(auth[1],input.request)})
   }
   if(req.url===unifiedPaths.fullSource){
    if(!exact(input,['request']))error(400,'INVALID_REQUEST')
    return send(200,{source:await fullSource.readSource(auth[1],input.request)})
   }
   if(req.url===unifiedPaths.fullSprayCommit){
    if(!exact(input,['request']))error(400,'INVALID_REQUEST')
    return send(200,{qc:await fullSpray.commit(auth[1],input.request)})
   }
   if(req.url===unifiedPaths.fullFertilizerCommit){
    if(!exact(input,['request']))error(400,'INVALID_REQUEST')
    return send(200,{qc:await fullFertilizer.commit(auth[1],input.request)})
   }
   if(req.url===unifiedPaths.qcCommit){
    if(!exact(input,['request']))error(400,'INVALID_REQUEST')
    return send(200,{qc:await qc.commit(auth[1],input.request)})
   }
   error(404,'ROUTE_DENIED')
  }catch(e){
   const [status,code]=classify(e)
   send(status,{error:code})
  }
 })
}
