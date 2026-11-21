// Synthetic UAT operational form -> canonical Planning QC receipt.
// NOT the production SprayForm/FertilizerForm's full DTO or its photo transport.
// Source fields MUST originate from the trusted QC source endpoint; server revalidates.
const need=(v,code)=>{if(!v)throw Error(code)}
const sid=v=>typeof v==='string'&&/^uat-[a-z0-9-]{1,60}$/.test(v)
const exact=(obj,keys)=>obj&&Object.getPrototypeOf(obj)===Object.prototype&&
 Reflect.ownKeys(obj).length===keys.length&&keys.every(key=>Object.hasOwn(obj,key))
export function prepareUnifiedOperationalQc(input){
 need(exact(input,['source','uid','recordId','sessionId','clientRevision','jobId','saveType','actualArea100']),'INVALID_FORM_INPUT')
 const {source,uid,recordId,sessionId,clientRevision,jobId,saveType,actualArea100}=input
 need(exact(source,['testOnly','dailyPlanId','monthlyPlanLineId','pid','date','shift','foreman','formType','area100','revision','readOnly']),'INVALID_FORM_SOURCE')
 need(source.testOnly===true&&source.readOnly===true,'SYNTHETIC_ONLY')
 for(const k of ['uid','recordId','sessionId','clientRevision','jobId'])need(sid(input[k]),'INVALID_SYNTHETIC_ID')
 for(const k of ['dailyPlanId','pid','foreman'])need(sid(source[k]),'INVALID_FORM_SOURCE')
 need(source.monthlyPlanLineId===''||sid(source.monthlyPlanLineId),'INVALID_FORM_SOURCE')
 need(['spray','fertilizer'].includes(source.formType)&&['1','2'].includes(source.shift),'INVALID_FORM_SOURCE')
 need(typeof source.date==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(source.date),'INVALID_FORM_DATE')
 const t=new Date(source.date+'T00:00:00Z')
 need(!Number.isNaN(t.getTime())&&t.toISOString().slice(0,10)===source.date,'INVALID_FORM_DATE')
 need(Number.isSafeInteger(source.area100)&&source.area100>0&&source.area100<=10000000,'INVALID_FORM_SOURCE')
 need(Number.isSafeInteger(source.revision)&&source.revision>=0&&source.revision<1000000,'INVALID_FORM_SOURCE')
 need(['draft','ready'].includes(saveType),'INVALID_FORM_STATUS')
 need(Number.isSafeInteger(actualArea100)&&actualArea100>=0&&actualArea100<=10000000,'INVALID_FORM_AREA')
 if(saveType==='ready')need(actualArea100>0,'INVALID_FORM_AREA')
 const record={
  testOnly:true,id:recordId,ownerUid:uid,inputtedBy:uid,formType:source.formType,
  clientRevision,saveType,dailyPlanId:source.dailyPlanId,monthlyPlanLineId:source.monthlyPlanLineId,
  pid:source.pid,date:source.date,shift:source.shift,foreman:source.foreman,
  actualArea100,sessionId
 }
 return {record,baseRevision:null,jobId,uploaderUid:uid,expectedDailyRevision:source.revision}
}
export function parseUnifiedAreaHa(value){
 need(typeof value==='string'&&/^\d{1,5}(?:\.\d{1,2})?$/.test(value),'INVALID_AREA_HA')
 const [whole,frac='']=value.split('.')
 const area100=Number(whole)*100+Number(frac.padEnd(2,'0'))
 need(Number.isSafeInteger(area100)&&area100>0&&area100<=10000000,'INVALID_AREA_HA')
 return area100
}
