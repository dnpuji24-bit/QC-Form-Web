/** Actual WO selection is scoped to a Daily Plan row. The WO planned shift
 * never overrides the independently chosen shift in the Actual record.
 */
export type ActualWoChoice={
  id:string;dailyPlanId:string;woNumber:string;plannedShift:string;
  dailyShift:string;pid:string;activity:string;description:string;
  operationCode:string;coaCode:string;department:string;
  date:string;areaHa:number;doneHa:number
}
export function normalizeActualWo(value:string):string{
  return String(value||'').normalize('NFKC').trim().toLocaleLowerCase('id-ID')
}
export function searchActualWo(items:ActualWoChoice[],text:string,limit=12):ActualWoChoice[]{
  const tokens=normalizeActualWo(text).split(/\s+/).filter(Boolean)
  const all=items.filter(item=>item.woNumber)
  const scored=all.map(item=>{
    const wo=normalizeActualWo(item.woNumber),activity=normalizeActualWo(item.activity)
    const haystack=[item.woNumber,item.dailyPlanId,item.pid,item.activity,
      item.description,item.operationCode,item.coaCode,item.department,item.dailyShift]
      .map(normalizeActualWo).join(' ')
    if(!tokens.every(term=>haystack.includes(term)))return null
    const q=tokens.join(' ')
    const score=wo===q?0:wo.startsWith(q)?1:
      normalizeActualWo(item.dailyPlanId)===q?2:activity.startsWith(q)?3:4
    return{item,score}
  }).filter((v):v is {item:ActualWoChoice;score:number}=>v!==null)
  scored.sort((a,b)=>a.score-b.score||a.item.woNumber.localeCompare(b.item.woNumber,'id',{numeric:true})||
    a.item.dailyShift.localeCompare(b.item.dailyShift,'id',{numeric:true})||
    a.item.dailyPlanId.localeCompare(b.item.dailyPlanId,'id'))
  return scored.slice(0,Math.max(1,limit)).map(v=>v.item)
}
export function actualShiftSnapshot(selected:{
  woNumber?:string;plannedShift?:string;coaCode?:string;
  operationCode?:string;department?:string;shift:string
},actualShift:string){
  return{woNumber:selected.woNumber||'',plannedShift:selected.plannedShift||'',
    coaCode:selected.coaCode||'',operationCode:selected.operationCode||'',
    department:selected.department||'',dailyShift:selected.shift,
    shift:actualShift}
}
export function isActualCrossShift(plannedShift:string,actualShift:string){
  return Boolean(plannedShift&&actualShift&&plannedShift!==actualShift)
}
