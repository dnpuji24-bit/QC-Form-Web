import assert from 'node:assert/strict'
import {test} from 'node:test'
import {dailyPlansToWhatsApp} from '../src/dailyPlanActions.ts'

const base={
 dailyPlanId:'DP-001',workGroupId:'work-001',planningOrder:1,date:'2026-11-22',
 shift:'2',sourceType:'MONTHLY',monthlyPlanLineId:'MP-001',woNumber:'WO-RT-002',
 plannedShift:'1',coaCode:'60100302',operationCode:'10724175',
 department:'Upkeep Manuring - Ratoon',companyCode:'GPA',farm:'Farm A',
 pid:'JAGF-2-K-003',activity:'Top Dressing',description:'Top Dressing C',
 areaHa:3.5,manpower:8,unitName:'Fertilizer Applicator',
 unitReady:2,unitStandby:0,unitBreakdown:0,foreman:'Gustinus Lorong',
 notes:'Perhatikan kesiapan alat',pidNotes:'',
 materials:[{material:'NK 20:30',dosePerHa:450,doseUnit:'kg',totalMaterial:1575,unit:'kg'}],
}
const second={...base,dailyPlanId:'DP-002',pid:'JAGF-2-K-004',
 woNumber:'WO-RT-003',plannedShift:'2',areaHa:5,
 materials:[{...base.materials[0],totalMaterial:2250}]}

test('Daily Plan header and per-PID WO are readable and not concatenated',()=>{
 const output=dailyPlansToWhatsApp([base,second])
 assert.match(output,/^\*DAILY PLAN\*\n📅 Tanggal: 22 November 2026/m)
 assert.doesNotMatch(output,/DAILY PLANNING|Description Operation|🧾 Kegiatan:|Top Dressing C/)
 assert.match(output,/\*01\. TOP DRESSING\*/)
 assert.match(output,/📍 \*1\. JAGF-2-K-003\*/)
 assert.match(output,/📍 \*2\. JAGF-2-K-004\*/)
 assert.match(output,/WO\s+: WO-RT-002\nOperation Code\s+: 10724175\nCoA\s+: 60100302\nLuas Rencana\s+: 3,50 Ha\nShift WO\s+: 1 → Shift Kerja 2/)
 assert.match(output,/WO\s+: WO-RT-003[\s\S]*?Shift WO\s+: 2 → Shift Kerja 2/)
 assert.ok(output.includes('────────────────────'))
 assert.ok(output.includes('━━━━━━━━━━━━━━━━'))
})
test('Material doses and unit-specific total are accurate',()=>{
 const output=dailyPlansToWhatsApp([base,second])
 assert.match(output,/NK 20:30 : 450 kg\/Ha/)
 assert.doesNotMatch(output,/kg\/Ha\/Ha/)
 assert.match(output,/Kebutuhan: 1\.575 kg/)
 assert.match(output,/Kebutuhan: 2\.250 kg/)
 assert.match(output,/\*TOTAL MATERIAL\*[\s\S]*NK 20:30 : \*3\.825 kg\*/)
 assert.match(output,/\*RINGKASAN SHIFT\*/)
 assert.match(output,/Total WO\s+: 2/)
 assert.match(output,/Total Paddock\s+: 2/)
 assert.match(output,/Total Luas\s+: 8,50 Ha/)
 assert.match(output,/Total HK\s+: 8/)
})
test('Resource is two monospaced columns without truncating names',()=>{
 const output=dailyPlansToWhatsApp([base,second])
 const resource=output.split('*RESOURCE OPERASIONAL*')[1].split('📝 Catatan:')[0]
 assert.match(resource,/Mandor: Gustinus[\s\S]*│ HK: 8/)
 assert.match(resource,/Lorong/)
 assert.match(resource,/Unit: Fertilizer/)
 assert.match(resource,/Applicator/)
 assert.match(resource,/Ready: 2/)
 assert.match(resource,/Breakdown: 0\s+│ Standby: 0/)
 assert.match(output,/📝 Catatan: Perhatikan kesiapan alat/)
 assert.equal((output.match(/\*RESOURCE OPERASIONAL\*/g)||[]).length,1)
})
test('Cross-shift groups are counted separately without duplicate WO',()=>{
 const one={...base,shift:'1',dailyPlanId:'DP-3',workGroupId:'shared-001',materials:[],notes:'',pidNotes:'',areaHa:1}
 const two={...base,shift:'2',dailyPlanId:'DP-4',workGroupId:'shared-001',materials:[],notes:'',pidNotes:'',areaHa:2}
 const output=dailyPlansToWhatsApp([one,two])
 assert.match(output,/\*SHIFT KERJA 1\*/)
 assert.match(output,/\*SHIFT KERJA 2\*/)
 assert.match(output,/\*RINGKASAN DAILY PLAN\*/)
 assert.match(output,/Total WO\s+: 1/)
 assert.match(output,/Total HK\s+: 16/)
 assert.doesNotMatch(output,/\*TOTAL MATERIAL\*/)
})
test('Legacy ADHOC Daily remains readable without WO',()=>{
 const output=dailyPlansToWhatsApp([{
   ...base,woNumber:'',operationCode:'',coaCode:'',department:'',
   plannedShift:'',sourceType:'ADHOC',description:'Top Dressing',materials:[],notes:'',pidNotes:'',
 }])
 assert.match(output,/\*DAILY PLAN\*/)
 assert.match(output,/Luas Rencana\s+: 3,50 Ha/)
 assert.doesNotMatch(output,/WO\s+: -|Operation Code\s+: -|CoA\s+: -|Shift WO\s+: -/)
 assert.match(output,/Total WO\s+: 0/)
 assert.equal(dailyPlansToWhatsApp([]),'')
})
test('Different material units are not combined',()=>{
 const mixed={...second,materials:[{material:'NK 20:30',dosePerHa:3,doseUnit:'L/Ha',totalMaterial:15,unit:'L'}]}
 const output=dailyPlansToWhatsApp([base,mixed])
 assert.match(output,/NK 20:30 : 3 L\/Ha/)
 assert.doesNotMatch(output,/L\/Ha\/Ha/)
 assert.match(output,/NK 20:30 : \*1\.575 kg\*/)
 assert.match(output,/NK 20:30 : \*15 L\*/)
})

