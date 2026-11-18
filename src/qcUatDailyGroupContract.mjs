// Synthetic atomic daily work group create contract. No SDK or production I/O.
import {nextPlanningRow} from './qcUatPlanningWriteContract.mjs'
const need=(ok,code)=>{if(!ok)throw Error(code)}
const exact=(v,k)=>need(v&&Object.getPrototypeOf(v)===Object.prototype&&Reflect.ownKeys(v).length===k.length&&k.every(x=>Object.hasOwn(v,x)&&Object.hasOwn(Object.getOwnPropertyDescriptor(v,x),'value')),'INVALID_GROUP_FIELDS')
const sid=v=>{need(typeof v==='string'&&/^uat-[a-z0-9-]{1,60}$/.test(v),'INVALID_SYNTHETIC_ID');return v}
const integer=(v,min,max)=>{need(Number.isSafeInteger(v)&&v>=min&&v<=max,'INVALID_GROUP_COUNT');return v}
const text=(v,max)=>{need(typeof v==='string'&&v===v.trim()&&v.length<=max,'INVALID_GROUP_TEXT');return v}
export function dailyGroupCreate(input,uid){
 exact(input,['workGroupId','planningOrder','date','shift','foreman','activityId','formType','sourceType','manpower','unitName','unitReady','unitStandby','unitBreakdown','notes','rows'])
 const workGroupId=sid(input.workGroupId);sid(uid)
 const resources={manpower:integer(input.manpower,0,10000),unitName:text(input.unitName,160),unitReady:integer(input.unitReady,0,10000),unitStandby:integer(input.unitStandby,0,10000),unitBreakdown:integer(input.unitBreakdown,0,10000)}
 need(resources.unitName!==''||resources.unitReady+resources.unitStandby+resources.unitBreakdown===0,'GROUP_UNIT_REQUIRED')
 const planningOrder=integer(input.planningOrder,1,100000),notes=text(input.notes,1000)
 need(Array.isArray(input.rows)&&input.rows.length>=1&&input.rows.length<=20&&Array.from({length:input.rows.length},(_,i)=>Object.hasOwn(input.rows,i)).every(Boolean),'INVALID_GROUP_SIZE')
 const common={date:input.date,shift:input.shift,foreman:input.foreman,activityId:input.activityId,formType:input.formType,sourceType:input.sourceType}
 const rows=input.rows.map(r=>{
  exact(r,['dailyPlanId','pid','monthlyPlanLineId','area100'])
  return nextPlanningRow('daily',{action:'create',id:r.dailyPlanId,expectedRevision:null,fields:{...common,pid:r.pid,monthlyPlanLineId:r.monthlyPlanLineId,area100:r.area100}},null,uid)
 })
 need(new Set(rows.map(r=>r.id)).size===rows.length,'DUPLICATE_DAILY_ID')
 need(new Set(rows.map(r=>r.pid)).size===rows.length,'DUPLICATE_GROUP_PID')
 const header={testOnly:true,workGroupId,revision:0,status:'open',createdBy:uid,updatedBy:uid,planningOrder,...common,...resources,notes,workGroupPidCount:rows.length,dailyPlanIds:rows.map(r=>r.id),totalArea100:rows.reduce((s,r)=>s+r.area100,0)}
 return {header,rows}
}
