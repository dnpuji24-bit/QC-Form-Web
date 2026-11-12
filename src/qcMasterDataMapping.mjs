const txt=value=>String(value??'').trim()
const active=rows=>rows.filter(row=>row&&row.active!==false)
const names=values=>[...new Set(values.map(txt).filter(Boolean))].sort((a,b)=>a.localeCompare(b,undefined,{numeric:true}))
export function buildQcMasterData(resources,materials,paddocks,activities){
  const unitMap=Object.create(null)
  for(const unit of active(resources.units)){
    const name=txt(unit.name)
    if(!name)continue
    if(Object.hasOwn(unitMap,name))throw Error('Duplicate unit name: '+name)
    unitMap[name]=names(active(resources.unitNumbers).filter(row=>row.parentUnitId?row.parentUnitId===unit.id:txt(row.parentUnitName).toLowerCase()===name.toLowerCase()).map(row=>row.name))
  }
  const resourceNames=key=>names(active(resources[key]).map(row=>row.name))
  const materialRows=active(materials).filter(row=>txt(row.materialName)).map(row=>({material:txt(row.materialName),description:txt(row.category),slot:txt(row.category),unit:txt(row.unit)}))
  return {names:resourceNames('foremen'),assistants:resourceNames('assistants'),shifts:resourceNames('shifts'),unitMap,dropper:resourceNames('droppers'),nozzles:resourceNames('nozzles'),waterQualities:resourceNames('waterQualities'),weatherConditions:resourceNames('weatherConditions'),materials:materialRows,paddocks:names(active(paddocks).map(row=>row.pid)),activities:names(active(activities).map(row=>row.activity)),descriptions:names(active(activities).map(row=>row.description))}
}
