import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {test} from 'node:test'
import {dailyWoSnapshot,normalizeWo,searchDailyWo,shiftIsCrossOver} from '../src/dailyWoPlanning.ts'

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8')
const entry=read('src/DailyPlanWebEntryPanel.tsx')
const picker=read('src/DailyWoSmartSearch.tsx')
const list=read('src/DailyPlanListPanel.tsx')
const types=read('src/dailyPlanWorkspaceTypes.ts')
const wa=read('src/dailyPlanActions.ts')
const rows=[
 {id:'m1',planLineId:'MP-GPA-202611-0001',woNumber:'WO-PL-001',pid:'JAGF-2-K-003',activity:'Top Dressing',description:'Top Dressing C',coaCode:'60100302',operationCode:'10618175',department:'Upkeep Manuring-Plant',plannedShift:'1',targetAreaHa:20,monthKey:'2026-11',week:'W3'},
 {id:'m2',planLineId:'MP-GPA-202611-0002',woNumber:'WO-RT-002',pid:'JAGF-2-K-003',activity:'Top Dressing',description:'Top Dressing C',coaCode:'60100302',operationCode:'10724175',department:'Upkeep Manuring-Ratoon',plannedShift:'2',targetAreaHa:20,monthKey:'2026-11',week:'W3'},
 {id:'m3',planLineId:'MP-GPA-202610-0001',woNumber:'WO-RT-003',pid:'A-007',activity:'Post Emergence',description:'Post Emergence A',coaCode:'60100209',operationCode:'10721181',department:'Weed Control',plannedShift:'1',targetAreaHa:12,monthKey:'2026-10',week:'W4'},
]
test('WO lookup distinguishes same PID and Activity with different Work Orders',()=>{
 assert.deepEqual(searchDailyWo(rows,'WO-RT').map(x=>x.woNumber),['WO-RT-002','WO-RT-003'])
 assert.deepEqual(searchDailyWo(rows,'WO-PL-001').map(x=>x.id),['m1'])
 assert.equal(searchDailyWo(rows,'K-003').length,2)
 assert.equal(searchDailyWo(rows,'10724175')[0].id,'m2')
 assert.equal(normalizeWo(' wo-rt-002 '),'WO-RT-002')
})
test('planned shift is only a snapshot; actual shift 2 is allowed for planned shift 1',()=>{
 assert.equal(shiftIsCrossOver('1','2'),true)
 assert.equal(shiftIsCrossOver('2','1'),true)
 assert.equal(shiftIsCrossOver('1','1'),false)
 assert.equal(shiftIsCrossOver('ALL','1'),false)
 assert.equal(shiftIsCrossOver('ALL','2'),false)
 const snapshot=dailyWoSnapshot(rows[0])
 assert.equal(snapshot.woNumber,'WO-PL-001')
 assert.equal(snapshot.monthlyPlanLineId,'MP-GPA-202611-0001')
 assert.equal(snapshot.plannedShift,'1')
 assert.equal(snapshot.coaCode,'60100302')
 assert.equal(snapshot.operationCode,'10618175')
 assert.deepEqual(dailyWoSnapshot(undefined),{woNumber:'',plannedShift:'',coaCode:'',operationCode:'',department:'',monthlyPlanLineId:''})
})
test('WO-first form fetches across months, links saved Monthly and prefills balance',()=>{
 assert.match(entry,/where\('woNumber','>='\s*,q\)/)
 assert.match(entry,/where\('woNumber','<='\s*,q\+/)
 assert.match(entry,/limit\(30\)/)
 assert.match(entry,/woTimerRef\.current=setTimeout/)
 assert.match(entry,/monthlyId:monthlyRow\.id/)
 assert.match(entry,/activitySearch:monthlyRow\.activity\|\|monthlyRow\.description/)
 assert.match(entry,/remaining\.toFixed\(4\)/)
 assert.match(entry,/sourceType==='MONTHLY'&&state\.active\.pids\[0\]/)
 assert.match(entry,/index>0&&<DailyWoSmartSearch/)
 assert.match(entry,/scheduleWoSearch\(v\)/)
})
test('Daily saves immutable WO, Operation, CoA and planned shift snapshots',()=>{
 assert.ok((entry.match(/woNumber:isMonthly\?\(selected\?\.woNumber\|\|''\):''/g)||[]).length>=2)
 assert.match(entry,/plannedShift:isMonthly\?\(selected\?\.plannedShift\|\|''\):''/)
 assert.match(entry,/coaCode:isMonthly\?\(selected\?\.coaCode\|\|''\):''/)
 assert.match(entry,/operationCode:isMonthly\?\(selected\?\.operationCode\|\|''\):''/)
 assert.match(entry,/monthlyPlanLineId:isMonthly\?\(selected\?\.planLineId\|\|''\):''/)
 assert.match(entry,/shift:group\.work\.shift/)
 assert.match(entry,/shift:activeInfo\.work\.shift/)
 assert.match(entry,/sourceType:'MONTHLY'/)
 assert.match(entry,/woSearch:planText\(p\.woSearch\)/)
})
test('WO picker keyboard and multi PID preserve preexisting manual Monthly fallback',()=>{
 assert.match(picker,/role="combobox"/)
 assert.match(picker,/role="listbox"/)
 assert.match(picker,/ArrowDown/)
 assert.match(picker,/ArrowUp/)
 assert.match(picker,/event\.preventDefault\(\)|e\.preventDefault\(\)/)
 assert.match(picker,/onSelect\(row\)/)
 assert.match(entry,/PID \/ Monthly Plan/)
 assert.match(entry,/onChange=\{e=>\{const value=e\.target\.value,matched=availableMonthly\.find/)
 assert.match(entry,/sourceType:'MONTHLY'\|'ADHOC'\|'SUPPORT'/)
})
test('Saved Daily / WhatsApp display WO without breaking historical Daily cards',()=>{
 for(const source of [types,list,wa])assert.match(source,/woNumber/)
 assert.match(list,/row\.woNumber&&<small>WO/)
 assert.match(wa,/if\(row\.woNumber\)details\.push/)
 assert.match(list,/woNumber:text\(data\.woNumber\)/)
 assert.match(list,/plannedShift:text\(data\.plannedShift\)/)
 assert.match(entry,/Shift Aktual/)
 assert.match(entry,/shiftIsCrossOver/)
})
