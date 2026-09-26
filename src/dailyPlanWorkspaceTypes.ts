export type SavedDailyMaterial={
  material:string
  dosePerHa:number
  doseUnit:string
  totalMaterial:number
  unit:string
}

export type SavedDailyRow={
  id:string
  dailyPlanId:string
  workGroupId:string
  workGroupPidCount:number
  planningOrder:number
  sourcePlanIdRaw:string
  sourceType:string
  monthlyLinkStatus:string
  monthlyPlanLineId:string
  date:string
  monthKey:string
  shift:string
  activity:string
  description:string
  paddockRaw:string
  pid:string
  areaHa:number
  areaUnit:string
  manpower:number
  unitName:string
  unitReady:number
  unitStandby:number
  unitBreakdown:number
  foreman:string
  notes:string
  companyCode:string
  farm:string
  stage:string
  masterVariety:string
  masterPending:boolean
  materials:SavedDailyMaterial[]
  lastModifiedSource:string
}

export type SavedDailyGroup={
  groupKey:string
  workGroupId:string
  planningOrder:number
  date:string
  shift:string
  sourceType:string
  activity:string
  description:string
  manpower:number
  unitName:string
  unitReady:number
  unitStandby:number
  unitBreakdown:number
  foreman:string
  notes:string
  rows:SavedDailyRow[]
}

export type DailyComposerRequest=
  |{mode:'edit-saved';group:SavedDailyGroup}
  |{mode:'duplicate-saved';group:SavedDailyGroup}
  |null

export function savedDailyGroupKey(row:SavedDailyRow){
  return row.workGroupId||row.dailyPlanId
}

export function groupSavedDailyRows(rows:SavedDailyRow[]):SavedDailyGroup[]{
  const map=new Map<string,SavedDailyRow[]>()
  for(const row of rows){
    const key=savedDailyGroupKey(row),list=map.get(key)||[]
    list.push(row);map.set(key,list)
  }
  return[...map.entries()].map(([groupKey,groupRows])=>{
    const ordered=[...groupRows].sort((a,b)=>a.pid.localeCompare(b.pid,undefined,{numeric:true}))
    const first=ordered[0]
    const orders=ordered.map(x=>x.planningOrder).filter(x=>x>0)
    return{
      groupKey,
      workGroupId:first.workGroupId||groupKey,
      planningOrder:orders.length?Math.min(...orders):999999,
      date:first.date,
      shift:first.shift,
      sourceType:first.sourceType,
      activity:first.activity,
      description:first.description,
      manpower:first.manpower,
      unitName:first.unitName,
      unitReady:first.unitReady,
      unitStandby:first.unitStandby,
      unitBreakdown:first.unitBreakdown,
      foreman:first.foreman,
      notes:first.notes,
      rows:ordered,
    }
  }).sort((a,b)=>a.shift.localeCompare(b.shift,undefined,{numeric:true})||a.planningOrder-b.planningOrder||a.activity.localeCompare(b.activity))
}
