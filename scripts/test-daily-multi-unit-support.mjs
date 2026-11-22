import assert from 'node:assert/strict'
import {test} from 'node:test'
import {readFileSync} from 'node:fs'
import {supportUnitRows,duplicateUnitCode} from '../src/dailyUnitSupport.ts'
import {slotCoverage,dateMinute,unitMatchesType,normalizeUnitNumber} from '../src/unitDispatchModel.ts'
const source=(path)=>readFileSync(new URL('../'+path,import.meta.url),'utf8')
test('Stool Splitter can plan one DT support under a single work group',()=>{
 const support=supportUnitRows([{id:'support-dt',unitName:'DUMP TRUCK',unitRequired:1,
   unitPreferredCodes:['DT123T'],notes:'Angkut material'}])
 assert.equal(support.length,1)
 assert.equal(support[0].unitRequired,1)
 assert.equal(support[0].unitName,'DUMP TRUCK')
 assert.equal(duplicateUnitCode(['SS001','SS002'],support),'')
 assert.equal(duplicateUnitCode(['DT123T'],support),'DT123T')
})
test('Primary and support assignments have independent coverage (multi-PID not multiplied)',()=>{
 const startMinute=dateMinute('2026-11-22','08:00')
 const base={date:'2026-11-22',shift:'1',workGroupId:'WG-1',activity:'Stool Splitting',woNumber:'WO-001',
   pids:['A-007','A-008'],preferred:[]}
 const main={...base,id:'WG-1|primary',requirementId:'primary',unitName:'STOOL SPLITTER',quantity:2}
 const dt={...base,id:'WG-1|support:support-dt',requirementId:'support:support-dt',unitName:'DUMP TRUCK',quantity:1}
 const assignment=(id,unitId,requirementId)=>({id,unitId,unitCode:unitId,workGroupId:'WG-1',
   date:'2026-11-22',shift:'1',startTime:'08:00',endTime:'10:00',
   startMinute,endMinute:startMinute+120,activity:'Stool Splitting',woNumber:'WO-001',
   pids:['A-007','A-008'],status:'ASSIGNED',notes:'',requirementId})
 const saved=[assignment('a','SS001','primary'),assignment('b','SS002','primary'),
   assignment('c','DT123T','support:support-dt')]
 assert.equal(slotCoverage(main,saved,[]),2)
 assert.equal(slotCoverage(dt,saved,[]),1)
 assert.equal(slotCoverage(main,saved.slice(0,1),[]),1)
 assert.equal(slotCoverage(dt,saved.slice(0,1),[]),0)
})
test('Existing Daily Plans with one unit remain compatible with new support rows',()=>{
 assert.deepEqual(supportUnitRows(undefined),[])
 assert.deepEqual(supportUnitRows(null),[])
 const code=source('src/UnitDispatchWorkspace.tsx')
 assert.match(code,/supportUnitRows\(first\.supportUnits\)/)
 assert.match(code,/requirementId:'primary'/)
 assert.match(code,/requirementId:'support:'\+item\.id/)
 const form=source('src/DailyPlanWebEntryPanel.tsx')
 assert.match(form,/Tambah Unit Support/)
 assert.match(form,/supportUnits:supportUnitRows\(group\.work\.supportUnits\)/)
 const list=source('src/DailyPlanListPanel.tsx')
 assert.match(list,/dispatchByGroup/)
 assert.match(list,/dispatchUnits/)
})

test('DT alias matches DUMP TRUCK and implementation matches tractor with Stool Splitter attachment',()=>{
 const dt=normalizeUnitNumber('dump-truck-dt123t',{name:'DT123T',parentUnitName:'DUMP TRUCK',parentUnitId:'dump-truck',active:true})
 const tractor=normalizeUnitNumber('tractor-tr015g',{name:'TR015G',parentUnitName:'TRACTOR',parentUnitId:'tractor',implement:'STOOL SPLITTER',active:true})
 assert.equal(unitMatchesType(dt,'DT'),true)
 assert.equal(unitMatchesType(dt,'DUMP TRUCK'),true)
 assert.equal(unitMatchesType(tractor,'STOOL SPLITTER'),true)
 assert.equal(unitMatchesType(tractor,'DUMP TRUCK'),false)
})
