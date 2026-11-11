/**
 * Preview-only server-side QC photo signing handler.
 * Cloud Run / another server runtime can call this only after configuring
 * Firebase Admin credentials and a SERVER-ONLY Supabase secret key.
 * Never import this file into Vite/browser code.
 */
import { authorizeQcPhotoRead } from './qcPhotoReadAuthorization.mjs'

const ID = /^[A-Za-z0-9_-]{1,160}$/
export function createQcPhotoSignHandler({ auth, db, signFile, allowedOrigin }) {
  if (!auth || !db || typeof signFile !== 'function' || !allowedOrigin) throw new Error('Invalid signing handler dependencies')
  return async function handler(request, response) {
    response.setHeader('Cache-Control', 'no-store')
    response.setHeader('X-Content-Type-Options', 'nosniff')
    response.setHeader('Vary', 'Origin')
    const origin = request.headers.origin
    if (origin && origin !== allowedOrigin) {
      response.writeHead(403); response.end(); return
    }
    if (origin === allowedOrigin) {
      response.setHeader('Access-Control-Allow-Origin', allowedOrigin)
      response.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type')
      response.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
    }
    if (request.method === 'OPTIONS') {
      response.writeHead(origin === allowedOrigin ? 204 : 403); response.end(); return
    }
    if (request.method !== 'POST') {
      response.writeHead(405, { Allow: 'POST, OPTIONS' }); response.end(); return
    }
    try {
      const authorization = request.headers.authorization || ''
      if (!/^Bearer [A-Za-z0-9_.-]+$/.test(authorization)) throw new AuthError(401)
      // Verify Firebase ID token and revocation on every request. This is NOT a
      // Supabase publishable token, Firebase custom claim or browser-role check.
      const decoded = await auth.verifyIdToken(authorization.slice(7), true)
      if (!decoded?.uid || !ID.test(decoded.uid)) throw new AuthError(401)
      let raw = ''
      for await (const chunk of request) {
        raw += chunk.toString()
        if (raw.length > 1024) throw new AuthError(413)
      }
      let payload
      try { payload = JSON.parse(raw) } catch { throw new AuthError(400) }
      if (!payload || Object.keys(payload).sort().join(',') !== 'photoId,recordId' ||
          !ID.test(payload.recordId || '') || !ID.test(payload.photoId || '')) throw new AuthError(400)

      const [userSnap, qcSnap, photoSnap] = await Promise.all([
        db.doc(`users/${decoded.uid}`).get(),
        db.doc(`qc_records/${payload.recordId}`).get(),
        db.doc(`qc_photo_metadata/${payload.recordId}/photos/${payload.photoId}`).get(),
      ])
      const profile = userSnap.exists ? userSnap.data() : null
      let roleAccess = null
      if (profile?.active === true && typeof profile.role === 'string' && ID.test(profile.role)) {
        const roleSnap = await db.doc(`role_access/${profile.role}`).get()
        if (roleSnap.exists) roleAccess = roleSnap.data()
      }
      const authorized = authorizeQcPhotoRead({
        callerUid: decoded.uid,
        profile, roleAccess,
        qcRecord: qcSnap.exists ? qcSnap.data() : null,
        photo: photoSnap.exists ? photoSnap.data() : null,
        recordId: payload.recordId, photoId: payload.photoId,
      })
      if (!authorized.allowed) throw new AuthError(403)
      // The signer receives ONLY the path derived from trusted Firestore metadata.
      // The browser never supplies a storage path, bucket or desired expiry.
      const signedUrl = await signFile(authorized.bucket, authorized.objectPath, 60)
      if (typeof signedUrl !== 'string' || !signedUrl.startsWith('https://')) throw new AuthError(502)
      response.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' })
      response.end(JSON.stringify({ signedUrl, expiresIn: 60 }))
    } catch (error) {
      const code = error instanceof AuthError ? error.status : 500
      // Intentionally do not return Firestore paths, UID, token, Supabase errors
      // or details of forbidden resources.
      response.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' })
      response.end(JSON.stringify({ error: code === 500 ? 'SERVER_ERROR' : code === 403 ? 'FORBIDDEN' : 'REQUEST_FAILED' }))
    }
  }
}
class AuthError extends Error {
  constructor(status) { super('Request rejected'); this.status = status }
}
