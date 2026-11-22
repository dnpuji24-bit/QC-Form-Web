import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {test} from 'node:test'

const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8')
const modelSource=read('src/activityCatalogModel.ts')
const catalog=read('src/MasterActivityCatalogPanel.tsx')
const resource=read('src/MasterOperationalResourcePanel.tsx')
const validation=read('src/MasterActivityManagePanel.tsx')
const monthly=read('src/MonthlyPlanWebEntryPanel.tsx')
const rules=read('firestore.rules')
const mod=await import(new URL('../src/activityCatalogModel.ts',import.meta.url).href)

test('Excel/ODS five-column schema accepts distinct department operation codes with shared COA',()=>{
 const plant=mod.parseActivityCatalogImport({
  Departement:'Upkeep Manuring-Plant','Operation Code':'10618175',
  COA:'60100302','Activity Category':'Fertilizing',Activity:'Top Dressing',
 })
 const ratoon=mod.parseActivityCatalogImport({
  Departement:'Upkeep Manuring - Ratoon','Operation Code':'10724175',
  COA:'60100302','Activity Category':'Fertilizing',Activity:'Top Dressing',
 })
 assert.equal(plant.name,ratoon.name)
 assert.notEqual(plant.operationCode,ratoon.operationCode)
 assert.equal(plant.coaCode,ratoon.coaCode)
 assert.notEqual(mod.opCatalogId(plant.operationCode),mod.opCatalogId(ratoon.operationCode))
})

test('COA blank is accepted in master and codes with leading zeros retain text',()=>{
 const value=mod.parseActivityCatalogImport({Departement:'Plant','Operation Code':'00107',COA:'',
  'Activity Category':'Weed Control',Activity:'Knockdown Spraying'})
 assert.equal(value.operationCode,'00107')
 assert.equal(value.coaCode,'')
 assert.throws(()=>mod.parseActivityCatalogImport({Departement:'Plant','Operation Code':'ABC',COA:'123','Activity Category':'Other',Activity:'Test'}))
})

test('legacy Activity lookup never guesses department when name is ambiguous',()=>{
 const records=[
  mod.parseCoaActivity('op-10618175',{department:'Plant',operationCode:'10618175',name:'Top Dressing',coaCode:'60100302'}),
  mod.parseCoaActivity('op-10724175',{department:'Ratoon',operationCode:'10724175',name:'Top Dressing',coaCode:'60100302'}),
 ]
 assert.equal(mod.findCatalogForValidation(records,{activity:'Top Dressing'}),undefined)
 assert.equal(mod.findCatalogForValidation(records,{activity:'Top Dressing',coaCode:'60100302'}),undefined)
 assert.equal(mod.findCatalogForValidation(records,{activity:'Top Dressing',catalogActivityId:'op-10724175'})?.department,'Ratoon')
})

test('Import is preview-first and non-destructive, with archive and audit',()=>{
 assert.match(catalog,/accept="\.ods,\.xlsx,\.xls"/)
 assert.match(catalog,/sheet_to_json/)
 assert.match(catalog,/Activity/)
 assert.match(catalog,/Konfirmasi Import/)
 assert.match(catalog,/XLSX\.writeFile/)
 assert.match(catalog,/Arsip/)
 assert.match(catalog,/Legacy/)
 assert.match(catalog,/ACTIVITY_CATALOG_HISTORY/)
 assert.doesNotMatch(catalog,/batch\.delete|deleteDoc/)
 assert.match(resource,/Daftar Activity \(5 kolom\)/)
})

test('Validation and Monthly store catalog references, snapshots and soft archive legacy',()=>{
 assert.match(validation,/catalogActivityId:choice\?\.id/)
 assert.match(validation,/activityCatalogChoiceLabel/)
 assert.match(validation,/archivedAt:serverTimestamp\(\)/)
 assert.doesNotMatch(validation,/batch\.delete\(doc\(context\.db,'master_activities'/)
 assert.match(monthly,/findCatalogForValidation/)
 assert.match(monthly,/operationCode:info\.operationCode/)
 assert.match(monthly,/department:info\.department/)
})

test('Rules block deletion and permit audited Activity updates',()=>{
 assert.match(rules,/match \/master_activity_catalog_history\//)
 assert.match(rules,/allow update, delete: if false/)
 const validationRules=rules.split('match /master_activities/')[1].split('match /master_materials/')[0]
 assert.match(validationRules,/allow delete: if false/)
 const catalogRules=rules.split('match /master_activity_catalog/')[1].split('match \/master_activity_catalog_history/')[0]
 assert.match(catalogRules,/allow delete: if false/)
 assert.match(catalogRules,/operationCode/)
})
