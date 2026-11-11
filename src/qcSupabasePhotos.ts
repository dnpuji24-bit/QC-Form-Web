import { doc, runTransaction } from 'firebase/firestore'
import { firebaseAuth, firestoreDb } from './firebase'
import type { QcRecord } from './types'

/**
 * Prototype-only photo pipeline. All files remain in Supabase Storage; Firestore
 * stores only object pointers. Intentionally disabled unless opted in locally.
 * It does NOT replace the existing production Apps Script upload path.
 */
// QC dual-write is NOT safe against the live Firestore database. This feature
// can only be enabled after an explicitly configured Firestore emulator path.
// Until the emulator adapter is implemented, fail closed.
export const supabaseQcPhotoPreviewEnabled = false
const endpoint = String(import.meta.env.VITE_SUPABASE_URL || '').replace(/\/$/, '')
const publishableKey = String(import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || '')
const bucket = 'qc-photos-test'
const dbName = 'qc-photo-uploads-v1'
const storeName = 'photos'
const maxBytes = 2 * 1024 * 1024
type PhotoKind = 'main' | 'hold' | 'scan'
export type SupabasePhotoRef = {
  photoId: string
  provider: 'supabase'
  bucket: string
  objectPath: string
  kind: PhotoKind
  holdId?: string
  contentType: string
  uploadedAt: string
}
type QueuedPhoto = {
  id: string
  recordId: string
  ownerUid: string
  recordRevision: string
  kind: PhotoKind
  holdId?: string
  contentType: string
  objectPath: string
  dataUrl: string
  attempts: number
  lastError?: string
  createdAt: number
}
function assertConfigured() {
  if (!endpoint.startsWith('https://') || !publishableKey) throw new Error('Supabase testing belum dikonfigurasi.')
  if (!firestoreDb || !firebaseAuth) throw new Error('Firebase belum dikonfigurasi.')
}
function openQueue(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(dbName, 1)
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(storeName)) req.result.createObjectStore(storeName, { keyPath: 'id' })
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}
async function transact<T>(mode: IDBTransactionMode, op: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openQueue()
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(storeName, mode)
      const req = op(tx.objectStore(storeName))
      let result!: T
      req.onsuccess = () => { result = req.result }
      req.onerror = () => reject(req.error)
      tx.oncomplete = () => resolve(result)
      tx.onerror = () => reject(tx.error)
      tx.onabort = () => reject(tx.error)
    })
  } finally { db.close() }
}
const allQueued = () => transact('readonly', store => store.getAll()).then(rows => rows as QueuedPhoto[])
const putQueued = (job: QueuedPhoto) => transact('readwrite', store => store.put(job))
const removeQueued = (id: string) => transact('readwrite', store => store.delete(id))

function candidates(record: QcRecord): Array<{ kind: PhotoKind; dataUrl: string; holdId?: string }> {
  const result: Array<{ kind: PhotoKind; dataUrl: string; holdId?: string }> = []
  if (String(record.photoBase64 || '').startsWith('data:image/')) result.push({ kind: 'main', dataUrl: String(record.photoBase64) })
  if (String(record.scanReportPhotoBase64 || '').startsWith('data:image/')) result.push({ kind: 'scan', dataUrl: String(record.scanReportPhotoBase64) })
  record.holdIntervals?.forEach(hold => {
    if (String(hold.photoBase64 || '').startsWith('data:image/')) {
      if (!hold.holdId || !/^[A-Za-z0-9_-]{1,160}$/.test(hold.holdId)) throw new Error('Foto HOLD memerlukan holdId stabil sebelum diantrikan.')
      result.push({ kind: 'hold', holdId: hold.holdId, dataUrl: String(hold.photoBase64) })
    }
  })
  return result
}
function decodeImage(dataUrl: string): { contentType: string; blob: Blob } {
  const match = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl)
  if (!match) throw new Error('Format foto harus JPEG, PNG, atau WebP dalam Base64.')
  const bytes = atob(match[2])
  if (bytes.length === 0 || bytes.length > maxBytes) throw new Error('Ukuran foto harus antara 1 byte dan 2 MB.')
  const out = new Uint8Array(new ArrayBuffer(bytes.length))
  for (let i = 0; i < bytes.length; i++) out[i] = bytes.charCodeAt(i)
  return { contentType: match[1], blob: new Blob([out], { type: match[1] }) }
}
function objectUrl(path: string): string {
  return `${endpoint}/storage/v1/object/${bucket}/${path.split('/').map(encodeURIComponent).join('/')}`
}
async function requestError(response: Response): Promise<string> {
  const body = (await response.text()).slice(0, 300)
  return `HTTP ${response.status}: ${body}`
}

