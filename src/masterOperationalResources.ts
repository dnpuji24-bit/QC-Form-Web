import { collection, getDocs } from 'firebase/firestore'
import { firestoreDb } from './firebase'

export type OperationalResourceKind=
  |'unit'
  |'unit_number'
  |'nozzle'
  |'dropper'
  |'shift'
  |'foreman'
  |'assistant'
  |'water_quality'
  |'weather_condition'

export type OperationalResource={
  id:string
  name:string
  active:boolean
  parentUnitId?:string
  parentUnitName?:string
}

export const OPERATIONAL_RESOURCE_COLLECTIONS:Record<OperationalResourceKind,string>={
  unit:'master_units',
  unit_number:'master_unit_numbers',
  nozzle:'master_nozzles',
  dropper:'master_droppers',
  shift:'master_shifts',
  foreman:'master_foremen',
  assistant:'master_assistants',
  water_quality:'master_water_qualities',
  weather_condition:'master_weather_conditions',
}

function text(value:unknown){return value===null||value===undefined?'':String(value).trim()}

export async function loadOperationalResources(kind:OperationalResourceKind):Promise<OperationalResource[]>{
  if(!firestoreDb)return[]
  const snap=await getDocs(collection(firestoreDb,OPERATIONAL_RESOURCE_COLLECTIONS[kind]))
  return snap.docs.map(item=>{
    const row=item.data() as Record<string,unknown>
    return{
      id:item.id,
      name:text(row.name||row.label||row.value||item.id),
      active:row.active!==false,
      parentUnitId:text(row.parentUnitId)||undefined,
      parentUnitName:text(row.parentUnitName)||undefined,
    }
  }).filter(row=>row.name&&row.active).sort((a,b)=>
    (a.parentUnitName||'').localeCompare(b.parentUnitName||'',undefined,{numeric:true})||
    a.name.localeCompare(b.name,undefined,{numeric:true})
  )
}

export async function loadAllOperationalResources(){
  const[
    units,unitNumbers,nozzles,droppers,shifts,foremen,assistants,waterQualities,weatherConditions,
  ]=await Promise.all([
    loadOperationalResources('unit'),
    loadOperationalResources('unit_number'),
    loadOperationalResources('nozzle'),
    loadOperationalResources('dropper'),
    loadOperationalResources('shift'),
    loadOperationalResources('foreman'),
    loadOperationalResources('assistant'),
    loadOperationalResources('water_quality'),
    loadOperationalResources('weather_condition'),
  ])
  return{units,unitNumbers,nozzles,droppers,shifts,foremen,assistants,waterQualities,weatherConditions}
}

export function mergeResourceNames(...groups:Array<Array<{name:string}|string>>){
  const values=new Set<string>()
  groups.flat().forEach(item=>{const value=typeof item==='string'?item:item?.name;if(value?.trim())values.add(value.trim())})
  return[...values].sort((a,b)=>a.localeCompare(b,undefined,{numeric:true}))
}

export function unitNumbersForUnit(resources:OperationalResource[],unitName:string){
  const wanted=unitName.trim().toLowerCase()
  if(!wanted)return[]
  return resources.filter(row=>String(row.parentUnitName||'').trim().toLowerCase()===wanted)
}

export function preferFirestoreNames(resources:OperationalResource[],fallback:string[]=[]){
  return mergeResourceNames(resources.length?resources:fallback)
}
