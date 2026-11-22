import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {test} from 'node:test'
import {dailyPlansToWhatsApp} from '../src/dailyPlanActions.ts'

const source=readFileSync(new URL('../src/actualPlanActions.ts',import.meta.url),'utf8')
const base={
 dailyPlanId:'DP-001',workGroupId:'AWG-01',planningOrder:1,date:'2026-11-22',
 shift:'2',sourceType:'MONTHLY',monthlyPlanLineId:'MP-0001',woNumber:'WO-RT-002',
 plannedShift:'1',operationCode:'10724175',coaCode:'60100302',department:'Upkeep Manuring-Ratoon',
 companyCode:'GPA',farm:'Farm A',pid:'JAGF-2-K-003',activity:'Top Dressing',description:'Top Dressing',
 areaHa:3.5,manpower:8,unitName:'Fertilizer Applicator',unitReady:2,unitStandby:0,unitBreakdown:0,
 foreman:'Gustinus Lorong',notes:'',pidNotes:'',
 materials:[{material:'NK 20:30',dosePerHa:450,doseUnit:'kg',unit:'kg',totalMaterial:1575}]
}
const second={...base,dailyPlanId:'DP-002',woNumber:'WO-RT-003',
 pid:'JAGF-2-K-004',areaHa:5,materials:[{...base.materials[0],totalMaterial:2250}]}
function format(rows){
 return dailyPlansToWhatsApp(rows).replace('*DAILY PLAN*','*ACTUAL PLAN*')
  .replaceAll('Total Rencana:','Total Actual:').replaceAll('Luas Rencana','Luas Actual')
  .replace('*RINGKASAN DAILY PLAN*','*RINGKASAN ACTUAL PLAN*')
}
test('Actual copy WA reuses exact approved Daily formatting with Actual labels',()=>{
 assert.match(source,/dailyPlansToWhatsApp\(transfers\)/)
 assert.match(source,/areaHa:row\.actualAreaHa/)
 assert.match(source,/shift:row\.shift/)
 assert.match(source,/woNumber:row\.woNumber/)
 assert.match(source,/plannedShift:row\.plannedShift/)
 assert.match(source,/coaCode:row\.coaCode/)
 assert.match(source,/operationCode:row\.operationCode/)
 for(const label of ["*ACTUAL PLAN*","Total Actual:","Luas Actual","*RINGKASAN ACTUAL PLAN*"]){
  assert.ok(source.includes(label),'Missing Actual text label: '+label)
 }
 const msg=format([base,second])
 assert.match(msg,/^\*ACTUAL PLAN\*/)
 assert.match(msg,/\*SHIFT KERJA 2\*/)
 assert.match(msg,/\*01\. TOP DRESSING\*/)
 assert.match(msg,/Total Actual: \*8,50 Ha\*/)
 assert.match(msg,/WO\s+: WO-RT-002\nOperation Code\s+: 10724175\nCoA\s+: 60100302\nLuas Actual\s+: 3,50 Ha\nShift WO\s+: 1 → Shift Kerja 2/)
 assert.doesNotMatch(msg,/Description Operation|🧾 Kegiatan:/)
})
test('Actual material totals and two-column resource format follow Daily',()=>{
 const msg=format([base,second])
 assert.match(msg,/\*RESOURCE OPERASIONAL\*/)
 assert.match(msg,/Mandor: Gustinus[\s\S]+│ HK: 8/)
 assert.match(msg,/Breakdown: 0\s+│ Standby: 0/)
 assert.match(msg,/\*TOTAL MATERIAL\*[\s\S]*NK 20:30 : \*3\.825 kg\*/)
 assert.match(msg,/Total WO\s+: 2/)
 assert.match(msg,/Total Paddock\s+: 2/)
 assert.match(msg,/Total Luas\s+: 8,50 Ha/)
 assert.match(msg,/Total HK\s+: 8/)
})
test('Actual includes both shift choices but no fake WO for legacy records',()=>{
 const legacy={...base,woNumber:'',plannedShift:'',operationCode:'',coaCode:'',department:'',
  materials:[],notes:'',pidNotes:''}
 const msg=format([legacy])
 assert.match(msg,/\*ACTUAL PLAN\*/)
 assert.match(msg,/Luas Actual\s+: 3,50 Ha/)
 assert.doesNotMatch(msg,/WO\s+: -|Operation Code\s+: -|CoA\s+: -/)
 assert.match(msg,/Total WO\s+: 0/)
 const multi=format([{...base,shift:'1'},second])
 assert.match(multi,/\*SHIFT KERJA 1\*/)
 assert.match(multi,/\*SHIFT KERJA 2\*/)
 assert.match(multi,/\*RINGKASAN ACTUAL PLAN\*/)
})
