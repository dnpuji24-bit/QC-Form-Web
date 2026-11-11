/**
 * Read-only smoke test using a previously uploaded TEST photo.
 * NEVER writes to Firestore, uploads objects or logs a signed URL/secret.
 * The test path must be .../tests/... (not a real QC photo).
 */
import { createClient } from '@supabase/supabase-js'
const url = process.env.SUPABASE_URL || ''
const secret = process.env.SUPABASE_SECRET_KEY || ''
let path = process.env.QC_PHOTO_TEST_OBJECT_PATH || ''
const projectUrl = 'https://mcfwnstdfhhtcbksgrlj.supabase.co'
const validPath = /^[A-Za-z0-9_-]{16,128}\/tests\/[A-Za-z0-9_-]{8,160}\.(jpg|png|webp)$/
if (url !== projectUrl) throw new Error('Safety stop: unexpected Supabase project URL.')
if (!secret.startsWith('sb_secret_')) throw new Error('A backend-only Supabase secret key is required.')
const supabase = createClient(url, secret, {
  auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
})
if (!path) {
  // Locate a pre-existing image under any /tests/ folder; do not display names.
  const { data: roots, error: rootError } = await supabase.storage.from('qc-photos-test').list('', { limit: 100 })
  if (rootError) throw new Error('Could not list existing private bucket test folders.')
  for (const root of roots || []) {
    if (!/^[A-Za-z0-9_-]{16,128}$/.test(root.name)) continue
    const { data: files, error: fileError } = await supabase.storage.from('qc-photos-test').list(root.name + '/tests', { limit: 100 })
    if (fileError) continue
    const match = (files || []).find(item => validPath.test(root.name + '/tests/' + item.name))
    if (match) { path = root.name + '/tests/' + match.name; break }
  }
}
if (!validPath.test(path)) throw new Error('No existing UID/tests/*.jpg/png/webp photo found. No object was created.')
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
