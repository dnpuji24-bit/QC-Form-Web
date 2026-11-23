import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {test} from 'node:test'
import {safeFirebaseLoginMessage,safeFirebaseProfileMessage} from '../src/qcNativeLoginDiagnostics.mjs'
const source=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8')
test('Firebase Auth failures are classified with only safe codes, no credentials',()=>{
 const cases=['auth/invalid-credential','auth/network-request-failed','auth/too-many-requests','auth/user-disabled',
   'auth/operation-not-allowed','auth/unauthorized-domain','auth/invalid-api-key','auth/app-check-token-is-invalid']
 for(const code of cases){
   const result=safeFirebaseLoginMessage({code,message:'sensitive-key-credential-123'})
   assert.ok(result.includes(code))
   assert.ok(!result.includes('sensitive-key-credential-123'))
 }
})
test('Unknown error never displays raw potentially sensitive data',()=>{
 const value=safeFirebaseLoginMessage({code:'auth/unsafe?secret=1234',message:'password=secret&email=user@example.test'})
 assert.ok(!value.includes('secret'))
 assert.ok(!value.includes('user@example.test'))
 const recognized=safeFirebaseLoginMessage({code:'auth/new-firebase-error',message:'password=secret'})
 assert.match(recognized,/auth\/new-firebase-error/)
 assert.ok(!recognized.includes('secret'))
})
test('Login does not discard authenticated user before signIn, and keeps email after failure',()=>{
 const code=source('src/NativePortalSession.tsx')
 const login=code.slice(code.indexOf('async function submit(event:FormEvent<HTMLFormElement>)'))
 assert.match(login,/await firebaseAuthPersistenceReady/)
 assert.match(login,/await signInWithEmailAndPassword\(firebaseAuth/)
 assert.doesNotMatch(login,/if\(firebaseAuth\.currentUser\)await signOut\(firebaseAuth\)/)
 assert.match(login,/setMessage\(register\?.*safeFirebaseLoginMessage\(error\)/)
 assert.match(login,/form\.elements\.namedItem\('password'\)/)
 assert.match(login,/if\(password instanceof HTMLInputElement\)password.value=''/)
 assert.doesNotMatch(login,/Permintaan gagal\. Periksa akun, koneksi, atau konfigurasi\./)
})
test('Firestore profile denial is distinguished from credentials and never claims successful application login',()=>{
 const cases=[
  [{code:'permission-denied'},'Firestore menolak'],
  [{code:'unavailable'},'profil Firestore'],
  [{message:'AUTH_PROFILE_NOT_APPROVED'},'belum aktif'],
  [{message:'AUTH_PROFILE_IDENTITY_MISMATCH'},'UID/email'],
  [{message:'AUTH_PROFILE_INVALID'},'role'],
 ]
 for(const [error,part] of cases)assert.ok(safeFirebaseProfileMessage(error).includes(part))
 const code=source('src/NativePortalSession.tsx')
 assert.match(code,/setMessage\(safeFirebaseProfileMessage\(error\)\)/)
 assert.match(code,/clearCompatibilitySession\(\)/)
})
test('No deployment modifies any Auth accounts, passwords, or owner profile',()=>{
 const code=source('src/NativePortalSession.tsx')
 assert.doesNotMatch(code,/updatePassword\(|deleteUser\(|setDoc\(.*users|changeEmail\(/)
})
