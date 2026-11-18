// Synthetic master-backed Planning snapshots. Exact integer quantity arithmetic.
import {currentPlanningRow,nextPlanningRow} from './qcUatPlanningWriteContract.mjs'
const need=(ok,code)=>{if(!ok)throw Error(code)}
const exact=(v,ks)=>need(v&&Object.getPrototypeOf(v)===Object.prototype&&Reflect.ownKeys(v).length===ks.length&&ks.every(k=>Object.hasOwn(v,k)&&Object.hasOwn(Object.getOwnPropertyDescriptor(v,k),'value')),'INVALID_MASTER_FIELDS')
const sid=v=>{need(typeof v==='string'&&/^uat-[a-z0-9-]{1,60}$/.test(v),'INVALID_SYNTHETIC_ID');return v}
const label=v=>{need(typeof v==='string'&&v.trim()===v&&v.length>0&&v.length<=160,'INVALID_MASTER_LABEL');return v}
const count=(v,min,max)=>{need(Number.isSafeInteger(v)&&v>=min&&v<=max,'INVALID_MASTER_NUMBER');return v}
const list=(v,min,max)=>{need(Array.isArray(v)&&v.length>=min&&v.length<=max&&Array.from({length:v.length},(_,i)=>Object.hasOwn(v,i)).every(Boolean),'INVALID_MASTER_LIST');return v}
const unique=(v,key)=>{need(new Set(v.map(key)).size===v.length,'DUPLICATE_MASTER_KEY');return v}
function master(v,id,key='id'){need(v?.testOnly===true&&v[key]===id&&v.active===true,'INVALID_PLANNING_MASTER');return v}
export function dose10000(v){
 need(typeof v==='string'||typeof v==='number','INVALID_MATERIAL_DOSE')
 const s=String(v)
 need(/^(0|[1-9]\d*)(\.\d{1,4})?$/.test(s),'INVALID_MATERIAL_DOSE')
 const [a,b='']=s.split('.'),n=Number(a)*10000+Number(b.padEnd(4,'0'))
 need(Number.isSafeInteger(n)&&n>0&&n<=100000000,'INVALID_MATERIAL_DOSE')
 return n
}
export function activityComponents(a,id,form){
 master(a,id);need(a.formType===form,'PLANNING_FORM_MISMATCH')
 need(a.companyScope==='GLOBAL'||sid(a.companyScope),'INVALID_COMPANY_SCOPE')
 label(a.activity);label(a.description)
 return unique(list(a.components,0,20).map(c=>{exact(c,['materialId','dosePerHa','unit']);return {materialId:sid(c.materialId),dose10000:dose10000(c.dosePerHa),unit:label(c.unit)}}),c=>c.materialId)
}
export function paddockSnapshot(p,pid,company,selected){
 master(p,pid,'pid');const companyCode=sid(p.companyCode)
 master(company,companyCode,'code')
 const plantArea100=count(p.plantArea100,0,10000000),areaPaddock100=count(p.areaPaddock100,0,10000000)
 need(plantArea100<=areaPaddock100,'PLANTED_EXCEEDS_PADDOCK')
 const options=unique(list(p.varietyBreakdown,1,30).map(v=>{exact(v,['variety','area100']);return {variety:label(v.variety),area100:count(v.area100,0,10000000)}}),v=>v.variety)
 need(options.reduce((sum,v)=>sum+v.area100,0)===plantArea100,'VARIETY_TOTAL_MISMATCH')
 const names=unique(list(selected,1,30).map(label),v=>v)
 const selectedVarietyDetails=names.map(v=>{const x=options.find(o=>o.variety===v);need(x,'UNKNOWN_VARIETY');return x})
 return {companyCode,farm:label(p.farm),stage:label(p.stage),masterVariety:label(p.variety),areaPaddock100,plantArea100,masterVarietyBreakdown:options,selectedVarieties:names,selectedVarietyDetails,selectedPlantArea100:selectedVarietyDetails.reduce((sum,v)=>sum+v.area100,0)}
}
export function materialSnapshot(components,materials){
 return components.map(c=>{const m=master(materials.get(c.materialId),c.materialId);need(m.unit===c.unit,'MATERIAL_UNIT_MISMATCH');return {materialId:c.materialId,material:label(m.materialName),dose10000:c.dose10000,unit:c.unit}})
}
export function materialTotals(components,area100){
 count(area100,1,10000000)
 return unique(list(components,0,20).map(c=>{
  exact(c,['materialId','material','dose10000','unit'])
  const dose=count(c.dose10000,1,100000000),total=dose*area100
  need(Number.isSafeInteger(total),'MATERIAL_TOTAL_OVERFLOW')
  return {materialId:sid(c.materialId),material:label(c.material),dose10000:dose,doseUnit:label(c.unit),unit:c.unit,totalMaterial1000000:total}
 }),c=>c.materialId)
}
export function monthlySnapshot(row,p,company,a,materials,selected){
 currentPlanningRow('monthly',row.id,row)
 need(['spray','fertilizer'].includes(a?.formType),'PLANNING_FORM_MISMATCH')
 const components=activityComponents(a,row.activityId,a.formType),pad=paddockSnapshot(p,row.pid,company,selected)
 need(a.companyScope==='GLOBAL'||a.companyScope===pad.companyCode,'ACTIVITY_COMPANY_MISMATCH')
 const componentsSnapshot=materialSnapshot(components,materials)
 return {testOnly:true,planLineId:row.id,pid:row.pid,activityId:row.activityId,formType:a.formType,activity:a.activity,description:a.description,createdBy:row.createdBy,...pad,componentsSnapshot}
}
export function monthlySnapshotRequest(input,uid){
 exact(input,['id','fields','selectedVarieties'])
 const selected=unique(list(input.selectedVarieties,1,30).map(label),v=>v)
 return {row:nextPlanningRow('monthly',{action:'create',id:input.id,expectedRevision:null,fields:input.fields},null,uid),selected}
}
export function dailySnapshot(row,source,p,company,a){
 currentPlanningRow('daily',row.id,row)
 master(a,row.activityId);need(a.formType===row.formType,'PLANNING_FORM_MISMATCH')
 label(a.activity);label(a.description)
 let pad,componentsSnapshot,activity,description
 if(row.sourceType==='MONTHLY'){
  need(source?.testOnly===true&&source.planLineId===row.monthlyPlanLineId&&source.pid===row.pid&&source.activityId===row.activityId&&source.formType===row.formType,'MISSING_MONTHLY_SNAPSHOT')
  const ks=['companyCode','farm','stage','masterVariety','areaPaddock100','plantArea100','masterVarietyBreakdown','selectedVarieties','selectedVarietyDetails','selectedPlantArea100']
  // Validate frozen snapshot without substituting newly changed paddock metadata.
  pad=paddockSnapshot({testOnly:true,pid:source.pid,active:true,companyCode:source.companyCode,farm:source.farm,stage:source.stage,variety:source.masterVariety,areaPaddock100:source.areaPaddock100,plantArea100:source.plantArea100,varietyBreakdown:source.masterVarietyBreakdown},row.pid,{testOnly:true,code:source.companyCode,active:true},source.selectedVarieties)
  const varietyRowsEqual=(left,right)=>Array.isArray(right)&&left.length===right.length&&left.every((v,i)=>right[i]&&Object.keys(right[i]).length===2&&right[i].variety===v.variety&&right[i].area100===v.area100)
  need(ks.every(k=>k==='masterVarietyBreakdown'||k==='selectedVarietyDetails'?varietyRowsEqual(pad[k],source[k]):k==='selectedVarieties'?Array.isArray(source[k])&&pad[k].length===source[k].length&&pad[k].every((v,i)=>v===source[k][i]):pad[k]===source[k]),'INVALID_MONTHLY_SNAPSHOT')
  master(p,row.pid,'pid');master(company,sid(p.companyCode),'code')
  need(p.companyCode===pad.companyCode,'PADDOCK_COMPANY_CHANGED')
  componentsSnapshot=source.componentsSnapshot;activity=label(source.activity);description=label(source.description)
 }else{
  need(source==null,'UNEXPECTED_MONTHLY_SNAPSHOT')
  pad=paddockSnapshot(p,row.pid,company,list(p?.varietyBreakdown,1,30).map(v=>v.variety))
  componentsSnapshot=[];activity=a.activity;description=a.description
 }
 need(a.companyScope==='GLOBAL'||a.companyScope===pad.companyCode,'ACTIVITY_COMPANY_MISMATCH')
 const materials=materialTotals(componentsSnapshot,row.area100)
 return {testOnly:true,dailyPlanId:row.id,pid:row.pid,monthlyPlanLineId:row.monthlyPlanLineId,sourceType:row.sourceType,activityId:row.activityId,formType:row.formType,activity,description,area100:row.area100,sourceDailyRevision:row.revision,createdBy:row.createdBy,...pad,componentsSnapshot,materials}
}
export function validateGroupResources(header,foreman,shift,unit){
 master(foreman,header.foreman);master(shift,header.shift,'code')
 need(header.unitName===''?unit==null:unit?.testOnly===true&&unit.active===true&&unit.name===header.unitName,'INVALID_MASTER_UNIT')
 return {foremanId:header.foreman,foremanName:label(foreman.name),shift:header.shift,unitName:header.unitName,unitId:unit?sid(unit.id):'',manpower:header.manpower,unitReady:header.unitReady,unitStandby:header.unitStandby,unitBreakdown:header.unitBreakdown}
}
export function aggregateGroupMaterials(rows){
 const totals=new Map()
 for(const r of rows)for(const m of r.materials){
  const key=m.materialId,previous=totals.get(key)
  need(!previous||previous.unit===m.unit&&previous.material===m.material,'GROUP_MATERIAL_CONFLICT')
  const total=(previous?.totalMaterial1000000??0)+m.totalMaterial1000000
  need(Number.isSafeInteger(total),'MATERIAL_TOTAL_OVERFLOW')
  totals.set(key,{materialId:key,material:m.material,unit:m.unit,totalMaterial1000000:total})
 }
 return [...totals.values()]
}

 // Compare canonical maps without relying on Firestore field ordering.
