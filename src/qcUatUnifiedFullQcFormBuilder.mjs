// 11D.5c.2b.2 — isolated, photo-free React UAT full-form mapper.
// The trusted HTTP server revalidates the entire record against current Planning/master.
// This module has no Firebase, network, Node.js or production app imports.
import {textFields as sprayTextFields,numberFields as sprayNumberFields,validateSprayDto} from './qcUatSprayFullDto.mjs'
import {fertilizerTextFields,fertilizerNumberFields,validateFertilizerDtoForComponents,summarizeFertilizerFillings} from './qcUatFertilizerFullDto.mjs'
const need=(v,code)=>{if(!v)throw Error(code)}
const text=(value,max=2000)=>{need(typeof value==='string'&&value.length<=max,'INVALID_FORM_TEXT');return value}
const two=(value,zero=false)=>{
 need(typeof value==='string'&&/^\d{1,5}(?:\.\d{1,2})?$/.test(value),'INVALID_FORM_DECIMAL')
 const n=Number(value);need(Number.isSafeInteger(Math.round(n*100))&&Math.round(n*100)<=10000000&&
  (zero||n>0),'INVALID_FORM_DECIMAL');return n
}
const clock=v=>{need(typeof v==='string'&&/^([01]\d|2[0-3]):[0-5]\d$/.test(v),'INVALID_CLOCK');return Number(v.slice(0,2))*60+Number(v.slice(3))}
const percent=v=>Math.round(v*100)/100
const identity=v=>{need(v&&/^uat-[a-z0-9-]{1,60}$/.test(v.uid)&&/^[a-z0-9-]{1,40}$/.test(v.nonce)&&
 ['draft','ready'].includes(v.saveType)&&typeof v.createdAt==='string'&&!Number.isNaN(Date.parse(v.createdAt)),'INVALID_FORM_IDENTITY');return v}
