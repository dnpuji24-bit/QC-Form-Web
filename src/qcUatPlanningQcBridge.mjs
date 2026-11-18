// Isolated revisioned planning -> existing synthetic QC lifecycle adapter. No I/O.
import {currentPlanningRow} from './qcUatPlanningWriteContract.mjs'
import {validateSyntheticReceiptRecord} from './qcUatQcLifecycleContract.mjs'
const need=(ok,code)=>{if(!ok)throw Error(code)}
const sid=v=>typeof v==='string'&&/^uat-[a-z0-9-]{1,60}$/.test(v)
const exact=(v,keys)=>v&&Object.getPrototypeOf(v)===Object.prototype&&Reflect.ownKeys(v).length===keys.length&&keys.every(k=>Object.hasOwn(v,k)&&Object.hasOwn(Object.getOwnPropertyDescriptor(v,k),'value'))
export function planningQcInput(input){
 need(exact(input,['record','baseRevision','jobId','uploaderUid','expectedDailyRevision']),'INVALID_PLANNING_QC_REQUEST')
 const {record:r,expectedDailyRevision}=input
 need(r&&sid(r.id)&&sid(r.dailyPlanId)&&sid(r.clientRevision)&&['spray','fertilizer'].includes(r.formType),'INVALID_PLANNING_QC_RECORD')
 need(sid(input.uploaderUid)&&sid(input.jobId)&&(input.baseRevision===null||sid(input.baseRevision)),'INVALID_PLANNING_QC_REQUEST')
 need(Number.isSafeInteger(expectedDailyRevision)&&expectedDailyRevision>=0&&expectedDailyRevision<1000000,'INVALID_DAILY_REVISION')
 return input
}
export function planningQcSnapshot(input,daily,parent,uid){
 const q=planningQcInput(input),r=q.record
 need(q.uploaderUid===uid&&r.ownerUid===uid&&r.inputtedBy===uid,'QC_OWNER_ONLY')
 need(daily,'MISSING_DAILY_PLAN')
 currentPlanningRow('daily',r.dailyPlanId,daily)
 need(daily.status==='open','PLAN_CLOSED')
 need(daily.revision===q.expectedDailyRevision,'DAILY_REVISION_CONFLICT')
 if(daily.sourceType==='MONTHLY'){
  need(parent,'MONTHLY_PARENT_NOT_FOUND')
  currentPlanningRow('monthly',daily.monthlyPlanLineId,parent)
  need(parent.status==='open','MONTHLY_PARENT_CLOSED')
  need(parent.pid===daily.pid&&parent.activityId===daily.activityId,'MONTHLY_PARENT_MISMATCH')
  // Historical DP remains linked when MP period moves; do not reapply creation-time period constraint.
 }else need(parent==null,'UNEXPECTED_MONTHLY_PARENT')
 const snapshot=Object.fromEntries(['testOnly','dailyPlanId','monthlyPlanLineId','pid','date','shift','foreman','formType','area100'].map(k=>[k,daily[k]]))
 validateSyntheticReceiptRecord(r,snapshot,uid)
 return snapshot
}

// Explicit same-day shift 1 -> 2 only; source identity stays fixed.
// The legacy lifecycle accepts one execution snapshot, so project only the execution
// shift/foreman after validating the authoritative source DP independently.
export function planningCarryoverSnapshot(input,daily,parent,uid){
 const q=planningQcInput(input),r=q.record
 need(q.uploaderUid===uid&&r.ownerUid===uid&&r.inputtedBy===uid,'QC_OWNER_ONLY')
 need(daily,'MISSING_DAILY_PLAN')
 currentPlanningRow('daily',r.dailyPlanId,daily)
 need(daily.shift==='1'&&r.shift==='2'&&r.date===daily.date,'CARRYOVER_SESSION_DENIED')
 const source=planningQcSnapshot({...q,record:{...r,shift:daily.shift,foreman:daily.foreman}},daily,parent,uid)
 const execution={...source,shift:r.shift,foreman:r.foreman}
 validateSyntheticReceiptRecord(r,execution,uid)
 return execution
}
