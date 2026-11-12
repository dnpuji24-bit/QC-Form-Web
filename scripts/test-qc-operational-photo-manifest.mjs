import assert from 'node:assert/strict'
import {prepareOperationalPhotoManifest as prepare,stripOperationalPhotoPayload as strip} from '../src/qcOperationalPhotoManifest.mjs'
const png='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jR1sAAAAASUVORK5CYII='
const base={recordId:'qc-test-1',uploaderUid:'testUser'}
const main={kind:'main',action:'replace',dataUrl:png}
const hold={kind:'hold',holdId:'hold-1',action:'replace',dataUrl:png}
const scan={kind:'scan',action:'replace',dataUrl:png}
const first=await prepare({...base,changes:[main,hold,scan]})
assert.equal(first.uploads.length,3); assert.equal(new Set(first.uploads.map(x=>x.reference.photoId)).size,3)
console.log('PASS: main, HOLD and scan have distinct immutable slots')
const retry=await prepare({...base,changes:[main,hold,scan]})
assert.deepEqual(first,retry);console.log('PASS: retries produce identical paths and hashes')
const kept=await prepare({...base,previous:first.manifest,changes:[]})
assert.deepEqual(kept.manifest,first.manifest);assert.equal(kept.uploads.length,0)
console.log('PASS: correction without new photo retains previous references')
const removed=await prepare({...base,previous:first.manifest,changes:[{kind:'hold',holdId:'hold-1',action:'remove'}]})
assert.equal(removed.manifest['hold_hold-1'],undefined);assert.deepEqual(removed.manifest.main,first.manifest.main)
console.log('PASS: explicit removal affects only selected slot')
const changed=await prepare({...base,previous:first.manifest,changes:[{...main,dataUrl:'data:image/png;base64,AQID'}]})
assert.notEqual(changed.manifest.main.photoId,first.manifest.main.photoId);assert.deepEqual(changed.manifest.scan,first.manifest.scan)
console.log('PASS: replacement creates new immutable ID')
await assert.rejects(prepare({...base,changes:[main,main]}));await assert.rejects(prepare({...base,changes:[{...hold,holdId:'../bad'}]}))
console.log('PASS: duplicate and invalid slots rejected')
await assert.rejects(prepare({...base,changes:[{...main,dataUrl:'data:image/gif;base64,AQID'}]}))
await assert.rejects(prepare({...base,changes:[{...main,dataUrl:'data:image/png;base64,'+Buffer.alloc(2097153).toString('base64')}]}))
console.log('PASS: unsupported type and oversize rejected')
const clean=strip({id:'qc1',photoBase64:png,scanReportPhotoBase64:png,photoDriveUrl:'old-drive',holdIntervals:[{holdId:'h',photoBase64:png,photoDriveUrl:'old-hold'}],downtimeList:[{photoBase64:png}]})
assert.equal(clean.photoBase64,undefined);assert.equal(clean.scanReportPhotoBase64,undefined);assert.equal(clean.photoDriveUrl,'old-drive');assert.deepEqual(clean.holdIntervals,[{holdId:'h',photoDriveUrl:'old-hold'}]);assert.deepEqual(clean.downtimeList,[{}])
console.log('PASS: binary stripped, historical Drive URLs retained')
console.log('SUCCESS: 8 operational photo manifest checks passed (no network, no writes)')
