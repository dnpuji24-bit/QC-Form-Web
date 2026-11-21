// Stage 19: release guard for legacy Google Drive photos and Apps Script retirement.
// Purely OFFLINE, read-only. No Firebase, Drive or Supabase calls; no credentials.
// Passing the retention guard does NOT certify production cutover readiness.
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {stripOperationalPhotoPayload,prepareOperationalPhotoManifest} from '../src/qcOperationalPhotoManifest.mjs'

const source=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8')
const png='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jR1sAAAAASUVORK5CYII='
const legacy={
 id:'legacy-qc-001',photoBase64:png,
 photoDriveUrl:'https://drive.google.com/file/d/legacy_main_123/view',
 scanReportPhotoBase64:png,
 scanReportDriveUrl:'https://drive.google.com/open?id=legacy_scan_123',
 holdIntervals:[{holdId:'hold-1',photoBase64:png,
  photoDriveUrl:'https://drive.google.com/file/d/legacy_hold_123/view'}],
 downtimeList:[{holdId:'hold-2',photoBase64:png,
  photoDriveUrl:'https://drive.google.com/file/d/legacy_down_123/view'}],
 extra:{source:'existing-firestore'}
}
let checks=0
function check(name,fn){awaited.push(Promise.resolve().then(fn).then(()=>{
 checks++;console.log('PASS: '+name)
}))}
const awaited=[]
check('old Drive main/scan/HOLD/downtime links remain byte-for-byte and input immutable',()=>{
 const snapshot=structuredClone(legacy),clean=stripOperationalPhotoPayload(legacy)
 assert.equal(clean.photoBase64,undefined)
 assert.equal(clean.scanReportPhotoBase64,undefined)
 assert.equal(clean.photoDriveUrl,snapshot.photoDriveUrl)
 assert.equal(clean.scanReportDriveUrl,snapshot.scanReportDriveUrl)
 assert.equal(clean.holdIntervals[0].photoDriveUrl,snapshot.holdIntervals[0].photoDriveUrl)
 assert.equal(clean.downtimeList[0].photoDriveUrl,snapshot.downtimeList[0].photoDriveUrl)
 assert.deepEqual(legacy,snapshot)
 assert.deepEqual(clean.extra,legacy.extra)
})
check('new Supabase photo path accepts only new image bytes, never imports Drive URLs',async()=>{
 const empty=await prepareOperationalPhotoManifest({
  recordId:'qc-v2-uat-example',uploaderUid:'uat-field',changes:[]})
 assert.deepEqual(empty.uploads,[])
 assert.deepEqual(empty.manifest,{})
 const current=await prepareOperationalPhotoManifest({
  recordId:'qc-v2-uat-example',uploaderUid:'uat-field',
  changes:[{kind:'main',action:'replace',dataUrl:png}]})
 assert.equal(current.uploads.length,1)
 assert.equal(current.manifest.main.provider,'supabase')
 assert.ok(current.manifest.main.objectPath.startsWith('uat-field/qc/qc-v2-uat-example/'))
 assert.doesNotMatch(JSON.stringify(current.manifest),/drive\.google\.com|googleapis\.com/)
 await assert.rejects(prepareOperationalPhotoManifest({
  recordId:'qc-v2-uat-example',uploaderUid:'uat-field',
  changes:[{kind:'main',action:'replace',dataUrl:legacy.photoDriveUrl}]}))
})
check('report still reads legacy Drive photo links; production Apps Script cutover is NOT yet approved',()=>{
 const app=source('src/App.tsx')
 const api=source('src/api.ts')
 const native=source('src/qcNativePortalConfig.ts')
 const policy=source('src/qcNativePortalPolicy.mjs')
 const save=source('src/qcOperationalPhotoManifest.mjs')
 assert.match(app,/function driveImageUrl\(/)
 assert.match(app,/record\.photoBase64\|\|record\.photoDriveUrl/)
 assert.match(app,/record\.scanReportPhotoBase64\|\|record\.scanReportDriveUrl/)
 assert.match(app,/h\.photoBase64\|\|h\.photoDriveUrl/)
 assert.match(save,/\.\.\.rest/)
 assert.match(api,/const DEFAULT_API = 'https:\/\/script\.google\.com\//)
 assert.match(api,/login:.*api\('login'/)
 assert.match(api,/finalizeRecord:.*api\('finalizeRecord'/)
 assert.match(native,/VITE_QC_NATIVE_PORTAL/)
 assert.match(policy,/NATIVE_PORTAL_LEGACY_API_BLOCKED/)
})
await Promise.all(awaited)
assert.equal(checks,3)
const blockers=[
 'Legacy Apps Script login and QC finalizeRecord routes still exist in src/api.ts',
 'Firebase-only native portal requires coordinated feature flags and production endpoint parity',
 'Existing QC data already lives in Firestore; do not reimport or replace it',
 'Historical Google Drive photos remain in place and must not be copied to Supabase'
]
console.log('SUCCESS: '+checks+' offline legacy-photo retention and cutover guard checks passed (NO writes)')
console.log('RELEASE_STATUS: BLOCKED — static source check is not a deployed-browser network test')
for(const message of blockers)console.log('REVIEW: '+message)
