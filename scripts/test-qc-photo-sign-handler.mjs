import assert from 'node:assert/strict'
import { createQcPhotoSignHandler } from './lib/qcPhotoSignHandler.mjs'
import { createUidLimiter } from './lib/qcPhotoUidLimiter.mjs'

const data = {
  'users/reader': { active: true, role: 'manager', username: 'readername' },
  'role_access/manager': { role: 'manager', permissions: { qc_records: 'view' } },
  'qc_records/qc123': { formType: 'spray', inputtedBy: 'uploader', ownerUid: 'uploaderuid' },
  'qc_photo_metadata/qc123/photos/photo456': { photoId: 'photo456', qcRecordId: 'qc123',
    ownerUid: 'uploaderuid', kind: 'main', provider: 'supabase',
    bucket: 'qc-photos-test', objectPath: 'uploaderuid/qc/qc123/photo456.jpg', contentType: 'image/jpeg' },
}
const db = { doc: path => ({ get: async () => ({ exists: Boolean(data[path]), data: () => data[path] }) }) }
let signed = 0
const signFile = async (bucket, objectPath, ttl) => {
  signed++
  assert.equal(bucket, 'qc-photos-test')
  assert.equal(objectPath, 'uploaderuid/qc/qc123/photo456.jpg')
  assert.equal(ttl, 60)
  return 'https://example.invalid/signed/photo?token=mock'
}
const auth = { verifyIdToken: async (token, checkRevoked) => {
  assert.equal(checkRevoked, true)
  if (token === 'revoked') throw new Error('revoked')
  return { uid: token === 'uploader' ? 'uploaderuid' : 'reader' }
} }
const handler = createQcPhotoSignHandler({ auth, db, signFile, allowedOrigin: 'https://qc-preview.example.invalid' })
async function call({ token='goodtoken', method='POST', origin='https://qc-preview.example.invalid', body={ recordId:'qc123', photoId:'photo456' } } = {}) {
  const request = {
    method, headers: { ...(origin ? { origin } : {}), authorization: `Bearer ${token}` },
    async *[Symbol.asyncIterator]() { yield Buffer.from(JSON.stringify(body)) }
  }
  const response = {
    headers: {}, status: 0, body: '',
    setHeader(key, value) { this.headers[key] = value },
    writeHead(status, headers = {}) { this.status = status; Object.assign(this.headers, headers) },
    end(body = '') { this.body = body }
  }
  await handler(request, response)
  return response
}
let checks = 0
async function check(name, args, status, change) {
  const prev = signed
  const res = await call(args)
  assert.equal(res.status, status, name + ': ' + res.body)
  assert.equal(signed - prev, change, name + ': unexpected signed URL generation')
  assert.equal(res.headers['Cache-Control'], 'no-store')
  checks++; console.log('PASS:', name)
}
await check('manager receives authorized signed link', {}, 200, 1)
data['role_access/manager'].permissions.qc_records = 'none'
await check('changed permission immediately blocks access', {}, 403, 0)
data['role_access/manager'].permissions.qc_records = 'view'
await check('restored permission permits access', {}, 200, 1)
data['users/reader'].active = false
await check('inactive Firebase profile denied', {}, 403, 0)
data['users/reader'].active = true
await check('revoked Firebase token rejected', { token: 'revoked' }, 401, 0)
await check('cross origin request rejected', { origin:'https://evil.example.invalid' }, 403, 0)
await check('arbitrary object path cannot be requested', { body: { recordId:'qc123', photoId:'photo456', objectPath:'other/file' } }, 400, 0)
await check('missing metadata rejected', { body: { recordId:'qc123', photoId:'missing' } }, 403, 0)
await check('GET method disabled', { method:'GET' }, 405, 0)
assert.equal((await call()).headers['Access-Control-Allow-Origin'],'https://qc-preview.example.invalid')
const limiter = createUidLimiter({ maxRequests: 1, windowMs: 60000 })
const limitedHandler = createQcPhotoSignHandler({
  auth, db, signFile, allowedOrigin:'https://qc-preview.example.invalid', rateLimit:limiter,
})
async function callLimited() {
  const request = { method:'POST', headers: { origin:'https://qc-preview.example.invalid', authorization:'Bearer goodtoken' },
    async *[Symbol.asyncIterator]() { yield Buffer.from(JSON.stringify({recordId:'qc123', photoId:'photo456'})) } }
  const response = { headers: {}, status:0, body:'',
    setHeader(k,v){this.headers[k]=v}, writeHead(status){this.status=status}, end(body=''){this.body=body} }
  await limitedHandler(request,response)
  return response
}
const signedBefore = signed
assert.equal((await callLimited()).status,200)
const blocked = await callLimited()
assert.equal(blocked.status,429)
assert.equal(blocked.headers['Retry-After'],'60')
assert.equal(signed,signedBefore+1)
checks++; console.log('PASS: per-UID throttling returns 429 without signing twice')

console.log(`SUCCESS: ${checks} handler security checks passed, no real Firebase or Supabase calls.`)
