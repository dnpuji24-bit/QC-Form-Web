/** QC multi-paddock domain model. Pure validation and deterministic allocation.
 * One QC Unit document owns the session; every child Actual references an exact
 * Daily ID + work ID. Firestore Rules validate those links from the parent.
 */
export const MAX_QC_PADDOCKS=8
const trim=v=>String(v??'').trim()
const num=v=>{const n=Number(v);return Number.isFinite(n)?n:NaN}
const key=v=>trim(v).toLocaleLowerCase('id-ID')
export function qcWorkIdentity(work){return trim(work?.dailyPlanId)}
export function qcWorkMap(works){
  const out={}
  for(const work of works||[]){
    const id=trim(work.workId)
    if(id&&/^[A-Za-z0-9_-]{1,64}$/.test(id))out[id]={
      dailyPlanId:trim(work.dailyPlanId),
      monthlyPlanLineId:trim(work.monthlyPlanLineId),
      woNumber:trim(work.woNumber),
      pid:trim(work.pid),
      areaHa:num(work.areaHa),
    }
  }
  return out
}
export function qcMaterialSourceTotals(sources){
  const result=new Map()
  for(const item of sources||[]){
    const id=trim(item.id)
    if(!id||result.has(id))throw Error('QC_MULTI_SOURCE_DUPLICATE')
    result.set(id,{id,material:trim(item.material),unit:trim(item.unit),quantity:num(item.quantity)})
  }
  return result
}
export function validateQcMultiPaddock(works,sources,{ready=false,totalArea}={}){
  if(!Array.isArray(works)||works.length===0)return'Minimal satu paddock diperlukan.'
  if(works.length>MAX_QC_PADDOCKS)return'Maksimal '+MAX_QC_PADDOCKS+' paddock dalam satu unit.'
  const ids=new Set(),dailyIds=new Set()
  const allocations=new Map()
  let total=0
  let sourceMap
  try{sourceMap=qcMaterialSourceTotals(sources)}catch{return'Identitas pengisian material duplikat.'}
  for(const source of sourceMap.values()){
    if(!source.material||!source.unit||!Number.isFinite(source.quantity)||source.quantity<0)
      return'Material filling harus memiliki nama, satuan, dan jumlah valid.'
    allocations.set(source.id,0)
  }
  for(const [i,work] of works.entries()){
    const label='Paddock '+(i+1)
    if(!/^[A-Za-z0-9_-]{1,64}$/.test(trim(work.workId))||ids.has(work.workId))
      return label+': ID segmen tidak valid atau duplikat.'
    ids.add(work.workId)
    if(!trim(work.dailyPlanId)||!trim(work.pid)||!trim(work.activity))
      return label+': pilih Daily ID dengan PID dan Activity yang tercatat pada tanggal QC.'
    if(dailyIds.has(work.dailyPlanId))return label+': Daily Plan sudah digunakan. Edit pekerjaan sebelumnya.'
    dailyIds.add(work.dailyPlanId)
    if(!Number.isFinite(num(work.areaHa))||num(work.areaHa)<=0)
      return label+': luas aktual harus lebih dari 0.'
    if(ready&&!work.completed)return label+': klik Selesai Paddock sebelum Ready.'
    total+=num(work.areaHa)
    for(const [sourceId,quantity] of Object.entries(work.materialAllocations||{})){
      if(!sourceMap.has(sourceId))return label+': alokasi merujuk pengisian tidak tersedia.'
      if(!Number.isFinite(num(quantity))||num(quantity)<0)return label+': alokasi material tidak valid.'
      allocations.set(sourceId,(allocations.get(sourceId)||0)+num(quantity))
    }
  }
  if(ready){
    if(works.length<2)return'Mode Multi-Paddock membutuhkan minimal dua paddock; gunakan QC biasa jika hanya satu.'
    if(!Number.isFinite(num(totalArea))||Math.abs(total-num(totalArea))>0.005)
      return'Total luas unit tidak sama dengan jumlah luas per paddock.'
    for(const item of sourceMap.values()){
      const actual=allocations.get(item.id)||0
      if(Math.abs(actual-item.quantity)>0.02)
        return'Pengisian '+item.material+': alokasi '+actual.toFixed(2)+' '+item.unit+
          ' harus sama dengan total '+item.quantity.toFixed(2)+' '+item.unit+'.'
    }
  }
  return ''
}
export function allocateQcMaterial(works,sourceId,quantity){
  const valid=(works||[]).filter(work=>num(work.areaHa)>0)
  const area=valid.reduce((sum,w)=>sum+num(w.areaHa),0)
  const value=num(quantity)
  if(!Number.isFinite(value)||value<0||!area||!valid.length)return works
  let used=0
  return works.map(work=>{
    const idx=valid.findIndex(w=>w.workId===work.workId)
    if(idx<0)return work
    const allocated=idx===valid.length-1?Number((value-used).toFixed(3)):
      Number((value*num(work.areaHa)/area).toFixed(3))
    used+=allocated
    return {...work,materialAllocations:{...work.materialAllocations,[sourceId]:allocated}}
  })
}
export function qcActualWorkId(recordId,workId){
  if(!/^[A-Za-z0-9_-]{1,64}$/.test(trim(workId)))throw Error('QC_MULTI_INVALID_WORK_ID')
  return 'qcactual_'+recordId+'__'+workId
}
export function qcMultiMaterialRows(work,sources){
  const sourceMap=qcMaterialSourceTotals(sources)
  const out=[]
  for(const [sourceId,value] of Object.entries(work.materialAllocations||{})){
    const source=sourceMap.get(sourceId),quantity=num(value)
    if(!source||!Number.isFinite(quantity)||quantity<=0)continue
    out.push({material:source.material,unit:source.unit,doseUnit:source.unit,
      dosePerHa:num(work.areaHa)>0?Number((quantity/num(work.areaHa)).toFixed(4)):0,
      totalMaterial:quantity,sourceFillingId:sourceId})
  }
  return out
}
