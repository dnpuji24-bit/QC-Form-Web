import assert from 'node:assert/strict'
import {roleDefinition,assignIdentityRole,permissionsForIdentity} from '../src/qcUatCustomRoles.mjs'
import {marker} from '../src/qcUatRolePermissions.mjs'
import {validateSession} from '../src/qcUatSessionPermissions.mjs'
import {ownerPermissionChange} from '../src/qcUatOwnerPermissionContract.mjs'
const r=roleDefinition({name:'QC Inspector',permissions:{qc_fertilizer:'edit',qc_records:'view'}})
const m={...marker('mandor_spraying',{qc_logs:'view'},{qc_records:'none'}),roleOverrides:{qc_logs:'view'},manualOverrides:{qc_records:'none'},policyRevision:0}
let n=0
const check=(name,fn)=>{fn();n++;console.log('PASS: '+name)}
const assigned=()=>assignIdentityRole(m,r.id,r)
check('custom role replaces old defaults and template overrides',()=>{const x=assigned();assert.equal(x.role,r.id);assert.equal(x.permissions.qc_spraying,'none');assert.equal(x.permissions.qc_logs,'none');assert.equal(x.permissions.qc_fertilizer,'edit');assert.deepEqual(x.roleOverrides,{})})
check('manual none survives assignment, original not mutated',()=>{const x=assigned();assert.equal(x.permissions.qc_records,'none');assert.equal(m.role,'mandor_spraying');assert.equal(x.policyRevision,1)})
check('custom role validates from catalog; missing mismatched or old overrides rejected',()=>{const x=assigned();for(const [a,b] of [[x,undefined],[x,roleDefinition({name:'Other Role',permissions:{}})],[{...x,roleOverrides:{qc_logs:'edit'}},r]])assert.throws(()=>permissionsForIdentity(a,b))})
check('Owner and unknown identities cannot be assigned',()=>{for(const id of ['owner','fake-role','custom-missing'])assert.throws(()=>assignIdentityRole(m,id,undefined));assert.throws(()=>assignIdentityRole({...m,role:'owner'},r.id,r));assert.throws(()=>assignIdentityRole({...m,enabled:false},r.id,r))})
check('same role and exhausted revision rejected',()=>{assert.throws(()=>assignIdentityRole(m,m.role));assert.throws(()=>assignIdentityRole({...m,policyRevision:999999},r.id,r))})
check('return to builtin uses default plus manual override',()=>{const x=assignIdentityRole(assigned(),'mandor_spraying');assert.equal(x.permissions.qc_spraying,'edit');assert.equal(x.permissions.qc_records,'none');assert.equal(x.policyRevision,2)})
check('manual change on custom role remains catalog based',()=>{const x=assigned();const result=ownerPermissionChange({targetUid:'uat-spray',expectedRevision:1,patch:{qc_fertilizer:'view'}},{actorUid:'uat-owner',claim:true,actor:{...m,role:'owner'},target:x,roleDefinition:r});assert.equal(result.next.permissions.qc_fertilizer,'view');assert.equal(result.next.permissions.qc_records,'none');assert.equal(result.next.permissions.qc_spraying,'none')})
check('session recognizes custom identity without role fallback',()=>{const x=assigned();const v={uid:'uat-spray',role:x.role,policyRevision:x.policyRevision,permissions:x.permissions};assert.equal(validateSession(v,v.uid).role,r.id);assert.throws(()=>validateSession({...v,role:'invalid'},v.uid));assert.throws(()=>validateSession({...v,permissions:{}},v.uid))})
console.log('SUCCESS: '+n+' custom role assignment checks (offline)')
