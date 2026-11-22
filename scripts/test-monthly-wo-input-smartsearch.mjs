import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {test} from 'node:test'
import {monthlyWorkIdentity,searchMonthlyActivities} from '../src/monthlyActivitySearch.ts'

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8')
const entry=read('src/MonthlyPlanWebEntryPanel.tsx')
const list=read('src/MonthlyPlanListPanel.tsx')
const picker=read('src/MonthlyActivitySmartSearch.tsx')
const choices=[
 {id:'act-c',description:'Top Dressing C',activity:'Top Dressing',
  activityCode:'ACT-0001',department:'Upkeep Manuring - Plant',operationCode:'10618175',
  coaCode:'60100302',activityCategory:'Fertilizing'},
 {id:'act-r',description:'Top Dressing C',activity:'Top Dressing',
  activityCode:'ACT-0002',department:'Upkeep Manuring - Ratoon',operationCode:'10724175',
  coaCode:'60100302',activityCategory:'Fertilizing'},
 {id:'act-herb',description:'Post Emergence A',activity:'Post Emergence',
  activityCode:'ACT-0023',department:'Weed Control - Ratoon',operationCode:'10724488',
  coaCode:'60100209',activityCategory:'Herbicide'},
]
test('Monthly search identifies same activity in different departments and operations',()=>{
 assert.deepEqual(searchMonthlyActivities(choices,'top dressing plant').map(x=>x.id),['act-c'])
 assert.deepEqual(searchMonthlyActivities(choices,'top dressing ratoon').map(x=>x.id),['act-r'])
 assert.deepEqual(searchMonthlyActivities(choices,'10724175').map(x=>x.id),['act-r'])
 assert.deepEqual(searchMonthlyActivities(choices,'ACT-0023').map(x=>x.id),['act-herb'])
 assert.equal(searchMonthlyActivities(choices,'60100302').length,2)
 assert.deepEqual(searchMonthlyActivities(choices,'top mustard'),[])
})
test('Monthly duplicate detection distinguishes planned shift and Operation identity',()=>{
 const row={pid:'JAGF-2-K-003',masterActivityId:'act-r',catalogActivityId:'op-10724175',
   plannedShift:'1',varieties:['R570']}
 const original=monthlyWorkIdentity(row)
 assert.notEqual(original,monthlyWorkIdentity({...row,plannedShift:'2'}))
 assert.notEqual(original,monthlyWorkIdentity({...row,catalogActivityId:'op-10618175'}))
 assert.equal(original,monthlyWorkIdentity({...row,pid:'jagf-2-k-003'}))
 assert.equal(original,monthlyWorkIdentity({...row,varieties:['R570']}))
 assert.notEqual(original,monthlyWorkIdentity({...row,plannedShift:'ALL'}))
 assert.notEqual(monthlyWorkIdentity({...row,plannedDate:'2026-11-23'}),monthlyWorkIdentity({...row,plannedDate:'2026-11-24'}))
})
test('Monthly UI uses keyboard smartsearch and previews all WO snapshot fields',()=>{
 assert.match(entry,/<MonthlyActivitySmartSearch options=\{activityChoices\}/)
 assert.match(entry,/const activityChoices=useMemo/)
 assert.match(entry,/findCatalogForValidation/)
 assert.match(entry,/coaCode:mapped\?\.coaCode\|\|''/)
 assert.match(entry,/operationCode:info\.operationCode/)
 assert.match(entry,/department:info\.department/)
 assert.match(entry,/runTransaction\(db,async transaction/)
 assert.match(entry,/const uniqueWos=\[\.\.\.new Set/)
 assert.match(entry,/plannedDate:info\.line\.plannedDate/)
 assert.match(entry,/Semua Shift \(Shift 1 & 2\)/)
 assert.match(entry,/Shift Rencana WO/)
 assert.match(entry,/Operation Code \(otomatis\)/)
 assert.match(entry,/monthlyWorkIdentity/)
 assert.match(entry,/row\.plannedShift!==\(x\.line\.plannedShift/)
 assert.match(entry,/row\.plannedDate&&x\.line\.plannedDate/)
})
test('Monthly smartsearch supports mouse, keyboard, clear and ten-result limit',()=>{
 assert.match(picker,/role="combobox"/)
 assert.match(picker,/role="listbox"/)
 assert.match(picker,/ArrowDown/)
 assert.match(picker,/ArrowUp/)
 assert.match(picker,/Enter/)
 assert.match(picker,/Escape/)
 assert.match(picker,/onClick=\{\(\)=>choose\(row\)\}/)
 assert.match(picker,/onSelect\(''\)/)
 assert.equal(searchMonthlyActivities(Array.from({length:30},(_,i)=>({...choices[0],id:String(i)})),'').length,10)
})
test('Monthly list search and Excel include WO, planned shift, Operation, CoA',()=>{
 assert.match(list,/row\.operationCode,row\.department,row\.activityCode,row\.plannedShift/)
 for(const name of ['Work Order (WO)','Operation Code','COA','Shift Rencana','Tanggal Rencana','Activity Code']){
   assert.ok(list.includes("'"+name+"'"),'Missing export heading '+name)
 }
 assert.match(list,/row\.woNumber,row\.operationCode,row\.coaCode,row\.department,row\.plannedShift,row\.plannedDate/)
 assert.match(list,/WO <strong>\{row\.woNumber\}<\/strong> · Operation/)
})

// The supplied example WO_931 carries the same WO across two paddocks and
// five dates, scheduled on both shifts. The unique line identities must remain
// distinct, even though work-order header identity is shared.
test('WO_931 repeated date/shift rows produce distinct Monthly line identities',()=>{
 const lines=[]
 const dates=['2026-11-23','2026-11-24','2026-11-25','2026-11-26','2026-11-27']
 for(const date of dates)for(const shift of ['1','2']){
  const pid=date<='2026-11-25'&&!(date==='2026-11-25'&&shift==='2')?'JAGF-2-J-007':'JAGF-3-L-005'
  lines.push({woNumber:'WO_931',pid,masterActivityId:'top-dressing',catalogActivityId:'10618175',plannedShift:shift,plannedDate:date,varieties:['R570']})
 }
 const ids=lines.map(monthlyWorkIdentity)
 assert.equal(lines.length,10)
 assert.equal(new Set(lines.map(x=>x.woNumber)).size,1)
 assert.equal(new Set(ids).size,10)
})
