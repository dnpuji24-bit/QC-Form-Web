const API = process.env.SMOKE_API_URL || 'https://script.google.com/macros/s/AKfycbwjqnVwOBDQg3ptclpw_bCQO9kAcYUcHkxz4tdlNppcPYmMpCocPTbG8fgGVlp1muY/exec'
const ownerUser = process.env.SMOKE_OWNER_USERNAME || ''
const ownerPass = process.env.SMOKE_OWNER_PASSWORD || ''
const expectedApiVersion = process.env.SMOKE_EXPECTED_API_VERSION || '46.3.2'

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

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function postWithRetry(action, token = '', data = {}, attempts = 3) {
  let result
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    result = await post(action, token, data)
    if (result?.ok !== false || result?.error !== 'SERVER_ERROR' || attempt === attempts) return result
    const waitMs = 1500 * attempt
    console.warn(`  ↻ ${action} transient SERVER_ERROR; retry ${attempt + 1}/${attempts} in ${waitMs}ms`)
    await sleep(waitMs)
  }
  return result
}

console.log('Runtime smoke: public API checks')
const health = await get('health')
assert(health.ok === true, `health failed: ${JSON.stringify(health)}`)
assert(typeof health.version === 'string' && health.version.length > 0, 'health version missing')
assert(health.version === expectedApiVersion, `deployed API version mismatch: expected v${expectedApiVersion}, got v${health.version}`)
console.log(`  ✓ health OK (deployed API v${health.version})`)

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
const sprayId2 = `SMOKE_SPRAY2_${nonce}`
const spraySessionId = `SMOKE_SPRAY_SESSION_${nonce}`
const fertId = `SMOKE_FERT_${nonce}`
const testDate = new Date().toISOString().slice(0, 10)
let sprayCreated = false
let sprayCreated2 = false
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
    sessionId: spraySessionId,
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
  const spraySync = await postWithRetry('syncRecord', token, { record: sprayRecord })
  assert(spraySync.ok === true && spraySync.recordId === sprayId, `spray sync failed: ${JSON.stringify(spraySync)}`)
  sprayCreated = true
  console.log('  ✓ Spray draft sync OK')

  const sprayEdit = { ...sprayRecord, noted: 'SMOKE_TEST_DRAFT_V2', area: 0.02 }
  const sprayResync = await postWithRetry('syncRecord', token, { record: sprayEdit })
  assert(sprayResync.ok === true, `spray edit sync failed: ${JSON.stringify(sprayResync)}`)
  const afterSprayEdit = await get('records', token)
  const sprayMatches = afterSprayEdit.records.filter((r) => r.id === sprayId)
  assert(sprayMatches.length === 1, `spray upsert expected one cloud record, got ${sprayMatches.length}`)
  assert(String(sprayMatches[0].noted || '') === 'SMOKE_TEST_DRAFT_V2', 'spray edit did not persist latest note')
  assert(Number(sprayMatches[0].area) === 0.02, 'spray edit did not persist latest area')
  console.log('  ✓ Spray edit/upsert OK')

  const sprayFinal = await postWithRetry('finalizeRecord', token, { record: { ...sprayEdit, saveType: 'ready' } })
  assert(sprayFinal.ok === true && sprayFinal.recordId === sprayId && Number(sprayFinal.rows) === 1, `spray finalize failed: ${JSON.stringify(sprayFinal)}`)
  const afterSprayFinal = await get('records', token)
  const sprayUploaded = afterSprayFinal.records.find((r) => r.id === sprayId)
  assert(sprayUploaded && sprayUploaded.saveType === 'uploaded', 'spray cloud record not marked uploaded')
  console.log('  ✓ Spray unit 1 finalize/upload OK')

  const sprayRecord2 = {
    ...sprayRecord,
    id: sprayId2,
    sessionId: spraySessionId,
    noUnit: 'CI-02',
    area: 0.03,
    actualUsage: 3,
    noted: 'SMOKE_TEST_UNIT_2',
    saveType: 'draft',
  }
  const spraySync2 = await postWithRetry('syncRecord', token, { record: sprayRecord2 })
  assert(spraySync2.ok === true && spraySync2.recordId === sprayId2, `spray unit 2 sync failed: ${JSON.stringify(spraySync2)}`)
  sprayCreated2 = true
  const sprayFinal2 = await postWithRetry('finalizeRecord', token, { record: { ...sprayRecord2, saveType: 'ready' } })
  assert(sprayFinal2.ok === true && sprayFinal2.recordId === sprayId2 && Number(sprayFinal2.rows) === 1, `spray unit 2 finalize failed: ${JSON.stringify(sprayFinal2)}`)
  const afterSpraySession = await get('records', token)
  const spraySession = afterSpraySession.records.filter((r) => r.id === sprayId || r.id === sprayId2)
  assert(spraySession.length === 2, `spray session expected 2 unit records, got ${spraySession.length}`)
  assert(spraySession.every((r) => r.saveType === 'uploaded'), 'spray session contains non-uploaded unit')
  assert(spraySession.every((r) => String(r.sessionId || '') === spraySessionId), 'spray sessionId was not preserved for both units')
  console.log('  ✓ Spray 2-unit session finalize/upload OK')

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
  const fertSync = await postWithRetry('syncRecord', token, { record: fertRecord })
  assert(fertSync.ok === true && fertSync.recordId === fertId, `fert sync failed: ${JSON.stringify(fertSync)}`)
  fertCreated = true
  console.log('  ✓ Fertilizer session draft sync OK')

  const fertFinal = await postWithRetry('finalizeRecord', token, { record: { ...fertRecord, saveType: 'ready' } })
  assert(fertFinal.ok === true && fertFinal.recordId === fertId && Number(fertFinal.rows) === 2, `fert finalize failed: ${JSON.stringify(fertFinal)}`)
  const afterFertFinal = await get('records', token)
  const fertUploaded = afterFertFinal.records.find((r) => r.id === fertId)
  assert(fertUploaded && fertUploaded.saveType === 'uploaded', 'fertilizer cloud record not marked uploaded')
  assert(Array.isArray(fertUploaded.pengisianList) && fertUploaded.pengisianList.length === 2, 'fertilizer fill list missing after finalize')
  console.log('  ✓ Fertilizer 2-fill finalize/upload OK')

  console.log('Runtime smoke: cleanup controlled records')
  const deleteSpray = await postWithRetry('deleteRecord', token, { recordId: sprayId })
  assert(deleteSpray.ok === true, `spray cleanup failed: ${JSON.stringify(deleteSpray)}`)
  sprayCreated = false
  const deleteSpray2 = await postWithRetry('deleteRecord', token, { recordId: sprayId2 })
  assert(deleteSpray2.ok === true, `spray unit 2 cleanup failed: ${JSON.stringify(deleteSpray2)}`)
  sprayCreated2 = false
  const deleteFert = await postWithRetry('deleteRecord', token, { recordId: fertId })
  assert(deleteFert.ok === true, `fert cleanup failed: ${JSON.stringify(deleteFert)}`)
  fertCreated = false
  const afterCleanup = await get('records', token)
  assert(!afterCleanup.records.some((r) => r.id === sprayId || r.id === sprayId2 || r.id === fertId), 'smoke records remain in Cloud_Monitoring after cleanup')
  console.log('  ✓ cleanup verified')
} finally {
  if (sprayCreated) {
    try { await postWithRetry('deleteRecord', token, { recordId: sprayId }) } catch (error) { console.error('Emergency Spray cleanup failed:', error.message) }
  }
  if (sprayCreated2) {
    try { await postWithRetry('deleteRecord', token, { recordId: sprayId2 }) } catch (error) { console.error('Emergency Spray unit 2 cleanup failed:', error.message) }
  }
  if (fertCreated) {
    try { await postWithRetry('deleteRecord', token, { recordId: fertId }) } catch (error) { console.error('Emergency Fertilizer cleanup failed:', error.message) }
  }
  const logout = await post('logout', token)
  assert(logout.ok === true, 'logout failed')
  console.log('  ✓ logout OK')
}

console.log('Runtime smoke completed successfully.')
