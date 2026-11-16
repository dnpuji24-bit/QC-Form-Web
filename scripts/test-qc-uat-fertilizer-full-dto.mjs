import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {buildQcActualPayload} from './qc-uat-load-actual-mapper.mjs'
import {validateFertilizerDto,summarizeFertilizerFillings} from '../src/qcUatFertilizerFullDto.mjs'
import {commitQcAndActual} from '../src/qcAtomicCommit.mjs'
import {operationalQueueId} from '../src/qcOperationalSaveTransport.mjs'
import {stripOperationalPhotoPayload} from '../src/qcOperationalPhotoManifest.mjs'
import {dailySourceProgress} from '../src/qcUatDailySourceProgress.mjs'
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
let n=0
const check=async(name,fn)=>{await fn();n++;console.log('PASS: '+name)}
const bad=(mutate,code)=>{const {r,dp}=fixture();mutate(r,dp);assert.throws(()=>validateFertilizerDto(r,dp),new RegExp(code))}
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
const commit=(h,r,baseRevision=null)=>commitQcAndActual({record:stripOperationalPhotoPayload(r),baseRevision,jobId:operationalQueueId(r.ownerUid,r.id,r.clientRevision),uploaderUid:r.ownerUid},h.deps)
await check('actual form formula sums separate fillings and distinguishes measured kg from planned estimate',()=>{
 const {r,dp,c}=fixture();validateFertilizerDto(r,dp);const s=summarizeFertilizerFillings(r.pengisianList)
 assert.equal(c.totalKgForDose,4000);assert.equal(s.ha,9);assert.equal(s.average,443.75);assert.equal(s.weighted,444.44);assert.equal(r.actualPlanMaterials[0].totalMaterial,4050)
})
await check('full DTO preserves carryover source and actual executor',()=>{const {r,dp}=fixture();validateFertilizerDto(r,dp);const a=buildQcActualPayload(r);assert.equal(a.dailyPlanId,dp.dailyPlanId);assert.equal(a.monthlyPlanLineId,dp.monthlyPlanLineId);assert.equal(a.shift,'2');assert.equal(a.foreman,'Mandor B');assert.equal(a.actualAreaHa,9);assert.equal(a.dailyVarianceHa,-1);assert.deepEqual(a.materials,r.actualPlanMaterials)})
await check('tampered source and reverse carryover rejected',()=>{bad(r=>r.monthlyPlanLineId='uat-wrong','SOURCE_DP_MISMATCH');bad((r,dp)=>{dp.shift='2';r.shift='1'},'SOURCE_SESSION_DENIED');bad((r,dp)=>{dp.shift='2';dp.foreman='Other'},'SOURCE_SESSION_DENIED')})
await check('forged ownership and unexpected fields rejected',()=>{bad(r=>r.ownerUid='uat-other','OWNER_MISMATCH');bad(r=>r.injected=true,'INVALID_FIELDS')})
await check('tampered filling dose and duplicate filling rejected',()=>{bad(r=>r.pengisianList[0].dosisAktual=1,'FILLING_DOSE_MISMATCH');bad(r=>r.pengisianList[1].pengisianKe=1,'INVALID_FILLING_ID')})
await check('tampered total area and average or weighted dose rejected',()=>{bad(r=>r.actualAreaHa=8,'FILLING_TOTAL_MISMATCH');bad(r=>r.averageActualDosage=1,'FILLING_TOTAL_MISMATCH');bad(r=>r.weightedActualDosage=1,'FILLING_TOTAL_MISMATCH')})
await check('estimated material cannot silently be replaced with measured usage',()=>{bad(r=>r.actualPlanMaterials[0].totalMaterial=4000,'PLANNED_MATERIAL_ESTIMATE_MISMATCH')})
await check('overnight HOLD and productivity verified; altered timing rejected',()=>{const {r,dp}=fixture();validateFertilizerDto(r,dp);assert.equal(r.effectiveWorkingMinutes,540);bad(r=>r.productivityHaPerHour=2,'TIMING_MISMATCH');bad(r=>r.downtimeList[0].end='00:31','DOWNTIME_MISMATCH');bad(r=>{r.holdIntervals[0].end='02:00';r.downtimeList[0].end='02:00'},'INVALID_HOLD_RANGE')})
await check('incomplete Draft generates no Actual; Ready rejects zero quantity',()=>{const {r,dp}=fixture([row(1,0,0)]);r.saveType='draft';validateFertilizerDto(r,dp);assert.equal(buildQcActualPayload(r),null);r.saveType='ready';assert.throws(()=>validateFertilizerDto(r,dp),/READY_FIELDS_REQUIRED/)})
await check('mixed products on potentially overlapping areas require policy review in this gate only',()=>{const {r,dp}=fixture([row(1,4500,10),row(2,1500,10,'Synthetic DAP',150)]);assert.equal(r.actualAreaHa,20);assert.throws(()=>validateFertilizerDto(r,dp),/MIXED_AREA_POLICY_UNRESOLVED/);r.saveType='draft';validateFertilizerDto(r,dp)})
await check('multi-component source requires policy review before synthetic Ready',()=>{const {r,dp}=fixture();const m={material:'DAP',dosePerHa:150,doseUnit:'kg',unit:'kg',totalMaterial:1200};dp.materials.push(m);r.actualPlanMaterials.push({...m,totalMaterial:1350});assert.throws(()=>validateFertilizerDto(r,dp),/MIXED_AREA_POLICY_UNRESOLVED/)})
await check('two shifts retain distinct Actual IDs and aggregate source progress without cap',async()=>{
 const {r,dp}=fixture(),h=harness(),r1={...r,id:'qc-v2-uat-fert-shift1',shift:'1',name:dp.foreman}
 validateFertilizerDto(r1,dp);validateFertilizerDto(r,dp);await commit(h,r1);await commit(h,r)
 assert.equal(h.ap().size,2)
 const rows=[...h.ap().values()]
 const p=dailySourceProgress({testOnly:true,dailyPlans:[{id:dp.dailyPlanId,targetArea100:800,kind:'fertilizer',shift:'1'}],actualReports:rows.map((a,i)=>({id:'uat-a'+i,dailyPlanId:a.dailyPlanId,actualArea100:a.actualAreaHa*100,shift:a.shift,foreman:a.foreman}))}).rows[0]
 assert.equal(p.actualArea100,1800);assert.equal(p.overArea100,1000);assert.equal(p.progressPct,225);assert.deepEqual(p.actualByShift100,{'1':900,'2':900})
})
await check('Draft to Ready and correction update one Actual without duplicating audit on replay',async()=>{
 const {r,dp}=fixture(),h=harness();await commit(h,validateFertilizerDto({...r,saveType:'draft'},dp));assert.equal(h.ap().size,0)
 const ready={...r,clientRevision:'uat-r2'};await commit(h,validateFertilizerDto(ready,dp),'uat-r1')
 const corrected={...fixture([row(1,4500,10)]).r,clientRevision:'uat-r3'};await commit(h,validateFertilizerDto(corrected,dp),'uat-r2');await commit(h,corrected,'uat-r2')
 assert.equal(h.ap().size,1);assert.equal(h.ap().get('qcactual_'+r.id).actualAreaHa,10);assert.equal(h.audit().size,3);await assert.rejects(commit(h,{...corrected,clientRevision:'uat-r4'},'uat-r1'),/QC_REVISION_CONFLICT/)
})
await check('atomic mock abort leaves both records and audit unchanged',async()=>{const {r,dp}=fixture(),h=harness();h.abort();await assert.rejects(commit(h,validateFertilizerDto(r,dp)),/MOCK_ABORT/);assert.equal(h.q().size,0);assert.equal(h.ap().size,0);assert.equal(h.audit().size,0)})
console.log('SUCCESS: '+n+' synthetic full Fertilizer DTO, actual mapper and mock atomic checks')
