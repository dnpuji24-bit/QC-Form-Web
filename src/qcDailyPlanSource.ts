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