test('WA copy includes actual primary and support unit codes once for multi-PID work',()=>{
 const primary={...base,activity:'Stool Splitting',description:'Stool Splitter',
   unitName:'STOOL SPLITTER',unitRequired:2,unitPreferredCodes:['SS001','SS002'],
   supportUnits:[{id:'dt-support',unitName:'DUMP TRUCK',unitRequired:1,
     unitPreferredCodes:['DT123T'],notes:'Angkut material ke paddock'}],
   dispatchUnits:[
     {requirementId:'primary',unitName:'STOOL SPLITTER',unitCode:'SS001'},
     {requirementId:'primary',unitName:'STOOL SPLITTER',unitCode:'SS002'},
     {requirementId:'support:dt-support',unitName:'DUMP TRUCK',unitCode:'DT123T'}
   ],materials:[],notes:''}
 const wa=dailyPlansToWhatsApp([primary,{...primary,dailyPlanId:'DP-003',pid:'JAGF-2-K-005'}])
 assert.match(wa,/DAFTAR UNIT & EQUIPMENT/)
 assert.match(wa,/Utama: STOOL SPLITTER — 2 unit/)
 assert.match(wa,/Kode: SS001, SS002/)
 assert.match(wa,/Support: DUMP TRUCK — 1 unit/)
 assert.match(wa,/Kode: DT123T/)
 assert.match(wa,/Keterangan: Angkut material ke paddock/)
 assert.doesNotMatch(wa,/No Unit:/)
 assert.equal((wa.match(/Support: DUMP TRUCK/g)||[]).length,1)
})
test('WA copy labels proposed codes separately when Unit Dispatch has no confirmed assignment',()=>{
 const row={...base,unitName:'STOOL SPLITTER',unitRequired:1,unitPreferredCodes:['SS003'],
   supportUnits:[{id:'dt-support',unitName:'DUMP TRUCK',unitRequired:1,
     unitPreferredCodes:['DT124T'],notes:''}],materials:[]}
 const wa=dailyPlansToWhatsApp([row])
 assert.match(wa,/No Unit: SS003/)
 assert.match(wa,/No Unit: DT124T/)
 assert.doesNotMatch(wa,/Kode: SS003/)
})
test('WA copy remains readable for legacy records without selected codes',()=>{
 const wa=dailyPlansToWhatsApp([base])
 assert.match(wa,/Unit: Fertilizer/)
 assert.match(wa,/DAFTAR UNIT & EQUIPMENT/)
 assert.match(wa,/Kode: belum ditentukan/)
})
