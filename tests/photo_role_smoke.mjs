const API = process.env.SMOKE_API_URL || 'https://script.google.com/macros/s/AKfycbwjqnVwOBDQg3ptclpw_bCQO9kAcYUcHkxz4tdlNppcPYmMpCocPTbG8fgGVlp1muY/exec'
const ownerUser = process.env.SMOKE_OWNER_USERNAME || ''
const ownerPass = process.env.SMOKE_OWNER_PASSWORD || ''

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

async function get(action, token = '') {
  const url = new URL(API)
  url.searchParams.set('action', action)
  if (token) url.searchParams.set('token', token)
  url.searchParams.set('_', String(Date.now()))
  const response = await fetch(url, { redirect: 'follow' })
  assert(response.ok, `${action}: HTTP ${response.status}`)
  return response.json()
}

async function post(action, token = '', data = {}) {
  const response = await fetch(API, {
    method: 'POST',
    redirect: 'follow',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ action, token, ...data }),
  })
  assert(response.ok, `${action}: HTTP ${response.status}`)
  return response.json()
}

if (!ownerUser || !ownerPass) {
  console.log('Photo runtime smoke skipped: Owner secrets not configured.')
  process.exit(0)
}

const health = await get('health')
console.log(`Photo runtime smoke against API v${health.version || 'unknown'}`)

const login = await post('login', '', { username: ownerUser, password: ownerPass, deviceInfo: 'github-actions-photo-smoke' })
assert(login.ok === true && login.token, `owner login failed: ${JSON.stringify(login)}`)
const token = login.token
const nonce = `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
const photoId = `SMOKE_PHOTO_${nonce}`
const photoPaddock = `SMOKE-PHOTO-${nonce.slice(-5)}`
const png1x1 = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Z7eQAAAAASUVORK5CYII='
let created = false

try {
  const photoRecord = {
    id: photoId,
    formType: 'spray',
    date: new Date().toISOString().slice(0, 10),
    shift: 'SMOKE',
    status: 'Working',
    name: 'CI Photo Test',
    nameOfAssistan: 'CI',
    paddock: photoPaddock,
    variety: 'TEST',
    area: 0.01,
    unit: 'TEST',
    noUnit: 'PHOTO-01',
    type: 'Smoke Test',
    activity: 'Smoke Test',
    deskripsi: 'Photo upload verification',
    noted: 'SMOKE_PHOTO_TEST',
    saveType: 'ready',
    photoBase64: png1x1,
    deviceInfo: 'github-actions-photo-smoke',
  }

  const final = await post('finalizeRecord', token, { record: photoRecord })
  assert(final.ok === true && final.recordId === photoId, `photo finalize failed: ${JSON.stringify(final)}`)
  created = true
  assert(/^https:\/\/drive\.google\.com\//.test(String(final.photoDriveUrl || '')), `Drive URL missing from finalize response: ${JSON.stringify(final)}`)

  const records = await get('records', token)
  assert(records.ok === true && Array.isArray(records.records), 'records failed after photo finalize')
  const saved = records.records.find((r) => r.id === photoId)
  assert(saved && saved.saveType === 'uploaded', 'photo cloud record missing after finalize')
  assert(saved.photoDriveUrl === final.photoDriveUrl, `Cloud record Drive URL mismatch: ${JSON.stringify(saved)}`)
  assert(!saved.photoBase64, 'Cloud record must not retain photo Base64 after Drive upload')

  console.log(`  ✓ photo finalized to Google Drive: ${final.photoDriveUrl}`)
  console.log(`  PHOTO_TEST_PADDOCK=${photoPaddock}`)
} finally {
  if (created) {
    try { await post('deleteRecord', token, { recordId: photoId }) }
    catch (error) { console.error(`cleanup record ${photoId} failed:`, error.message) }
  }
  try { await post('logout', token) } catch {}
}

console.log('Photo Google Drive smoke completed successfully.')
