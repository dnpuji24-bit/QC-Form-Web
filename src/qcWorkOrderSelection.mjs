/* Pure explicit QC WO selection. No browser, Firestore or TypeScript compiler
 * dependencies; shared with the operational QC forms and regression tests.
 */
const text=v=>String(v??'').trim()
const normalize=v=>text(v).normalize('NFKD')
  .replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('id-ID')
export function qcWorkOrderPlansByKind(rows,date,matchesKind){
  if(!date)return[]
  return rows.filter(row=>row.date===date&&matchesKind(row)
    &&Boolean(text(row.woNumber))&&Boolean(text(row.dailyPlanId)))
}
export function qcSelectedWorkOrder(rows,selectedId){
  if(!selectedId)return null
  const matches=rows.filter(row=>row.dailyPlanId===selectedId)
  return matches.length===1?matches[0]:null
}
export function qcSearchWorkOrders(rows,query,limit=12){
  const terms=normalize(query).split(/\s+/).filter(Boolean)
  const whole=terms.join(' ')
  return rows.map(row=>{
    const wo=normalize(row.woNumber)
    const hay=[row.woNumber,row.pid,row.dailyPlanId,row.operationCode,
      row.coaCode,row.activity,row.description,row.department,row.shift]
      .map(normalize).join(' ')
    if(!text(row.woNumber)||!terms.every(term=>hay.includes(term)))return null
    const rank=!whole?4:wo===whole?0:wo.startsWith(whole)?1:
      normalize(row.dailyPlanId)===whole?2:3
    return{row,rank}
  }).filter(Boolean)
    .sort((a,b)=>a.rank-b.rank
      ||text(a.row.woNumber).localeCompare(text(b.row.woNumber),'id',{numeric:true})
      ||text(a.row.shift).localeCompare(text(b.row.shift),'id',{numeric:true})
      ||text(a.row.dailyPlanId).localeCompare(text(b.row.dailyPlanId),'id'))
    .slice(0,Math.max(1,limit)).map(entry=>entry.row)
}
export function qcMergeEligiblePlans(current,carryover,explicit){
  const byId=new Map()
  for(const row of [...current,...carryover,...explicit]){
    if(row.dailyPlanId&&!byId.has(row.dailyPlanId))byId.set(row.dailyPlanId,row)
  }
  return [...byId.values()]
}
