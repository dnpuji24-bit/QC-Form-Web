import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {test} from 'node:test'

const read = (path) => readFileSync(new URL('../'+path, import.meta.url),'utf8')
const info = read('src/qcReleaseInfo.tsx')
const app = read('src/App.tsx')
const workflow = read('.github/workflows/qc-production-hosting.yml')
const manifest = read('scripts/write-qc-release-manifest.mjs')
const hosting = JSON.parse(read('firebase.json'))

test('QC Settings exposes actual SHA, source branch and preview/live channel', () => {
  assert.match(app, /import \{QcReleaseInfo\}/)
  assert.match(app, /<QcReleaseInfo\/>/)
  assert.match(info, /VITE_QC_BUILD_SHA/)
  assert.match(info, /VITE_QC_APP_VERSION/)
  assert.match(info, /VITE_QC_SOURCE_BRANCH/)
  assert.match(info, /form-qc-unm--react-test/)
  assert.match(info, /form-qc-unm\.web\.app/)
  assert.match(info, /Kanal preview menggunakan Firebase dan Supabase produksi/)
})

test('release manifest only accepts real current repository SHA and package version', () => {
  assert.match(manifest, /\^\[a-f0-9\]\{40\}\$/)
  assert.match(manifest, /QC_RELEASE_SHA_INVALID/)
  assert.match(manifest, /QC_RELEASE_VERSION_MISMATCH/)
  assert.match(manifest, /QC_RELEASE_BRANCH_MISMATCH/)
  assert.match(manifest, /release\.json/)
  assert.ok(hosting.hosting.headers.some(h => h.source === '/react/release.json' &&
    h.headers.some(v=>v.value.includes('no-store'))))
})

test('production workflow builds once and deploys identical artifact to LIVE and react-test', () => {
  assert.match(workflow, /feature\/firebase-auth-claims-supabase/)
  assert.match(workflow, /VITE_QC_BUILD_SHA/)
  assert.match(workflow, /VITE_QC_APP_VERSION/)
  assert.match(workflow, /channelId: live/)
  assert.match(workflow, /channelId: react-test/)
  const live = workflow.indexOf('channelId: live')
  const preview = workflow.indexOf('channelId: react-test')
  assert.ok(preview > live, 'Preview must deploy same completed LIVE build')
  assert.equal((workflow.match(/npm run build/g)||[]).length, 1)
  assert.equal((workflow.match(/npm install --no-audit --no-fund/g)||[]).length, 1)
})
