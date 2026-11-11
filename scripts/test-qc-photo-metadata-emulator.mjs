import assert from 'node:assert/strict'
import { initializeApp } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
import { attachQcPhotoMetadata } from './lib/qcPhotoMetadata.mjs'

const PROJECT = 'demo-qc-photo-test'
const host = process.env.FIRESTORE_EMULATOR_HOST || ''
if (process.env.GCLOUD_PROJECT !== PROJECT || process.env.FIREBASE_PROJECT_ID !== PROJECT ||
    !/^(127\.0\.0\.1|localhost):\d+$/.test(host)) {
  console.error('SAFETY STOP: Run ONLY with Firestore Emulator, demo project, localhost.')
  console.error('Expected: FIRESTORE_EMULATOR_HOST=127.0.0.1:8085; GCLOUD_PROJECT=FIREBASE_PROJECT_ID=demo-qc-photo-test')
  process.exit(2)
}
initializeApp({ projectId: PROJECT })
const db = getFirestore()
const ownerUid = 'test-firebase-owner'
const otherUid = 'different-firebase-user'
const recordId = 'qc-emulator-001'
const rev = 'rev-001'
const qcRef = db.doc(`qc_records/${recordId}`)
let checks = 0
const check = (title, fn) => fn().then(() => { console.log('PASS:', title); checks++ })
const fails = (title, fn, match) => check(title, async () => { await assert.rejects(fn, match) })
const photo = (photoId, kind, extra = {}) => ({
  recordId, ownerUid, revision: rev, photoId, kind,
  objectPath: `${ownerUid}/qc/${recordId}/${photoId}.jpg`,
  contentType: 'image/jpeg', ...(kind === 'hold' ? { holdId: 'hold-001' } : {}), ...extra,
})
try {
  await qcRef.set({ id: recordId, ownerUid, clientRevision: rev, formType: 'spray', paddock: 'TEST_ONLY', saveType: 'ready', photoDriveUrl: 'https://example.invalid/historical' })
  await check('main photo reference', async () => {
    assert.equal((await attachQcPhotoMetadata(db, photo('photo-main', 'main'))).status, 'created')
  })
  await check('HOLD photo reference', async () => {
    assert.equal((await attachQcPhotoMetadata(db, photo('photo-hold', 'hold'))).status, 'created')
  })
  await check('scan report photo reference', async () => {
    assert.equal((await attachQcPhotoMetadata(db, photo('photo-scan', 'scan'))).status, 'created')
  })
  await check('idempotent retry creates no second reference', async () => {
    assert.equal((await attachQcPhotoMetadata(db, photo('photo-main', 'main'))).status, 'existing')
    assert.equal((await db.collection(`qc_photo_metadata/${recordId}/photos`).get()).size, 3)
  })
  await fails('same photo ID cannot point at another object', () => attachQcPhotoMetadata(db, photo('photo-main', 'main', { objectPath: `${ownerUid}/qc/${recordId}/different.jpg` })), /collision/)
  await fails('other owner denied', () => attachQcPhotoMetadata(db, photo('wrong-owner', 'main', { ownerUid: otherUid, objectPath: `${otherUid}/qc/${recordId}/wrong-owner.jpg` })), /owner/)
  await fails('path outside owner folder denied', () => attachQcPhotoMetadata(db, photo('wrong-path', 'main', { objectPath: `shared/wrong-path.jpg` })), /path/)
  await fails('stale QC revision denied', () => attachQcPhotoMetadata(db, photo('stale', 'main', { revision: 'rev-before-edit' })), /Stale/)
  await qcRef.update({ clientRevision: 'rev-002' })
  await fails('old revision denied after edit', () => attachQcPhotoMetadata(db, photo('old-rev', 'main')), /Stale/)
  await check('historical Drive URL and QC record are unmodified by photo metadata', async () => {
    const record = (await qcRef.get()).data()
    assert.equal(record.photoDriveUrl, 'https://example.invalid/historical')
    assert.equal(record.saveType, 'ready')
    assert.equal(record.supabasePhotoRefs, undefined)
  })
  console.log(`SUCCESS: ${checks} Firestore Emulator metadata checks passed; no production writes.`)
} catch (error) {
  console.error('FAILED:', error)
  process.exitCode = 1
}
