import { spawn } from 'node:child_process'
import fs from 'node:fs'
import { chromium } from 'playwright-core'

const API = process.env.SMOKE_API_URL || 'https://script.google.com/macros/s/AKfycbwjqnVwOBDQg3ptclpw_bCQO9kAcYUcHkxz4tdlNppcPYmMpCocPTbG8fgGVlp1muY/exec'
const ownerUser = process.env.SMOKE_OWNER_USERNAME || ''
const ownerPass = process.env.SMOKE_OWNER_PASSWORD || ''

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

async function apiPost(action, token = '', data = {}) {
  const response = await fetch(API, {
    method: 'POST', redirect: 'follow', headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ action, token, ...data }),
  })
  assert(response.ok, `${action}: HTTP ${response.status}`)
  return response.json()
}

async function apiGet(action, token = '') {
  const url = new URL(API)
  url.searchParams.set('action', action)
  if (token) url.searchParams.set('token', token)
  url.searchParams.set('_', String(Date.now()))
  const response = await fetch(url, { redirect: 'follow' })
  assert(response.ok, `${action}: HTTP ${response.status}`)
  return response.json()
}

function chromePath() {
  const candidates = ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser']
  return candidates.find((p) => fs.existsSync(p)) || ''
}

async function waitHttp(url, timeoutMs = 20000) {
  const started = Date.now()
  while (Date.now() - started < timeoutMs) {
    try { const r = await fetch(url); if (r.ok) return } catch {}
    await new Promise((r) => setTimeout(r, 300))
  }
  throw new Error(`Timed out waiting for ${url}`)
}

function start(command, args) {
  return spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'], env: process.env })
}

if (!ownerUser || !ownerPass) {
  console.log('Browser offline smoke skipped: Owner secrets not configured.')
  process.exit(0)
}

const executablePath = chromePath()
assert(executablePath, 'No Chrome/Chromium executable found on runner')
const login = await apiPost('login', '', { username: ownerUser, password: ownerPass, deviceInfo: 'github-actions-browser-offline-smoke' })
assert(login.ok === true && login.token, `owner login failed: ${JSON.stringify(login)}`)
const token = login.token
const nonce = `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
const recordId = `SMOKE_OFFLINE_${nonce}`
const record = {
  id: recordId,
  formType: 'spray',
  date: new Date().toISOString().slice(0, 10),
  shift: 'SMOKE',
  status: 'Working',
  name: 'Browser Offline Test',
  paddock: 'SMOKE-OFFLINE',
  area: 0.01,
  activity: 'Smoke Test',
  saveType: 'draft',
}

let dev
let preview
let browser
try {
  console.log('Browser smoke: navigator offline -> local queue -> online replay')
  dev = start('npm', ['run', 'dev', '--', '--host', '127.0.0.1', '--port', '5173'])
  await waitHttp('http://127.0.0.1:5173/offline-harness.html')

  browser = await chromium.launch({ executablePath, headless: true })
  const context = await browser.newContext()
  const page = await context.newPage()
  await page.goto('http://127.0.0.1:5173/offline-harness.html', { waitUntil: 'networkidle' })
  await page.waitForFunction(() => window.__qcOfflineReady === true)
  await page.evaluate((id) => window.__qcOffline.discardQueuedRecord(id), recordId)

  await context.setOffline(true)
  assert(await page.evaluate(() => navigator.onLine === false), 'navigator.onLine did not become false')
  const queued = await page.evaluate(async ({ token, record }) => {
    const result = await window.__qcOffline.sendOrQueue(token, 'syncRecord', record)
    return { ...result, count: window.__qcOffline.queueCount() }
  }, { token, record })
  assert(queued.queued === true && queued.count === 1, `offline record was not queued: ${JSON.stringify(queued)}`)
  console.log('  ✓ offline record queued in browser localStorage')

  await context.setOffline(false)
  await page.waitForFunction(() => navigator.onLine === true)
  const flushed = await page.evaluate(async (token) => {
    const result = await window.__qcOffline.flushQueue(token)
    return { ...result, count: window.__qcOffline.queueCount() }
  }, token)
  assert(flushed.sent === 1 && flushed.left === 0 && flushed.count === 0, `queue replay failed: ${JSON.stringify(flushed)}`)
  const records = await apiGet('records', token)
  assert(records.ok === true && records.records.some((r) => r.id === recordId), 'replayed offline record not found on backend')
  console.log('  ✓ online replay reached Apps Script and queue became empty')

  await context.close()
  await browser.close()
  browser = undefined
  dev.kill('SIGTERM')
  dev = undefined

  console.log('Browser smoke: PWA shell offline reload')
  preview = start('npm', ['run', 'preview', '--', '--host', '127.0.0.1', '--port', '4173'])
  await waitHttp('http://127.0.0.1:4173/react/')
  browser = await chromium.launch({ executablePath, headless: true })
  const pwaContext = await browser.newContext()
  const pwaPage = await pwaContext.newPage()
  await pwaPage.goto('http://127.0.0.1:4173/react/', { waitUntil: 'networkidle' })
  await pwaPage.evaluate(async () => {
    if (!('serviceWorker' in navigator)) throw new Error('serviceWorker unsupported')
    await navigator.serviceWorker.ready
  })
  await pwaPage.waitForTimeout(500)
  await pwaContext.setOffline(true)
  await pwaPage.reload({ waitUntil: 'domcontentloaded', timeout: 15000 })
  const rootExists = await pwaPage.locator('#root').count()
  assert(rootExists === 1, 'PWA app shell did not load while offline')
  console.log('  ✓ service worker served /react/ while browser network was offline')
  await pwaContext.setOffline(false)
  await pwaContext.close()
} finally {
  try { await apiPost('deleteRecord', token, { recordId }) } catch {}
  try { await apiPost('logout', token) } catch {}
  if (browser) await browser.close().catch(() => {})
  if (dev) dev.kill('SIGTERM')
  if (preview) preview.kill('SIGTERM')
}

console.log('Browser offline/PWA smoke completed successfully.')
