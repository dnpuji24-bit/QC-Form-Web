import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { attestHosted, rollbackTarget } from './qc-native-admin-hosted-snapshot.mjs'

const slug = 'qc-native-admin-live-pilot'
const quarantine = execFileSync('git', [
  'show', 'HEAD:scripts/release-artifacts/' + slug + '/quarantine.mjs',
])

function mock(t, versions, { config, drift, failDownload } = {}) {
  const work = mkdtempSync(join(tmpdir(), 'qc-hosted-test-'))
  t.after(() => rmSync(work, { recursive: true, force: true }))
  let read = 0
  const run = args => {
    assert.equal(args[0], args[0] === 'init' ? 'init' : 'functions')
    if (args[1] === 'list') {
      assert.equal(args[2], 'test-project')
      return JSON.stringify([{
        slug, id: 'ecde3c88-dd7c-44d9-8300-a90a32514010', status: 'ACTIVE',
        version: versions[read++], verify_jwt: false, import_map: true,
        entrypoint_path: '/source/' + slug + '/index.ts',
        import_map_path: '/source/' + slug + '/deno.json',
        ...config,
      }])
    }
    if (args[0] === 'init') return
    assert.equal(args[1], 'download')
    assert.equal(args[3], 'test-project')
    if (failDownload) throw Error('download failed')
    const dir = join(args.at(-1), 'supabase', 'functions', slug)
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'index.ts'), "import './quarantine.mjs'\n")
    writeFileSync(join(dir, 'deno.json'), '{"imports":{}}\n')
    writeFileSync(join(dir, 'quarantine.mjs'), drift ? 'wrong bytes' : quarantine)
  }
  return kind => attestHosted({ run, listTarget: 'test-project', downloadTarget: 'test-project', work, kind })
}

test('ON and OFF can increment version between snapshots without changing identity or source', t => {
  const attest = mock(t, [9, 9, 10, 10, 11, 11])
  assert.deepEqual([attest('quarantine').version, attest('quarantine').version,
    attest('quarantine').version], [9, 10, 11])
})

test('reject version drift during download', t => {
  assert.throws(() => mock(t, [11, 12])('quarantine'), /HOSTED_SNAPSHOT_CHANGED/)
})

test('reject wrong function ID or config with matching source', t => {
  for (const config of [{ id: 'other' }, { verify_jwt: true }, { import_map: false },
    { entrypoint_path: '/wrong.ts' }, { import_map_path: '/wrong.json' }]) {
    assert.throws(() => mock(t, [11, 11], { config })(), /HOSTED_ID_OR_CONFIG_MISMATCH/)
  }
})

test('rollback skips already restored quarantine and stops on drift or download failure', t => {
  assert.equal(rollbackTarget(mock(t, [13, 13]), true), 'already-quarantine')
  assert.equal(rollbackTarget(mock(t, [13, 14]), true), 'stop')
  assert.equal(rollbackTarget(mock(t, [13, 13], { drift: true }), true), 'stop')
  assert.equal(rollbackTarget(mock(t, [13, 13], { failDownload: true }), true), 'stop')
})

test('rollback may restore only the attested candidate after OFF is verified', () => {
  const candidate = () => ({ source: 'candidate', version: 11 })
  assert.equal(rollbackTarget(candidate, true), 'restore-quarantine')
  assert.equal(rollbackTarget(candidate, false), 'stop')
})
