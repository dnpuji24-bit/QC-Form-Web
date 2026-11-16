import {validateSprayDto} from '../src/qcUatSprayFullDto.mjs'
import {fixture} from './qc-uat-spray-full-dto-fixture.mjs'
function need(v,code){if(!v)throw Error(code)}
function testAll(){
 let n=0
 const test=(mutate,code)=>{const {r,dp}=fixture();mutate(r,dp);let got;try{validateSprayDto(r,dp)}catch(e){got=e.message}need(got===code,'EXPECTED '+code+' GOT '+got);n++}
 test(()=>{},undefined)
 test((r,dp)=>{r.shift='1';r.name=dp.foreman},undefined)
 test((r,dp)=>{dp.shift='2';dp.foreman=r.name},undefined)
 test(r=>r.actualAreaHa=8,'AREA_MISMATCH')
 test(r=>r.dailyPlanId='uat-other','SOURCE_DP_MISMATCH')
 test(r=>r.monthlyPlanLineId='uat-other','SOURCE_DP_MISMATCH')
 test(r=>r.plannedDailyAreaHa=9,'SOURCE_DP_MISMATCH')
 test((r,dp)=>{dp.shift='2';r.shift='1'},'SOURCE_SESSION_DENIED')
 test(r=>{r.shift='1'},'SOURCE_SESSION_DENIED')
 test(r=>r.actualPlanMaterials[0].totalMaterial=16,'MATERIAL_MISMATCH')
 test(r=>r.dosage1=3,'PESTICIDE_SLOT_MISMATCH')
 test(r=>r.estUsageAdjuvant='0','ADJUVANT_MISMATCH')
 test(r=>r.effectiveWorkingMinutes=600,'TIMING_MISMATCH')
 test(r=>r.holdIntervals[0].start='14:00','INVALID_HOLD_RANGE')
 test(r=>r.holdIntervals.push({...r.holdIntervals[0]}),'INVALID_HOLD_ID')
 test(r=>r.holdIntervals.push({...r.holdIntervals[0],holdId:'uat-h2',start:'23:45',end:'00:45'}),'INVALID_HOLD_RANGE')
 test(r=>r.startTime='25:00','INVALID_CLOCK')
 test(r=>r.ownerUid='uat-other','OWNER_MISMATCH')
 test(r=>r.unexpected=true,'INVALID_FIELDS')
 test(r=>r.testOnly=false,'SYNTHETIC_SPRAY_ONLY')
 test(r=>{r.saveType='draft';r.startTime='';r.endTime='';r.workingDurationMinutes=0;r.effectiveWorkingMinutes=0;r.productivityHaPerHour=0},undefined)
 return n
}
console.log('SUCCESS: '+testAll()+' full-shape Spray DTO validation checks (synthetic offline)')
