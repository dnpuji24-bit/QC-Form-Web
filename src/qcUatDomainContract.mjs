// Pure synthetic DTO contract for a future isolated UI. No SDK or network.
export const UAT_WORKSPACE='cutover'
const collections=Object.freeze(['master_paddocks','master_activities','monthly_plans','daily_plans','qc_records','daily_reports'])
const ids=/^uat-[a-z0-9-]{1,60}$/
const uids=/^[A-Za-z0-9_-]{1,128}$/
const forms=['spray','fertilizer']
const fail=code=>{throw Error(code)}
export function syntheticId(id){if(typeof id!=='string'||!ids.test(id))fail('INVALID_UAT_ID');return id}
export function syntheticUid(uid){if(typeof uid!=='string'||!uids.test(uid))fail('INVALID_UAT_UID');return uid}
export function syntheticCollection(c){if(!collections.includes(c))fail('INVALID_UAT_COLLECTION');return ['qc_uat_workspaces',UAT_WORKSPACE,c]}
export function syntheticPath(c,id){return [...syntheticCollection(c),syntheticId(id)]}
export function syntheticLimit(n=20){if(!Number.isInteger(n)||n<1||n>100)fail('INVALID_UAT_LIMIT');return n}
function exact(input,keys){
 if(!input||Object.getPrototypeOf(input)!==Object.prototype||Reflect.ownKeys(input).length!==keys.length||!keys.every(k=>Object.hasOwn(input,k)&&Object.getOwnPropertyDescriptor(input,k)?.get===undefined&&Object.getOwnPropertyDescriptor(input,k)?.set===undefined))fail('INVALID_UAT_FIELDS')
 return input
}
function area(n){if(!Number.isSafeInteger(n)||n<1||n>100000)fail('INVALID_UAT_AREA');return n}
function form(v){if(!forms.includes(v))fail('INVALID_UAT_FORM');return v}
// Input areas are integer hundredths of hectares; no implicit conversion.
function payload(c,id,input){
 switch(c){
 case 'master_paddocks':{const d=exact(input,['area100']);return {pid:id,area100:area(d.area100)}}
 case 'master_activities':{const d=exact(input,['formType']);return {formType:form(d.formType)}}
 case 'monthly_plans':{const d=exact(input,['pid','activityId','targetArea100']);return {pid:syntheticId(d.pid),activityId:syntheticId(d.activityId),targetArea100:area(d.targetArea100)}}
 case 'daily_plans':{const d=exact(input,['pid','activityId','monthlyPlanLineId','targetArea100','formType']);return {pid:syntheticId(d.pid),activityId:syntheticId(d.activityId),monthlyPlanLineId:syntheticId(d.monthlyPlanLineId),targetArea100:area(d.targetArea100),formType:form(d.formType)}}
 case 'qc_records':{const d=exact(input,['pid','monthlyPlanLineId','dailyPlanId','formType','actualArea100']);return {pid:syntheticId(d.pid),monthlyPlanLineId:syntheticId(d.monthlyPlanLineId),dailyPlanId:syntheticId(d.dailyPlanId),formType:form(d.formType),actualArea100:area(d.actualArea100)}}
 default:fail('INVALID_UAT_CREATE_COLLECTION')
 }
}
function metadata(uid,createdAt){return {testOnly:true,ownerUid:syntheticUid(uid),createdAt}}
export function planCreate(c,id,input,uid,createdAt){
 if(!['master_paddocks','master_activities','monthly_plans','daily_plans'].includes(c))fail('INVALID_UAT_CREATE_COLLECTION')
 return {...metadata(uid,createdAt),...payload(c,syntheticId(id),input)}
}
export function qcPair(id,input,uid,createdAt){
 const qc={...metadata(uid,createdAt),...payload('qc_records',syntheticId(id),input)}
 const actual={...qc,sourceOrigin:'QC',qcRecordId:id}
 return {qc,actual}
}
