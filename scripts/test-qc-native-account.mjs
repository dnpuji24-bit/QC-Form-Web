import assert from 'node:assert/strict'
import {changeNativePassword} from '../src/qcNativeAccountPolicy.mjs'
const profile={firebaseUid:'u1',status:'approved',role:'admin',email:'user@example.test',permissions:{qc_settings:'edit'}}
const identity={uid:'u1',email:'USER@example.test'}
function fixture(overrides={}){
 const calls=[]
 const args={native:true,enabled:true,online:()=>true,expectedUid:'u1',current:'old-password',next:'new-password',confirm:'new-password',readProfile:async()=>{calls.push('profile');return profile},getIdentity:()=>identity,reauthenticate:async(user,secret)=>{assert.equal(user,identity);assert.equal(secret,'old-password');calls.push('reauth')},update:async(user,secret)=>{assert.equal(user,identity);assert.equal(secret,'new-password');calls.push('update')},...overrides}
 return {args,calls}
}
let n=0
async function check(label,fn){await fn();n++;console.log('PASS: '+label)}
async function denied(overrides,pattern){const f=fixture(overrides);await assert.rejects(changeNativePassword(f.args),pattern);assert.ok(!f.calls.includes('update'));return f}
await check('native flag required',()=>denied({native:false},/NATIVE_PASSWORD_DISABLED/))
await check('password changes disabled by default',()=>denied({enabled:false},/NATIVE_PASSWORD_DISABLED/))
await check('offline changes denied',()=>denied({online:()=>false},/NATIVE_PASSWORD_OFFLINE/))
await check('view-only settings denied',()=>denied({readProfile:async()=>({...profile,permissions:{qc_settings:'view'}})},/NATIVE_PASSWORD_FORBIDDEN/))
await check('unapproved profile denied',()=>denied({readProfile:async()=>({...profile,status:'pending'})},/NATIVE_PASSWORD_SESSION_CHANGED/))
await check('wrong Firebase UID denied',()=>denied({getIdentity:()=>({...identity,uid:'u2'})},/NATIVE_PASSWORD_SESSION_CHANGED/))
await check('wrong Firebase email denied',()=>denied({getIdentity:()=>({...identity,email:'other@example.test'})},/NATIVE_PASSWORD_SESSION_CHANGED/))
await check('invalid new passwords rejected before auth',async()=>{for(const p of [{next:'short',confirm:'short'},{next:'old-password',confirm:'old-password'},{confirm:'mismatch'},{current:''}]){const f=await denied(p,/NATIVE_PASSWORD_INVALID/);assert.deepEqual(f.calls,[])}})
await check('failed reauthentication prevents update',()=>denied({reauthenticate:async()=>{throw Error('auth/invalid-credential')}},/auth\/invalid-credential/))
await check('account switch after reauthentication denies update',async()=>{let active=identity;await denied({getIdentity:()=>active,reauthenticate:async()=>{active={...identity,uid:'u2'}}},/NATIVE_PASSWORD_SESSION_CHANGED/)})
await check('permission removed after reauthentication denies update',async()=>{let count=0;await denied({readProfile:async()=>++count===1?profile:{...profile,permissions:{qc_settings:'none'}}},/NATIVE_PASSWORD_FORBIDDEN/)})
await check('success reauthenticates and revalidates before update',async()=>{const f=fixture();assert.deepEqual(await changeNativePassword(f.args),{ok:true,sessionChanged:false});assert.deepEqual(f.calls,['profile','reauth','profile','update'])})
await check('failed update is never reported as success',async()=>{const f=fixture({update:async()=>{throw Error('auth/network-request-failed')}});await assert.rejects(changeNativePassword(f.args),/auth\/network-request-failed/)})
await check('owner retains settings permission',async()=>{const f=fixture({readProfile:async()=>({...profile,role:'owner',permissions:{}})});assert.equal((await changeNativePassword(f.args)).ok,true);assert.ok(f.calls.includes('update'))})
console.log('SUCCESS: '+n+' native account password policy checks passed (mock Auth only; no network, no writes)')
