const API = process.env.SMOKE_API_URL || 'https://script.google.com/macros/s/AKfycbwjqnVwOBDQg3ptclpw_bCQO9kAcYUcHkxz4tdlNppcPYmMpCocPTbG8fgGVlp1muY/exec'
const ownerUser = process.env.SMOKE_OWNER_USERNAME || ''
const ownerPass = process.env.SMOKE_OWNER_PASSWORD || ''

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

async function get(action, token = '', data = {}) {
  const url = new URL(API)
  url.searchParams.set('action', action)
  if (token) url.searchParams.set('token', token)
  url.searchParams.set('_', String(Date.now()))
  for (const [key, value] of Object.entries(data)) {
    if (value !== undefined && value !== null) url.searchParams.set(key, String(value))
  }
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

console.log('Runtime smoke: public API checks')
const health = await get('health')
assert(health.ok === true, `health failed: ${JSON.stringify(health)}`)
assert(typeof health.version === 'string' && health.version.length > 0, 'health version missing')
console.log(`  ✓ health OK (API v${health.version})`)

const master = await get('masterData')
assert(master.ok === true && master.data && typeof master.data === 'object', 'masterData failed')
console.log('  ✓ masterData OK')

const invalidMe = await get('me', 'invalid-smoke-token')
assert(invalidMe.ok === false, 'invalid token should be rejected')
assert(String(invalidMe.error || '').startsWith('AUTH_'), `unexpected invalid-token error: ${JSON.stringify(invalidMe)}`)
console.log('  ✓ invalid session rejected')

if (!ownerUser || !ownerPass) {
  console.log('Runtime smoke: owner credentials not configured; authenticated checks skipped.')
  process.exit(0)
}

console.log('Runtime smoke: Owner checks')
const login = await post('login', '', { username: ownerUser, password: ownerPass, deviceInfo: 'github-actions-smoke-test' })
assert(login.ok === true && login.token && login.user, `owner login failed: ${JSON.stringify({ ok: login.ok, error: login.error, message: login.message })}`)
assert(String(login.user.role).toLowerCase() === 'owner', `expected owner role, got ${login.user.role}`)
const token = login.token
console.log('  ✓ owner login OK')

const nonce = `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
const sprayId = `SMOKE_SPRAY_${nonce}`
const fertId = `SMOKE_FERT_${nonce}`
const testDate = new Date().toISOString().slice(0, 10)
let sprayCreated = false
let fertCreated = false

try {
  const me = await get('me', token)
  assert(me.ok === true && me.user && String(me.user.role).toLowerCase() === 'owner', 'me failed')
  console.log('  ✓ me OK')

  const records = await get('records', token)
  assert(records.ok === true && Array.isArray(records.records), 'records failed')
  console.log(`  ✓ records OK (${records.records.length} visible)`)

  const users = await get('users', token)
  assert(users.ok === true && Array.isArray(users.users), 'users failed')
  console.log(`  ✓ users OK (${users.users.length} users)`)

  const logs = await get('logs', token)
  assert(logs.ok === true && Array.isArray(logs.logs), 'logs failed')
  console.log(`  ✓ logs OK (${logs.logs.length} logs returned)`)

  console.log('Runtime smoke: controlled Spray write/finalize')
  const sprayRecord = {
    id: sprayId,
    formType: 'spray',
    date: testDate,
    shift: 'SMOKE',
    status: 'Working',
    name: 'CI Smoke Test',
    nameOfAssistan: 'CI',
    paddock: 'SMOKE-SPRAY',
    variety: 'TEST',
    area: 0.01,
    unit: 'TEST',
    noUnit: 'CI-01',
    type: 'Smoke Test',
    activity: 'Smoke Test',
    deskripsi: 'Automated runtime verification',
    waterRate: 100,
    actualUsage: 1,
    noted: 'SMOKE_TEST_DRAFT_V1',
    saveType: 'draft',
    deviceInfo: 'github-actions-write-smoke',
  }
  const spraySync = await post('syncRecord', token, { record: sprayRecord })
  assert(spraySync.ok === true && spraySync.recordId === sprayId, `spray sync failed: ${JSON.stringify(spraySync)}`)
  sprayCreated = true
  console.log('  ✓ Spray draft sync OK')

  const sprayEdit = { ...sprayRecord, noted: 'SMOKE_TEST_DRAFT_V2', area: 0.02 }
  const sprayResync = await post('syncRecord', token, { record: sprayEdit })
  assert(sprayResync.ok === true, `spray edit sync failed: ${JSON.stringify(sprayResync)}`)
  const afterSprayEdit = await get('records', token)
  const sprayMatches = afterSprayEdit.records.filter((r) => r.id === sprayId)
  assert(sprayMatches.length === 1, `spray upsert expected one cloud record, got ${sprayMatches.length}`)
  assert(String(sprayMatches[0].noted || '') === 'SMOKE_TEST_DRAFT_V2', 'spray edit did not persist latest note')
  assert(Number(sprayMatches[0].area) === 0.02, 'spray edit did not persist latest area')
  console.log('  ✓ Spray edit/upsert OK')

  const sprayFinal = await post('finalizeRecord', token, { record: { ...sprayEdit, saveType: 'ready' } })
  assert(sprayFinal.ok === true && sprayFinal.recordId === sprayId && Number(sprayFinal.rows) === 1, `spray finalize failed: ${JSON.stringify(sprayFinal)}`)
  const afterSprayFinal = await get('records', token)
  const sprayUploaded = afterSprayFinal.records.find((r) => r.id === sprayId)
  assert(sprayUploaded && sprayUploaded.saveType === 'uploaded', 'spray cloud record not marked uploaded')
  console.log('  ✓ Spray finalize/upload OK')

  console.log('Runtime smoke: controlled Fertilizer session write/finalize')
  const fertRecord = {
    id: fertId,
    sessionId: `SMOKE_SESSION_${nonce}`,
    formType: 'fertilizer',
    date: testDate,
    shift: 'SMOKE',
    status: 'Working',
    name: 'CI Smoke Test',
    nameOfAssistan: 'CI',
    paddock: 'SMOKE-FERT',
    unit: 'TEST',
    noUnit: 'CI-02',
    type: 'Fertilizer',
    activity: 'Smoke Test',
    catatan: 'SMOKE_TEST_FERTILIZER',
    saveType: 'draft',
    deviceInfo: 'github-actions-write-smoke',
    pengisianList: [
      { pengisianKe: 1, jenisPupuk: 'TEST-A', dosis: 100, statusHose: 'OK', jumlah: 10, hasilKerja: 0.1, pemerataanPupuk: 1 },
      { pengisianKe: 2, jenisPupuk: 'TEST-B', dosis: 120, statusHose: 'OK', jumlah: 12, hasilKerja: 0.1, pemerataanPupuk: 2 },
    ],
  }
  const fertSync = await post('syncRecord', token, { record: fertRecord })
  assert(fertSync.ok === true && fertSync.recordId === fertId, `fert sync failed: ${JSON.stringify(fertSync)}`)
  fertCreated = true
  console.log('  ✓ Fertilizer session draft sync OK')

  const fertFinal = await post('finalizeRecord', token, { record: { ...fertRecord, saveType: 'ready' } })
  assert(fertFinal.ok === true && fertFinal.recordId === fertId && Number(fertFinal.rows) === 2, `fert finalize failed: ${JSON.stringify(fertFinal)}`)
  const afterFertFinal = await get('records', token)
  const fertUploaded = afterFertFinal.records.find((r) => r.id === fertId)
  assert(fertUploaded && fertUploaded.saveType === 'uploaded', 'fertilizer cloud record not marked uploaded')
  assert(Array.isArray(fertUploaded.pengisianList) && fertUploaded.pengisianList.length === 2, 'fertilizer fill list missing after finalize')
  console.log('  ✓ Fertilizer 2-fill finalize/upload OK')

  console.log('Runtime smoke: cleanup controlled records')
  const deleteSpray = await post('deleteRecord', token, { recordId: sprayId })
  assert(deleteSpray.ok === true, `spray cleanup failed: ${JSON.stringify(deleteSpray)}`)
  sprayCreated = false
  const deleteFert = await post('deleteRecord', token, { recordId: fertId })
  assert(deleteFert.ok === true, `fert cleanup failed: ${JSON.stringify(deleteFert)}`)
  fertCreated = false
  const afterCleanup = await get('records', token)
  assert(!afterCleanup.records.some((r) => r.id === sprayId || r.id === fertId), 'smoke records remain in Cloud_Monitoring after cleanup')
  console.log('  ✓ cleanup verified')
} finally {
  if (sprayCreated) {
    try { await post('deleteRecord', token, { recordId: sprayId }) } catch (error) { console.error('Emergency Spray cleanup failed:', error.message) }
  }
  if (fertCreated) {
    try { await post('deleteRecord', token, { recordId: fertId }) } catch (error) { console.error('Emergency Fertilizer cleanup failed:', error.message) }
  }
  const logout = await post('logout', token)
  assert(logout.ok === true, 'logout failed')
  console.log('  ✓ logout OK')
}

console.log('Runtime smoke completed successfully.')
