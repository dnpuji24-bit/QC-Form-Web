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
  console.log('Runtime smoke: owner credentials not configured; authenticated read-only checks skipped.')
  process.exit(0)
}

console.log('Runtime smoke: Owner read-only checks')
const login = await post('login', '', { username: ownerUser, password: ownerPass, deviceInfo: 'github-actions-smoke-test' })
assert(login.ok === true && login.token && login.user, `owner login failed: ${JSON.stringify({ ok: login.ok, error: login.error, message: login.message })}`)
assert(String(login.user.role).toLowerCase() === 'owner', `expected owner role, got ${login.user.role}`)
const token = login.token
console.log('  ✓ owner login OK')

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
} finally {
  const logout = await post('logout', token)
  assert(logout.ok === true, 'logout failed')
  console.log('  ✓ logout OK')
}

console.log('Runtime smoke completed successfully.')
