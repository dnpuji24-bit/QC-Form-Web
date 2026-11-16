import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
// Exercise the actual calculation expression from FertilizerForm, with no UI/network.
const source=readFileSync(new URL('../src/FertilizerForm.tsx',import.meta.url),'utf8')
const first='pengisianList=card.fillings.map(',last=',timing=timingFor(card)'
assert.equal(source.split(first).length,2);const a=source.indexOf(first),b=source.indexOf(last,a);assert.ok(b>a)
const expr=source.slice(a,b)
assert.doesNotMatch(expr,/\b(?:import|require|fetch|process|globalThis)\b/)
const calculation=await import('data:text/javascript;base64,'+Buffer.from("const num=value=>Number(String(value??'').replace(',','.'))||0;\nexport function calculate(card){const "+expr+";return {pengisianList,averageActualDosage,totalKgForDose,totalHaForDose,weightedActualDosage}}").toString('base64'))
const calc=calculation.calculate
const row=(i,kg,ha,brand='Synthetic NK',dose=450)=>({pengisianKe:i,dosis:String(dose),statusHose:'Lancar',jenisPupuk:brand,jumlah:String(kg),hasilKerja:String(ha),pemerataanPupuk:'2'})
function fixture(fills=[row(1,1750,4),row(2,2250,5)]){
 const dp={testOnly:true,kind:'fertilizer',dailyPlanId:'uat-dp1',monthlyPlanLineId:'uat-mp1',date:'2026-11-12',shift:'1',foreman:'Mandor A',pid:'C-003',activity:'Top Dressing',type:'FERTILIZER',companyCode:'UAT',farm:'Farm UAT',sourceType:'monthly',planningOrder:1,areaHa:8,materials:[{material:'NK',dosePerHa:450,doseUnit:'kg',unit:'kg',totalMaterial:3600}]}
 const c=calc({fillings:fills}),first=c.pengisianList[0],ha=c.totalHaForDose
 const h={holdId:'uat-h1',start:'23:30',end:'00:30',reason:'Downtime',windSpeed:'',note:'',photoBase64:'',photoDriveUrl:''}
 const r={testOnly:true,id:'qc-v2-uat-fert1',sessionId:'uat-session',formType:'fertilizer',date:dp.date,shift:'2',name:'Mandor B',nameOfAssistan:'Asisten A',status:'Working',dailyPlanId:dp.dailyPlanId,monthlyPlanLineId:dp.monthlyPlanLineId,dailyPlanLinkStatus:'LINKED',dailyPlanSourceType:dp.sourceType,plannedDailyAreaHa:8,actualAreaHa:ha,companyCode:dp.companyCode,farm:dp.farm,dailyPlanningOrder:1,actualPlanMaterials:dp.materials.map(m=>({...m,totalMaterial:m.dosePerHa*ha})),startTime:'15:00',endTime:'01:00',workingDurationMinutes:600,holdTotalMinutes:60,effectiveWorkingMinutes:540,productivityHaPerHour:Math.round(ha/9*100)/100,paddock:dp.pid,unit:'Stool Splitter',noUnit:'SS001',type:dp.type,activity:dp.activity,jenisPupuk:first.jenisPupuk,dosis:first.dosis,statusHose:first.statusHose,pengisianList:c.pengisianList,downtimeList:[{id:h.holdId,issue:h.reason,start:h.start,end:h.end,note:h.note}],holdIntervals:[h],catatan:'',noted:'',photoBase64:'',photoDriveUrl:'',scanReportPhotoBase64:'',scanReportDriveUrl:'',scanConfidence:0,scanRawText:'',scanSourceFileName:'',scanAppliedAt:'',averageActualDosage:c.averageActualDosage,weightedActualDosage:c.weightedActualDosage,saveType:'ready',inputtedBy:'uat-fertilizer',ownerUid:'uat-fertilizer',createdAt:'2026-11-12T15:00:00Z',clientRevision:'uat-r1'}
 return {r,dp,c}
}
const master=[{productId:'uat-brand-nk',name:'Synthetic NK',componentId:'uat-nk',material:'NK',active:true},{productId:'uat-brand-dap',name:'Synthetic DAP',componentId:'uat-dap',material:'DAP',active:true}]
function multi(fills=[row(1,9450,21),row(2,3225,21.5,'Synthetic DAP',150)]){
 const {r,dp}=fixture(fills);dp.pid='uat-pid';r.paddock=dp.pid;dp.areaHa=20;r.plannedDailyAreaHa=20;dp.materials[0].totalMaterial=9000
 dp.materials.push({material:'DAP',dosePerHa:150,doseUnit:'kg',unit:'kg',totalMaterial:3000})
 r.actualPlanMaterials=dp.materials.map(m=>({...m,totalMaterial:Number((m.dosePerHa*r.actualAreaHa).toFixed(4))}))
 return {r,dp}
}

export {multi,master,row}
