import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdtempSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const slug = 'qc-native-admin-live-pilot'
const hashes = {
  candidate: '36c29d0770fde1a2f692045409d424a109f0b3da1648400ba49f015feb859bc8',
  quarantine: '7cd9f42f30ed49e66d2af563147a0d44ed24235834cfa62a7f1fce1757891b90',
}

function metadata(run, target) {
  const rows = JSON.parse(run(['functions', 'list', target, '-o', 'json']))
  const matches = rows.filter(f => f.slug === slug)
  const [f] = matches
  if (matches.length !== 1 || f.status !== 'ACTIVE' ||
      f.id !== 'ecde3c88-dd7c-44d9-8300-a90a32514010' ||
      f.verify_jwt !== false || f.import_map !== true ||
      !Number.isSafeInteger(f.version) || f.version < 1 ||
      !f.entrypoint_path?.endsWith('/' + slug + '/index.ts') ||
      !f.import_map_path?.endsWith('/' + slug + '/deno.json')) {
    throw Error('HOSTED_ID_OR_CONFIG_MISMATCH')
  }
  return [f.version, f.entrypoint_path, f.import_map_path]
}

export function verifySource(dir, kind) {
  if (!Object.hasOwn(hashes, kind)) throw Error('INVALID_SOURCE_KIND')
  const names = [kind + '.mjs', 'deno.json', 'index.ts']
  const entries = readdirSync(dir, { withFileTypes: true })
  if (entries.length !== names.length ||
      entries.some(e => !e.isFile() || !names.includes(e.name)) ||
      !readFileSync(join(dir, 'index.ts')).equals(Buffer.from("import './" + kind + ".mjs'\n")) ||
      !readFileSync(join(dir, 'deno.json')).equals(Buffer.from('{"imports":{}}\n')) ||
      createHash('sha256').update(readFileSync(join(dir, names[0]))).digest('hex') !== hashes[kind]) {
    throw Error('HOSTED_SOURCE_MISMATCH')
  }
}

export function attestHosted({ run, listTarget, downloadTarget, work, kind }) {
  const before = metadata(run, listTarget)
  const download = mkdtempSync(join(work, 'hosted-'))
  run(['init', '--workdir', download])
  run(['functions', 'download', slug, downloadTarget, '--use-api', '--workdir', download])
  const after = metadata(run, listTarget)
  if (JSON.stringify(before) !== JSON.stringify(after)) throw Error('HOSTED_SNAPSHOT_CHANGED')
  const dir = join(download, 'supabase', 'functions', slug)
  const source = kind ?? (readdirSync(dir).includes('quarantine.mjs') ? 'quarantine' : 'candidate')
  verifySource(dir, source)
  return { version: after[0], source }
}

export function rollbackTarget(snapshot, offVerified) {
  try {
    const { source } = snapshot()
    if (source === 'quarantine') return 'already-quarantine'
    if (source === 'candidate' && offVerified) return 'restore-quarantine'
  } catch {
    return 'stop'
  }
  return 'stop'
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const [cli, listTarget, downloadTarget, work, kind] = process.argv.slice(2)
    if (cli === '--verify-source') {
      verifySource(listTarget, downloadTarget)
    } else {
      const run = args => execFileSync(cli, args, {
        encoding: 'utf8', timeout: 120000, stdio: ['ignore', 'pipe', 'inherit'],
      })
      const attest = source => attestHosted({ run, listTarget, downloadTarget, work, kind: source })
      if (kind === 'rollback') {
        console.log(rollbackTarget(attest, process.argv[7] === 'off-verified'))
      } else {
        const { version } = attest(kind)
        console.log(`PASS: hosted ${kind} v${version} matches pinned source and function settings`)
      }
    }
  } catch (error) {
    console.error(error.code ?? error.message)
    process.exitCode = 1
  }
}
