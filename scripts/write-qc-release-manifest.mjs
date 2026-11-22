import { readFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const sha = String(process.env.VITE_QC_BUILD_SHA || '').trim()
const version = String(process.env.VITE_QC_APP_VERSION || '').trim()
const sourceBranch = String(process.env.VITE_QC_SOURCE_BRANCH || '').trim()
const packageVersion = JSON.parse(readFileSync(resolve('package.json'), 'utf8')).version

if (!/^[a-f0-9]{40}$/i.test(sha)) throw new Error('QC_RELEASE_SHA_INVALID: require a 40-character source commit')
if (version !== packageVersion) throw new Error('QC_RELEASE_VERSION_MISMATCH')
if (sourceBranch !== 'feature/firebase-auth-claims-supabase') throw new Error('QC_RELEASE_BRANCH_MISMATCH')

const release = Object.freeze({
  application: 'QC-Form-Web',
  version,
  commit: sha,
  sourceBranch,
  builtAtUtc: new Date().toISOString(),
  backend: 'form-qc-unm',
})
const directory = resolve('public/react')
mkdirSync(directory, { recursive: true })
writeFileSync(resolve(directory, 'release.json'), JSON.stringify(release, null, 2) + '\n')
console.log('Release manifest created for:', release.commit.slice(0, 8), release.sourceBranch)
