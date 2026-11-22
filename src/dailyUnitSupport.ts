/** Support equipment required for one Daily Plan work group.
 * Stored once on each PID row for backwards-compatible reads; counts are
 * evaluated by workGroupId, not multiplied by the number of paddocks.
 */
export type SupportUnitRequirement={
  id:string
  unitName:string
  unitRequired:number
  unitPreferredCodes:string[]
  notes:string
}
export function supportUnitRows(raw:unknown):SupportUnitRequirement[]{
  if(!Array.isArray(raw))return[]
  return raw.map((item,index)=>{
    const x=(item&&typeof item==='object'?item:{}) as Record<string,unknown>
    const unitName=String(x.unitName??'').trim()
    const n=Number(x.unitRequired)
    return{
      id:String(x.id||'support-'+index),
      unitName,
      unitRequired:Number.isFinite(n)&&n>=0?Math.floor(n):0,
      unitPreferredCodes:Array.isArray(x.unitPreferredCodes)?
        [...new Set(x.unitPreferredCodes.map(v=>String(v||'').trim()).filter(Boolean))]:[],
      notes:String(x.notes??'').trim()
    }
  }).filter(x=>x.unitName||x.unitRequired>0||x.unitPreferredCodes.length>0)
}
export function allUnitCodes(primary:string[],support:SupportUnitRequirement[]){
  return [...primary,...support.flatMap(s=>s.unitPreferredCodes)].map(x=>x.trim()).filter(Boolean)
}
export function duplicateUnitCode(primary:string[],support:SupportUnitRequirement[]){
  const seen=new Set<string>()
  for(const c of allUnitCodes(primary,support)){
    const id=c.toUpperCase()
    if(seen.has(id))return c
    seen.add(id)
  }
  return''
}
