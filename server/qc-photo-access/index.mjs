/**
 * Dedicated trusted server: Firebase token → Firestore permissions → Supabase
 * private, short-lived signed URL. Not connected to production Hosting by default.
 * Start only in a trusted, authenticated hosting environment.
 */
import http from 'node:http'
import { initializeApp, applicationDefault, getApps } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import { getFirestore } from 'firebase-admin/firestore'
import { createClient } from '@supabase/supabase-js'
import { createQcPhotoSignHandler } from '../../scripts/lib/qcPhotoSignHandler.mjs'

const vars = ['FIREBASE_PROJECT_ID','SUPABASE_URL','SUPABASE_SECRET_KEY','PHOTO_ACCESS_ALLOWED_ORIGIN']
for (const variable of vars) {
  if (!process.env[variable]) throw new Error(`Missing required server-only environment variable: ${variable}`)
}
if (process.env.FIREBASE_PROJECT_ID !== 'form-qc-unm') {
  throw new Error('Unexpected Firebase Project ID; deployment configuration must be reviewed.')
}
if (!/^https:\/\/[A-Za-z0-9.-]+\.supabase\.co$/.test(process.env.SUPABASE_URL)) {
  throw new Error('Expected a HTTPS Supabase project URL.')
}
const allowedOrigin = process.env.PHOTO_ACCESS_ALLOWED_ORIGIN
if (!/^https:\/\/[^/]+$/.test(allowedOrigin)) throw new Error('Expected a single HTTPS allowed origin (no path).')
if (!getApps().length) initializeApp({ credential: applicationDefault(), projectId: process.env.FIREBASE_PROJECT_ID })
const auth = getAuth()
const db = getFirestore()
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
})
const signFile = async (bucket, path, seconds) => {
  if (bucket !== 'qc-photos-test' || seconds !== 60) throw new Error('Invalid signing request')
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, seconds)
  if (error || !data?.signedUrl) throw new Error('Supabase signing failed')
  return data.signedUrl
}
const signHandler = createQcPhotoSignHandler({ auth, db, signFile, allowedOrigin })
const port = Number(process.env.PORT || 8080)
const server = http.createServer((request, response) => {
  if (request.url !== '/api/qc-photo/sign') {
    response.setHeader('Cache-Control', 'no-store')
    response.writeHead(404)
    response.end()
    return
  }
  void signHandler(request, response)
})
server.requestTimeout = 15_000
server.headersTimeout = 10_000
server.listen(port, '0.0.0.0', () => {
  // Never log tokens, URLs or user photo paths.
  console.info('QC private photo signing server listening.')
})
