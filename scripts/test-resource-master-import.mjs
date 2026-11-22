import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {test} from 'node:test'
import {employeeDocId,parseResourceRows,unitDocId,unitKindName} from '../src/resourceMasterImport.ts'
import {conditionAt,normalizeUnitNumber} from '../src/unitDispatchModel.ts'
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8')
const employee=[
  ['DATA MASTER KARYAWAN UPKEEP & MANURING'],
  ['Edit karyawan'],
  ['Employee ID','Nama Karyawan','Join Date','Jabatan','Unit Code','Status','IMPLEMENT','KETERANGAN','FRONT','SHIFT','PEKERJAAN','TYPE','Kolom 13','Pengawas'],
  ['20251003206','SAMPEL A','25/10/2025','Sopir Dump Truck 5 Ton','DT123T','CADANGAN','DUMP TRUCK','','2','A','SOPIR','','','PENGAWAS A'],
  ['', 'SAMPEL B', '', 'Tenaga Stool Splitter','','','-','','#N/A','#N/A','TENAGA','','','PENGAWAS B']
]
const units=[
  ['DATA MASTER UNIT & ALAT BERAT'],
  ['Daftar seluruh unit'],
  ['UNIT CODE','IMPLEMENT','EQUIPMENT TYPE','BRAND','MODEL','YEAR','SERIAL NO','Plan PT','Plan User','QTY','Category','JUMLAH OP'],
  ['DT123T','DUMP TRUCK','DUMP TRUCK','MITSUBISHI','FE75SHDXN4X2M','2025','SERIAL-MOCK','GPA','UPKEEP & MANURING','5 Ton','','2'],
  ['TR001G','STOOL SPLITTER','TRACTOR','JOHN DEERE','7M-230','2025','','GPA','UPKEEP & MANURING','Stool Splitter','Operator Tractor >= 200 HP','1']
]
const sheets=[{name:'Sheet1',rows:employee},{name:'Sheet2',rows:units}]
test('legacy ODS sheets are recognized by original headers and never mixed',()=>{
 const e=parseResourceRows(sheets,'employee'),u=parseResourceRows(sheets,'unit')
 assert.equal(e.sheetName,'Sheet1');assert.equal(u.sheetName,'Sheet2')
 assert.equal(e.employees.length,2);assert.equal(u.units.length,2)
})
test('missing Employee ID is not fabricated, source #N/A is marked for review',()=>{
 const rows=parseResourceRows(sheets,'employee').employees
 assert.equal(rows[0].employeeId,'20251003206')
 assert.equal(rows[0].joinDate,'2025-10-25')
 assert.equal(rows[0].reserveStatus,'CADANGAN')
 assert.equal(rows[1].employeeId,'')
 assert.ok(employeeDocId(rows[1]).startsWith('unverified-'))
 assert.equal(rows[1].front,'')
 assert.equal(rows[1].frontRaw,'#N/A')
 assert.equal(rows[1].shiftRaw,'#N/A')
 assert.ok(rows[1].warnings.length>=3)
})
test('each physical code is one unit; QTY is a capacity label, not unit count',()=>{
 const rows=parseResourceRows(sheets,'unit').units
 assert.equal(rows[0].code,'DT123T')
 assert.equal(rows[0].capacitySpec,'5 Ton')
 assert.equal(rows[0].operatorRequirement,2)
 assert.equal(unitKindName(rows[1]),'STOOL SPLITTER')
 assert.notEqual(unitDocId(unitKindName(rows[0]),rows[0].code),unitDocId(unitKindName(rows[1]),rows[1].code))
})
test('existing imported unit is available without mandatory inspection',()=>{
 const unit=normalizeUnitNumber('test',{name:'TR001G',parentUnitName:'STOOL SPLITTER',active:true,importNeedsInspection:true})
 assert.equal(unit.importNeedsInspection,true)
 assert.equal(conditionAt([],unit.id,100),'READY')
 assert.equal(conditionAt([{id:'legacy',unitId:unit.id,type:'PENDING_INSPECTION',effectiveMinute:90,date:'2026-11-22',shift:'1',note:'old',actorUid:'asisten'}],unit.id,100),'READY')
 assert.equal(conditionAt([{id:'e1',unitId:unit.id,type:'READY_APPROVED',effectiveMinute:90,date:'2026-11-22',shift:'1',note:'approved',actorUid:'asisten'}],unit.id,100,'PENDING_INSPECTION'),'READY')
})
test('separate menu, role permissions and Firestore-only import',()=>{
 const portal=read('src/PortalRouter.tsx'),permissions=read('src/accessControl.ts'),rules=read('firestore.rules')
 const importer=read('src/MasterResourceImportPanel.tsx')
 assert.match(portal,/MasterEmployeeWorkspace/)
 assert.match(portal,/master-employees/)
 assert.match(portal,/UnitDispatchWorkspace/)
 assert.match(permissions,/data_master_employees/)
 assert.match(rules,/match \/master_employees\//)
 assert.match(rules,/match \/master_resource_import_logs\//)
 assert.match(importer,/\.ods/)
 assert.match(importer,/importNeedsInspection:false/)
 assert.match(importer,/master_unit_numbers/)
 assert.match(importer,/master_employees/)
 assert.match(importer,/getDocsFromServer/)
 assert.doesNotMatch(importer,/localStorage|sessionStorage/)
})
