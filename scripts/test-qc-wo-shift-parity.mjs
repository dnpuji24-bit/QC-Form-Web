import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {test} from 'node:test'
import {qcWorkOrderPlansByKind,qcSelectedWorkOrder,qcSearchWorkOrders,qcMergeEligiblePlans} from '../src/qcWorkOrderSelection.mjs'

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8')
const source=read('src/qcDailyPlanSource.ts')
const base={date:'2026-11-22',companyCode:'GPA',farm:'F1',areaHa:20,
 masterVariety:'R570',unitName:'Boom Sprayer',planningOrder:1}
const rows=[
 {...base,id:'daily-a',dailyPlanId:'DP-A',monthlyPlanLineId:'MP-A',
  woNumber:'WO-SP-001',plannedShift:'1',operationCode:'10723001',
  coaCode:'60100209',department:'Ratoon Weed Control',shift:'1',foreman:'Mandor A',
  pid:'A-007',activity:'Post Emergence',description:'Post Emergence A',
  type:'SPRAY',activityCategory:'HERBICIDE',
  materials:[{material:'Glyphosate',dosePerHa:2,doseUnit:'L',unit:'L',totalMaterial:40}]},
 {...base,id:'daily-b',dailyPlanId:'DP-B',monthlyPlanLineId:'MP-A',
  woNumber:'WO-SP-001',plannedShift:'1',operationCode:'10723001',
  coaCode:'60100209',department:'Ratoon Weed Control',shift:'2',foreman:'Mandor B',
  pid:'A-007',activity:'Post Emergence',description:'Post Emergence A',
  type:'SPRAY',activityCategory:'HERBICIDE',
  materials:[{material:'Glyphosate',dosePerHa:2,doseUnit:'L',unit:'L',totalMaterial:40}]},
 {...base,id:'daily-c',dailyPlanId:'DP-C',monthlyPlanLineId:'MP-C',
  woNumber:'WO-FERT-002',plannedShift:'2',operationCode:'10724175',
  coaCode:'60100302',department:'Upkeep Manuring',shift:'2',foreman:'Mandor C',
  pid:'J-003',activity:'Top Dressing',description:'Top Dressing C',
  type:'FERTILIZER',activityCategory:'FERTILIZER',
  materials:[{material:'NK 20:30',dosePerHa:450,doseUnit:'kg',unit:'kg',totalMaterial:9000}]},
 {...base,id:'daily-legacy',dailyPlanId:'DP-LEGACY',monthlyPlanLineId:'',
  woNumber:'',shift:'1',foreman:'Mandor D',pid:'K-009',
  activity:'Top Dressing',description:'Top Dressing C',
  type:'FERTILIZER',activityCategory:'FERTILIZER',materials:[]}
]
const select=(date,form)=>qcWorkOrderPlansByKind(rows,date,row=>
 (form==='spray'?row.type==='SPRAY':row.type==='FERTILIZER'))
