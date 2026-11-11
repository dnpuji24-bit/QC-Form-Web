import { authorizeQcPhotoRead } from './lib/qcPhotoReadAuthorization.mjs'
import assert from 'node:assert/strict'

const recordId = 'qc123'
const photoId = 'photo456'
const ownerUid = 'firebaseowner'
const record = { formType: 'spray', inputtedBy: 'mandor01', ownerUid }
const photo = { photoId, qcRecordId: recordId, provider: 'supabase',
  bucket: 'qc-photos-test', ownerUid, objectPath: `${ownerUid}/qc/${recordId}/${photoId}.jpg`,
  contentType: 'image/jpeg', kind: 'main' }
const roleNames = ['owner','manager','admin','asisten','mandor_spraying','mandor_fertilizer','pengunjung']
const mk = (role, permission) => ({
  callerUid: 'requester', profile: { active: true, username: role === 'mandor_spraying' ? 'mandor01' : 'othername', role },
  roleAccess: { role, permissions: { qc_records: permission } },
  qcRecord: record, photo, recordId, photoId,
})
let checks = 0
function test(name, args, allowed, reason) {
  const outcome = authorizeQcPhotoRead(args)
  assert.equal(outcome.allowed, allowed, `${name}: ${outcome.reason || ''}`)
  if (reason) assert.equal(outcome.reason, reason, name)
  if (allowed) { assert.equal(outcome.objectPath, photo.objectPath); assert.equal(outcome.bucket, 'qc-photos-test') }
  checks++; console.log('PASS:', name)
}
test('owner full read regardless of permission map', { ...mk('owner','none'), roleAccess: null }, true)
test('manager can read with view', mk('manager','view'), true)
test('admin can read with edit', mk('admin','edit'), true)
test('asisten can read with view', mk('asisten','view'), true)
test('mandor reads own spraying QC', mk('mandor_spraying','view'), true)
test('manager denied after owner sets none', mk('manager','none'), false,'ROLE_PERMISSION_DENIED')
test('admin denied after owner sets none', mk('admin','none'), false,'ROLE_PERMISSION_DENIED')
test('missing permission map fails closed', { ...mk('manager','view'), roleAccess: null }, false,'ROLE_PERMISSION_MISSING')
test('mismatched role_access doc denied', { ...mk('admin','view'), roleAccess: { role: 'manager', permissions: { qc_records: 'view' } } }, false,'ROLE_PERMISSION_MISSING')
test('inactive user cannot read', { ...mk('manager','view'), profile: { ...mk('manager','view').profile, active: false } }, false,'INACTIVE_OR_UNKNOWN_ROLE')
test('unknown role denied', mk('unknownrole','view'), false,'INACTIVE_OR_UNKNOWN_ROLE')
test('mandor can read another QC when granted Data QC view', { ...mk('mandor_spraying','view'), profile: { active: true, role: 'mandor_spraying', username: 'different' } }, true)
test('fertilizer mandor can read spraying with Data QC view', mk('mandor_fertilizer','view'), true)
test('viewer allowed only when owner grants view', mk('pengunjung','view'), true)
test('viewer denied without permission', mk('pengunjung','none'), false,'ROLE_PERMISSION_DENIED')
test('different photo ID refused', { ...mk('manager','view'), photo: { ...photo, photoId: 'unexpected' } }, false,'PHOTO_METADATA_INVALID')
test('different bucket refused', { ...mk('manager','view'), photo: { ...photo, bucket: 'public' } }, false,'PHOTO_METADATA_INVALID')
test('other owner UID refused', { ...mk('manager','view'), photo: { ...photo, ownerUid: 'someoneelse' } }, false,'PHOTO_METADATA_INVALID')
test('malformed file path refused', { ...mk('manager','view'), photo: { ...photo, objectPath: 'firebaseowner/qc/other/secret.jpg' } }, false,'PHOTO_PATH_DENIED')
test('sneaky nested path refused', { ...mk('manager','view'), photo: { ...photo, objectPath: `${ownerUid}/qc/${recordId}/subdir/photo456.jpg` } }, false,'PHOTO_PATH_DENIED')
test('mismatch content-type extension refused', { ...mk('manager','view'), photo: { ...photo, contentType: 'image/png' } }, false,'PHOTO_PATH_DENIED')
test('invalid photo type refused', { ...mk('manager','view'), photo: { ...photo, kind: 'other' } }, false,'PHOTO_METADATA_INVALID')
test('record must exist', { ...mk('manager','view'), qcRecord: null }, false,'QC_MISSING')
test('bad user UID fails', { ...mk('manager','view'), callerUid: '../../admin' }, false,'INVALID_REQUEST')
console.log(`SUCCESS: ${checks} QC cross-user photo authorization unit checks passed (no network access).`)
