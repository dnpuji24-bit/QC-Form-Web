// Aggregate validated plan summaries, never raw QC records or mixed physical/component hectares.
import {planningWeek} from './qcUatPlanningProgressContract.mjs'
const need=(ok,code)=>{if(!ok)throw Error(code)}
const qty=v=>{need(Number.isSafeInteger(v)&&v>=0,'INVALID_DASHBOARD_QUANTITY');return v}
const sum=xs=>qty(xs.reduce((a,b)=>a+qty(b),0))
const sid=v=>typeof v==='string'&&/^uat-[a-z0-9-]{1,60}$/.test(v)
export function dashboardRequest(q){
 need(q&&Object.getPrototypeOf(q)===Object.prototype&&Reflect.ownKeys(q).length===2&&['monthKey','week'].every(k=>Object.hasOwn(q,k)&&Object.hasOwn(Object.getOwnPropertyDescriptor(q,k),'value')),'INVALID_DASHBOARD_REQUEST')
 need(['ALL','W1','W2','W3','W4'].includes(q.week),'INVALID_WEEK')
 const startDate=planningWeek(q.monthKey,q.week==='ALL'?'W1':q.week).startDate,endDate=planningWeek(q.monthKey,q.week==='ALL'?'W4':q.week).endDate
 return {monthKey:q.monthKey,week:q.week,startDate,endDate}
}
const byShift=rows=>Object.fromEntries(['1','2'].map(s=>[s,sum(rows.map(r=>r.actualByShift100[s]))]))
function materialTotals(rows){
 const groups=new Map()
 for(const r of rows)for(const m of r.materials){
  const key=JSON.stringify([m.materialId,m.material,m.unit,m.dose10000])
  if(!groups.has(key))groups.set(key,[])
  groups.get(key).push(m)
 }
 return [...groups.entries()].sort(([a],[b])=>a.localeCompare(b)).map(([,ms])=>{
  const {materialId,material,unit,dose10000}=ms[0]
  const targetArea100=sum(ms.map(m=>m.targetArea100)),actualArea100=sum(ms.map(m=>m.actualArea100)),unknownActualCount=sum(ms.map(m=>m.unknownActualCount)),knownActualMaterial1000000=sum(ms.map(m=>m.knownActualMaterial1000000)),standardMaterial1000000=sum(ms.map(m=>m.standardMaterial1000000))
  return {materialId,material,unit,dose10000,targetArea100,actualArea100,signedBalance100:targetArea100-actualArea100,remainingArea100:sum(ms.map(m=>m.remainingArea100)),overArea100:sum(ms.map(m=>m.overArea100)),plannedMaterial1000000:sum(ms.map(m=>m.plannedMaterial1000000)),standardMaterial1000000,knownActualMaterial1000000,unknownActualCount,actualMaterial1000000:unknownActualCount?null:knownActualMaterial1000000,varianceMaterial1000000:unknownActualCount?null:knownActualMaterial1000000-standardMaterial1000000,actualByShift100:byShift(ms)}
 })
}
function totals(rows,kind){
 const all=rows.filter(r=>r.kind===kind),active=all.filter(r=>!r.cancelled)
 const statusCounts=Object.fromEntries(['PLANNED','ON PROGRESS','DONE','OVER ACTUAL','CANCELLED'].map(s=>[s,all.filter(r=>r.status===s).length]))
 const targetArea100=sum(active.map(r=>r.targetArea100))
 const common={kind,planCount:all.length,activePlanCount:active.length,statusCounts,actualCount:sum(active.map(r=>r.actualCount)),draftCount:sum(active.map(r=>r.draftCount)),materials:materialTotals(active)}
 if(kind==='spray'){
  const actualArea100=sum(active.map(r=>r.actualArea100))
  return {...common,areaSemantics:'SCALAR_APPLICATION',targetArea100,actualArea100,signedBalance100:targetArea100-actualArea100,remainingArea100:sum(active.map(r=>r.remainingArea100)),overArea100:sum(active.map(r=>r.overArea100)),progressPct:targetArea100?actualArea100/targetArea100*100:null,actualByShift100:byShift(active)}
 }
 return {...common,areaSemantics:'APPLICATION_HA_ONLY',applicationArea100:sum(active.map(r=>r.applicationArea100)),applicationTargetArea100:sum(active.map(r=>r.applicationTargetArea100)),completedPlanCount:active.filter(r=>r.done===true).length}
}
export function dashboardTotals(rows){
 need(Array.isArray(rows)&&rows.length<=100&&new Set(rows.map(r=>r.id)).size===rows.length,'INVALID_DASHBOARD_ROWS')
 for(const r of rows)need(sid(r.id)&&['spray','fertilizer'].includes(r.kind)&&typeof r.cancelled==='boolean'&&Array.isArray(r.materials)&&r.areaSemantics===(r.kind==='spray'?'SCALAR_APPLICATION':'APPLICATION_HA_ONLY')&&(!r.cancelled||r.actualCount===0),'INVALID_DASHBOARD_ROW')
 const grouped=new Map()
 for(const r of rows){
  need(typeof r.activity==='string'&&typeof r.description==='string','INVALID_DASHBOARD_ROW')
  const k=JSON.stringify([r.kind,r.activity,r.description])
  if(!grouped.has(k))grouped.set(k,[])
  grouped.get(k).push(r)
 }
 return {spray:totals(rows,'spray'),fertilizer:totals(rows,'fertilizer'),activities:[...grouped.entries()].sort(([a],[b])=>a.localeCompare(b)).map(([k,rs])=>{const [kind,activity,description]=JSON.parse(k);return {activity,description,...totals(rs,kind)}})}
}
// Execution attribution has no assigned target; targets are attributed separately to source DP.
export function executionTotals(actuals){
 need(Array.isArray(actuals)&&actuals.length<=100&&new Set(actuals.map(a=>a.id)).size===actuals.length,'INVALID_DASHBOARD_ACTUALS')
 const groups=new Map()
 for(const a of actuals){
  need(sid(a.foreman)&&['1','2'].includes(a.shift)&&['spray','fertilizer'].includes(a.kind),'INVALID_DASHBOARD_ACTUAL')
  const k=JSON.stringify([a.foreman,a.shift,a.kind])
  if(!groups.has(k))groups.set(k,[])
  groups.get(k).push(a)
 }
 return [...groups.entries()].sort(([a],[b])=>a.localeCompare(b)).map(([k,rs])=>{const [foreman,shift,kind]=JSON.parse(k);return {foreman,shift,kind,actualCount:rs.length,...(kind==='spray'?{actualArea100:sum(rs.map(r=>r.actualArea100))}:{applicationArea100:sum(rs.map(r=>r.applicationArea100))})}})
}