test('Actual Daily source mapper carries all WO/CoA fields and retains material snapshots',()=>{
 for(const field of ['woNumber','plannedShift','operationCode','coaCode',
  'department','catalogActivityId','activityCode']){
  assert.ok(source.includes(field+':text(row.'+field+')'),'Missing QC source field: '+field)
 }
 assert.match(source,/getDocs\(query\(collection\(firestoreDb,'daily_plans'\),where\('date','==',date\)\)\)/)
 assert.match(source,/materials:materials\(row\.materials\)/)
 assert.match(source,/qcWorkOrderPlansByKind\(rows,date,row=>qcDailyKind\(row\)===kind\)/)
 assert.match(source,/return qcSelectedWorkOrder\(qcWorkOrderPlans\(rows,kind,date\),selectedId\)/)
 assert.equal(rows[0].materials[0].dosePerHa,2)
 assert.equal(rows[2].materials[0].dosePerHa,450)
})
test('Bidirectional QC cross-shift selects exact Daily ID, not WO-only identity',()=>{
 const spray=select('2026-11-22','spray')
 assert.equal(spray.length,2)
 const sourceShift1=qcSelectedWorkOrder(spray,'DP-A')
 const sourceShift2=qcSelectedWorkOrder(spray,'DP-B')
 assert.equal(sourceShift1.shift,'1')
 assert.equal(sourceShift2.shift,'2')
 const shift2Qc=qcMergeEligiblePlans([sourceShift2],[],[sourceShift1])
 const shift1Qc=qcMergeEligiblePlans([sourceShift1],[],[sourceShift2])
 assert.deepEqual(shift2Qc.map(row=>row.dailyPlanId),['DP-B','DP-A'])
 assert.deepEqual(shift1Qc.map(row=>row.dailyPlanId),['DP-A','DP-B'])
 assert.equal(qcSelectedWorkOrder(shift1Qc,'DP-B').woNumber,'WO-SP-001')
 assert.equal(qcSelectedWorkOrder(shift2Qc,'DP-A').plannedShift,'1')
})
test('Selected WO must have correct QC kind and date; duplicate Daily IDs are rejected',()=>{
 assert.equal(select('2026-11-23','spray').length,0)
 assert.equal(select('2026-11-22','fertilizer').length,2)
 assert.equal(qcSelectedWorkOrder(select('2026-11-22','fertilizer'),'DP-A'),null)
 assert.equal(qcSelectedWorkOrder(select('2026-11-22','spray'),'WO-SP-001'),null)
 assert.equal(qcSelectedWorkOrder([rows[0],{...rows[0],id:'copy'}],'DP-A'),null)
 assert.equal(qcSelectedWorkOrder(select('2026-11-22','spray'),'missing'),null)
})
test('Smartsearch matches WO, PID, Operation Code, CoA and Daily ID without conflating rows',()=>{
 assert.deepEqual(qcSearchWorkOrders(rows,'WO-SP-001').map(r=>r.dailyPlanId),['DP-A','DP-B'])
 assert.equal(qcSearchWorkOrders(rows,'60100302')[0].dailyPlanId,'DP-C')
 assert.equal(qcSearchWorkOrders(rows,'10723001').length,2)
 assert.equal(qcSearchWorkOrders(rows,'K-009')[0].dailyPlanId,'DP-LEGACY')
 assert.equal(qcSearchWorkOrders(rows,'DP-B')[0].woNumber,'WO-SP-001')
 assert.equal(qcSearchWorkOrders(Array.from({length:30},(_,i)=>({...rows[0],id:String(i),dailyPlanId:'DP-'+i})),'' ).length,12)
})
test('Historical no-WO Daily is explicitly selectable by same date, type, PID and Activity',()=>{
 assert.equal(select('2026-11-22','fertilizer').some(r=>r.dailyPlanId==='DP-LEGACY'),true)
 assert.equal(qcSelectedWorkOrder(select('2026-11-22','fertilizer'),'DP-LEGACY').woNumber,'')
 assert.equal(qcSelectedWorkOrder(select('2026-11-23','fertilizer'),'DP-LEGACY'),null)
 assert.equal(qcSelectedWorkOrder(select('2026-11-22','spray'),'DP-LEGACY'),null)
 assert.equal(qcSearchWorkOrders(select('2026-11-22','fertilizer'),'K-009 Top Dressing')[0].dailyPlanId,'DP-LEGACY')
 assert.equal(qcSearchWorkOrders(select('2026-11-22','fertilizer'),'P-DOES-NOT-EXIST').length,0)
 const withoutPid={...rows[3],dailyPlanId:'DP-NO-PID',pid:''}
 const withoutActivity={...rows[3],dailyPlanId:'DP-NO-ACT',activity:''}
 assert.deepEqual(qcWorkOrderPlansByKind([withoutPid,withoutActivity],'2026-11-22',()=>true),[])
 assert.equal(qcSelectedWorkOrder([rows[3],{...rows[3],id:'duplicate'}],'DP-LEGACY'),null)
 assert.match(source,/export function dailyPlansForQcSession/)
 assert.match(source,/export function qcShiftOneCarryoverCandidates/)
 assert.match(source,/export function resolveQcSessionPlan/)
 assert.match(read('src/FertilizerForm.tsx'),/Pilih Daily Plan ID/)
 assert.match(read('src/SprayForm.tsx'),/Paddock/)
})
test('Both live forms explicitly link WO and preserve immutable Daily/Monthly references',()=>{
 for(const path of ['src/SprayForm.tsx','src/FertilizerForm.tsx']){
  const s=read(path)
  assert.match(s,/QcWorkOrderSmartSearch rows=\{woOptions\}/)
  assert.match(s,/qcExplicitWorkOrderPlan\(dailyPlanRows/)
  assert.match(s,/qcMergeEligiblePlans/)
  assert.match(s,/dailyPlanId:card\.dailyPlanId,monthlyPlanLineId:card\.monthlyPlanLineId/)
  for(const key of ['woNumber','operationCode','coaCode','plannedShift','dailyShift','dailyForeman']){
   const mapped=key==='dailyShift'?'shift':key==='dailyForeman'?'foreman':key
   assert.ok(s.includes(key+':cardDailyPlan?.'+mapped+"||''"),'Missing '+key+' snapshot in '+path)
  }
  assert.match(s,/qcExplicitWorkOrderPlan\(dailyPlanRows,[^,]+,date,c\.dailyPlanId\)\?c:/)
  assert.match(s,/disabled=\{busy\|\|editingUploaded\}/)
 }
 const actual=read('src/firestoreStore.ts')
 for(const key of ['woNumber','plannedShift','dailyShift','operationCode','coaCode']){
  assert.ok(actual.includes(key+':String(record.'+key+"||'')"),'Missing QC-generated Actual snapshot '+key)
 }
})
test('Fertilizer recipe, Spray dosing and photo/queue pipeline are preserved',()=>{
 const spray=read('src/SprayForm.tsx'),fert=read('src/FertilizerForm.tsx')
 assert.match(spray,/const materials=\(cardDailyPlan\?\.materials\|\|\[\]\)\.slice\(0,4\)/)
 assert.match(spray,/estimatedAdjuvant/)
 assert.match(fert,/const first=matched\?\.materials\[0\],choices=fertilizerChoices/)
 assert.match(fert,/if\(!c\.fillings\.length\)/)
 assert.match(spray,/queueFormSession\(operationalItems\)/)
 assert.match(fert,/queueFormSession\(operationalItems\)/)
 const picker=read('src/QcWorkOrderSmartSearch.tsx')
 for(const name of ['role="combobox"','role="listbox"',"ArrowDown","ArrowUp","Escape","onSelect(row)"]){
  assert.ok(picker.includes(name),'Missing keyboard smartsearch contract '+name)
 }
})

test('WO-less Daily selection is not a free-text bypass in Spray or Fertilizer',()=>{
 const picker=read('src/QcWorkOrderSmartSearch.tsx')
 assert.ok(picker.includes('Tanpa WO · Daily Lama'))
 for(const path of ['src/SprayForm.tsx','src/FertilizerForm.tsx']){
  const code=read(path)
  assert.match(code,/qcExplicitWorkOrderPlan\(dailyPlanRows/)
  assert.match(code,/source\.activity!==work\.activity|selected\.activity!==work\.activity/)
  assert.match(code,/Daily ID secara eksplisit/)
 }
 const multi=read('src/qcMultiPaddock.mjs')
 assert.match(multi,/!trim\(work\.dailyPlanId\)\|\|!trim\(work\.pid\)\|\|!trim\(work\.activity\)/)
 const section=read('src/QcMultiPaddockSection.tsx')
 assert.match(section,/chosen\[0\]\.activity!==work\.activity/)
 assert.ok(section.includes('Tanpa WO · Daily lama'))
})
