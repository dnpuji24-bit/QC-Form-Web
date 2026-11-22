import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {test} from 'node:test'
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8')
const catalog=read('src/MasterActivityCatalogPanel.tsx')
const master=read('src/MasterOperationalResourcePanel.tsx')
const validation=read('src/MasterActivityManagePanel.tsx')
const monthly=read('src/MonthlyPlanWebEntryPanel.tsx')
const list=read('src/MonthlyPlanListPanel.tsx')
const rules=read('firestore.rules')

test('Master Resource contains CoA catalog, separate from ACT validation code',()=>{
 assert.match(master,/Master Activity &amp; CoA/)
 assert.match(catalog,/master_activity_catalog/)
 assert.match(catalog,/coaCode/)
 assert.match(catalog,/inputMode="numeric"/)
 assert.match(catalog,/\^\\d\{1,20\}\$/)
 assert.match(validation,/catalogActivityId/)
 assert.match(validation,/selectedCatalog/)
 assert.match(validation,/CoA \(otomatis\)/)
 assert.match(validation,/activityCode:code/)
})

test('legacy validation composition and ACT code are retained',()=>{
 assert.match(validation,/existingComponents/)
 assert.match(validation,/code=existing\?\.activityCode\|\|nextActivityCode/)
 assert.match(validation,/components:existingComponents/)
 assert.match(validation,/catalogEntry\?\.coaCode\|\|existing\?\.coaCode\|\|''/)
})

test('Monthly plan uses manual WO per PID/activity/shift and saved CoA snapshot',()=>{
 assert.match(monthly,/woNumber:string;plannedShift:string/)
 assert.match(monthly,/Nomor WO \(manual\)/)
 assert.match(monthly,/CoA \(otomatis\)/)
 assert.match(monthly,/woNumber,plannedShift/)
 assert.match(monthly,/coaCode:info.coaCode/)
 assert.match(monthly,/runTransaction\(db,async transaction/)
 assert.match(monthly,/const woSnaps=await Promise.all/)
 assert.match(monthly,/if\(existingWo>=0\)throw/)
 assert.match(monthly,/transaction.set\(woRefs\[index\]/)
 assert.match(list,/WO \/ CoA \/ Shift/)
})

test('Firestore rules restrict catalog writes and preserve immutable WO identity',()=>{
 assert.match(rules,/match \/master_activity_catalog\//)
 assert.match(rules,/canEditKey\('data_master_activity_resources'/)
 assert.match(rules,/match \/work_orders\//)
 assert.match(rules,/existsAfter\(\/databases\/\$\(database\)\/documents\/monthly_plans/)
 assert.match(rules,/allow update, delete: if false/)
 assert.match(rules,/match \/monthly_plans\//)
})
