/**
 * Server-side authorization for QC photo read. Pure decision logic (no network).
 * Data is loaded from Firestore by a trusted backend after Firebase JWT verification.
 * This module is NOT used to grant access directly from the browser.
 */
const ROLES = new Set(['owner','manager','admin','asisten','mandor_spraying','mandor_fertilizer','pengunjung'])
const VALID_ID = /^[A-Za-z0-9_-]{1,160}$/
const PHOTO_BUCKET = 'qc-photos-test'
const ALLOWED_MIME = new Set(['image/jpeg','image/png','image/webp'])
const EXTENSION = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }

function rejection(reason) { return Object.freeze({ allowed: false, reason }) }
export function authorizeQcPhotoRead({ callerUid, profile, roleAccess, qcRecord, photo, recordId, photoId }) {
  if (typeof callerUid !== 'string' || !VALID_ID.test(callerUid) ||
      !VALID_ID.test(recordId || '') || !VALID_ID.test(photoId || '')) return rejection('INVALID_REQUEST')
  if (!profile || profile.active !== true || !ROLES.has(profile.role)) return rejection('INACTIVE_OR_UNKNOWN_ROLE')
  if (profile.role !== 'owner') {
    if (roleAccess?.role !== profile.role) return rejection('ROLE_PERMISSION_MISSING')
    if (!['view','edit'].includes(roleAccess?.permissions?.qc_records)) return rejection('ROLE_PERMISSION_DENIED')
  }
  if (!qcRecord || !['spray','fertilizer'].includes(qcRecord.formType)) return rejection('QC_MISSING')
  if ((profile.role === 'mandor_spraying' || profile.role === 'mandor_fertilizer') &&
      (qcRecord.inputtedBy !== profile.username ||
        (profile.role === 'mandor_spraying' && qcRecord.formType !== 'spray') ||
        (profile.role === 'mandor_fertilizer' && qcRecord.formType !== 'fertilizer'))) {
    return rejection('QC_SCOPE_DENIED')
  }
  if (!photo || photo.provider !== 'supabase' || photo.bucket !== PHOTO_BUCKET ||
      photo.photoId !== photoId || photo.qcRecordId !== recordId ||
      !VALID_ID.test(photo.ownerUid || '') ||
      photo.ownerUid !== qcRecord.ownerUid ||
      !ALLOWED_MIME.has(photo.contentType) ||
      !['main','hold','scan'].includes(photo.kind)) return rejection('PHOTO_METADATA_INVALID')
  const prefix = `${photo.ownerUid}/qc/${recordId}/`
  if (typeof photo.objectPath !== 'string' || !photo.objectPath.startsWith(prefix)) return rejection('PHOTO_PATH_DENIED')
  const name = photo.objectPath.slice(prefix.length)
  const ext = EXTENSION[photo.contentType]
  if (!new RegExp(`^[A-Za-z0-9_-]+\\.${ext}$`).test(name)) return rejection('PHOTO_PATH_DENIED')
  return Object.freeze({ allowed: true, bucket: PHOTO_BUCKET, objectPath: photo.objectPath })
}
