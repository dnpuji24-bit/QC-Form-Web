/**
 * Firestore metadata prototype for QC photos. Designed for the emulator ONLY.
 * Separate qc_photo_metadata prevents the legacy qc_records mirror overwriting pointers.
 * Uses the trusted Firebase Admin SDK; no rule-bypass path is exposed to a browser.
 */
const BUCKET = 'qc-photos-test'
const KINDS = new Set(['main', 'hold', 'scan'])
const MIME = new Set(['image/jpeg', 'image/png', 'image/webp'])
const safe = value => typeof value === 'string' && /^[A-Za-z0-9_-]{1,160}$/.test(value)

export async function attachQcPhotoMetadata(db, info) {
  const { recordId, ownerUid, revision, photoId, kind, objectPath, contentType, holdId } = info
  if (![recordId, ownerUid, revision, photoId].every(safe)) throw new Error('Invalid IDs or revision')
  if (!KINDS.has(kind) || !MIME.has(contentType)) throw new Error('Invalid photo kind or MIME type')
  if (kind === 'hold' ? !safe(holdId) : holdId !== undefined) throw new Error('Invalid HOLD photo identity')
  const prefix = `${ownerUid}/qc/${recordId}/`
  if (!objectPath.startsWith(prefix) || !/^[a-zA-Z0-9_-]+\.(jpg|png|webp)$/.test(objectPath.slice(prefix.length))) {
    throw new Error('Photo path must be owned by Firebase UID and QC record')
  }
  const ref = db.doc(`qc_records/${recordId}`)
  const photoRef = db.doc(`qc_photo_metadata/${recordId}/photos/${photoId}`)
  const stamp = new Date().toISOString()
  const metadata = {
    photoId, qcRecordId: recordId, ownerUid, recordRevision: revision,
    provider: 'supabase', bucket: BUCKET, objectPath, kind, contentType,
    ...(kind === 'hold' ? { holdId } : {}), uploadedAt: stamp,
  }
  return db.runTransaction(async tx => {
    const recordSnap = await tx.get(ref)
    const photoSnap = await tx.get(photoRef)
    if (!recordSnap.exists) throw new Error('QC record does not exist')
    const record = recordSnap.data()
    if (record.ownerUid !== ownerUid) throw new Error('Photo owner does not match QC owner')
    if (record.clientRevision !== revision) throw new Error('Stale QC revision')
    if (photoSnap.exists) {
      const previous = photoSnap.data()
      const immutable = ['photoId','qcRecordId','ownerUid','recordRevision','provider','bucket','objectPath','kind','contentType','holdId']
      if (!immutable.every(key => (previous[key] ?? null) === (metadata[key] ?? null))) throw new Error('Photo ID collision')
      return { status: 'existing', photoId }
    }
    tx.create(photoRef, metadata)
    return { status: 'created', photoId }
  })
}
