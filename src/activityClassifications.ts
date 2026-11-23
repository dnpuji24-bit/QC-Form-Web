import { collection,getDocs } from 'firebase/firestore'
import { firestoreDb } from './firebase'
export type ActivityClassificationKind='activity_type'|'activity_category'
export const ACTIVITY_CLASSIFICATION_COLLECTIONS:Record<ActivityClassificationKind,string>={
 activity_type:'master_activity_types',
 activity_category:'master_activity_categories',
}
export const ACTIVITY_CLASSIFICATION_DEFAULTS:Record<ActivityClassificationKind,string[]>={
 activity_type:['SPRAY','FERTILIZER','OTHERS'],
 activity_category:['HERBICIDE','INSECTICIDE','FUNGICIDE','FERTILIZER','ADJUVANT','OTHER'],
}
export type ActivityClassification={id:string;name:string;active:boolean;builtIn:boolean}
export function classificationName(value:string){return value.trim().toUpperCase().replace(/\s+/g,'_')}
export function classificationId(value:string){return classificationName(value).toLowerCase().replace(/[^a-z0-9_\-]/g,'')}
export function classificationRows(kind:ActivityClassificationKind,docs:Array<{id:string;data:Record<string,unknown>}>):ActivityClassification[]{
 const byName=new Map<string,ActivityClassification>()
 for(const name of ACTIVITY_CLASSIFICATION_DEFAULTS[kind]){
  byName.set(name,{id:classificationId(name),name,active:true,builtIn:true})
 }
 for(const doc of docs){
  const name=classificationName(String(doc.data.name||doc.id))
  if(!name)continue
  const prior=byName.get(name)
  byName.set(name,{id:doc.id,name,active:doc.data.active!==false,builtIn:!!prior?.builtIn})
 }
 return [...byName.values()].sort((a,b)=>a.name.localeCompare(b.name,undefined,{numeric:true}))
}
export async function loadActivityClassifications(kind:ActivityClassificationKind):Promise<ActivityClassification[]>{
 if(!firestoreDb)return classificationRows(kind,[])
 const snap=await getDocs(collection(firestoreDb,ACTIVITY_CLASSIFICATION_COLLECTIONS[kind]))
 return classificationRows(kind,snap.docs.map(item=>({id:item.id,data:item.data() as Record<string,unknown>})))
}
/** Only these two values use the dedicated Spray/Fertilizer QC forms. Other types can be planned without a recipe. */
export function activityRequiresRecipe(type:string){return ['SPRAY','FERTILIZER'].includes(classificationName(type))}
