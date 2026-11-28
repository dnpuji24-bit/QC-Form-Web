import type {BkmCandidate} from './bkmAggregation.mjs'
import type {BkmInputRow} from './bkmFirestore'

export const operationFieldLimits={description:240,pid:120,uom:24,wo:120}
export type BkmOperationFields=Record<keyof typeof operationFieldLimits,string>

export function bkmOperationFields(row:BkmInputRow):BkmOperationFields{
 const source=row.candidate
 return {
  description:row.operationFields?.description??source?.description??'',
  pid:row.operationFields?.pid??source?.pid??'',
  uom:row.operationFields?.uom??source?.uom??'',
  wo:row.operationFields?.wo??source?.wo??row.filterWo??'',
 }
}

const key=(value:string)=>value.trim().toLowerCase()

export function bkmOperationCandidate(row:BkmInputRow,company:string):BkmCandidate|null{
 const fields=bkmOperationFields(row)
 const source=row.candidate
 const matchesSource=source&&key(fields.description)===key(source.description)&&
  key(fields.pid)===key(source.pid)&&key(fields.wo)===key(source.wo)
 if(matchesSource){
  const sameUnit=key(fields.uom)===key(source.uom)
  return {...source,...fields,...(sameUnit?{}:{target:null,hi:null,shi:null,progress:null})}
 }
 const description=fields.description.trim(),pid=fields.pid.trim(),wo=fields.wo.trim(),uom=fields.uom.trim()
 if(!description||!pid)return null
 return {
  id:JSON.stringify(['manual-entry',company.toUpperCase(),key(pid),row.activityFilter||key(description),key(wo)]),
  company:company.toUpperCase(),description,pid,wo,uom,operationCode:row.activityFilter||'',
  area:null,hk:null,target:null,hi:null,shi:null,progress:null,notes:'',warnings:[],
  conflict:false,actualIds:[],material:[],
 }
}

export function bkmOperationIncomplete(row:BkmInputRow,company:string){
 return !!row.operationFields&&
  (Object.values(row.operationFields).some(value=>value.trim())||!!row.candidate)&&
  !bkmOperationCandidate(row,company)
}