/** Save images in IndexedDB before attempting any network transfer. */
export async function queueQcRecordPhotos(record: QcRecord): Promise<number> {
  if (!supabaseQcPhotoPreviewEnabled) return 0
  assertConfigured()
  const ownerUid = firebaseAuth!.currentUser?.uid
  if (!ownerUid) throw new Error('Login Firebase diperlukan sebelum menyimpan antrean foto.')
  const inputs = candidates(record)
  if (!inputs.length) return 0
  const existing = (await allQueued()).filter(job => job.ownerUid === ownerUid && job.recordId === record.id)
  const revision = String(record.clientRevision || '')
  for (const photo of inputs) {
    // Validate locally before putting any new data in the queue.
    const { contentType } = decodeImage(photo.dataUrl)
    const previous = existing.find(job => job.recordRevision === revision && job.kind === photo.kind && job.holdId === photo.holdId)
    if (previous) continue
    const photoId = crypto.randomUUID()
    const extension = contentType === 'image/png' ? 'png' : contentType === 'image/webp' ? 'webp' : 'jpg'
    const entry: QueuedPhoto = {
      id: photoId, recordId: record.id, ownerUid, recordRevision: revision,
      kind: photo.kind, holdId: photo.holdId, contentType,
      objectPath: `${ownerUid}/qc/${encodeURIComponent(record.id)}/${photoId}.${extension}`,
      dataUrl: photo.dataUrl, attempts: 0, createdAt: Date.now(),
    }
    await putQueued(entry)
  }
  return inputs.length
}
let processing: Promise<{ processed: number; remaining: number }> | null = null
export function flushQcPhotoQueue(): Promise<{ processed: number; remaining: number }> {
  if (processing) return processing
  processing = flushInternal().finally(() => { processing = null })
  return processing
}
async function flushInternal(): Promise<{ processed: number; remaining: number }> {
  if (!supabaseQcPhotoPreviewEnabled || !navigator.onLine) return { processed: 0, remaining: 0 }
  assertConfigured()
  const currentUser = firebaseAuth!.currentUser
  if (!currentUser) return { processed: 0, remaining: (await allQueued()).length }
  const tokenResult = await currentUser.getIdTokenResult(true)
  if (tokenResult.claims.role !== 'authenticated') throw new Error('Firebase ID Token tidak memiliki role=authenticated.')
  let processed = 0
  for (const job of await allQueued()) {
    if (job.ownerUid !== currentUser.uid) continue
    try {
      const { blob } = decodeImage(job.dataUrl)
      const uploaded = await fetch(objectUrl(job.objectPath), {
        method: 'POST',
        headers: {
          apikey: publishableKey, Authorization: `Bearer ${tokenResult.token}`,
          'Content-Type': job.contentType, 'x-upsert': 'false',
        },
        body: blob,
      })
      // A retry after a successful upload can return 409; verify it by authenticated GET.
      if (!uploaded.ok && uploaded.status !== 409) throw new Error(await requestError(uploaded))
      const verified = await fetch(objectUrl(job.objectPath), {
        headers: { apikey: publishableKey, Authorization: `Bearer ${tokenResult.token}` },
      })
      if (!verified.ok) throw new Error('Foto belum bisa dibaca kembali: ' + await requestError(verified))
      // A photo metadata document is immutable and independent of the legacy
      // qc_records mirror. It is exactly what the signed-photo viewer reads.
      const reference: SupabasePhotoRef = {
        photoId: job.id, provider: 'supabase', bucket, objectPath: job.objectPath,
        kind: job.kind, ...(job.holdId === undefined ? {} : { holdId: job.holdId }),
        contentType: job.contentType, uploadedAt: new Date().toISOString(),
      }
      await runTransaction(firestoreDb!, async transaction => {
        const recordRef = doc(firestoreDb!, 'qc_records', job.recordId)
        const photoRef = doc(firestoreDb!, 'qc_photo_metadata', job.recordId, 'photos', job.id)
        const [recordSnapshot, photoSnapshot] = await Promise.all([
          transaction.get(recordRef), transaction.get(photoRef),
        ])
        if (!recordSnapshot.exists()) throw new Error('Record QC belum dikonfirmasi di Firestore.')
        const data = recordSnapshot.data()
        if (data.ownerUid !== job.ownerUid) throw new Error('Pemilik QC tidak cocok dengan akun foto.')
        if (String(data.clientRevision || '') !== job.recordRevision) throw new Error('Revisi QC berubah; perlu pemeriksaan sebelum menautkan foto lama.')
        if (photoSnapshot.exists()) {
          const saved = photoSnapshot.data()
          const immutable = ['photoId','qcRecordId','ownerUid','recordRevision','provider','bucket','objectPath','kind','contentType','holdId']
          const intended = {
            ...reference, qcRecordId: job.recordId, ownerUid: job.ownerUid,
            recordRevision: job.recordRevision,
          }
          if (!immutable.every(key => (saved[key] ?? null) ===
            ((intended as Record<string, unknown>)[key] ?? null))) {
            throw new Error('ID foto sudah terpakai untuk objek lain.')
          }
          return
        }
        transaction.set(photoRef, {
          ...reference, qcRecordId: job.recordId, ownerUid: job.ownerUid,
          recordRevision: job.recordRevision,
        })
      })
      await removeQueued(job.id)
      processed++
    } catch (error) {
      await putQueued({ ...job, attempts: job.attempts + 1, lastError: error instanceof Error ? error.message : String(error) })
      // Keep processing other jobs; retry is safe because each path is immutable.
    }
  }
  return { processed, remaining: (await allQueued()).filter(job => job.ownerUid === currentUser.uid).length }
}
export async function qcPhotoQueueStatus(): Promise<{ pending: number; failures: number }> {
  const uid = firebaseAuth?.currentUser?.uid
  const jobs = (await allQueued()).filter(item => item.ownerUid === uid)
  return { pending: jobs.length, failures: jobs.filter(item => item.lastError).length }
}
export async function readPrivateQcPhoto(reference: SupabasePhotoRef): Promise<string> {
  assertConfigured()
  if (reference.bucket !== bucket || reference.provider !== 'supabase') throw new Error('Referensi foto tidak sesuai bucket.')
  const owner = firebaseAuth!.currentUser
  if (!owner) throw new Error('Login Firebase diperlukan.')
  const token = await owner.getIdToken()
  const response = await fetch(objectUrl(reference.objectPath), { headers: { apikey: publishableKey, Authorization: `Bearer ${token}` } })
  if (!response.ok) throw new Error(await requestError(response))
  return URL.createObjectURL(await response.blob())
}
