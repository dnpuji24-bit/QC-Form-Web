import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {buildQcActualPayload} from './qc-uat-load-actual-mapper.mjs'
import {validateFertilizerDto} from '../src/qcUatFertilizerFullDto.mjs'
import {prepareComponentFertilizer,componentActual,commitComponentFertilizer,componentProgressRecords} from '../src/qcUatFertilizerMaterialIntegration.mjs'
import {fertilizerComponentProgress} from '../src/qcUatFertilizerComponentProgress.mjs'
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
function harness(){
 let q=new Map(),ap=new Map(),audit=new Map(),abort=false
 const deps={currentUid:async()=> 'uat-fertilizer',buildActual:buildQcActualPayload,transaction:async fn=>{
  const nq=new Map(q),na=new Map(ap),nu=new Map(audit)
  const result=await fn({readQc:async id=>nq.get(id)??null,readActual:async id=>na.get(id)??null,writeQc:(id,r)=>{nq.set(id,structuredClone(r));nu.set(id+':'+r.clientRevision,true)},writeActual:(id,r)=>na.set(id,structuredClone(r))})
  if(abort){abort=false;throw Error('MOCK_ABORT')}
  q=nq;ap=na;audit=nu;return result
 }}
 return {deps,q:()=>q,ap:()=>ap,audit:()=>audit,abort:()=>{abort=true}}
}

