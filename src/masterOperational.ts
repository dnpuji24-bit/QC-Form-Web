import { collection, getDocs } from 'firebase/firestore'
import { firestoreDb } from './firebase'

export type OperationalMasters={
  units:string[]
  shifts:string[]
  foremen:string[]
}

function text(value:unknown){return value===null||value===undefined?'':String(value).trim()}
function unique(values:string[]){return [...new Set(values.map(value=>value.trim()).filter(Boolean))].sort((a,b)=>a.localeCompare(b,undefined,{numeric:true}))}

async function labels(collectionName:string){
  if(!firestoreDb)return[]
  const snap=await getDocs(collection(firestoreDb,collectionName))
  return unique(snap.docs.map(item=>{
    const row=item.data() as Record<string,unknown>
    if(row.active===false)return''
    return text(row.label||row.name||row.value||row.unit||row.shift||row.foreman||row.mandor)
  }).filter(Boolean))
}

export async function loadOperationalMasters(fallback:Partial<OperationalMasters>={}):Promise<OperationalMasters>{
  if(!firestoreDb){
    return{
      units:unique(fallback.units||[]),
      shifts:unique(fallback.shifts||[]),
      foremen:unique(fallback.foremen||[]),
    }
  }
  const[units,shifts,foremen]=await Promise.all([
    labels('master_units'),
    labels('master_shifts'),
    labels('master_foremen'),
  ])
  return{
    units:unique([...(fallback.units||[]),...units]),
    shifts:unique([...(fallback.shifts||[]),...shifts]),
    foremen:unique([...(fallback.foremen||[]),...foremen]),
  }
}

export function smartMatches(values:string[],query:string,limit=12){
  const needle=query.trim().toLowerCase()
  if(!needle)return values.slice(0,limit)
  const starts=values.filter(value=>value.toLowerCase().startsWith(needle))
  const contains=values.filter(value=>!value.toLowerCase().startsWith(needle)&&value.toLowerCase().includes(needle))
  return [...starts,...contains].slice(0,limit)
}
