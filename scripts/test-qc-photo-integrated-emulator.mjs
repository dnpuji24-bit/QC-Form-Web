/**
 * Integration test: mocked Supabase object -> Firestore Rules client metadata ->
 * authorized viewer via real emulator data + backend signing handler.
 * No real Supabase calls, no production Firestore, no Firebase Auth requests.
 */
import assert from 'node:assert/strict'
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing'
import { doc, setDoc, getDoc, getDocs, collection, query, limit } from 'firebase/firestore'
import { createQcPhotoSignHandler } from './lib/qcPhotoSignHandler.mjs'

const projectId = 'demo-qc-photo-test'
const host = process.env.FIRESTORE_EMULATOR_HOST || ''
if (process.env.FIREBASE_PROJECT_ID !== projectId || process.env.GCLOUD_PROJECT !== projectId ||
    !/^(localhost|127\.0\.0\.1):\d+$/.test(host)) {
  console.error('SAFETY STOP: emulator-only integration test.')
  process.exit(2)
}
const [hostname, port] = host.split(':')
const env = await initializeTestEnvironment({ projectId,
  firestore: { host: hostname, port: Number(port) } })
const uploader = 'test-photo-uploader'
const manager = 'test-photo-manager'
const noAccess = 'test-photo-denied'
const recordId = 'qc-photo-integration-001'
const photoId = 'photo-main-001'
const objectPath = `${uploader}/qc/${recordId}/${photoId}.jpg`
let assertions = 0, signingCount = 0
const mockStorage = new Map()
const getPath = id => `qc_photo_metadata/${recordId}/photos/${id}`
async function test(name, run) { await run(); assertions++; console.log('PASS:',name) }
try {
  const admin = env.withSecurityRulesDisabled.bind(env)
  await admin(async context => {
    const db = context.firestore()
    await Promise.all([
      setDoc(doc(db,'users',uploader), { active:true, role:'mandor_spraying', username:'sprayer-one' }),
      setDoc(doc(db,'users',manager), { active:true, role:'manager', username:'manager-one' }),
      setDoc(doc(db,'users',noAccess), { active:true, role:'pengunjung', username:'guest-one' }),
      setDoc(doc(db,'role_access','mandor_spraying'), { role:'mandor_spraying', permissions:{qc_records:'view',qc_spraying:'edit'} }),
      setDoc(doc(db,'role_access','manager'), { role:'manager', permissions:{qc_records:'view',qc_spraying:'none'} }),
      setDoc(doc(db,'role_access','pengunjung'), { role:'pengunjung', permissions:{qc_records:'none',qc_spraying:'none'} }),
      setDoc(doc(db,'qc_records',recordId), { id:recordId,ownerUid:uploader,inputtedBy:'sprayer-one',clientRevision:'revision001',formType:'spray',saveType:'ready' }),
    ])
  })
  const writer = env.authenticatedContext(uploader).firestore()
  const viewer = env.authenticatedContext(manager).firestore()
  const denied = env.authenticatedContext(noAccess).firestore()
  const reference = { photoId, qcRecordId:recordId, ownerUid:uploader, recordRevision:'revision001',
    provider:'supabase',bucket:'qc-photos-test',objectPath,kind:'main',
    contentType:'image/jpeg',uploadedAt:'2026-11-11T00:00:00Z' }
  await test('mock private Supabase upload stores immutable object', async () => {
    mockStorage.set(objectPath, Buffer.from('mock-image-content'))
    assert.ok(mockStorage.has(objectPath))
  })
  await test('uploader writes metadata as Firebase client', async () => {
    await assertSucceeds(setDoc(doc(writer,getPath(photoId)), reference))
  })
  await test('manager with Data QC View reads metadata', async () => {
    const result = await assertSucceeds(getDoc(doc(viewer,getPath(photoId))))
    assert.equal(result.data().objectPath, objectPath)
  })
  await test('manager can list bounded QC photo collection', async () => {
    const result = await assertSucceeds(getDocs(query(collection(viewer,'qc_photo_metadata',recordId,'photos'),limit(50))))
    assert.equal(result.size,1)
  })
  await test('account with Data QC None cannot read photo', async () => {
    await assertFails(getDoc(doc(denied,getPath(photoId))))
  })
  const serverDb = {
    doc: path => ({ get: async () => {
      let result
      await admin(async context => { result=await getDoc(doc(context.firestore(),path)) })
      return { exists:result.exists(), data:()=>result.data() }
    } })
  }
  const handler = createQcPhotoSignHandler({
    auth:{verifyIdToken: async (token,checkRevoked) => {
      assert.equal(checkRevoked,true)
      if (!['manager-token','denied-token'].includes(token)) throw new Error('Bad token')
      return { uid: token==='manager-token'?manager:noAccess }
    }},
    db:serverDb, allowedOrigin:'https://preview.example.invalid',
    signFile:async (bucket,path,ttl) => {
      assert.equal(bucket,'qc-photos-test')
      assert.ok(mockStorage.has(path),'signed URL must refer to existing mock object')
      assert.equal(ttl,60)
      signingCount++
      return 'https://example.invalid/private-signed-url'
    }
  })
  async function request(token) {
    const req = { method:'POST', headers:{origin:'https://preview.example.invalid',authorization:`Bearer ${token}`},
      async *[Symbol.asyncIterator]() { yield Buffer.from(JSON.stringify({recordId,photoId})) } }
    const res = {status:0,body:'',setHeader(){},writeHead(status){this.status=status},end(body=''){this.body=body} }
    await handler(req,res)
    return res
  }
  await test('backend signs existing photo for manager with View',async () => {
    const res=await request('manager-token')
    assert.equal(res.status,200,res.body)
    assert.equal(JSON.parse(res.body).expiresIn,60)
    assert.equal(signingCount,1)
  })
  await test('backend denies user with Data QC None',async () => {
    const res=await request('denied-token')
    assert.equal(res.status,403,res.body)
    assert.equal(signingCount,1)
  })
  await test('role change immediately revokes new signed URLs',async () => {
    await admin(async context => setDoc(doc(context.firestore(),'role_access','manager'),
      {role:'manager',permissions:{qc_records:'none',qc_spraying:'none'}}))
    await assertFails(getDoc(doc(viewer,getPath(photoId))))
    const res=await request('manager-token')
    assert.equal(res.status,403)
    assert.equal(signingCount,1)
  })
  console.log(`SUCCESS: ${assertions} integrated QC photo checks passed (emulator + mock storage; no production writes).`)
} catch(error) {
  console.error('FAILED integrated QC photo checks:',error)
  process.exitCode=1
} finally { await env.cleanup() }
