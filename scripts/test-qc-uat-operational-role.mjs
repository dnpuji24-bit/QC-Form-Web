import assert from 'node:assert/strict'
import {roleDefinition,assignIdentityRole,permissionsForIdentity} from '../src/qcUatCustomRoles.mjs'
import {marker} from '../src/qcUatRolePermissions.mjs'
import {operationalPermissions,canReadOperationalPhoto} from '../server/qc-photo-access/uat-operational-permissions.mjs'
const def=roleDefinition({name:'QC Field Officer',permissions:{qc_spraying:'edit',qc_fertilizer:'view',qc_records:'view'}})
const identity=assignIdentityRole({...marker('mandor_spraying'),policyRevision:0,roleOverrides:{},manualOverrides:{}},def.id,def)
let data={testOnly:true,workspace:'cutover',definition:def},reads=0
const tx={get:async ref=>{reads++;assert.equal(ref,'qc_uat_workspaces/cutover/role_catalog/'+def.id);return {data:()=>data}}},db={doc:x=>x}
const resolve=(m=identity,productionProfile=false)=>operationalPermissions({tx,db,marker:m,productionProfile})
let n=0
const check=async(name,fn)=>{await fn();n++;console.log('PASS: '+name)}
await check('built-in fixtures retain prior permission contract',async()=>{const m=marker('mandor_spraying');assert.deepEqual(await resolve(m),m.permissions);assert.equal(reads,0)})
await check('custom grants resolve from catalog rather than old role',async()=>{const p=await resolve();assert.equal(p.qc_spraying,'edit');assert.equal(p.qc_fertilizer,'view');assert.equal(p.qc_dashboard,'none')})
await check('explicit manual none overrides custom edit',async()=>{const m={...identity,manualOverrides:{qc_spraying:'none'}};assert.equal((await resolve({...m,permissions:permissionsForIdentity(m,def)})).qc_spraying,'none')})
await check('missing and malformed catalog fail closed',async()=>{const old=data;try{for(const d of [undefined,{...old,testOnly:false},{...old,workspace:'other'},{...old,definition:{...def,id:'custom-other'}}]){data=d;await assert.rejects(resolve(),{message:'UAT_IDENTITY_DENIED'})}}finally{data=old}})
await check('forged cached permissions and invalid revision denied',async()=>{for(const m of [{...identity,permissions:{...identity.permissions,qc_settings:'edit'}},{...identity,policyRevision:-1},{...identity,manualOverrides:undefined},{...identity,roleOverrides:{qc_logs:'edit'}}])await assert.rejects(resolve(m),{message:'UAT_IDENTITY_DENIED'})})
await check('disabled production and unknown role denied',async()=>{await assert.rejects(resolve({...identity,enabled:false}));await assert.rejects(resolve(identity,true));await assert.rejects(resolve({...identity,role:'unknown'}))})
await check('custom role cannot sign foreign photo even with Data QC view',async()=>{const p=await resolve();assert.equal(canReadOperationalPhoto(identity,p,'uat-a',{ownerUid:'uat-b'},'qc_spraying'),false);assert.equal(canReadOperationalPhoto(identity,p,'uat-a',{ownerUid:'uat-a'},'qc_spraying'),true)})
await check('built-in supervisor photo access unchanged and custom none denied',async()=>{const m=marker('manager'),p=await resolve(m);assert.equal(canReadOperationalPhoto(m,p,'uat-a',{ownerUid:'uat-b'},'qc_spraying'),true);assert.equal(canReadOperationalPhoto(identity,{qc_spraying:'none',qc_records:'none'},'uat-a',{ownerUid:'uat-a'},'qc_spraying'),false)})
console.log('SUCCESS: '+n+' custom operational permission checks (offline)')
