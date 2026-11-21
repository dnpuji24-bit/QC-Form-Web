// Stage 19 — small Firebase-only portal boundary delta (OFFLINE, no writes).
// This is NOT a hosted-browser egress certification or deployment approval.
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {assertNativePortalConfig,assertLegacyApiAllowed,NATIVE_SESSION_MARKER} from '../src/qcNativePortalPolicy.mjs'
import {assertQcScriptAllowed,selectQcFlushMode} from '../src/qcCutoverPolicy.mjs'

const src=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8')
let n=0
function check(name,fn){fn();n++;console.log('PASS: '+name)}
check('Firebase-only login rejects old tokens and incomplete cutover flags',()=>{
 assert.doesNotThrow(()=>assertNativePortalConfig(true,true,true,true,true))
 for(let i=0;i<4;i++){
  const flags=[true,true,true,true];flags[i]=false
  assert.throws(()=>assertNativePortalConfig(true,...flags),/CONFIG_INCOMPLETE/)
 }
 assert.throws(()=>assertLegacyApiAllowed(true,'old-token'),/NATIVE_PORTAL_LEGACY_API_BLOCKED/)
 assert.throws(()=>assertLegacyApiAllowed(false,NATIVE_SESSION_MARKER),/NATIVE_PORTAL_LEGACY_API_BLOCKED/)
 assert.equal(selectQcFlushMode(true,true),'operational-only')
 for(const action of ['records','syncRecord','finalizeRecord','deleteRecord'])
  assert.throws(()=>assertQcScriptAllowed(action,true),/QC_FIRESTORE_ONLY/)
})
check('native Settings never reads or changes the legacy Apps Script URL',()=>{
 const api=src('src/api.ts'),app=src('src/App.tsx')
 const getter=api.slice(api.indexOf('export function getApiUrl'),api.indexOf('export function setApiUrl'))
 const setter=api.slice(api.indexOf('export function setApiUrl'),api.indexOf('export async function api'))
 assert.match(getter,/if\s*\(nativePortalEnabled\)\s*return\s*''/)
 assert.match(setter,/assertLegacyApiAllowed\(nativePortalEnabled,\s*''\)/)
 assert.match(app,/useState\(\(\)=>nativePortalEnabled\?'':getApiUrl\(\)\)/)
 assert.match(app,/if\(nativePortalEnabled\)return <section data-testid="firebase-native-settings"/)
 assert.match(app,/URL Apps Script lama dinonaktifkan/)
 // Old-mode configuration remains in the bundle for an explicit, separate rollback.
 assert.match(setter,/localStorage\.setItem\(CONFIG_KEY/)
 assert.doesNotThrow(()=>assertLegacyApiAllowed(false,'old-token'))
})
check('native entrypoint and historical Drive report remain separate from legacy auth',()=>{
 const main=src('src/main.tsx'),native=src('src/NativePortalSession.tsx')
 const app=src('src/App.tsx'),cutover=src('src/qcCutover.ts')
 assert.match(main,/nativePortalEnabled\s*\?\s*<NativePortalSession>/)
 for(const pilot of ['showNativeRegistrationPilot','showFirebaseAuthPilot','showOperationalPilot','showPhotoUploadTest']){
  assert.match(main,new RegExp('const '+pilot+' = !nativePortalEnabled && '))
 }
 assert.match(native,/signInWithEmailAndPassword/)
 assert.match(native,/readApprovedFirebaseSession/)
 assert.match(cutover,/VITE_QC_FIRESTORE_ONLY/)
 assert.match(cutover,/VITE_QC_OPERATIONAL_SAVE/)
 assert.match(app,/record\.photoBase64\|\|record\.photoDriveUrl/)
 assert.match(app,/record\.scanReportPhotoBase64\|\|record\.scanReportDriveUrl/)
 assert.match(app,/h\.photoBase64\|\|h\.photoDriveUrl/)
})
console.log('SUCCESS: '+n+' Firebase-only boundary delta contracts passed (OFFLINE, NO writes)')
console.log('RELEASE_STATUS: BLOCKED — native backend parity and deployed-browser egress still require verification')
