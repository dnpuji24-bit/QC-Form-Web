// Emulator-only design candidate. Never use this module to deploy rules.
import assert from 'node:assert/strict'
import {createHash} from 'node:crypto'
import {readFileSync} from 'node:fs'
export const demoProject='demo-qc-uat-foundation'
export const workspace='cutover'
export const baselineHash='1969b01dc886befc8fa65982c5a57fcbf464581a73a1e4916e1485f8922e8e5c'
const baseline=readFileSync(new URL('./firestore.legacy-audit-release.rules',import.meta.url),'utf8')
const normalizedHash=s=>createHash('sha256').update(s.replace(/\r\n/g,'\n').trimEnd()).digest('hex')
const oldSignedIn='    function signedIn() { return request.auth != null; }'
const marker='    match /{document=**} {'
const guardedSignedIn=`    // Candidate only: a reserved marker also blocks stale tokens without the claim.
    function uatIdentityPath() {
      return /databases/$(database)/documents/qc_uat_identities/$(request.auth.uid);
    }
    function signedIn() {
      return request.auth != null
        && !request.auth.token.keys().hasAny(['qcUat'])
        && !exists(uatIdentityPath());
    }`
const probeRules=`    // Isolated foundation probe, not full portal authorization.
    function allowedUatProbe() {
      return request.auth != null
        && request.auth.token.get('qcUat', false) == true
        && !exists(/databases/$(database)/documents/users/$(request.auth.uid))
        && exists(uatIdentityPath())
        && get(uatIdentityPath()).data.enabled == true
        && get(uatIdentityPath()).data.testOnly == true
        && get(uatIdentityPath()).data.workspace == 'cutover';
    }
    match /qc_uat_identities/{uid} {
      allow read, write: if false;
    }
    match /qc_uat_workspaces/cutover/probes/{probeId} {
      allow get: if allowedUatProbe()
        && probeId == request.auth.uid
        && resource.data.ownerUid == request.auth.uid
        && resource.data.testOnly == true;
      allow create: if allowedUatProbe()
        && probeId == request.auth.uid
        && request.resource.data.keys().hasAll(['ownerUid','testOnly','kind','createdAt'])
        && request.resource.data.keys().hasOnly(['ownerUid','testOnly','kind','createdAt'])
        && request.resource.data.ownerUid == request.auth.uid
        && request.resource.data.testOnly == true
        && request.resource.data.kind == 'isolation-probe'
        && request.resource.data.createdAt == request.time;
      allow list, update, delete: if false;
    }

`
export function candidateRules(source=baseline){
  assert.equal(normalizedHash(source),baselineHash,'BASELINE_HASH_MISMATCH')
  assert.equal(source.split(oldSignedIn).length,2,'SIGNED_IN_ANCHOR_MISMATCH')
  assert.equal(source.split(marker).length,2,'CATCH_ALL_ANCHOR_MISMATCH')
  const candidate=source.replace(oldSignedIn,guardedSignedIn).replace(marker,probeRules+marker)
  assert.equal(candidate.replace(guardedSignedIn,oldSignedIn).replace(probeRules,''),source,'CANDIDATE_SPLICE_MISMATCH')
  return candidate
}
export function probePath(uid){
  if(typeof uid!=='string'||!/^[A-Za-z0-9_-]{1,128}$/.test(uid))throw Error('INVALID_PROBE_UID')
  return ['qc_uat_workspaces',workspace,'probes',uid]
}
export function assertDemoEnvironment(env=process.env){
  assert.equal(env.GCLOUD_PROJECT,demoProject,'DEMO_PROJECT_REQUIRED')
  for(const key of ['GOOGLE_CLOUD_PROJECT','FIREBASE_PROJECT_ID']){
    if(env[key])assert.equal(env[key],demoProject,'WRONG_PROJECT')
  }
  assert.match(env.FIRESTORE_EMULATOR_HOST||'',/^(127\.0\.0\.1|localhost):8185$/,'LOOPBACK_EMULATOR_REQUIRED')
}
export function selfTest(){
  const candidate=candidateRules()
  assert.ok(candidate.includes('!exists(uatIdentityPath())'))
  assert.ok(candidate.includes("!request.auth.token.keys().hasAny(['qcUat'])"))
  assert.ok(candidate.includes('match /qc_uat_workspaces/cutover/probes/{probeId}'))
  assert.throws(()=>candidateRules(baseline+'x'),/BASELINE_HASH_MISMATCH/)
  assert.deepEqual(probePath('uat_1'),['qc_uat_workspaces','cutover','probes','uat_1'])
  for(const bad of ['', '../users', 'a/b', '.', 'a b', null])assert.throws(()=>probePath(bad),/INVALID_PROBE_UID/)
  assertDemoEnvironment({GCLOUD_PROJECT:demoProject,FIRESTORE_EMULATOR_HOST:'127.0.0.1:8185'})
  for(const env of [{GCLOUD_PROJECT:'form-qc-unm',FIRESTORE_EMULATOR_HOST:'127.0.0.1:8185'},{GCLOUD_PROJECT:demoProject,FIRESTORE_EMULATOR_HOST:'example.com:8185'},{GCLOUD_PROJECT:demoProject},{GCLOUD_PROJECT:demoProject,GOOGLE_CLOUD_PROJECT:'form-qc-unm',FIRESTORE_EMULATOR_HOST:'localhost:8185'}])assert.throws(()=>assertDemoEnvironment(env))
  console.log('SUCCESS: UAT foundation source, path and emulator guards passed (offline)')
}
