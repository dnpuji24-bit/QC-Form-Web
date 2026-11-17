// Synthetic write lifecycle only. No SDK, network, production imports or migration.
import {planningWeek} from './qcUatPlanningProgressContract.mjs'
const need=(ok,code)=>{if(!ok)throw Error(code)}
const exact=(v,ks)=>need(v&&Object.getPrototypeOf(v)===Object.prototype&&Reflect.ownKeys(v).length===ks.length&&ks.every(k=>Object.hasOwn(v,k)&&Object.hasOwn(Object.getOwnPropertyDescriptor(v,k),'value')),'INVALID_PLANNING_FIELDS')
const sid=v=>{need(typeof v==='string'&&/^uat-[a-z0-9-]{1,60}$/.test(v),'INVALID_SYNTHETIC_ID');return v}
const area=v=>{need(Number.isSafeInteger(v)&&v>0&&v<=10000000,'INVALID_PLANNING_AREA');return v}
const rev=v=>{need(Number.isSafeInteger(v)&&v>=0&&v<1000000,'INVALID_PLANNING_REVISION');return v}
const date=v=>{need(typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v),'INVALID_PLANNING_DATE');const t=new Date(v+'T00:00:00Z');need(Number.isFinite(t.getTime())&&t.toISOString().slice(0,10)===v,'INVALID_PLANNING_DATE');return v}
const fields={monthly:['pid','activityId','monthKey','week','targetArea100'],daily:['pid','activityId','sourceType','monthlyPlanLineId','date','shift','foreman','formType','area100']}
export function planFields(scope,input){
 need(Object.hasOwn(fields,scope),'INVALID_PLANNING_SCOPE');exact(input,fields[scope])
 const common={pid:sid(input.pid),activityId:sid(input.activityId)}
 if(scope==='monthly'){
  planningWeek(input.monthKey,input.week)
  return {...common,monthKey:input.monthKey,week:input.week,targetArea100:area(input.targetArea100)}
 }
 need(['MONTHLY','ADHOC','SUPPORT'].includes(input.sourceType),'INVALID_PLANNING_SOURCE')
 need(input.sourceType==='MONTHLY'?Boolean(input.monthlyPlanLineId):input.monthlyPlanLineId==='','INVALID_PLANNING_LINK')
 need(['1','2'].includes(input.shift)&&['spray','fertilizer'].includes(input.formType),'INVALID_PLANNING_EXECUTION')
 return {...common,sourceType:input.sourceType,monthlyPlanLineId:input.monthlyPlanLineId?sid(input.monthlyPlanLineId):'',date:date(input.date),shift:input.shift,foreman:sid(input.foreman),formType:input.formType,area100:area(input.area100)}
}
export function planningRequest(scope,input){
 need(Object.hasOwn(fields,scope),'INVALID_PLANNING_SCOPE')
 need(input&&['create','update','cancel'].includes(input.action),'INVALID_PLANNING_ACTION')
 exact(input,input.action==='cancel'?['action','id','expectedRevision']:['action','id','expectedRevision','fields'])
 const {action}=input,id=sid(input.id)
 need(action==='create'?input.expectedRevision===null:input.expectedRevision!==null,'INVALID_PLANNING_REVISION')
 return {action,id,expectedRevision:action==='create'?null:rev(input.expectedRevision),...(action==='cancel'?{}:{fields:planFields(scope,input.fields)})}
}
export function currentPlanningRow(scope,id,row){
 need(Object.hasOwn(fields,scope),'INVALID_PLANNING_SCOPE')
 exact(row,['testOnly','id','revision','status','createdBy','updatedBy',...fields[scope],...(scope==='daily'?['dailyPlanId']:['planLineId'])])
 need(row.testOnly===true&&row.id===id&&(scope==='daily'?row.dailyPlanId===id:row.planLineId===id)&&['open','cancelled'].includes(row.status),'INVALID_EXISTING_PLAN')
 sid(row.createdBy);sid(row.updatedBy);rev(row.revision)
 planFields(scope,Object.fromEntries(fields[scope].map(k=>[k,row[k]])))
 return row
}
export function nextPlanningRow(scope,request,current,uid){
 const q=planningRequest(scope,request);sid(uid)
 if(q.action==='create'){
  need(!current,'PLAN_ALREADY_EXISTS')
  return {testOnly:true,id:q.id,...(scope==='daily'?{dailyPlanId:q.id}:{planLineId:q.id}),revision:0,status:'open',createdBy:uid,updatedBy:uid,...q.fields}
 }
 need(current,'PLAN_NOT_FOUND');currentPlanningRow(scope,q.id,current)
 need(current.revision===q.expectedRevision,'PLANNING_REVISION_CONFLICT')
 need(current.status==='open','PLAN_CLOSED');need(current.revision<999999,'INVALID_PLANNING_REVISION')
 if(q.action==='update'){
  const immutable=scope==='monthly'?['pid','activityId']:['pid','activityId','sourceType','monthlyPlanLineId','formType']
  need(immutable.every(k=>current[k]===q.fields[k]),'PLANNING_IDENTITY_IMMUTABLE')
 }
 return {...current,...(q.fields||{}),revision:current.revision+1,status:q.action==='cancel'?'cancelled':'open',updatedBy:uid}
}
export function verifyMonthlyParent(daily,parent){
 need(parent,'MONTHLY_PARENT_NOT_FOUND')
 currentPlanningRow('monthly',daily.monthlyPlanLineId,parent)
 need(parent.status==='open','MONTHLY_PARENT_CLOSED')
 need(parent.pid===daily.pid&&parent.activityId===daily.activityId,'MONTHLY_PARENT_MISMATCH')
 // Existing plans may cross periods. New linked daily rows must be in the current MP period.
 const {startDate,endDate}=planningWeek(parent.monthKey,parent.week)
 need(daily.date>=startDate&&daily.date<=endDate,'MONTHLY_PARENT_PERIOD_MISMATCH')
 // No cap on daily target relative to MP or Actual relative to target.
}
