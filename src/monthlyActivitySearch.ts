/** Pure Monthly Activity search: one validation (ACT) row is one selectable
 * item; Operation Code disambiguates identical Activity names by department.
 */
export type MonthlyActivityChoice={
  id:string
  description:string
  activity:string
  activityCode:string
  department:string
  operationCode:string
  coaCode:string
  activityCategory:string
}
function normalize(value:string):string{
  return String(value||'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'')
    .toLocaleLowerCase('id-ID').replace(/[^a-z0-9]+/g,' ').trim()
}
export function searchMonthlyActivities(
  options:MonthlyActivityChoice[],query:string,limit=10
):MonthlyActivityChoice[]{
  const terms=normalize(query).split(/\s+/).filter(Boolean)
  const whole=terms.join(' ')
  const ranked=options.map(row=>{
    const description=normalize(row.description),activity=normalize(row.activity)
    const operation=normalize(row.operationCode),coa=normalize(row.coaCode),act=normalize(row.activityCode)
    const haystack=[description,activity,operation,coa,act,
      normalize(row.department),normalize(row.activityCategory)].join(' ')
    if(!terms.every(term=>haystack.includes(term)))return null
    const rank=!whole?4:operation===whole||act===whole?0
      :operation.startsWith(whole)||act.startsWith(whole)?1
      :description===whole||activity===whole?2
      :description.startsWith(whole)||activity.startsWith(whole)?3:4
    return {row,rank}
  }).filter((x):x is {row:MonthlyActivityChoice;rank:number}=>x!==null)
  ranked.sort((a,b)=>a.rank-b.rank
    ||a.row.description.localeCompare(b.row.description,'id')
    ||a.row.department.localeCompare(b.row.department,'id')
    ||a.row.operationCode.localeCompare(b.row.operationCode,'id')
    ||a.row.id.localeCompare(b.row.id))
  return ranked.slice(0,Math.max(1,limit)).map(x=>x.row)
}
/** Duplicate work rows are only duplicates if the same activity identity,
 * paddock, planned date, planned shift and variety selection repeat. A different WO can
 * legitimately schedule the same paddock/activity on another shift.
 */
export function monthlyWorkIdentity(row:{
  pid:string;masterActivityId:string;catalogActivityId:string;plannedShift:string;plannedDate?:string;varieties:string[]
}):string{
  return [normalize(row.pid),normalize(row.catalogActivityId||row.masterActivityId),
    row.plannedShift==='2'?'2':row.plannedShift==='ALL'?'ALL':'1',
    row.plannedDate||'',row.varieties.map(normalize).sort().join(',')].join('|')
}
