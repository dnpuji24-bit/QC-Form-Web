import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {test} from 'node:test'
import {searchActivityCatalog} from '../src/activityCatalogSearch.ts'
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8')
const picker=read('src/ActivityCatalogSmartSearch.tsx')
const validation=read('src/MasterActivityManagePanel.tsx')
const rows=[
 {id:'op-10618175',name:'Top Dressing',department:'Upkeep Manuring-Plant',operationCode:'10618175',coaCode:'60100302',activityCategory:'Fertilizing',active:true},
 {id:'op-10724175',name:'Top Dressing',department:'Upkeep Manuring - Ratoon',operationCode:'10724175',coaCode:'60100302',activityCategory:'Fertilizing',active:true},
 {id:'op-10721173',name:'Cultivation',department:'Upkeep Manuring - Ratoon',operationCode:'10721173',coaCode:'60100204',activityCategory:'Cultivation',active:true},
]
test('activity smartsearch supports activity + department with duplicate names',()=>{
 assert.deepEqual(searchActivityCatalog(rows,'top dressing plant').map(x=>x.id),['op-10618175'])
 assert.deepEqual(searchActivityCatalog(rows,'top dressing ratoon').map(x=>x.id),['op-10724175'])
 assert.equal(searchActivityCatalog(rows,'TOP DRESSING').length,2)
})
test('lookup supports Operation Code and CoA, insensitive to case and whitespace',()=>{
 assert.equal(searchActivityCatalog(rows,'10724175')[0].id,'op-10724175')
 assert.equal(searchActivityCatalog(rows,'60100302').length,2)
 assert.equal(searchActivityCatalog(rows,'  CULtivation  ')[0].operationCode,'10721173')
 assert.equal(searchActivityCatalog(rows,'top nonexistent').length,0)
})
test('keyboard and mouse both select stable catalog ID and clear previous selection during typing',()=>{
 assert.match(picker,/role="combobox"/)
 assert.match(picker,/role="listbox"/)
 assert.match(picker,/aria-activedescendant/)
 assert.match(picker,/event\.key==='ArrowDown'/)
 assert.match(picker,/event\.key==='ArrowUp'/)
 assert.match(picker,/event\.key==='Enter'/)
 assert.match(picker,/event\.key==='Escape'/)
 assert.match(picker,/onClick=\{\(\)=>select\(row\.id\)\}/)
 assert.match(picker,/if\(value\)\{preserveTypedText\.current=true;onSelect\(''\)\}/)
 assert.match(validation,/catalogActivityId:choice\?\.id\|\|''/)
 assert.match(validation,/activity:choice\?\.name\|\|''/)
})
test('result set is bounded and auto-linked CoA and Operation fields remain read-only',()=>{
 assert.equal(searchActivityCatalog(Array.from({length:25},(_,i)=>({...rows[0],id:String(i),operationCode:String(i)})),'',10).length,10)
 assert.match(validation,/CoA \(otomatis\)<input readOnly/)
 assert.match(validation,/Operation Code \(otomatis\)<input readOnly/)
 assert.match(validation,/<ActivityCatalogSmartSearch options=\{catalogOptions\}/)
})
