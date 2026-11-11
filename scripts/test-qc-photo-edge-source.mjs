/**
 * Zero-network release gate for initial Edge Function source.
 * This is NOT a runtime/authentication test; a hosted cross-account test is still required.
 */
import { readFileSync } from 'node:fs'
import assert from 'node:assert/strict'
const edge = readFileSync('supabase/functions/qc-photo-sign/index.ts','utf8')
const config = readFileSync('supabase/config.toml','utf8')
const conditions = {
  'explicit Firebase gateway exception': config.includes('[functions.qc-photo-sign]') && config.includes('verify_jwt = false'),
  'Firebase signature and audience verified': edge.includes('jwtVerify(jwt,jwks') && edge.includes('audience:projectId'),
  'Firebase Auth disabled/revoked check': edge.includes('accounts:lookup') && edge.includes('userAccount.disabled===true') && edge.includes('auth_time'),
  'permission read from Firestore': edge.includes("docPath('role_access/'+profile.role)") && edge.includes("['view','edit'].includes(role.permissions?.qc_records)"),
  'no client path accepted': edge.includes("Object.keys(data).sort().join(',')!=='photoId,recordId'"),
  'private bucket enforced': edge.includes("const bucket = 'qc-photos-test'"),
  'short-lived signing': edge.includes('createSignedUrl(photo.objectPath,60)'),
  'CORS pinned to one origin': edge.includes("origin!==expectedOrigin"),
  'server side secret only': edge.includes("Deno.env.get('SUPABASE_SECRET_KEYS')"),
  'no production URL toggles': !edge.includes('VITE_'),
}
for(const [name,ok] of Object.entries(conditions)){assert.equal(ok,true,name);console.log('PASS:',name)}
console.log('SUCCESS: 10 Edge Function source release gates passed (source/config only; no network, no deployment).')
