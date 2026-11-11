import { firebaseAuth } from './firebase'

/**
 * Standalone test harness: does NOT touch Firestore or QC records.
 * Uploads ONLY into qc-photos-test/<Firebase UID>/queue-tests/.
 */
const bucket = 'qc-photos-test'
const endpoint = String(import.meta.env.VITE_SUPABASE_URL || '').replace(/\/$/, '')
const publishableKey = String(import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || '')
const dbName = 'supabase-photo-qa-v1'
const objectStore = 'jobs'
const allowed = new Set(['image/jpeg', 'image/png', 'image/webp'])
const maxSize = 2 * 1024 * 1024

export type PhotoQaJob = {
  id: string
  ownerUid: string
  objectPath: string
  file: Blob
  contentType: string
  createdAt: number
  attempts: number
  error: string
}

async function database(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open(dbName, 1)
    r.onupgradeneeded = () => {
      if (!r.result.objectStoreNames.contains(objectStore)) r.result.createObjectStore(objectStore, { keyPath: 'id' })
    }
    r.onsuccess = () => resolve(r.result)
    r.onerror = () => reject(r.error)
  })
}
async function request<T>(mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await database()
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(objectStore, mode)
      const r = action(tx.objectStore(objectStore))
      let value!: T
      r.onsuccess = () => { value = r.result }
      r.onerror = () => reject(r.error)
      tx.oncomplete = () => resolve(value)
      tx.onerror = () => reject(tx.error)
      tx.onabort = () => reject(tx.error)
    })
  } finally { db.close() }
}
export async function listPhotoQaJobs(): Promise<PhotoQaJob[]> {
  const uid = firebaseAuth?.currentUser?.uid
  return ((await request('readonly', store => store.getAll())) as PhotoQaJob[])
    .filter(item => item.ownerUid === uid)
    .sort((a, b) => a.createdAt - b.createdAt)
}
export async function enqueuePhotoQa(file: File): Promise<PhotoQaJob> {
  const ownerUid = firebaseAuth?.currentUser?.uid
  if (!ownerUid) throw new Error('Login Firebase diperlukan.')
  if (!allowed.has(file.type) || file.size === 0 || file.size > maxSize) {
    throw new Error('Foto harus JPEG/PNG/WebP dengan ukuran 1 byte sampai 2 MB.')
  }
  const ext = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg'
  const id = crypto.randomUUID()
  const job: PhotoQaJob = {
    id, ownerUid,
    objectPath: `${ownerUid}/queue-tests/${id}.${ext}`,
    file, contentType: file.type, createdAt: Date.now(), attempts: 0, error: '',
  }
  await request('readwrite', store => store.put(job))
  return job
}
function urlFor(path: string): string {
  return `${endpoint}/storage/v1/object/${bucket}/${path.split('/').map(encodeURIComponent).join('/')}`
}
async function message(response: Response): Promise<string> {
  return `HTTP ${response.status}: ${(await response.text()).slice(0, 220)}`
}
let active: Promise<{ done: number; pending: number; preview: string | null }> | null = null
export function flushPhotoQaJobs(): Promise<{ done: number; pending: number; preview: string | null }> {
  if (active) return active
  active = flush().finally(() => { active = null })
  return active
}
async function flush(): Promise<{ done: number; pending: number; preview: string | null }> {
  if (!endpoint.startsWith('https://') || !publishableKey) throw new Error('Supabase belum dikonfigurasi.')
  if (!navigator.onLine) return { done: 0, pending: (await listPhotoQaJobs()).length, preview: null }
  const user = firebaseAuth?.currentUser
  if (!user) throw new Error('Login Firebase diperlukan.')
  const token = await user.getIdTokenResult(true)
  if (token.claims.role !== 'authenticated') throw new Error('Claim Firebase role=authenticated belum tersedia.')
  const headers = { apikey: publishableKey, Authorization: `Bearer ${token.token}` }
  let done = 0
  let preview: string | null = null
  for (const job of await listPhotoQaJobs()) {
    try {
      const upload = await fetch(urlFor(job.objectPath), {
        method: 'POST',
        headers: { ...headers, 'Content-Type': job.contentType, 'x-upsert': 'false' },
        body: job.file,
      })
      if (!upload.ok && upload.status !== 409) throw new Error(await message(upload))
      const read = await fetch(urlFor(job.objectPath), { headers })
      if (!read.ok) throw new Error(await message(read))
      const blob = await read.blob()
      if (preview) URL.revokeObjectURL(preview)
      preview = URL.createObjectURL(blob)
      // Remove queue item only AFTER verifying private read.
      await request('readwrite', store => store.delete(job.id))
      done++
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error)
      await request('readwrite', store => store.put({ ...job, attempts: job.attempts + 1, error: reason }))
    }
  }
  return { done, pending: (await listPhotoQaJobs()).length, preview }
}
