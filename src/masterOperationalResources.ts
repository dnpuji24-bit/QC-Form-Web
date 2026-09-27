import { collection, getDocs } from 'firebase/firestore'
import { firestoreDb } from './firebase'

export type OperationalResourceKind='unit'|'shift'|'foreman'
export type OperationalResource={id:string;name:string;active:boolean}

const COLLECTIONS:Record<OperationalResourceKind,string>={
  unit:'master_units',
  shift:'master_shifts',
  foreman:'master_foremen',
}

function text(value:unknown){return value===null||value===undefined?'':String(value).trim()}

export async function loadOperationalResources(kind:OperationalResourceKind):Promise<OperationalResource[]>{
  if(!firestoreDb)return[]
  const snap=await getDocs(collection(firestoreDb,COLLECTIONS[kind]))
  return snap.docs.map(item=>{
    const row=item.data() as Record<string,unknown>
    return{id:item.id,name:text(row.name||row.label||row.value||item.id),active:row.active!==false}
  }).filter(row=>row.name&&row.active).sort((a,b)=>a.name.localeCompare(b.name,undefined,{numeric:true}))
}

export async function loadAllOperationalResources(){
  const[units,shifts,foremen]=await Promise.all([
    loadOperationalResources('unit'),
    loadOperationalResources('shift'),
    loadOperationalResources('foreman'),
  ])
  return{units,shifts,foremen}
}

export function mergeResourceNames(...groups:Array<Array<{name:string}|string>>){
  const values=new Set<string>()
  groups.flat().forEach(item=>{const value=typeof item==='string'?item:item?.name;if(value?.trim())values.add(value.trim())})
  return[...values].sort((a,b)=>a.localeCompare(b,undefined,{numeric:true}))
}
