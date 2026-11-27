import assert from 'node:assert/strict'
import {test} from 'node:test'
import {buildBkmCandidates,bkmAvailableCandidates} from '../src/bkmAggregation.mjs'
const date='2026-11-27',past='2026-11-26'
const line={companyCode:'GPA',pid:'J-012',monthlyPlanLineId:'P1',woNumber:'WO-1',activity:'Fertilizer',description:'Top Dressing C',operationCode:'107241'}
const other={...line,monthlyPlanLineId:'P2',pid:'J-013'}
const daily=[{...line,id:'D1',dailyPlanId:'D1',date,shift:'1'},{...line,id:'D2',dailyPlanId:'D2',date,shift:'2'},{...other,id:'D3',dailyPlanId:'D3',date,shift:'1'}]
const a=(id,extra={})=>({...line,id,actualReportId:id,dailyPlanId:'D1',date,shift:'1',actualAreaHa:5,manpower:3,sourceOrigin:'WEB',...extra})
const actual=[a('A1'),a('A2',{dailyPlanId:'D2',shift:'2',actualAreaHa:8,manpower:4}),a('A3',{...other,dailyPlanId:'D3',actualAreaHa:2})]
const history=[a('A0',{date:past,actualAreaHa:4}),...actual,a('future',{date:'2026-11-28',actualAreaHa:99})]
const monthly=[{...line,id:'P1',planLineId:'P1',targetAreaHa:20},{...other,id:'P2',planLineId:'P2',targetAreaHa:10}]
const paddocks=[{id:'J-012',pid:'J-012',companyCode:'GPA',areaPlantedHa:25},{id:'J-013',pid:'J-013',companyCode:'GPA',areaPlantedHa:14}]
test('same WO on distinct paddocks, both shifts, as-of SHI, no duplicate record',()=>{
 const rows=buildBkmCandidates({date,daily,actual,history,monthly,paddocks})
 assert.equal(rows.length,2)
 assert.equal(rows[0].hi,13);assert.equal(rows[0].shi,17)
 assert.equal(rows[0].target,20);assert.equal(rows[0].progress,85);assert.equal(rows[0].hk,7)
 assert.equal(rows[0].area,25);assert.equal(rows[1].hi,2)
 assert.equal(bkmAvailableCandidates(rows,'GPA','WO-1').length,2)
 assert.equal(bkmAvailableCandidates(rows,'GPA','').length,2)
 assert.equal(bkmAvailableCandidates(rows,'GPA','WO-OTHER').length,0)
 assert.equal(bkmAvailableCandidates(rows,'GPA','',[rows[0].id]).length,1)
})
test('optional WO and missing monthly link never invent a target or cumulative quantity',()=>{
 const r={...line,id:'D4',dailyPlanId:'D4',monthlyPlanLineId:'',woNumber:'',date}
 const [c]=buildBkmCandidates({date,daily:[r],actual:[{...r,id:'A4',actualReportId:'A4',actualAreaHa:3}],paddocks})
 assert.equal(c.wo,'');assert.equal(c.hi,3);assert.equal(c.shi,null);assert.equal(c.target,null);assert.equal(c.progress,null)
})
test('QC and manual actual overlap is blocked; no guessed HK or duplicated quantities',()=>{
 const rows=buildBkmCandidates({date,daily:[daily[0]],actual:[a('manual'),a('qc',{sourceOrigin:'QC',qcRecordId:'QC1'})],monthly,paddocks})
 assert.equal(rows[0].conflict,true);assert.equal(rows[0].hi,null);assert.equal(rows[0].shi,null)
})
test('only actual allocated source quantities enter material; no QC/manual dose estimate',()=>{
 const measured=a('Q1',{sourceOrigin:'QC',qcRecordId:'Q1',qcWorkId:'W1',materials:[{material:'NK',unit:'Kg',totalMaterial:100,sourceFillingId:'fill1'},{material:'DAP',unit:'Kg',totalMaterial:20}]})
 const [r]=buildBkmCandidates({date,daily:[daily[0]],actual:[measured,{...measured,id:'duplicate'}],history:[{...measured,id:'Q0',qcRecordId:'Q0',date:past}],monthly,paddocks})
 assert.equal(r.hi,5);assert.equal(r.shi,10);assert.equal(r.hk,null)
 assert.equal(r.material.length,1);assert.equal(r.material[0].hi,100);assert.equal(r.material[0].shi,200)
 assert.ok(r.warnings.some(w=>w.includes('material')))
})
