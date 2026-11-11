import { useEffect, useState } from 'react'
import { onAuthStateChanged, type User } from 'firebase/auth'
import { firebaseAuth } from './firebase'

const url = String(import.meta.env.VITE_SUPABASE_URL || '').replace(/\/$/, '')
const publishableKey = String(import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || '')
const bucket = 'qc-photos-test'
const maxSize = 2 * 1024 * 1024
const allowedTypes = new Set(['image/jpeg', 'image/png', 'image/webp'])

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
function storageUrl(path: string): string {
  return `${url}/storage/v1/object/${bucket}/${path.split('/').map(encodeURIComponent).join('/')}`
}
async function readError(response: Response): Promise<string> {
  const payload = await response.text()
  try {
    const data = JSON.parse(payload) as { message?: string; error?: string; error_description?: string }
    return data.message || data.error_description || data.error || payload.slice(0, 240)
  } catch {
    return payload.slice(0, 240) || response.statusText
  }
}
export default function SupabasePhotoTest() {
  const [user, setUser] = useState<User | null>(firebaseAuth?.currentUser ?? null)
  const [claim, setClaim] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState('')
  const [path, setPath] = useState('')
  const [preview, setPreview] = useState('')
  const [error, setError] = useState('')
  useEffect(() => {
    if (!firebaseAuth) return
    return onAuthStateChanged(firebaseAuth, (next) => { setUser(next); setClaim(''); setPath(''); setPreview('') })
  }, [])
  useEffect(() => {
    return () => { if (preview) URL.revokeObjectURL(preview) }
  }, [preview])
  async function checkToken() {
    if (!user) throw new Error('Login Firebase di aplikasi QC terlebih dahulu.')
    const token = await user.getIdTokenResult(true)
    const currentRole = token.claims.role
    setClaim(typeof currentRole === 'string' ? currentRole : '(tidak ada)')
    if (currentRole !== 'authenticated') throw new Error('Firebase token belum memuat custom claim role=authenticated. Refresh login dan periksa claims.')
    return token.token
  }
  async function runUpload() {
    if (!url.startsWith('https://') || !publishableKey) { setError('Konfigurasi Supabase testing belum tersedia.'); return }
    if (!user || !file) { setError('Login Firebase dan pilih foto terlebih dahulu.'); return }
    if (!allowedTypes.has(file.type) || file.size > maxSize || file.size === 0) {
      setError('Pilih JPEG, PNG atau WebP dengan ukuran 1 byte sampai 2 MB.'); return
    }
    setBusy(true); setError(''); setStatus('Memeriksa Firebase ID token...')
    try {
      const token = await checkToken()
      const extension = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg'
      const objectPath = `${user.uid}/tests/${crypto.randomUUID()}.${extension}`
      setStatus('Mengunggah foto ke bucket private...')
      const upload = await fetch(storageUrl(objectPath), {
        method: 'POST',
        headers: {
          apikey: publishableKey,
          Authorization: `Bearer ${token}`,
          'Content-Type': file.type,
          'x-upsert': 'false',
          'cache-control': '3600',
        },
        body: file,
      })
      if (!upload.ok) throw new Error(`Upload ditolak (${upload.status}): ${await readError(upload)}`)
      setPath(objectPath)
      setStatus('Upload berhasil. Memeriksa unduhan private...')
      const downloaded = await fetch(storageUrl(objectPath), {
        headers: { apikey: publishableKey, Authorization: `Bearer ${token}` },
      })
      if (!downloaded.ok) throw new Error(`Upload berhasil, tetapi pembacaan gagal (${downloaded.status}): ${await readError(downloaded)}`)
      const blob = await downloaded.blob()
      setPreview(URL.createObjectURL(blob))
      setStatus('Berhasil: foto diunggah dan dibaca kembali menggunakan token Firebase.')
    } catch (e) {
      setError(message(e)); setStatus('Pengujian belum berhasil.')
    } finally { setBusy(false) }
  }
  return (
    <main style={{ maxWidth: 760, margin: '32px auto', padding: 24, background: '#f8fafc', color: '#0f172a', borderRadius: 16, fontFamily: 'system-ui, sans-serif', lineHeight: 1.6 }}>
      <h1>Supabase Photo Upload Test</h1>
      <p>Halaman pengujian terpisah. Tidak menyimpan QC ke Firestore, tidak mengubah foto Google Drive, dan tidak menulis Spreadsheet.</p>
      <p><strong>Firebase:</strong> {user ? `Masuk sebagai ${user.email || user.uid}` : 'Belum login Firebase'}</p>
      <p><strong>Firebase UID:</strong> {user?.uid || '—'}</p>
      <p><strong>Token role:</strong> {claim || 'Belum diperiksa'}</p>
      <p><strong>Bucket:</strong> {bucket} (Private)</p>
      {!user && <p style={{ color: '#b45309' }}>Buka aplikasi QC dan login terlebih dahulu pada origin yang sama, lalu kembali ke halaman pengujian ini.</p>}
      <label htmlFor="photo-test-file">Pilih foto (JPEG, PNG, WebP; maksimum 2 MB)</label>
      <div><input id="photo-test-file" type="file" accept="image/jpeg,image/png,image/webp" disabled={busy} onChange={(e) => setFile(e.target.files?.[0] ?? null)} /></div>
      <button disabled={busy || !user || !file || !url || !publishableKey} onClick={() => { void runUpload() }} style={{ marginTop: 16, padding: '10px 20px', cursor: 'pointer', borderRadius: 8 }}>{busy ? 'Memproses…' : 'Upload & Verify Private Read'}</button>
      {status && <p role="status">{status}</p>}
      {error && <p role="alert" style={{ color: '#b91c1c', overflowWrap: 'anywhere' }}>{error}</p>}
      {path && <p><strong>Object path (bukan public URL):</strong> <code style={{ overflowWrap: 'anywhere' }}>{path}</code></p>}
      {preview && <img src={preview} alt="Foto uji yang dibaca kembali dari Supabase" style={{ maxWidth: '100%', maxHeight: 340, display: 'block', borderRadius: 8 }} />}
      <p style={{ fontSize: 13, color: '#475569' }}>Uji ini membuat satu object foto baru pada bucket testing setiap kali tombol ditekan. Tidak melakukan update/delete dan belum menyimpan metadata foto ke QC.</p>
    </main>
  )
}
