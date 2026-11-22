import assert from 'node:assert/strict'
import {test} from 'node:test'
import {readFileSync} from 'node:fs'
import {actualShiftSnapshot,isActualCrossShift,searchActualWo} from '../src/actualWoSelection.ts'

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8')
const entry=read('src/ActualPlanWebEntryPanel.tsx')
const list=read('src/ActualPlanListPanel.tsx')
const savedTypes=read('src/actualPlanWorkspaceTypes.ts')
const picker=read('src/ActualWoSmartSearch.tsx')
const daily=[
 {id:'daily-1',dailyPlanId:'DP-20261122-001',woNumber:'WO-TD-1001',pid:'J-002',
  activity:'Top Dressing',description:'Top Dressing C',operationCode:'10724175',coaCode:'60100302',
  department:'Upkeep Ratoon',plannedShift:'1',dailyShift:'1',date:'2026-11-22',
  areaHa:15,doneHa:5},
 {id:'daily-2',dailyPlanId:'DP-20261122-002',woNumber:'WO-TD-1001',pid:'J-002',
  activity:'Top Dressing',description:'Top Dressing C',operationCode:'10724175',coaCode:'60100302',
  department:'Upkeep Ratoon',plannedShift:'1',dailyShift:'2',date:'2026-11-22',
  areaHa:10,doneHa:0},
 {id:'daily-3',dailyPlanId:'DP-20261122-003',woNumber:'WO-HB-2001',pid:'A-007',
  activity:'Post Emergence',description:'Post Emergence A',operationCode:'10723001',coaCode:'60100408',
  department:'Weed Control',plannedShift:'2',dailyShift:'2',date:'2026-11-22',
  areaHa:20,doneHa:0},
]
test('WO-first smartsearch identifies Daily row when same WO appears on both shifts',()=>{
 assert.deepEqual(searchActualWo(daily,'WO-TD-1001').map(r=>r.dailyPlanId),
  ['DP-20261122-001','DP-20261122-002'])
 assert.deepEqual(searchActualWo(daily,'A-007').map(r=>r.dailyPlanId),['DP-20261122-003'])
 assert.deepEqual(searchActualWo(daily,'10724175').map(r=>r.dailyShift),['1','2'])
 assert.equal(searchActualWo(daily,'unknown').length,0)
})
test('WO shift, Daily shift and Actual shift remain independent',()=>{
 const selected={woNumber:'WO-TD-1001',plannedShift:'1',shift:'1',
  operationCode:'10724175',coaCode:'60100302',department:'Ratoon'}
 const snapshot=actualShiftSnapshot(selected,'2')
 assert.equal(snapshot.shift,'2')
 assert.equal(snapshot.dailyShift,'1')
 assert.equal(snapshot.plannedShift,'1')
 assert.equal(snapshot.woNumber,'WO-TD-1001')
 assert.equal(snapshot.coaCode,'60100302')
 assert.ok(isActualCrossShift(snapshot.plannedShift,snapshot.shift))
 assert.ok(isActualCrossShift('2','1'))
 assert.equal(isActualCrossShift('1','1'),false)
})
test('Actual is always linked to the selected Daily, never guessed from Monthly alone',()=>{
 assert.match(entry,/getPlanDocsWithCache\(fsQuery\(collection\(firestoreDb,'daily_plans'\),where\('date','==',date\)\)\)/)
 assert.match(entry,/const woChoices=useMemo<ActualWoChoice\[\]>\(\(\)=>daily\.filter\(row=>row\.woNumber\)/)
 assert.match(entry,/dailyId:found\?\.id\|\|''/)
 assert.match(entry,/chooseWoDaily/)
 assert.match(entry,/typeWoSearch/)
 assert.match(entry,/WO.*Daily/)
 assert.match(picker,/role="combobox"/)
 assert.match(picker,/role="listbox"/)
 assert.match(picker,/ArrowDown/)
 assert.match(picker,/ArrowUp/)
 assert.match(picker,/Enter/)
})
test('Actual records persist exact WO, CoA, Operation, and Actual shift in create and edit paths',()=>{
 assert.ok((entry.match(/\.\.\.actualShiftSnapshot\(selected,/g)||[]).length>=3)
 assert.match(entry,/shift:source\.shift/)
 assert.match(entry,/woSearch:planText\(row\.woSearch\)/)
 assert.match(entry,/Shift Aktual/)
 assert.match(entry,/Shift WO \(rencana\)/)
 assert.match(entry,/CoA \(otomatis\)/)
 assert.match(entry,/Operation Code \(otomatis\)/)
 assert.match(entry,/isActualCrossShift/)
 assert.match(savedTypes,/woNumber:string/)
 assert.match(savedTypes,/plannedShift:string/)
 assert.match(savedTypes,/dailyShift:string/)
 assert.match(savedTypes,/operationCode:string/)
 assert.match(savedTypes,/coaCode:string/)
 assert.match(list,/woNumber:text\(d\.woNumber\)/)
 assert.match(list,/r\.woNumber,r\.operationCode,r\.coaCode/)
})
test('Legacy Daily fallback remains, and saved Actual can be copied cross-shift by WO',()=>{
 assert.match(entry,/Pilih Daily \/ PID tanpa WO \(data lama\)/)
 assert.match(entry,/monthlyPlanLineId:selected\.monthlyPlanLineId/)
 assert.match(list,/d\.woNumber===sourceRow\.woNumber&&d\.pid===sourceRow\.pid/)
 assert.match(list,/shift:sourceRow\.shift,dailyShift:target\?\.shift/)
})
