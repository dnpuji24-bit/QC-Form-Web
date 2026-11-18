// Synthetic group lifecycle. Existing canonical member rows and membership IDs stay intact.
import {dailyGroupCreate} from './qcUatDailyGroupContract.mjs'
import {currentPlanningRow,nextPlanningRow} from './qcUatPlanningWriteContract.mjs'
const need=(ok,code)=>{if(!ok)throw Error(code)}
const exact=(v,ks)=>need(v&&Object.getPrototypeOf(v)===Object.prototype&&Reflect.ownKeys(v).length===ks.length&&ks.every(k=>Object.hasOwn(v,k)&&Object.hasOwn(Object.getOwnPropertyDescriptor(v,k),'value')),'INVALID_GROUP_FIELDS')
const sid=v=>{need(typeof v==='string'&&/^uat-[a-z0-9-]{1,60}$/.test(v),'INVALID_SYNTHETIC_ID');return v}
const rev=v=>{need(Number.isSafeInteger(v)&&v>=0&&v<1000000,'INVALID_GROUP_REVISION');return v}
const date=v=>{need(typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v),'INVALID_GROUP_DATE');const d=new Date(v+'T00:00:00Z');need(Number.isFinite(d.getTime())&&d.toISOString().slice(0,10)===v,'INVALID_GROUP_DATE');return v}
const dense=(a,min,max)=>Array.isArray(a)&&a.length>=min&&a.length<=max&&Array.from({length:a.length},(_,i)=>Object.hasOwn(a,i)).every(Boolean)
const common=['date','shift','foreman','activityId','formType','sourceType']
const resources=['manpower','unitName','unitReady','unitStandby','unitBreakdown','notes']
const pick=(o,ks)=>Object.fromEntries(ks.map(k=>[k,o[k]]))
const fields=['pid','activityId','sourceType','monthlyPlanLineId','date','shift','foreman','formType','area100']
export function groupHeaderIds(id,h){
 need(h,'GROUP_NOT_FOUND')
 exact(h,['testOnly','workGroupId','revision','status','createdBy','updatedBy','planningOrder',...common,...resources,'workGroupPidCount','dailyPlanIds','totalArea100'])
 need(h.testOnly===true&&h.workGroupId===sid(id)&&['open','cancelled'].includes(h.status),'INVALID_GROUP_HEADER')
 rev(h.revision);sid(h.createdBy);sid(h.updatedBy);date(h.date)
 need(dense(h.dailyPlanIds,1,20)&&h.dailyPlanIds.length===h.workGroupPidCount,'INVALID_GROUP_MEMBERS')
 h.dailyPlanIds.forEach(sid)
 need(new Set(h.dailyPlanIds).size===h.dailyPlanIds.length,'INVALID_GROUP_MEMBERS')
 return h.dailyPlanIds
}
export function validateGroupState(id,h,rows,members){
 const ids=groupHeaderIds(id,h)
 need(dense(rows,ids.length,ids.length)&&dense(members,ids.length,ids.length),'INVALID_GROUP_MEMBERS')
 for(let i=0;i<ids.length;i++){
  const r=rows[i],m=members[i]
  need(r&&m,'INVALID_GROUP_MEMBERS')
  currentPlanningRow('daily',ids[i],r)
  exact(m,['testOnly','dailyPlanId','workGroupId'])
  need(m.testOnly===true&&m.dailyPlanId===ids[i]&&m.workGroupId===id,'INVALID_GROUP_MEMBERS')
  need(r.status===h.status&&r.createdBy===h.createdBy&&common.every(k=>r[k]===h[k]),'GROUP_STATE_MISMATCH')
 }
 const rebuilt=dailyGroupCreate({workGroupId:id,planningOrder:h.planningOrder,...pick(h,common),...pick(h,resources),rows:rows.map(r=>({dailyPlanId:r.id,pid:r.pid,monthlyPlanLineId:r.monthlyPlanLineId,area100:r.area100}))},h.createdBy).header
 need(rebuilt.totalArea100===h.totalArea100,'GROUP_STATE_MISMATCH')
 return {header:h,rows}
}
export function groupMutationRequest(input){
 need(input&&['edit','cancel'].includes(input.action),'INVALID_GROUP_ACTION')
 exact(input,input.action==='edit'?['action','workGroupId','expectedRevision','fields']:['action','workGroupId','expectedRevision'])
 const q={action:input.action,workGroupId:sid(input.workGroupId),expectedRevision:rev(input.expectedRevision)}
 if(q.action==='edit'){
  const f=input.fields
  exact(f,['shift','foreman',...resources,'rows'])
  need(dense(f.rows,1,20),'INVALID_GROUP_MEMBERS')
  const rows=f.rows.map(r=>{exact(r,['dailyPlanId','area100']);return {dailyPlanId:sid(r.dailyPlanId),area100:r.area100}})
  need(new Set(rows.map(r=>r.dailyPlanId)).size===rows.length,'INVALID_GROUP_MEMBERS')
  q.fields={...pick(f,['shift','foreman',...resources]),rows}
 }
 return q
}
export function nextDailyGroup(input,h,rows,members,uid){
 const q=groupMutationRequest(input);sid(uid)
 validateGroupState(q.workGroupId,h,rows,members)
 need(h.revision===q.expectedRevision,'GROUP_REVISION_CONFLICT')
 need(h.status==='open','GROUP_CLOSED');need(h.revision<999999,'INVALID_GROUP_REVISION')
 let nextRows,nextHeader
 if(q.action==='edit'){
  const f=q.fields
  need(f.rows.length===rows.length&&rows.every(r=>f.rows.some(x=>x.dailyPlanId===r.id)),'GROUP_MEMBERSHIP_IMMUTABLE')
  const candidate=dailyGroupCreate({workGroupId:h.workGroupId,planningOrder:h.planningOrder,...pick(h,common),...pick(f,['shift','foreman',...resources]),rows:rows.map(r=>({dailyPlanId:r.id,pid:r.pid,monthlyPlanLineId:r.monthlyPlanLineId,area100:f.rows.find(x=>x.dailyPlanId===r.id).area100}))},uid)
  nextRows=rows.map((r,i)=>nextPlanningRow('daily',{action:'update',id:r.id,expectedRevision:r.revision,fields:pick(candidate.rows[i],fields)},r,uid))
  nextHeader={...candidate.header,createdBy:h.createdBy,revision:h.revision+1}
 }else{
  nextRows=rows.map(r=>nextPlanningRow('daily',{action:'cancel',id:r.id,expectedRevision:r.revision},r,uid))
  nextHeader={...h,status:'cancelled',revision:h.revision+1,updatedBy:uid}
 }
 return validateGroupState(q.workGroupId,nextHeader,nextRows,members)
}
export function groupReorderRequest(input){
 exact(input,['date','groups']);date(input.date)
 need(dense(input.groups,1,20),'INVALID_REORDER_SIZE')
 const groups=input.groups.map(g=>{exact(g,['workGroupId','expectedRevision']);return {workGroupId:sid(g.workGroupId),expectedRevision:rev(g.expectedRevision)}})
 need(new Set(groups.map(g=>g.workGroupId)).size===groups.length,'DUPLICATE_GROUP_ID')
 return {date:input.date,groups}
}
export function nextGroupOrder(input,headers,uid){
 const q=groupReorderRequest(input);sid(uid)
 need(Array.isArray(headers)&&headers.length===q.groups.length,'REORDER_SCOPE_MISMATCH')
 for(const h of headers){groupHeaderIds(h.workGroupId,h);need(h.status==='open'&&h.date===q.date,'REORDER_SCOPE_MISMATCH')}
 need(new Set(headers.map(h=>h.workGroupId)).size===headers.length,'REORDER_SCOPE_MISMATCH')
 return q.groups.map((g,i)=>{
  const h=headers.find(x=>x.workGroupId===g.workGroupId)
  need(h,'REORDER_SCOPE_MISMATCH');need(h.revision===g.expectedRevision,'GROUP_REVISION_CONFLICT')
  need(h.revision<999999,'INVALID_GROUP_REVISION')
  return {...h,planningOrder:i+1,revision:h.revision+1,updatedBy:uid}
 })
}
