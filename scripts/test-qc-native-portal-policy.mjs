import assert from 'node:assert/strict'
import {assertNativePortalConfig,assertLegacyApiAllowed,NATIVE_SESSION_MARKER} from '../src/qcNativePortalPolicy.mjs'
let n=0
function test(label,fn){fn();n++;console.log('PASS: '+label)}
test('legacy build remains usable',()=>assert.doesNotThrow(()=>assertNativePortalConfig(false,false,false,false,false)))
test('complete native configuration permitted',()=>assert.doesNotThrow(()=>assertNativePortalConfig(true,true,true,true,true)))
for(let i=0;i<4;i++)test('missing native prerequisite '+(i+1)+' rejected',()=>{const flags=[true,true,true,true];flags[i]=false;assert.throws(()=>assertNativePortalConfig(true,...flags),/CONFIG_INCOMPLETE/)})
test('native mode blocks legacy API even with old token',()=>assert.throws(()=>assertLegacyApiAllowed(true,'old-token'),/LEGACY_API_BLOCKED/))
test('compatibility marker never accepted as legacy credential',()=>assert.throws(()=>assertLegacyApiAllowed(false,NATIVE_SESSION_MARKER),/LEGACY_API_BLOCKED/))
test('legacy mode accepts existing transport',()=>assert.doesNotThrow(()=>assertLegacyApiAllowed(false,'old-token')))
console.log('SUCCESS: '+n+' native portal policy checks passed (no network, no writes)')
