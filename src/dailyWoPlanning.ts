/** Daily uses Monthly as authoritative WO source; planned shift is metadata,
 * never a restriction on actual shift selected by the foreman.
 */
export type DailyWoChoice={
  id:string;planLineId:string;woNumber:string;pid:string;activity:string;
  description:string;coaCode:string;operationCode:string;department:string;
  plannedShift:string;targetAreaHa:number;monthKey:string;week:string
}
export function normalizeWo(value:string):string{return String(value||'').trim().toUpperCase()}
export function searchDailyWo(rows:DailyWoChoice[],query:string,limit=12):DailyWoChoice[]{
  const q=normalizeWo(query)
  const match=rows.filter(row=>row.woNumber&&
    (!q||normalizeWo(row.woNumber).includes(q)||normalizeWo(row.pid).includes(q)||
      normalizeWo(row.operationCode).includes(q)))
  return match.sort((a,b)=>{
    const score=(r:DailyWoChoice)=>normalizeWo(r.woNumber)===q?0:normalizeWo(r.woNumber).startsWith(q)?1:2
    return score(a)-score(b)||b.monthKey.localeCompare(a.monthKey)
      ||a.woNumber.localeCompare(b.woNumber,'id',{numeric:true})
  }).slice(0,Math.max(1,limit))
}
export function dailyWoSnapshot(row:DailyWoChoice|undefined){
  return {
    woNumber:row?.woNumber||'',plannedShift:row?.plannedShift||'',
    coaCode:row?.coaCode||'',operationCode:row?.operationCode||'',
    department:row?.department||'',monthlyPlanLineId:row?.planLineId||'',
  }
}
export function shiftIsCrossOver(plannedShift:string,actualShift:string):boolean{
  return Boolean(plannedShift&&plannedShift!=='ALL'&&actualShift&&plannedShift!==actualShift)
}