function same(a,b){
 if(a===b)return true
 if(!a||!b||typeof a!=='object'||typeof b!=='object'||Array.isArray(a)!==Array.isArray(b))return false
 const ks=Object.keys(a)
 return ks.length===Object.keys(b).length&&ks.every(k=>Object.hasOwn(b,k)&&same(a[k],b[k]))
}
const padKeys=['companyCode','farm','stage','masterVariety','areaPaddock100','plantArea100','masterVarietyBreakdown','selectedVarieties','selectedVarietyDetails','selectedPlantArea100']
function frozenPad(s,pid){
 const p=paddockSnapshot({testOnly:true,pid,active:true,companyCode:s.companyCode,farm:s.farm,stage:s.stage,variety:s.masterVariety,areaPaddock100:s.areaPaddock100,plantArea100:s.plantArea100,varietyBreakdown:s.masterVarietyBreakdown},pid,{testOnly:true,code:s.companyCode,active:true},s.selectedVarieties)
 need(padKeys.every(k=>same(p[k],s[k])),'INVALID_FROZEN_PADDOCK')
 return p
}
export function readMonthlySnapshot(row,s){
 need(row&&s,'MISSING_MONTHLY_SNAPSHOT')
 currentPlanningRow('monthly',row.id,row)
 exact(s,['testOnly','planLineId','pid','activityId','formType','activity','description','createdBy',...padKeys,'componentsSnapshot'])
 need(s.testOnly===true&&s.planLineId===row.id&&s.pid===row.pid&&s.activityId===row.activityId&&s.createdBy===row.createdBy&&['spray','fertilizer'].includes(s.formType),'INVALID_MONTHLY_SNAPSHOT')
 label(s.activity);label(s.description);frozenPad(s,row.pid)
 return {row,snapshot:s,materials:materialTotals(s.componentsSnapshot,row.targetArea100)}
}
export function readDailySnapshot(row,s,source){
 need(row&&s,'MISSING_DAILY_SNAPSHOT')
 currentPlanningRow('daily',row.id,row)
 exact(s,['testOnly','dailyPlanId','pid','monthlyPlanLineId','sourceType','activityId','formType','activity','description','area100','sourceDailyRevision','createdBy',...padKeys,'componentsSnapshot','materials'])
 const expectedRevision=row.status==='cancelled'?row.revision-1:row.revision
 need(s.testOnly===true&&s.dailyPlanId===row.id&&s.sourceDailyRevision===expectedRevision&&['pid','monthlyPlanLineId','sourceType','activityId','formType','area100','createdBy'].every(k=>s[k]===row[k]),'INVALID_DAILY_SNAPSHOT')
 label(s.activity);label(s.description);frozenPad(s,row.pid)
 need(same(s.materials,materialTotals(s.componentsSnapshot,row.area100)),'INVALID_DAILY_MATERIAL_TOTAL')
 if(row.sourceType==='MONTHLY'){
  need(source&&source.planLineId===row.monthlyPlanLineId&&source.pid===row.pid&&source.activityId===row.activityId&&source.formType===row.formType,'MISSING_MONTHLY_SNAPSHOT')
  need([...padKeys,'activity','description','componentsSnapshot'].every(k=>same(s[k],source[k])),'FROZEN_SOURCE_MISMATCH')
 }else need(source==null&&s.componentsSnapshot.length===0,'UNEXPECTED_MONTHLY_SNAPSHOT')
 return s
}
export function readGroupSnapshot(header,rows,s,snapshots,sources){
 need(s,'MISSING_GROUP_SNAPSHOT')
 exact(s,['testOnly','workGroupId','createdBy','sourceGroupRevision','resources','totalMaterials'])
 need(s.testOnly===true&&s.workGroupId===header.workGroupId&&s.createdBy===header.createdBy&&Number.isSafeInteger(s.sourceGroupRevision)&&s.sourceGroupRevision>=0&&s.sourceGroupRevision<=header.revision-(header.status==='cancelled'?1:0),'INVALID_GROUP_SNAPSHOT')
 need(Array.isArray(snapshots)&&snapshots.length===rows.length&&Array.isArray(sources)&&sources.length===rows.length,'INVALID_GROUP_SNAPSHOT')
 rows.forEach((r,i)=>{readDailySnapshot(r,snapshots[i],sources[i]);need(r.revision-(r.status==='cancelled'?1:0)<=s.sourceGroupRevision,'INVALID_GROUP_SNAPSHOT')})
 const res=s.resources
 exact(res,['foremanId','foremanName','shift','unitName','unitId','manpower','unitReady','unitStandby','unitBreakdown'])
 need(res.foremanId===header.foreman&&['shift','unitName','manpower','unitReady','unitStandby','unitBreakdown'].every(k=>res[k]===header[k]),'INVALID_GROUP_RESOURCES')
 label(res.foremanName);if(res.unitName)sid(res.unitId);else need(res.unitId==='','INVALID_GROUP_RESOURCES')
 need(same(s.totalMaterials,aggregateGroupMaterials(snapshots)),'INVALID_GROUP_MATERIAL_TOTAL')
 return {groupSnapshot:s,snapshots}
}
export function reviseDailySnapshot(before,next,s,source){
 readDailySnapshot(before,s,source)
 need(next.status==='open'&&before.status==='open'&&next.revision===before.revision+1&&['id','pid','monthlyPlanLineId','sourceType','activityId','formType','createdBy','date'].every(k=>before[k]===next[k]),'INVALID_SNAPSHOT_TRANSITION')
 const revised={...s,area100:next.area100,sourceDailyRevision:next.revision,materials:materialTotals(s.componentsSnapshot,next.area100)}
 return readDailySnapshot(next,revised,source)
}
