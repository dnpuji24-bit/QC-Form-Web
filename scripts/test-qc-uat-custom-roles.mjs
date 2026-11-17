import assert from 'node:assert/strict'
import {roleDefinition,builtinRoles,validateCustomRole} from '../src/qcUatCustomRoles.mjs'
import {keys,roles} from '../src/qcUatRolePermissions.mjs'
let n=0
const check=(name,fn)=>{fn();n++;console.log('PASS: '+name)}
check('new role defaults all permissions to none',()=>{const r=roleDefinition({name:'QC Inspector',permissions:{}});assert.equal(r.id,'custom-qc-inspector');assert.deepEqual(Object.keys(r.permissions),keys);assert.ok(Object.values(r.permissions).every(m=>m==='none'))})
check('name identity deterministic across case and separators',()=>{for(const name of [' QC Inspector ','qc_inspector','QC-INSPECTOR'])assert.equal(roleDefinition({name,permissions:{}}).id,'custom-qc-inspector')})
check('explicit view and edit only affect selected keys',()=>{const r=roleDefinition({name:'Planning Officer',permissions:{data_plan_daily:'edit',qc_records:'view'}});assert.equal(r.permissions.data_plan_daily,'edit');assert.equal(r.permissions.qc_records,'view');assert.equal(r.permissions.qc_spraying,'none')})
check('built-in and privileged role identities reserved',()=>{for(const name of [...roles,'OWNER','Super Admin','owner admin','custom-test','Admin Owner'])assert.throws(()=>roleDefinition({name,permissions:{}}))})
check('invalid names rejected',()=>{for(const name of ['','ab','../test','a'.repeat(51),null])assert.throws(()=>roleDefinition({name,permissions:{}}))})
check('forged authority fields and invalid permissions rejected',()=>{for(const input of [{name:'QC Inspector',permissions:{owner:'edit'}},{name:'QC Inspector',permissions:{qc_spraying:'admin'}},{name:'QC Inspector',permissions:{},id:'owner'},{name:'QC Inspector',permissions:{},role:'owner'}])assert.throws(()=>roleDefinition(input))})
check('persisted role must have exact complete definition',()=>{const r=roleDefinition({name:'QC Inspector',permissions:{}});assert.deepEqual(validateCustomRole(r),r);assert.throws(()=>validateCustomRole({...r,id:'owner'}));assert.throws(()=>validateCustomRole({...r,permissions:{}}))})
check('built-ins unchanged and custom role not a built-in identity',()=>{assert.deepEqual(builtinRoles().map(r=>r.id),roles);assert.ok(!roles.includes(roleDefinition({name:'QC Inspector',permissions:{}}).id))})
console.log('SUCCESS: '+n+' custom role catalog checks (offline)')
