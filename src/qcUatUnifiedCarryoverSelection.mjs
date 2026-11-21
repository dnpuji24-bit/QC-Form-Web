// Isolated UAT only. Source Daily Plan identity is immutable; execution can explicitly carry over 1 -> 2 on the SAME date.
const need=(ok,code)=>{if(!ok)throw Error(code)}
const sid=v=>typeof v==='string'&&/^uat-[a-z0-9-]{1,60}$/.test(v)
const exact=(v,ks)=>v&&Object.getPrototypeOf(v)===Object.prototype&&Reflect.ownKeys(v).length===ks.length&&ks.every(k=>Object.hasOwn(v,k))
export function fullQcExecutionRequest(scalar,formType,selection){
 need(['spray','fertilizer'].includes(formType),'INVALID_FORM_KIND')
 need(scalar?.testOnly===true&&scalar.readOnly===true&&sid(scalar.dailyPlanId)&&scalar.formType===formType,'INVALID_SCALAR_SOURCE')
 need(['1','2'].includes(scalar.shift)&&sid(scalar.foreman)&&Number.isSafeInteger(scalar.revision)&&scalar.revision>=0&&scalar.revision<1000000,'INVALID_SCALAR_SOURCE')
 need(typeof scalar.date==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(scalar.date),'INVALID_SCALAR_SOURCE')
 need(exact(selection,['carryover','actualForemanId'])&&typeof selection.carryover==='boolean','INVALID_EXECUTION_SELECTION')
 const {carryover,actualForemanId}=selection
 if(carryover){
  need(scalar.shift==='1','CARRYOVER_SOURCE_SHIFT_REQUIRED')
  need(sid(actualForemanId),'INVALID_EXECUTION_FOREMAN')
 }else need(actualForemanId==='','UNEXPECTED_FOREMAN_OVERRIDE')
 const executionShift=carryover?'2':scalar.shift,executionForemanId=carryover?actualForemanId:scalar.foreman
 return {
  request:{dailyPlanId:scalar.dailyPlanId,expectedDailyRevision:scalar.revision,formType,date:scalar.date,shift:executionShift,foreman:executionForemanId},
  expected:{sourceShift:scalar.shift,sourceForemanId:scalar.foreman,executionShift,executionForemanId,carryover}
 }
}
export function validateFullQcExecutionSource(source,scalar,formType,selection){
 const {expected}=fullQcExecutionRequest(scalar,formType,selection)
 need(source?.testOnly===true&&source.kind===formType&&source.dailyPlanId===scalar.dailyPlanId&&source.date===scalar.date&&source.dailyRevision===scalar.revision,'INVALID_FULL_SOURCE')
 for(const [key,value] of Object.entries(expected))need(source[key]===value,'QC_EXECUTION_SOURCE_MISMATCH')
 return source
}
