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
  for (const [key, value] of Object.entries(data)) if (value != null) url.searchParams.set(key, String(value))
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

function expectForbidden(result, label) {
  assert(result && result.ok === false && result.error === 'AUTH_FORBIDDEN', `${label} should be AUTH_FORBIDDEN: ${JSON.stringify(result)}`)
}

if (!ownerUser || !ownerPass) {
  console.log('Extended runtime smoke skipped: Owner secrets not configured.')
  process.exit(0)
}

const ownerLogin = await post('login', '', { username: ownerUser, password: ownerPass, deviceInfo: 'github-actions-extended-smoke' })
assert(ownerLogin.ok === true && ownerLogin.token, `owner login failed: ${JSON.stringify(ownerLogin)}`)
const ownerToken = ownerLogin.token
const nonce = `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
const testDate = new Date().toISOString().slice(0, 10)
const createdRecordIds = new Set()
const tempUsers = []

try {
  console.log('Extended runtime smoke: Photo -> Google Drive')
  const photoId = `SMOKE_PHOTO_${nonce}`
  const photoPaddock = `SMOKE-PHOTO-${nonce.slice(-5)}`
  const png1x1 = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Z7eQAAAAASUVORK5CYII='
  const photoRecord = {
    id: photoId,
    formType: 'spray',
    date: testDate,
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
  const photoFinal = await post('finalizeRecord', ownerToken, { record: photoRecord })
  assert(photoFinal.ok === true && photoFinal.recordId === photoId, `photo finalize failed: ${JSON.stringify(photoFinal)}`)
  createdRecordIds.add(photoId)
  const photoRecords = await get('records', ownerToken)
  assert(photoRecords.ok === true && photoRecords.records.some((r) => r.id === photoId && r.saveType === 'uploaded'), 'photo cloud record missing after finalize')
  console.log(`  ✓ photo payload accepted and finalized (${photoId})`)
  console.log(`  PHOTO_TEST_PADDOCK=${photoPaddock}`)

  console.log('Extended runtime smoke: non-Owner permission matrix')
  const foreignId = `SMOKE_FOREIGN_${nonce}`
  const foreignRecord = {
    id: foreignId,
    formType: 'spray',
    date: testDate,
    shift: 'SMOKE',
    status: 'Working',
    name: 'Owner Foreign Record',
    paddock: 'SMOKE-FOREIGN',
    area: 0.01,
    activity: 'Smoke Test',
    saveType: 'draft',
  }
  const foreignSync = await post('syncRecord', ownerToken, { record: foreignRecord })
  assert(foreignSync.ok === true, 'failed to create foreign visibility record')
  createdRecordIds.add(foreignId)

  const roles = [
    { role: 'manager', logs: true, users: false, spray: false, fert: false, del: true },
    { role: 'admin', logs: true, users: false, spray: false, fert: false, del: true },
    { role: 'asisten', logs: true, users: false, spray: true, fert: true, del: true },
    { role: 'mandor_spraying', logs: false, users: false, spray: true, fert: false, del: false, ownOnly: true },
    { role: 'mandor_fertilizer', logs: false, users: false, spray: false, fert: true, del: false, ownOnly: true },
    { role: 'pengunjung', logs: false, users: false, spray: false, fert: false, del: false },
  ]

  for (const cfg of roles) {
    const suffix = cfg.role.replace(/_/g, '').slice(0, 12)
    const username = `smoke_${suffix}_${nonce.slice(-5)}`.toLowerCase()
    const password = `Tmp!${Math.random().toString(36).slice(2)}A9`
    const email = `${username}@smoke.invalid`
    tempUsers.push(username)

    const reg = await post('register', '', {
      username,
      email,
      fullName: `Smoke ${cfg.role}`,
      password,
      role: 'pengunjung',
      deviceInfo: 'github-actions-role-smoke',
    })
    assert(reg.ok === true, `register ${cfg.role} failed: ${JSON.stringify(reg)}`)
    const approve = await post('approveUser', ownerToken, { username, role: cfg.role })
    assert(approve.ok === true, `approve ${cfg.role} failed: ${JSON.stringify(approve)}`)

    const login = await post('login', '', { username, password, deviceInfo: 'github-actions-role-smoke' })
    assert(login.ok === true && login.token, `login ${cfg.role} failed: ${JSON.stringify(login)}`)
    const token = login.token
    assert(String(login.user.role).toLowerCase() === cfg.role, `${cfg.role}: wrong role returned (${login.user.role})`)

    const me = await get('me', token)
    assert(me.ok === true && me.user.role === cfg.role, `${cfg.role}: me failed`)

    const users = await get('users', token)
    if (cfg.users) assert(users.ok === true, `${cfg.role}: users should be allowed`)
    else expectForbidden(users, `${cfg.role}: users`)

    const logs = await get('logs', token)
    if (cfg.logs) assert(logs.ok === true && Array.isArray(logs.logs), `${cfg.role}: logs should be allowed`)
    else expectForbidden(logs, `${cfg.role}: logs`)

    const sprayId = `SMOKE_ROLE_S_${suffix}_${nonce}`
    const sprayRecord = { id: sprayId, formType: 'spray', date: testDate, shift: 'SMOKE', status: 'Working', name: `Smoke ${cfg.role}`, paddock: `SMOKE-${suffix}-S`, area: 0.01, activity: 'Smoke Test', saveType: 'draft' }
    const spray = await post('syncRecord', token, { record: sprayRecord })
    if (cfg.spray) {
      assert(spray.ok === true, `${cfg.role}: spray sync should be allowed: ${JSON.stringify(spray)}`)
      createdRecordIds.add(sprayId)
    } else expectForbidden(spray, `${cfg.role}: spray sync`)

    const fertId = `SMOKE_ROLE_F_${suffix}_${nonce}`
    const fertRecord = { id: fertId, formType: 'fertilizer', date: testDate, shift: 'SMOKE', status: 'Working', name: `Smoke ${cfg.role}`, paddock: `SMOKE-${suffix}-F`, unit: 'TEST', noUnit: 'ROLE', activity: 'Smoke Test', saveType: 'draft', pengisianList: [{ pengisianKe: 1, jenisPupuk: 'TEST', dosis: 100, statusHose: 'OK', jumlah: 1, hasilKerja: 0.01, pemerataanPupuk: 1 }] }
    const fert = await post('syncRecord', token, { record: fertRecord })
    if (cfg.fert) {
      assert(fert.ok === true, `${cfg.role}: fertilizer sync should be allowed: ${JSON.stringify(fert)}`)
      createdRecordIds.add(fertId)
    } else expectForbidden(fert, `${cfg.role}: fertilizer sync`)

    const del = await post('deleteRecord', token, { recordId: `SMOKE_NONEXISTENT_${nonce}` })
    if (cfg.del) assert(del.ok === true, `${cfg.role}: delete permission should be allowed`)
    else expectForbidden(del, `${cfg.role}: delete`)

    const visible = await get('records', token)
    assert(visible.ok === true && Array.isArray(visible.records), `${cfg.role}: records failed`)
    if (cfg.ownOnly) {
      assert(!visible.records.some((r) => r.id === foreignId), `${cfg.role}: should not see Owner foreign record`)
      const ownId = cfg.spray ? sprayId : fertId
      assert(visible.records.some((r) => r.id === ownId), `${cfg.role}: should see own record`)
    } else {
      assert(visible.records.some((r) => r.id === foreignId), `${cfg.role}: should see monitoring record`)
    }

    const logout = await post('logout', token)
    assert(logout.ok === true, `${cfg.role}: logout failed`)
    console.log(`  ✓ ${cfg.role} permission matrix OK`)
  }

  console.log(`  TEMP_ROLE_USER_PREFIX=smoke_`)
} finally {
  for (const id of createdRecordIds) {
    try { await post('deleteRecord', ownerToken, { recordId: id }) } catch (error) { console.error(`cleanup record ${id} failed:`, error.message) }
  }
  for (const username of tempUsers) {
    try { await post('rejectUser', ownerToken, { username, role: 'pengunjung' }) } catch (error) { console.error(`reject temp user ${username} failed:`, error.message) }
  }
  const logout = await post('logout', ownerToken)
  assert(logout.ok === true, 'owner logout failed')
}

console.log('Extended runtime smoke completed successfully.')
