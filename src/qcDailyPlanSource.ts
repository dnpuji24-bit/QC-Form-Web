import { collection, getDocs, query, where } from 'firebase/firestore'
import { firestoreDb } from './firebase'

export type QcDailyMaterial={
  material:string
  dosePerHa:number
  doseUnit:string
  totalMaterial:number
  unit:string
}

export type QcDailyPlan={
  id:string
  dailyPlanId:string
  monthlyPlanLineId:string
  woNumber:string
  plannedShift:string
  operationCode:string
  coaCode:string
  department:string
  catalogActivityId:string
  activityCode:string
  companyCode:string
  farm:string
  date:string
  shift:string
  foreman:string
  pid:string
  activity:string
  description:string
  type:string
  activityCategory:string
  masterVariety:string
  areaHa:number
  sourceType:string
  unitName:string
  notes:string
  pidNotes:string
  planningOrder:number
  materials:QcDailyMaterial[]
}

const text=(value:unknown)=>String(value??'').trim()
const num=(value:unknown)=>{const n=Number(value??0);return Number.isFinite(n)?n:0}
const key=(value:unknown)=>text(value).toLowerCase().replace(/[_-]+/g,' ').replace(/\s+/g,' ').trim()
function shiftKey(value:unknown){
  const raw=key(value)
  if(!raw)return''
  const compact=raw.replace(/\s+/g,'')
  const aliases:Record<string,string>={
    '1':'1','01':'1','1.0':'1','shift1':'1','sh1':'1','s1':'1','i':'1','shifti':'1',
    '2':'2','02':'2','2.0':'2','shift2':'2','sh2':'2','s2':'2','ii':'2','shiftii':'2',
  }
  if(aliases[compact])return aliases[compact]
  const numeric=raw.match(/^(?:shift|sh|s)?\s*0*([12])(?:\.0+)?$/)
  return numeric?numeric[1]:raw
}
export function qcShiftValue(value:unknown){return shiftKey(value)}

function materials(value:unknown):QcDailyMaterial[]{
  if(!Array.isArray(value))return[]
  return value.map(item=>{
    const row=(item&&typeof item==='object'?item:{}) as Record<string,unknown>
    return{
      material:text(row.material||row.name),
      dosePerHa:num(row.dosePerHa||row.dosage),
      doseUnit:text(row.doseUnit||row.unit),
      totalMaterial:num(row.totalMaterial),
      unit:text(row.unit||row.doseUnit),
    }
  }).filter(row=>row.material)
}

export function qcDailyKind(row:QcDailyPlan):'spray'|'fertilizer'|'other'{
  const explicit=key([row.type,row.activityCategory].filter(Boolean).join(' '))
  if(/fertili|pupuk/.test(explicit))return'fertilizer'
  if(/spray|herbicide|insecticide|fungicide|pesticide/.test(explicit))return'spray'
  const label=key(row.description+' '+row.activity)
  if(/top dressing|single dressing|bassalt dressing|basalt dressing|basal dressing|fertili|pupuk/.test(label))return'fertilizer'
  if(/pre emergence|post emergence|knockdown|insecticide|herbicide|spray/.test(label))return'spray'
  return'other'
}

export async function loadQcDailyPlans(date:string):Promise<QcDailyPlan[]>{
  if(!firestoreDb||!date)return[]
  const snap=await getDocs(query(collection(firestoreDb,'daily_plans'),where('date','==',date)))
  return snap.docs.map(item=>{
    const row=item.data() as Record<string,unknown>
    return{
      id:item.id,
      dailyPlanId:text(row.dailyPlanId||item.id),
      monthlyPlanLineId:text(row.monthlyPlanLineId),
      woNumber:text(row.woNumber),
      plannedShift:text(row.plannedShift),
      operationCode:text(row.operationCode),
      coaCode:text(row.coaCode),
      department:text(row.department),
      catalogActivityId:text(row.catalogActivityId),
      activityCode:text(row.activityCode),
      companyCode:text(row.companyCode).toUpperCase(),
      farm:text(row.farm),
      date:text(row.date),
      shift:text(row.shift),
      foreman:text(row.foreman),
      pid:text(row.pid||row.paddockRaw).toUpperCase(),
      activity:text(row.activity),
      description:text(row.description||row.activity),
      type:text(row.type),
      activityCategory:text(row.activityCategory),
      masterVariety:text(row.masterVariety),
      areaHa:num(row.areaHa),
      sourceType:text(row.sourceType),
      unitName:text(row.unitName),
      notes:text(row.notes),
      pidNotes:text(row.pidNotes),
      planningOrder:num(row.planningOrder),
      materials:materials(row.materials),
    }
  }).filter(row=>row.pid&&row.activity)
    .sort((a,b)=>shiftKey(a.shift).localeCompare(shiftKey(b.shift),undefined,{numeric:true})||a.planningOrder-b.planningOrder||a.pid.localeCompare(b.pid,undefined,{numeric:true}))
}

export function dailyPlansForQc(rows:QcDailyPlan[],kind:'spray'|'fertilizer',shift:string){
  const selectedShift=shiftKey(shift)
  return rows.filter(row=>{
    if(qcDailyKind(row)!==kind)return false
    const rowShift=shiftKey(row.shift)
    return !selectedShift||!rowShift||rowShift===selectedShift
  })
}