const master=[{productId:'uat-brand-nk',name:'Synthetic NK',componentId:'uat-nk',material:'NK',active:true},{productId:'uat-brand-dap',name:'Synthetic DAP',componentId:'uat-dap',material:'DAP',active:true}]
function multi(fills=[row(1,9450,21),row(2,3225,21.5,'Synthetic DAP',150)]){
 const {r,dp}=fixture(fills);dp.pid='uat-pid';r.paddock=dp.pid;dp.areaHa=20;r.plannedDailyAreaHa=20;dp.materials[0].totalMaterial=9000
 dp.materials.push({material:'DAP',dosePerHa:150,doseUnit:'kg',unit:'kg',totalMaterial:3000})
 r.actualPlanMaterials=dp.materials.map(m=>({...m,totalMaterial:Number((m.dosePerHa*r.actualAreaHa).toFixed(4))}))
 return {r,dp}
}
const prepare=(r,dp,products=master)=>prepareComponentFertilizer(r,dp,products)
const commit=(h,r,dp,baseRevision=null,products=master)=>commitComponentFertilizer({record:r,dp,master:products,baseRevision,uploaderUid:r.ownerUid},h.deps)
const readProgress=(h,dp)=>{
 const components=dp.materials.map(m=>({componentId:master.find(p=>p.material===m.material).componentId,targetArea100:2000,targetDoseKgHa:m.dosePerHa}))
 return fertilizerComponentProgress({testOnly:true,monthlyPlans:[{id:dp.monthlyPlanLineId,pid:dp.pid,components}],dailyPlans:[{id:dp.dailyPlanId,monthlyPlanLineId:dp.monthlyPlanLineId,pid:dp.pid,date:dp.date,shift:dp.shift,foreman:dp.foreman,components}],products:master.map(p=>({id:p.productId,componentId:p.componentId,active:p.active})),records:componentProgressRecords([...h.ap().values()])})
}
let n=0
const check=async(name,fn)=>{await fn();n++;console.log('PASS: '+name)}
await check('full legacy DTO becomes component-aware without pooling hectares',()=>{const {r,dp}=multi();assert.throws(()=>validateFertilizerDto(r,dp),/MIXED_AREA_POLICY_UNRESOLVED/);const q=prepare(r,dp);assert.equal(q.applicationArea100,4250);assert.deepEqual(q.fertilizerComponents.map(c=>[c.actualArea100,c.actualKg100,c.estimatedKg100]),[[2100,945000,945000],[2150,322500,322500]]);assert.deepEqual(q.actualPlanMaterials.map(c=>c.totalMaterial),[9450,3225]);const a=componentActual(q,buildQcActualPayload);assert.equal(a.actualAreaHa,undefined);assert.equal(a.dailyVarianceHa,undefined);assert.equal(a.materials,undefined);assert.equal(a.dailyPlanId,dp.dailyPlanId);assert.equal(a.foreman,'Mandor B');assert.equal(a.shift,'2')})
await check('one component Ready is allowed; remaining component is zero',()=>{const {r,dp}=multi([row(1,9400,21)]);const q=prepare(r,dp);assert.deepEqual(q.fertilizerComponents.map(c=>[c.actualArea100,c.actualKg100,c.estimatedKg100]),[[2100,940000,945000],[0,0,0]])})
await check('measured consumption separate from component estimates',()=>{const {r,dp}=multi([row(1,1750,4),row(2,2250,5),row(3,1500,10,'Synthetic DAP',150)]);const q=prepare(r,dp);assert.deepEqual(q.fertilizerComponents.map(c=>[c.actualArea100,c.actualKg100,c.estimatedKg100]),[[900,400000,405000],[1000,150000,150000]]);assert.ok(Math.abs(q.fertilizerComponents[0].weightedDoseKgHa-4000/9)<1e-10)})
await check('unknown inactive and duplicate product names denied',()=>{const {r,dp}=multi();assert.throws(()=>prepare(r,dp,master.filter(p=>p.material==='NK')),/UNMAPPED_SOURCE_COMPONENT/);assert.throws(()=>prepare(r,dp,master.map(p=>({...p,active:false}))),/PRODUCT_NOT_AUTHORIZED/);assert.throws(()=>prepare(r,dp,[...master,{...master[0],productId:'uat-other'}]),/AMBIGUOUS_PRODUCT/)})
await check('wrong target dose and unplanned product denied',()=>{let {r,dp}=multi([row(1,9450,21,'Synthetic NK',150)]);assert.throws(()=>prepare(r,dp),/COMPONENT_TARGET_DOSE_MISMATCH/);({r,dp}=multi());const m=[...master,{productId:'uat-urea',name:'Synthetic Urea',componentId:'uat-urea',material:'UREA',active:true}];r.pengisianList[1].jenisPupuk='Synthetic Urea';assert.throws(()=>prepare(r,dp,m),/PRODUCT_NOT_IN_SOURCE/)})
await check('multiple brands per source component aggregate',()=>{const {r,dp}=multi([row(1,4500,10),row(2,4950,11,'NK Alternate')]);const q=prepare(r,dp,[...master,{...master[0],productId:'uat-brand-nk2',name:'NK Alternate'}]);assert.equal(q.fertilizerComponents[0].actualArea100,2100);assert.equal(q.fertilizerComponents[0].fillings.length,2)})
await check('forged totals estimates and excessive precision denied',()=>{let {r,dp}=multi();r.actualAreaHa=20;assert.throws(()=>prepare(r,dp),/FILLING_TOTAL_MISMATCH/);({r,dp}=multi());r.actualPlanMaterials[1].totalMaterial=3225;assert.throws(()=>prepare(r,dp),/PLANNED_MATERIAL_ESTIMATE_MISMATCH/);({r,dp}=multi([row(1,450,1.001)]));assert.throws(()=>prepare(r,dp),/COMPONENT_PRECISION_REQUIRED/)})
await check('photo-free Draft creates no Actual then Ready credits one component',async()=>{const {r,dp}=multi([row(1,9450,21)]),h=harness();await commit(h,{...r,saveType:'draft'},dp);assert.equal(h.ap().size,0);await commit(h,{...r,clientRevision:'uat-r2'},dp,'uat-r1');const p=readProgress(h,dp);assert.equal(p.daily[0].done,false);assert.equal(p.monthly[0].components[1].remainingArea100,2000)})
await check('separate shifts aggregate by source and independent component progress',async()=>{const {r,dp}=multi([row(1,9450,21)]),h=harness();await commit(h,{...r,shift:'1',name:'Mandor A'},dp);const second=multi([row(1,3225,21.5,'Synthetic DAP',150)]).r;await commit(h,{...second,id:'qc-v2-uat-fert2'},dp);const p=readProgress(h,dp);assert.equal(h.ap().size,2);assert.equal(p.daily[0].done,true);assert.equal(p.daily[0].limitingProgressPct,105);assert.deepEqual(p.monthly[0].components.map(c=>c.actualArea100),[2100,2150])})
await check('correction updates same Actual and exact retry has no duplicate audit',async()=>{const {r,dp}=multi(),h=harness();await commit(h,r,dp);const next={...multi([row(1,9450,21),row(2,2700,18,'Synthetic DAP',150)]).r,clientRevision:'uat-r2'};await commit(h,next,dp,'uat-r1');await commit(h,next,dp,'uat-r1');assert.equal(h.ap().size,1);assert.equal(h.audit().size,2);assert.equal(readProgress(h,dp).daily[0].limitingProgressPct,90);await assert.rejects(commit(h,{...r,clientRevision:'uat-r2'},dp,'uat-r1'),/COMPONENT_REPLAY_CONFLICT/)})
await check('stale correction and source reassignment rejected',async()=>{const {r,dp}=multi(),h=harness();await commit(h,r,dp);await assert.rejects(commit(h,{...r,clientRevision:'uat-r2'},dp,'uat-old'),/QC_REVISION_CONFLICT/);await assert.rejects(commit(h,{...r,clientRevision:'uat-r2',dailyPlanId:'uat-dp2'},{...dp,dailyPlanId:'uat-dp2'},'uat-r1'),/COMPONENT_SOURCE_IMMUTABLE/)})
await check('corrupted paired Actual blocks exact replay',async()=>{const {r,dp}=multi(),h=harness();await commit(h,r,dp);h.ap().get('qcactual_'+r.id).fertilizerComponents[0].actualArea100=1;await assert.rejects(commit(h,r,dp),/COMPONENT_PAIR_MISMATCH/)})
await check('failed transaction leaves QC Actual and audit unchanged',async()=>{const {r,dp}=multi(),h=harness();h.abort();await assert.rejects(commit(h,r,dp),/MOCK_ABORT/);assert.equal(h.q().size,0);assert.equal(h.ap().size,0);assert.equal(h.audit().size,0)})
await check('photo and old scalar Actual fail closed',()=>{const {r,dp}=multi();assert.throws(()=>prepare({...r,photoBase64:'data:image/png;base64,AAAA'},dp),/PHOTO_GATE_PENDING/);assert.throws(()=>componentProgressRecords([buildQcActualPayload(r)]),/COMPONENT_ACTUAL_REQUIRED/)})
console.log('SUCCESS: '+n+' full Fertilizer component DTO, Actual and mock atomic integration checks')
