import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {test} from 'node:test'
import {shiftWindow,timeWindow,overlaps,conditionAt,normalizeUnitNumber,unitMatches} from '../src/unitDispatchModel.ts'

const text=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8')
const date='2026-11-22'
test('a physical unit can be assigned to Shift 1 and Shift 2 without overlap',()=>{
 const s1=shiftWindow(date,'1'),s2=shiftWindow(date,'2')
 assert.equal(overlaps(s1,s2),false)
 const sameShiftA=timeWindow(date,'1','08:00','10:00')
 const sameShiftB=timeWindow(date,'1','10:15','12:00')
 const sameShiftConflict=timeWindow(date,'1','09:30','11:00')
 assert.ok(sameShiftA&&sameShiftB&&sameShiftConflict)
 assert.equal(overlaps(sameShiftA,sameShiftB),false)
 assert.equal(overlaps(sameShiftA,sameShiftConflict),true)
})
test('imported physical units and legacy PENDING_INSPECTION do not need approval',()=>{
 const u=normalizeUnitNumber('water-tank-wt001',{name:'WT001',parentUnitId:'water-tank',parentUnitName:'WATER TANK 1,5KL',importNeedsInspection:true})
 assert.equal(u.active,true)
 assert.equal(conditionAt([],u.id,shiftWindow(date,'1').startMinute),'READY')
 const events=[{id:'old',unitId:u.id,type:'PENDING_INSPECTION',effectiveMinute:shiftWindow(date,'1').startMinute-10,date,shift:'1',note:'old',actorUid:'owner'}]
 assert.equal(conditionAt(events,u.id,shiftWindow(date,'1').startMinute),'READY')
 assert.equal(conditionAt(events,u.id,shiftWindow(date,'2').startMinute),'READY')
 assert.equal(unitMatches(u,{id:'req',date,shift:'2',workGroupId:'x',activity:'Water Supply',woNumber:'',pids:[],unitName:'WATER TANK 1,5KL',quantity:1,preferred:[]}),true)
})
test('breakdown and maintenance block both shifts until Ready set immediately',()=>{
 const unitId='wt001',s1=shiftWindow(date,'1'),s2=shiftWindow(date,'2')
 const e=(id,type,at)=>({id,unitId,type,effectiveMinute:at,date,shift:'1',note:'test',actorUid:'owner'})
 const events=[e('bd','BREAKDOWN',s1.startMinute+15)]
 assert.equal(conditionAt(events,unitId,s2.startMinute),'BREAKDOWN')
 events.push(e('r','READY',s1.endMinute))
 assert.equal(conditionAt(events,unitId,s2.startMinute),'READY')
 events.push(e('maint','MAINTENANCE',s2.startMinute+15))
 assert.equal(conditionAt(events,unitId,s2.endMinute),'MAINTENANCE')
})
test('Excel-style Master Unit UI has inline fields and bulk save without approval',()=>{
 const grid=text('src/UnitMasterGrid.tsx'),daily=text('src/DailyUnitAvailability.tsx')
 const dispatch=text('src/UnitDispatchWorkspace.tsx'),model=text('src/unitDispatchModel.ts')
 const rules=text('firestore.rules'),importer=text('src/MasterResourceImportPanel.tsx')
 for(const token of ['Tabel Edit Cepat','Simpan Semua Perubahan','Cari Unit','Keterangan','Shift','Tambah Unit','MASTER']) {
   assert.match(grid,new RegExp(token,'i'))
 }
 assert.match(dispatch,/Daily Plan — Unit Dispatch \(Tabel\)/)
 assert.match(dispatch,/saveAssignmentNote/)
 assert.match(dispatch,/eventType==='READY'/)
 assert.doesNotMatch(dispatch,/Approve Ready — Asisten|menunggu pemeriksaan|Ready Approval/)
 assert.match(daily,/Unit Ready tersedia untuk Shift 1 maupun 2/)
 assert.doesNotMatch(daily,/u\.importNeedsInspection\?'PENDING_INSPECTION'/)
 assert.match(importer,/importNeedsInspection:false/)
 assert.match(model,/latest\.type==='OUT_OF_SERVICE'/)
 assert.match(rules,/request\.resource\.data\.type in \['MAINTENANCE','OUT_OF_SERVICE','READY'/)
 assert.match(rules,/\.affectedKeys\(\)\.hasOnly\(\['status','endMinute','notes'/)
})

test('rapid condition changes within one minute honor latest creation timestamp',()=>{
 const date='2026-11-22',minute=shiftWindow(date,'1').startMinute+15
 const e=(id,type,createdAtMs)=>({id,unitId:'wt001',type,date,shift:'1',effectiveMinute:minute,note:'test',actorUid:'owner',createdAtMs})
 assert.equal(conditionAt([e('z-breakdown','BREAKDOWN',100),e('a-ready','READY',200)],'wt001',minute),'READY')
})
