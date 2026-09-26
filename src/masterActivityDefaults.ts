import { collection, getDocs } from 'firebase/firestore'
import { firestoreDb } from './firebase'

export type ActivityResourceDefault={
  id:string
  description:string
  activity:string
  type:string
  defaultUnitName:string
  defaultShift:string
  defaultForeman:string
}

function text(value:unknown){return value===null||value===undefined?'':String(value).trim()}
function key(value:unknown){return text(value).toLowerCase().replace(/\s+/g,' ').trim()}

export async function loadActivityResourceDefaults():Promise<ActivityResourceDefault[]>{
  if(!firestoreDb)return[]
  const snap=await getDocs(collection(firestoreDb,'master_activities'))
  return snap.docs.map(item=>{
    const row=item.data() as Record<string,unknown>
    return{
      id:item.id,
      description:text(row.description),
      activity:text(row.activity),
      type:text(row.type).toUpperCase(),
      defaultUnitName:text(row.defaultUnitName||row.unitName||row.defaultUnit),
      defaultShift:text(row.defaultShift||row.shift),
      defaultForeman:text(row.defaultForeman||row.foreman||row.mandor),
    }
  }).filter(row=>row.activity||row.description)
}

export function findActivityResourceDefault(rows:ActivityResourceDefault[],activity:string,description='',type=''){
  const descriptionKey=key(description),activityKey=key(activity),typeKey=key(type)
  if(descriptionKey){
    const exactDescription=rows.find(row=>key(row.description)===descriptionKey&&(!typeKey||key(row.type)===typeKey))
    if(exactDescription)return exactDescription
  }
  if(!activityKey)return null
  const candidates=rows.filter(row=>(key(row.activity)===activityKey||key(row.description)===activityKey)&&(!typeKey||key(row.type)===typeKey))
  if(candidates.length===1)return candidates[0]
  if(candidates.length>1){
    const signatures=new Set(candidates.map(row=>[row.defaultUnitName,row.defaultShift,row.defaultForeman].map(key).join('|')))
    if(signatures.size===1)return candidates[0]
  }
  return null
}
