import assert from 'node:assert/strict'
import {test} from 'node:test'
import {readFileSync} from 'node:fs'
import {createOfflineLease,readOfflineLease,OFFLINE_LEASE_MS,isOfflineTransportFailure} from '../src/qcOfflineLease.mjs'
import {operationalRetryDelay,operationalRetryDue} from '../src/qcOperationalQueue.mjs'
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8')
const identity={uid:'uid-one',email:'demo@example.test'},project='form-qc-unm',now=1770000000000
const user={firebaseUid:identity.uid,email:identity.email,role:'owner',status:'approved',username:'owner',fullName:'Demo Owner',permissions:{qc_records:'view',data_plan_daily:'edit'}}
test('Offline access is scoped to prior server-verified Firebase UID, email, origin/project and time',()=>{
 const lease=createOfflineLease(user,identity,project,now)
 assert.equal(lease.expiresAt,now+OFFLINE_LEASE_MS)
 assert.equal(OFFLINE_LEASE_MS,43200000)
 assert.equal(readOfflineLease(JSON.stringify(lease),identity,project,now+100).user.firebaseUid,identity.uid)
 for(const id of [null,{uid:'uid-two',email:identity.email},{uid:identity.uid,email:'other@example.test'}])
  assert.equal(readOfflineLease(lease,id,project,now+100),null)
 assert.equal(readOfflineLease(lease,identity,'another-project',now+100),null)
 assert.equal(readOfflineLease(lease,identity,project,now+OFFLINE_LEASE_MS),null)
 assert.equal(readOfflineLease(lease,identity,project,now-1),null)
 assert.equal(readOfflineLease({...lease,expiresAt:now+999999999},identity,project,now+100),null)
 assert.equal(readOfflineLease(null,identity,project,now),null)
 assert.equal(createOfflineLease({...user,status:'disabled'},identity,project,now),null)
})
test('Local lease never stores password, ID token or refresh token',()=>{
 const lease=createOfflineLease({...user,password:'secret',idToken:'id-token',refreshToken:'refresh-token'},identity,project,now)
 assert.equal(Object.hasOwn(lease.user,'password'),false)
 assert.equal(Object.hasOwn(lease.user,'idToken'),false)
 assert.equal(Object.hasOwn(lease.user,'refreshToken'),false)
})
test('Only network availability errors permit offline fallback, never quota or access denial',()=>{
 for(const code of ['unavailable','deadline-exceeded','auth/network-request-failed','firestore/unavailable'])
  assert.equal(isOfflineTransportFailure({code}),true)
 for(const code of ['permission-denied','resource-exhausted','auth/invalid-credential','auth/user-disabled','unauthenticated'])
  assert.equal(isOfflineTransportFailure({code}),false)
})
test('Retry backoff is persistent, quota-sensitive and bounded; manual sync targets one record',()=>{
 assert.equal(operationalRetryDelay(1,{code:'resource-exhausted'}),300000)
 assert.equal(operationalRetryDelay(1,Error('Quota exceeded.')),300000)
 assert.equal(operationalRetryDelay(1,{code:'unavailable'}),30000)
 assert.equal(operationalRetryDelay(2,{code:'unavailable'}),60000)
 assert.equal(operationalRetryDelay(20,Error('Quota exceeded')),1800000)
 const job={record:{id:'qc1'},nextAttemptAt:now+300000}
 assert.equal(operationalRetryDue(job,now),false)
 assert.equal(operationalRetryDue(job,now+300000),true)
 assert.equal(operationalRetryDue(job,now,'qc1'),true)
 assert.equal(operationalRetryDue(job,now,'qc2'),false)
})
test('Cold offline menu cannot mount shared Firestore data or publish the compatibility session',()=>{
 const shell=read('src/OfflinePortal.tsx'),session=read('src/NativePortalSession.tsx')
 assert.match(shell,/job\.uploaderUid===user\.firebaseUid&&job\.record\.ownerUid===user\.firebaseUid/)
 assert.doesNotMatch(shell,/getDocs\(|getDoc\(|setDoc\(|deleteDoc\(|PortalRouter|NativeUsersAccess/)
 assert.match(session,/clearCompatibilitySession\(\);setUser\(null\);setRetainedOffline\(false\);setOfflineLease\(lease\)/)
 assert.match(session,/if\(!navigator\.onLine\)throw Error\('OFFLINE_LOGIN_REQUIRES_PREVIOUS_SESSION'\)/)
 assert.match(session,/const reconnect=\(\)=>\{void verify\(true\)\}/)
 assert.match(session,/if\(!transient\)forgetOfflineProfile\(\)/)
 assert.match(read('src/PortalRouter.tsx'),/canUsers=user\?\.role==='owner'&&!offlineMode/)
 assert.match(read('src/qcOperationalAdapters.ts'),/nativePortalEnabled&&!canSyncVerifiedNativeUid\(uid\)/)
})
test('Versioned service worker caches emitted static assets only, preserves QC IndexedDB',()=>{
 const vite=read('vite.config.ts'),sw=read('scripts/qc-react-offline-sw.js')
 assert.match(vite,/Object\.keys\(bundle\)/)
 assert.match(vite,/fileName:'sw\.js'/)
 assert.match(sw,/cache\.addAll\(APP_SHELL\)/)
 assert.match(sw,/url\.origin!==self\.location\.origin/)
 assert.match(sw,/shellPaths\.has\(url\.pathname\)/)
 assert.doesNotMatch(sw,/indexedDB|deleteDatabase|firestore\.googleapis\.com|identitytoolkit/)
})
