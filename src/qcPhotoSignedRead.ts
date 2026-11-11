import { firebaseAuth } from './firebase'

/**
 * PREVIEW-ONLY client API for a future authenticated photo signing backend.
 * It intentionally does not access Supabase secrets or change the current
 * production QC viewer. The backend must verify permission from Firestore.
 */
const endpoint = String(import.meta.env.VITE_QC_PHOTO_SIGN_ENDPOINT || '')
const enabled = import.meta.env.VITE_QC_PHOTO_SIGN_PREVIEW === 'true'
const isValidId = (value: string): boolean => /^[A-Za-z0-9_-]{1,160}$/.test(value)

export async function requestQcPhotoPreviewUrl(recordId: string, photoId: string): Promise<{ signedUrl: string; expiresIn: number }> {
  if (!enabled || !endpoint || !endpoint.startsWith('https://')) throw new Error('Layanan preview foto QC belum diaktifkan.')
  if (!isValidId(recordId) || !isValidId(photoId)) throw new Error('ID QC atau foto tidak valid.')
  const user = firebaseAuth?.currentUser
  if (!user) throw new Error('Login Firebase diperlukan.')
  const token = await user.getIdToken()
  const result = await fetch(endpoint, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ recordId, photoId }),
    cache: 'no-store',
  })
  if (!result.ok) throw new Error(result.status === 403 ? 'Akses foto tidak diizinkan.' : 'Foto belum bisa dibuka.')
  const payload: unknown = await result.json()
  if (!payload || typeof payload !== 'object' || !('signedUrl' in payload) || !('expiresIn' in payload)) throw new Error('Respons foto tidak valid.')
  const url = (payload as { signedUrl: unknown }).signedUrl
  const expires = (payload as { expiresIn: unknown }).expiresIn
  if (typeof url !== 'string' || !url.startsWith('https://') || expires !== 60) throw new Error('Respons foto tidak valid.')
  // The signed URL is a temporary bearer capability: never persist or log it.
  return { signedUrl: url, expiresIn: expires }
}
