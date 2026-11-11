/**
 * Read-only smoke test using a previously uploaded TEST photo.
 * NEVER writes to Firestore, uploads objects or logs a signed URL/secret.
 * The test path must be .../tests/... (not a real QC photo).
 */
import { createClient } from '@supabase/supabase-js'
const url = process.env.SUPABASE_URL || ''
const secret = process.env.SUPABASE_SECRET_KEY || ''
const path = process.env.QC_PHOTO_TEST_OBJECT_PATH || ''
const projectUrl = 'https://mcfwnstdfhhtcbksgrlj.supabase.co'
const validPath = /^[A-Za-z0-9_-]{16,128}\/tests\/[A-Za-z0-9_-]{8,160}\.(jpg|png|webp)$/
if (url !== projectUrl) throw new Error('Safety stop: unexpected Supabase project URL.')
if (!secret.startsWith('sb_secret_')) throw new Error('A backend-only Supabase secret key is required.')
if (!validPath.test(path)) throw new Error('Safety stop: use an existing uid/tests/photoId.jpg/png/webp object path only.')
const supabase = createClient(url, secret, {
  auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
})
const { data, error } = await supabase.storage.from('qc-photos-test').createSignedUrl(path, 60)
if (error || !data?.signedUrl) throw new Error('Could not sign existing private test photo: ' + (error?.message || 'no URL'))
const response = await fetch(data.signedUrl, { method: 'GET', cache: 'no-store', signal: AbortSignal.timeout(15000) })
if (!response.ok) throw new Error('Signed URL download failed: HTTP ' + response.status)
const mime = response.headers.get('content-type')?.split(';')[0]?.trim() || ''
if (!['image/jpeg','image/png','image/webp'].includes(mime)) throw new Error('Unexpected content-type from signed URL: ' + mime)
const bytes = (await response.arrayBuffer()).byteLength
if (bytes <= 0 || bytes > 2 * 1024 * 1024) throw new Error('Unexpected photo size.')
console.log('SUCCESS: existing PRIVATE Supabase test photo was signed and downloaded.')
console.log('Confirmed bucket: qc-photos-test; expiration: 60 seconds; valid image; bytes:', bytes)
console.log('Read-only; no Firebase/Firestore writes, no object changes, no signed URL or secret printed.')
