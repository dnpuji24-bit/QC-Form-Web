export type PlanMaterialLine={
  material:string
  dosePerHa:number
  doseUnit:string
  totalMaterial:number
  unit:string
}

export function planText(value:unknown){return value===null||value===undefined?'':String(value).trim()}
export function planNum(value:unknown){const n=Number(String(value??'').replace(',','.'));return Number.isFinite(n)?n:0}
export function planRowId(prefix='row'){return prefix+'_'+Date.now().toString(36)+'_'+Math.random().toString(36).slice(2,8)}
export function planHa(value:number,digits=2){return new Intl.NumberFormat('id-ID',{minimumFractionDigits:digits,maximumFractionDigits:digits}).format(value)+' Ha'}

export function readPlanDraft<T>(key:string,fallback:T):T{
  try{
    const raw=localStorage.getItem(key)
    if(!raw)return fallback
    const parsed=JSON.parse(raw) as T
    return parsed??fallback
  }catch{return fallback}
}

export function writePlanDraft(key:string,value:unknown){
  try{localStorage.setItem(key,JSON.stringify(value))}catch{}
}

export function clearPlanDraft(key:string){
  try{localStorage.removeItem(key)}catch{}
}

export function materialLinesFromComponents(components:unknown[],areaHa:number):PlanMaterialLine[]{
  if(!Array.isArray(components))return[]
  return components.map((item,index)=>{
    const row=(item&&typeof item==='object'?item:{}) as Record<string,unknown>
    const material=planText(row.activeIngredient||row.material||row.label||('Bahan '+(index+1)))
    const dosePerHa=planNum(row.dosePerHa||row.dosage)
    const unit=planText(row.unit)
    return{
      material,
      dosePerHa,
      doseUnit:unit,
      totalMaterial:Number((dosePerHa*Math.max(0,areaHa)).toFixed(4)),
      unit,
    }
  }).filter(row=>row.material&&row.dosePerHa>0)
}

export function aggregateMaterials(groups:PlanMaterialLine[][]){
  const map=new Map<string,PlanMaterialLine>()
  for(const group of groups)for(const row of group){
    const key=(row.material+'|'+row.unit).toLowerCase()
    const current=map.get(key)
    if(current)current.totalMaterial=Number((current.totalMaterial+row.totalMaterial).toFixed(4))
    else map.set(key,{...row})
  }
  return[...map.values()].sort((a,b)=>a.material.localeCompare(b.material))
}
