// Filter only verified summaries. Organization comes from frozen source snapshots.
// Source assignment and actual executor are distinct views, never one mixed denominator.
import {dashboardRequest,dashboardTotals,executionTotals} from './qcUatPlanningDashboard.mjs'
const need=(ok,code)=>{if(!ok)throw Error(code)}
const sid=v=>typeof v==='string'&&/^uat-[a-z0-9-]{1,60}$/.test(v)
const label=v=>typeof v==='string'&&v.length>0&&v.length<=160&&v===v.trim()
const keys=['period','week','companyCode','farm','shift','foreman']
export function filteredDashboardRequest(q){
 need(q&&Object.getPrototypeOf(q)===Object.prototype&&Reflect.ownKeys(q).length===keys.length&&keys.every(k=>Object.hasOwn(q,k)&&Object.hasOwn(Object.getOwnPropertyDescriptor(q,k),'value')),'INVALID_DASHBOARD_FILTERS')
 need(typeof q.period==='string'&&/^20\d{2}(-(?:0[1-9]|1[0-2]))?$/.test(q.period),'INVALID_DASHBOARD_PERIOD')
 need(q.companyCode===null||sid(q.companyCode),'INVALID_DASHBOARD_COMPANY')
 need(q.farm===null||label(q.farm)&&q.companyCode!==null,'INVALID_DASHBOARD_FARM')
 need(q.shift===null||['1','2'].includes(q.shift),'INVALID_DASHBOARD_SHIFT')
 need(q.foreman===null||sid(q.foreman),'INVALID_DASHBOARD_FOREMAN')
 const annual=q.period.length===4
 need(!annual||q.week==='ALL','ANNUAL_WEEK_UNSUPPORTED')
 const dates=dashboardRequest({monthKey:annual?q.period+'-01':q.period,week:q.week})
 return {...q,startDate:dates.startDate,endDate:annual?q.period+'-12-31':dates.endDate,firstMonth:annual?q.period+'-01':q.period,lastMonth:annual?q.period+'-12':q.period,annual}
}
const matchesOrg=(q,r)=>{need(sid(r.companyCode)&&label(r.farm),'INVALID_DASHBOARD_ORGANIZATION');return (q.companyCode===null||q.companyCode===r.companyCode)&&(q.farm===null||q.farm===r.farm)}
const matchesWorker=(q,r)=>(q.shift===null||q.shift===r.shift)&&(q.foreman===null||q.foreman===r.foreman)
export function filteredDashboardTotals(q,monthly,daily){
 need(Array.isArray(monthly)&&monthly.length<=20&&Array.isArray(daily)&&daily.length<=30,'DASHBOARD_SCOPE_LIMIT')
 const ms=monthly.filter(r=>matchesOrg(q,r)),ds=daily.filter(x=>matchesOrg(q,x.summary))
 const plans=ds.map(x=>x.summary)
 const source=plans.filter(r=>matchesWorker(q,r))
 const all=ds.flatMap(x=>x.actuals)
 // Validate uniqueness across the entire organization cohort before selecting executors.
 executionTotals(all)
 const actuals=all.filter(a=>matchesWorker(q,a))
 return {monthly:dashboardTotals(ms),daily:dashboardTotals(plans),sourceDaily:dashboardTotals(source),executionByForemanShift:executionTotals(actuals),outOfPeriodDailyCount:ms.reduce((n,r)=>n+r.outOfPeriodDailyIds.length,0),sourceBasis:'ASSIGNED_DP_ALL_LINKED_ACTUAL',executionBasis:'ACTUAL_EXECUTOR_NO_TARGET',organizationBasis:'FROZEN_SOURCE_SNAPSHOT'}
}