export function resolveQcDailyPlan(rows:QcDailyPlan[],pid:string,activity:string,description=''){
  const p=key(pid),a=key(activity),d=key(description)
  const matches=rows.filter(row=>key(row.pid)===p&&key(row.activity)===a&&(!d||key(row.description)===d))
  return matches.sort((x,y)=>x.planningOrder-y.planningOrder||x.dailyPlanId.localeCompare(y.dailyPlanId,undefined,{numeric:true}))[0]||null
}

export function qcDailyPlanLabel(row:QcDailyPlan){
  return `${row.pid} — ${row.description||row.activity} — ${row.dailyPlanId}`
}


// Strict session mapping is opt-in. Existing legacy callers keep their behavior.
const sessionKey=(value:unknown)=>text(value).toLowerCase().replace(/\s+/g,' ')
export function dailyPlansForQcSession(rows:QcDailyPlan[],kind:'spray'|'fertilizer',date:string,shift:string,foreman:string){
  const s=shiftKey(shift),f=sessionKey(foreman),d=text(date)
  if(!d||!s||!f)return[]
  return rows.filter(row=>qcDailyKind(row)===kind&&row.date===d&&shiftKey(row.shift)===s&&sessionKey(row.foreman)===f&&Boolean(row.dailyPlanId))
}
export function qcSessionPlanMatches(rows:QcDailyPlan[],pid:string,activity:string,description:string){
  if(!text(pid)||!text(activity)||!text(description))return[]
  return rows.filter(row=>sessionKey(row.pid)===sessionKey(pid)&&sessionKey(row.activity)===sessionKey(activity)&&sessionKey(row.description)===sessionKey(description))
}
export function resolveQcSessionPlan(rows:QcDailyPlan[],pid:string,activity:string,description:string,selectedId:string){
  if(!selectedId||rows.filter(row=>row.dailyPlanId===selectedId).length!==1)return null
  return qcSessionPlanMatches(rows,pid,activity,description).find(row=>row.dailyPlanId===selectedId)||null
}


// Carry-over candidates are not automatically selected or a verified balance.
// Source DP and actual session are independent; only same-date 1 -> 2 is allowed here.
export function qcShiftOneCarryoverCandidates(rows:QcDailyPlan[],kind:'spray'|'fertilizer',date:string,actualShift:string,actualForeman:string){
  if(shiftKey(actualShift)!=='2'||!text(date)||!sessionKey(actualForeman))return[]
  return rows.filter(row=>qcDailyKind(row)===kind&&row.date===text(date)&&shiftKey(row.shift)==='1'&&Boolean(sessionKey(row.foreman))&&Boolean(row.dailyPlanId))
}


/** WO is selected explicitly by Daily ID; planned shift never constrains
 * execution shift. Only Daily records for the QC session date and form kind
 * are eligible. Legacy records without WO remain in the existing picker.
 */
export function qcWorkOrderPlans(rows:QcDailyPlan[],kind:'spray'|'fertilizer',date:string):QcDailyPlan[]{
  return rows.filter(row=>row.date===date&&qcDailyKind(row)===kind
    &&Boolean(row.woNumber.trim())&&Boolean(row.dailyPlanId))
}

function searchToken(value:unknown):string{
  return text(value).normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('id-ID').trim()
}
export function qcSearchWorkOrders(rows:QcDailyPlan[],query:string,limit=12):QcDailyPlan[]{
  const tokens=searchToken(query).split(/\s+/).filter(Boolean)
  const whole=tokens.join(' ')
  return rows.map(row=>{
    const wo=searchToken(row.woNumber)
    const hay=[row.woNumber,row.pid,row.dailyPlanId,row.operationCode,
      row.coaCode,row.activity,row.description,row.department,row.shift]
      .map(searchToken).join(' ')
    if(!row.woNumber||!tokens.every(t=>hay.includes(t)))return null
    const rank=!whole?4:wo===whole?0:wo.startsWith(whole)?1:
      searchToken(row.dailyPlanId)===whole?2:3
    return {row,rank}
  }).filter((entry):entry is {row:QcDailyPlan;rank:number}=>entry!==null)
    .sort((a,b)=>a.rank-b.rank
      ||a.row.woNumber.localeCompare(b.row.woNumber,'id',{numeric:true})
      ||a.row.shift.localeCompare(b.row.shift,'id',{numeric:true})
      ||a.row.dailyPlanId.localeCompare(b.row.dailyPlanId,'id'))
    .slice(0,Math.max(1,limit)).map(item=>item.row)
}
export function qcExplicitWorkOrderPlan(
  allRows:QcDailyPlan[],kind:'spray'|'fertilizer',date:string,selectedId:string
):QcDailyPlan|null{
  if(!selectedId)return null
  const matches=qcWorkOrderPlans(allRows,kind,date)
    .filter(row=>row.dailyPlanId===selectedId)
  return matches.length===1?matches[0]:null
}
/** Preserve existing same-shift and legacy carry-over results, then include
 * only explicitly linked WO rows. Deduplicate by Daily ID before QC validates.
 */
export function qcMergeEligiblePlans(
  current:QcDailyPlan[],carryover:QcDailyPlan[],explicit:QcDailyPlan[]
):QcDailyPlan[]{
  const byId=new Map<string,QcDailyPlan>()
  for(const row of [...current,...carryover,...explicit]){
    if(row.dailyPlanId&&!byId.has(row.dailyPlanId))byId.set(row.dailyPlanId,row)
  }
  return [...byId.values()]
}