function timeline(editor,ready){
 if(!ready&&!editor.startTime&&!editor.endTime)return {workingDurationMinutes:0,holdTotalMinutes:0,effectiveWorkingMinutes:0,holdIntervals:[]}
 const a=clock(editor.startTime),raw=clock(editor.endTime),b=raw<a?raw+1440:raw
 need(b>a&&b-a<=1440,'INVALID_FORM_DURATION')
 const day=t=>{let x=clock(t);return raw<a&&x<a?x+1440:x}
 const holds=editor.holds.map((h,i)=>{
  need(h&&typeof h==='object'&&Object.keys(h).length===4,'INVALID_FORM_HOLD')
  const first=day(h.start),last=day(h.end)
  need(first>=a&&last<=b&&last>first,'INVALID_FORM_HOLD')
  return {first,last,row:{holdId:'uat-h'+(i+1),start:h.start,end:h.end,reason:text(h.reason),windSpeed:'',note:text(h.note),photoBase64:'',photoDriveUrl:''}}
 }).sort((x,y)=>x.first-y.first)
 need(holds.length<=20,'INVALID_FORM_HOLD')
 for(let i=1;i<holds.length;i++)need(holds[i].first>=holds[i-1].last,'INVALID_FORM_HOLD')
 const total=holds.reduce((x,h)=>x+h.last-h.first,0),effective=b-a-total
 need(effective>0,'INVALID_FORM_DURATION')
 return {workingDurationMinutes:b-a,holdTotalMinutes:total,effectiveWorkingMinutes:effective,holdIntervals:holds.map(h=>h.row)}
}
function masterSource(source){
 need(source?.testOnly===true&&['spray','fertilizer'].includes(source.kind)&&['1','2'].includes(source.executionShift)&&
 typeof source.executionForemanId==='string'&&typeof source.executionForemanName==='string'&&
 Array.isArray(source.materials)&&source.materials.length<=20,'INVALID_FULL_SOURCE')
 const kind=source.kind
 need(source.areaSemantics===(kind==='spray'?'SCALAR_APPLICATION':'COMPONENT_APPLICATION_ONLY'),'INVALID_FULL_SOURCE')
 return {testOnly:true,kind,dailyPlanId:source.dailyPlanId,monthlyPlanLineId:source.monthlyPlanLineId,
  date:source.date,shift:source.sourceShift,foreman:source.sourceForemanName,pid:source.pid,
  activity:source.activity,...(kind==='spray'?{description:source.description,masterVariety:source.masterVariety}:{}),
  type:kind==='spray'?'SPRAY':'FERTILIZER',companyCode:source.companyCode,farm:source.farm,
  sourceType:source.sourceType,planningOrder:source.planningOrder,areaHa:source.area100/100,
  materials:source.materials.map(m=>({material:m.material,dosePerHa:m.dose10000/10000,
   doseUnit:m.doseUnit,unit:m.unit,totalMaterial:m.totalMaterial1000000/1000000}))}
}
function base(source,editor,actor,spray){
 const fields=spray?sprayTextFields:fertilizerTextFields
 const nums=spray?sprayNumberFields:fertilizerNumberFields
 const r={testOnly:true,...Object.fromEntries(fields.map(k=>[k,''])),...Object.fromEntries(nums.map(k=>[k,0]))}
 const timing=timeline(editor,actor.saveType==='ready')
 const area=spray?two(editor.areaHa,actor.saveType==='draft'):0
 Object.assign(r,{id:'qc-v2-uat-'+actor.nonce,sessionId:'uat-session-'+actor.nonce,
  clientRevision:'uat-r-'+actor.nonce,formType:source.kind,status:'Working',
  ownerUid:actor.uid,inputtedBy:actor.uid,createdAt:actor.createdAt,
  date:source.date,shift:source.executionShift,name:source.executionForemanName,
  nameOfAssistan:text(editor.assistant),dailyPlanId:source.dailyPlanId,monthlyPlanLineId:source.monthlyPlanLineId,
  dailyPlanLinkStatus:'LINKED',dailyPlanSourceType:source.sourceType,
  companyCode:source.companyCode,farm:source.farm,paddock:source.pid,activity:source.activity,
  type:spray?'SPRAY':'FERTILIZER',dailyPlanningOrder:source.planningOrder,
  plannedDailyAreaHa:source.area100/100,unit:text(editor.unit),noUnit:text(editor.noUnit),
  startTime:text(editor.startTime),endTime:text(editor.endTime),saveType:actor.saveType,
  noted:text(editor.notes),holdIntervals:timing.holdIntervals,
  workingDurationMinutes:timing.workingDurationMinutes,holdTotalMinutes:timing.holdTotalMinutes,
  effectiveWorkingMinutes:timing.effectiveWorkingMinutes})
 if(spray){r.actualAreaHa=area;r.area=String(area);r.variety=source.masterVariety;r.deskripsi=source.description}
 return {r,timing}
}
export function buildUnifiedFullQc(source,editor,actor){
 identity(actor)
 need(editor&&Object.getPrototypeOf(editor)===Object.prototype&&Array.isArray(editor.holds),'INVALID_FORM_EDITOR')
 const dp=masterSource(source),spray=source.kind==='spray'
 const {r,timing}=base(source,editor,actor,spray)
 if(spray){
  need(source.materials.length<=4,'SPRAY_MATERIAL_SLOT_LIMIT')
  r.dropper=text(editor.dropper);r.nozzle=text(editor.nozzle);r.waterQuality=text(editor.waterQuality)
  r.weatherCondition=text(editor.weatherCondition);r.windSpeed=text(editor.windSpeed)
  r.waterRate=text(editor.waterRate);r.adjuvantDosage=text(editor.adjuvantDosage)
  r.adjuvant=text(editor.adjuvant);r.actUsageAdjuvant=text(editor.actUsageAdjuvant)
  const dec=v=>{need(/^\d*(?:\.\d{1,6})?$/.test(v),'INVALID_FORM_MATERIAL');return Number(v||0)}
  r.estUsageAdjuvant=(dec(r.adjuvantDosage)*dec(r.waterRate)*r.actualAreaHa/1000).toFixed(2)
  for(let i=0;i<4;i++){
   const m=dp.materials[i]
   r['pesticide'+(i+1)]=m?.material||''
   r['dosage'+(i+1)]=m?.dosePerHa||''
   r['estUsagePesticide'+(i+1)]=m?(m.dosePerHa*r.actualAreaHa).toFixed(2):''
   r['actUsagePesticide'+(i+1)]=text(editor.measuredUsage?.[i]??'',120)
  }
  r.actualPlanMaterials=dp.materials.map(m=>({...m,totalMaterial:Number((m.dosePerHa*r.actualAreaHa).toFixed(4))}))
  r.productivityHaPerHour=timing.effectiveWorkingMinutes?percent(r.actualAreaHa/(timing.effectiveWorkingMinutes/60)):0
  validateSprayDto(r,dp)
 }else{
  need(Array.isArray(editor.fillings)&&editor.fillings.length>0&&editor.fillings.length<=100,'INVALID_FORM_FILLINGS')
  r.pengisianList=editor.fillings.map((f,i)=>{
   const m=source.materials.find(m=>m.materialId===f.materialId)
   need(m&&m.dose10000>0,'INVALID_FORM_COMPONENT')
   const kg=two(f.kg,true),ha=two(f.areaHa,true)
   return {pengisianKe:i+1,dosis:m.dose10000/10000,statusHose:text(f.statusHose),
    jenisPupuk:text(f.productName),jumlah:kg,hasilKerja:ha,
    dosisAktual:ha?percent(kg/ha):0,pemerataanPupuk:text(f.distribution)}
  })
  const sum=summarizeFertilizerFillings(r.pengisianList),first=r.pengisianList[0]
  r.actualAreaHa=sum.ha;r.averageActualDosage=sum.average;r.weightedActualDosage=sum.weighted
  r.jenisPupuk=first.jenisPupuk;r.dosis=first.dosis;r.statusHose=first.statusHose
  r.catatan=text(editor.notes)
  r.actualPlanMaterials=dp.materials.map(m=>({...m,totalMaterial:Number((m.dosePerHa*r.actualAreaHa).toFixed(4))}))
  r.downtimeList=timing.holdIntervals.map(h=>({id:h.holdId,issue:h.reason,start:h.start,end:h.end,note:h.note}))
  r.productivityHaPerHour=timing.effectiveWorkingMinutes?percent(r.actualAreaHa/(timing.effectiveWorkingMinutes/60)):0
  validateFertilizerDtoForComponents(r,dp)
 }
 return {record:r,baseRevision:null,jobId:'uat-job-'+actor.nonce,
  uploaderUid:actor.uid,expectedDailyRevision:source.dailyRevision,foremanId:source.executionForemanId}
}
