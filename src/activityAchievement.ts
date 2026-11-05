/** Aggregate a single operational activity from the same filtered Daily and Actual
 * records used by the Summary composition. One record contributes exactly once.
 * Matching is case/spacing/Unicode-insensitive; unrelated activities are excluded.
 */
export function activityMatchKey(value:unknown):string{
  return String(value??'').normalize('NFKC')
    .replace(/[\u200B-\u200D\uFEFF]/g,'').replace(/\u00A0/g,' ')
    .replace(/\s+/g,' ').trim().toLocaleLowerCase('id-ID')
}
export type PlanAreaRow={activity:string;areaHa:number}
export type ActualAreaRow={activity:string;actualAreaHa:number}
export type ActivityAchievement={
  activity:string;plan:number;actual:number;percentage:number|null;
  remaining:number;over:number;planRecords:number;actualRecords:number
}
function positiveArea(value:number):number{return Number.isFinite(value)?Math.max(0,value):0}
export function calculateActivityAchievement(
  selectedActivity:string,
  dailyRows:readonly PlanAreaRow[],
  actualRows:readonly ActualAreaRow[],
):ActivityAchievement{
  const activityKey=activityMatchKey(selectedActivity)
  const daily=dailyRows.filter(row=>activityMatchKey(row.activity||'Tanpa Activity')===activityKey)
  const actual=actualRows.filter(row=>activityMatchKey(row.activity||'Tanpa Activity')===activityKey)
  const plan=daily.reduce((sum,row)=>sum+positiveArea(row.areaHa),0)
  const completed=actual.reduce((sum,row)=>sum+positiveArea(row.actualAreaHa),0)
  return{
    activity:selectedActivity,plan,actual:completed,
    percentage:plan>0?completed/plan*100:null,
    remaining:Math.max(0,plan-completed),over:Math.max(0,completed-plan),
    planRecords:daily.length,actualRecords:actual.length,
  }
}
/** Normalized activity names are merged, but display labels retain their first spelling. */
export function aggregateActivityShares(
  rows:readonly {activity:string;value:number}[],
):Array<{activity:string;value:number}>{
  const groups=new Map<string,{activity:string;value:number}>()
  for(const row of rows){
    const label=row.activity||'Tanpa Activity',key=activityMatchKey(label)
    const existing=groups.get(key)
    const value=positiveArea(row.value)
    if(existing)existing.value+=value
    else groups.set(key,{activity:label,value})
  }
  return [...groups.values()].filter(row=>row.value>0)
    .sort((a,b)=>b.value-a.value||a.activity.localeCompare(b.activity,undefined,{numeric:true}))
}

/**
 * Monthly Plan is the sole target source. Actual comes from precisely matched
 * linked Actual reports plus manual monthly progress (the Monthly Plan list
 * reconciliation convention). Daily scheduling is never added to the target.
 */
export type MonthlyAchievementPlanRow={
  planLineId:string;pid:string;activity:string;description:string;
  targetAreaHa:number;manualActualAreaHa:number;cancelled:boolean
}
export type MonthlyAchievementActualRow={
  id:string;monthlyPlanLineId:string;pid:string;activity:string;description:string;actualAreaHa:number
}
export type MonthlyActivityAchievement=ActivityAchievement&{
  manual:number;linked:number;unmatchedActualRecords:number;monthlyPlanLines:number
}
function linkKey(value:unknown){
  return activityMatchKey(value).replace(/[^a-z0-9]/g,'')
}
export function calculateMonthlyActivityAchievement(
  selectedActivity:string,
  monthlyRows:readonly MonthlyAchievementPlanRow[],
  linkedActualRows:readonly MonthlyAchievementActualRow[],
  identityRows:readonly MonthlyAchievementPlanRow[]=monthlyRows,
):MonthlyActivityAchievement{
  const key=activityMatchKey(selectedActivity)
  // Identity must be checked against every plan line in this month, including
  // other weeks/activities hidden by the dashboard filters.
  const allActive=identityRows.filter(row=>!row.cancelled)
  const selected=monthlyRows.filter(row=>!row.cancelled&&activityMatchKey(row.activity||row.description||'Tanpa Activity')===key)
  const plan=selected.reduce((sum,row)=>sum+positiveArea(row.targetAreaHa),0)
  const manual=selected.reduce((sum,row)=>sum+positiveArea(row.manualActualAreaHa),0)
  // Evaluate each actual once against ALL monthly lines in the scope, not just
  // the currently selected activity. This prevents assigning an ambiguous PID
  // and plan-line link to the wrong activity.
  let linked=0,actualRecords=0,unmatchedActualRecords=0
  const seenIds=new Set<string>()
  const selectedSet=new Set(selected)
  for(const actual of linkedActualRows){
    if(seenIds.has(actual.id))continue
    seenIds.add(actual.id)
    const matches=allActive.filter(row=>linkKey(row.planLineId)===linkKey(actual.monthlyPlanLineId)
      &&linkKey(row.pid)===linkKey(actual.pid)
      &&Boolean(linkKey(row.planLineId)&&linkKey(row.pid)))
    if(!matches.length)continue
    const matchingLabel=matches.filter(row=>{
      const desc=linkKey(row.description||row.activity)
      const actDesc=linkKey(actual.description||actual.activity)
      return Boolean(desc&&actDesc&&desc===actDesc)
    })
    // Same identity rule as Monthly Plan reconciliation: if only one matching
    // monthly line exists, the explicit link is unambiguous. If multiple lines
    // share the same identifier and PID, require an exact description match.
    const candidates=matches.length===1?matches:matchingLabel
    if(candidates.length!==1){
      if(matches.some(row=>selectedSet.has(row)))unmatchedActualRecords++
      continue
    }
    if(!selectedSet.has(candidates[0]))continue
    linked+=positiveArea(actual.actualAreaHa)
    actualRecords++
  }
  const completed=linked+manual
  return{
    activity:selectedActivity,plan,actual:completed,
    percentage:plan>0?completed/plan*100:null,
    remaining:Math.max(0,plan-completed),over:Math.max(0,completed-plan),
    planRecords:selected.length,actualRecords,
    manual,linked,unmatchedActualRecords,monthlyPlanLines:selected.length,
  }
}
