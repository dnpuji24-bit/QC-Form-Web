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
