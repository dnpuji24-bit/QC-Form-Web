export const LOCAL_DB_NAME = 'qc_react_local_v2'
export const LOCAL_DB_VERSION = 3
export const DRAFT_STORE = 'drafts'
export const QUEUE_STORE = 'queue'

export function openLocalDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(LOCAL_DB_NAME, LOCAL_DB_VERSION)

    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(DRAFT_STORE)) db.createObjectStore(DRAFT_STORE, { keyPath: 'key' })
      if (!db.objectStoreNames.contains(QUEUE_STORE)) db.createObjectStore(QUEUE_STORE, { keyPath: 'id' })
    }

    request.onsuccess = () => {
      const db = request.result
      db.onversionchange = () => db.close()
      resolve(db)
    }
    request.onerror = () => reject(request.error || new Error('Penyimpanan lokal tidak tersedia.'))
    request.onblocked = () => reject(new Error('Penyimpanan lokal sedang dipakai versi lama. Tutup tab QC lain lalu buka kembali aplikasi.'))
  })
}
