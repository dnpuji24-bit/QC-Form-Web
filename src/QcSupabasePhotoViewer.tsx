import { useEffect, useState } from 'react'
import { collection, getDocs, limit, query } from 'firebase/firestore'
import { firebaseAuth, firestoreDb } from './firebase'
import { requestQcPhotoPreviewUrl } from './qcPhotoSignedRead'

type Photo = { photoId: string; kind: 'main' | 'hold' | 'scan'; src: string }
type PhotoMetadata = { photoId?: string; kind?: string; provider?: string; qcRecordId?: string }
const enabled = import.meta.env.VITE_QC_PHOTO_SIGN_PREVIEW === 'true'
const order = { main: 0, hold: 1, scan: 2 }

export default function QcSupabasePhotoViewer({ recordId }: { recordId: string }) {
  const [photos, setPhotos] = useState<Photo[]>([])
  const [state, setState] = useState<'loading'|'ready'|'error'>('loading')
  const [message, setMessage] = useState('')
  useEffect(() => {
    let cancelled = false
    if (!enabled || !firestoreDb || !firebaseAuth?.currentUser) return
    const load = async () => {
      setState('loading')
      setMessage('')
      try {
        const snap = await getDocs(query(collection(firestoreDb!, 'qc_photo_metadata', recordId, 'photos'), limit(100)))
        const metadata = snap.docs.map(doc => ({ ...doc.data(), photoId: doc.id } as PhotoMetadata))
          .filter((photo): photo is PhotoMetadata & { photoId: string; kind: Photo['kind'] } =>
            photo.provider === 'supabase' && photo.qcRecordId === recordId &&
            (photo.kind === 'main' || photo.kind === 'hold' || photo.kind === 'scan') &&
            typeof photo.photoId === 'string')
        const visible: Photo[] = []
        for (const item of metadata) {
          if (cancelled) return
          try {
            const { signedUrl } = await requestQcPhotoPreviewUrl(recordId, item.photoId)
            visible.push({ photoId: item.photoId, kind: item.kind, src: signedUrl })
          } catch {
            // A missing/inaccessible photo must not leak metadata or break the QC report.
          }
        }
        if (!cancelled) {
          setPhotos(visible.sort((a,b) => order[a.kind] - order[b.kind]))
          setState('ready')
        }
      } catch {
        if (!cancelled) {
          setMessage('Foto Supabase belum dapat diakses. Foto historis Google Drive tetap tersedia.')
          setState('error')
        }
      }
    }
    void load()
    return () => { cancelled = true }
  }, [recordId])
  if (!enabled) return null
  return <div className="report-section qc-supabase-preview">
    <h3>Foto Supabase (Preview)</h3>
    {state === 'loading' && <p className="muted">Memeriksa izin foto…</p>}
    {state === 'error' && <p className="muted">{message}</p>}
    {state === 'ready' && photos.length === 0 && <p className="muted">Belum ada foto Supabase yang dapat ditampilkan.</p>}
    {photos.map(photo => <div key={photo.photoId}>
      <p>{photo.kind === 'main' ? 'Foto utama' : photo.kind === 'hold' ? 'Foto HOLD' : 'Scan Report'}</p>
      <img className="report-photo" src={photo.src} alt={photo.kind} referrerPolicy="no-referrer" />
    </div>)}
    <p className="muted">Foto preview menggunakan URL sementara. Untuk PDF/JPG, foto harus sudah selesai dimuat saat ekspor.</p>
  </div>
}
