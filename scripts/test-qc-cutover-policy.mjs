import assert from 'node:assert/strict'
import {assertQcScriptAllowed,assertLegacyQcWriteAllowed,selectQcFlushMode} from '../src/qcCutoverPolicy.mjs'
let n=0
const check=(label,fn)=>{fn();n++;console.log('PASS: '+label)}
for(const action of ['records','syncRecord','finalizeRecord','deleteRecord'])check('cutover blocks Apps Script '+action,()=>assert.throws(()=>assertQcScriptAllowed(action,true),/QC_FIRESTORE_ONLY/))
check('legacy mode retains existing QC routes',()=>{for(const a of ['records','syncRecord','finalizeRecord','deleteRecord'])assert.doesNotThrow(()=>assertQcScriptAllowed(a,false))})
check('unrelated module routes are unchanged',()=>{for(const a of ['login','me','masterData','updateRolePermissions','logs'])assert.doesNotThrow(()=>assertQcScriptAllowed(a,true))})
check('operational IDs cannot enter legacy writes even in dual mode',()=>assert.throws(()=>assertLegacyQcWriteAllowed('qc-v2-test',false),/QC_LEGACY_WRITE_BLOCKED/))
check('historic writes paused in cutover',()=>assert.throws(()=>assertLegacyQcWriteAllowed('qc_123',true),/QC_LEGACY_WRITE_BLOCKED/))
check('legacy historic writes supported with flag off',()=>assert.doesNotThrow(()=>assertLegacyQcWriteAllowed('qc_123',false)))
check('invalid cutover configuration fails closed',()=>assert.throws(()=>selectQcFlushMode(true,false),/QC_CUTOVER_CONFIGURATION_INVALID/))
check('cutover selects only operational worker',()=>assert.equal(selectQcFlushMode(true,true),'operational-only'))
check('default mode preserves dual transport',()=>assert.equal(selectQcFlushMode(false,false),'dual'))
console.log('SUCCESS: '+n+' QC cutover policy checks passed (no network, no writes)')
