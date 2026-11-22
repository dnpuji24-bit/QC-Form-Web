export type UnitCondition='READY'|'BREAKDOWN'|'MAINTENANCE'|'PENDING_INSPECTION'|'OUT_OF_SERVICE'
export type UnitEventType='BREAKDOWN'|'MAINTENANCE'|'PENDING_INSPECTION'|'READY_APPROVED'
export type UnitNumber={id:string;code:string;kind:string;parentUnitId:string;active:boolean;brand:string;model:string;implement:string;notes:string}
export type UnitEvent={id:string;unitId:string;type:UnitEventType;effectiveMinute:number;note:string;actorUid:string;date:string;shift:string}
export type UnitAssignment={id:string;unitId:string;unitCode:string;workGroupId:string;date:string;shift:string;startTime:string;endTime:string;startMinute:number;endMinute:number;activity:string;woNumber:string;pids:string[];status:string;replacesAssignmentId?:string}
export type UnitRequirement={id:string;date:string;shift:string;workGroupId:string;activity:string;woNumber:string;pids:string[];unitName:string;quantity:number;preferred:string[]}
export const clean=(value:unknown)=>String(value??'').trim()
export const count=(value:unknown)=>Math.max(0,Math.floor(Number(value)||0))
export const key=(value:unknown)=>clean(value).toLowerCase().replace(/\s+/g,' ')
export const dateMinute=(date:string,time:string)=>{const d=Date.parse(date+'T00:00:00Z');const m=/^([01]\d|2[0-3]):([0-5]\d)$/.exec(time);if(!Number.isFinite(d)||!m)return NaN;return d/60000+Number(m[1])*60+Number(m[2])}
export function timeWindow(date:string,shift:string,start:string,end:string){
  const a=dateMinute(date,start),b=dateMinute(date,end),mid=dateMinute(date,'00:00')
  if(!Number.isFinite(a)||!Number.isFinite(b)||!Number.isFinite(mid))return null
  let from=a,to=b
  // Shift 2 includes the after-midnight hours on the following calendar day.
  if(shift==='2'&&from-mid<720)from+=1440
  if(to<=from)to+=1440
  if(to-from>1440||to<=from)return null
  return{startMinute:from,endMinute:to}
}
export function shiftWindow(date:string,shift:string){
  return timeWindow(date,shift,shift==='2'?'15:00':'06:00',shift==='2'?'03:00':'15:00')!
}
export function overlaps(a:{startMinute:number;endMinute:number},b:{startMinute:number;endMinute:number}){
  return a.startMinute<b.endMinute&&b.startMinute<a.endMinute
}
export function conditionAt(events:UnitEvent[],unitId:string,minute:number):UnitCondition{
  let latest:UnitEvent|undefined
  for(const event of events){
    if(event.unitId!==unitId||event.effectiveMinute>minute)continue
    if(!latest||event.effectiveMinute>latest.effectiveMinute||(event.effectiveMinute===latest.effectiveMinute&&event.id>latest.id))latest=event
  }
  if(!latest)return'READY'
  if(latest.type==='BREAKDOWN')return'BREAKDOWN'
  if(latest.type==='MAINTENANCE')return'MAINTENANCE'
  if(latest.type==='PENDING_INSPECTION')return'PENDING_INSPECTION'
  return'READY'
}
export function assignmentConflict(assignments:UnitAssignment[],unitId:string,range:{startMinute:number;endMinute:number},skipId=''){
  return assignments.find(a=>a.id!==skipId&&a.unitId===unitId&&a.status!=='CANCELLED'&&overlaps(a,range))
}
export function unitMatches(u:UnitNumber,requirement:UnitRequirement){
  return key(u.kind)===key(requirement.unitName) || (!!u.parentUnitId && key(u.parentUnitId)===key(requirement.unitName))
}
export function slotCoverage(requirement:UnitRequirement,assignments:UnitAssignment[],events:UnitEvent[]){
  const matching=assignments.filter(a=>a.workGroupId===requirement.workGroupId&&a.date===requirement.date&&a.shift===requirement.shift&&a.status!=='CANCELLED'&&a.status!=='REPLACED'&&conditionAt(events,a.unitId,a.startMinute)==='READY')
  return Math.min(requirement.quantity,new Set(matching.map(a=>a.unitId)).size)
}
export function normalizeUnitNumber(id:string,raw:Record<string,unknown>):UnitNumber{
  return{id,code:clean(raw.name||raw.code||id),kind:clean(raw.parentUnitName),parentUnitId:clean(raw.parentUnitId),active:raw.active!==false,brand:clean(raw.brand),model:clean(raw.model),implement:clean(raw.implement),notes:clean(raw.notes)}
}
export function normalizeAssignment(id:string,raw:Record<string,unknown>):UnitAssignment{
  return{id,unitId:clean(raw.unitId),unitCode:clean(raw.unitCode),workGroupId:clean(raw.workGroupId),date:clean(raw.date),shift:clean(raw.shift),startTime:clean(raw.startTime),endTime:clean(raw.endTime),startMinute:Number(raw.startMinute)||0,endMinute:Number(raw.endMinute)||0,activity:clean(raw.activity),woNumber:clean(raw.woNumber),pids:Array.isArray(raw.pids)?raw.pids.map(clean):[],status:clean(raw.status)||'ASSIGNED',replacesAssignmentId:clean(raw.replacesAssignmentId)}
}
export function normalizeEvent(id:string,raw:Record<string,unknown>):UnitEvent{
 return{id,unitId:clean(raw.unitId),type:clean(raw.type) as UnitEventType,effectiveMinute:Number(raw.effectiveMinute)||0,note:clean(raw.note),actorUid:clean(raw.actorUid),date:clean(raw.date),shift:clean(raw.shift)}
}
