import assert from 'node:assert/strict'
import {resolveFirebaseProfile as resolve} from '../src/qcFirebaseIdentity.mjs'
const identity={uid:'uid-a',email:'test@example.com'}
const profile={active:true,status:'approved',role:'manager',username:'test',fullName:'Test User',email:'test@example.com'}
const template={role:'manager',permissions:{qc_records:'view',qc_spraying:'edit'}}
const keys=['qc_records','qc_spraying','qc_fertilizer']
let n=0
const test=(label,fn)=>{fn();n++;console.log('PASS: '+label)}
test('approved Firebase identity resolves',()=>assert.equal(resolve(identity,profile,template,keys).firebaseUid,identity.uid))
test('manual View and Edit honored',()=>assert.deepEqual(resolve(identity,profile,template,keys).permissions,{qc_records:'view',qc_spraying:'edit',qc_fertilizer:'none'}))
test('permission change applies on next verification',()=>assert.equal(resolve(identity,profile,{...template,permissions:{qc_records:'none'}},keys).permissions.qc_records,'none'))
test('missing template fails closed',()=>assert.equal(resolve(identity,profile,undefined,keys).permissions.qc_records,'none'))
test('wrong role template fails closed',()=>assert.equal(resolve(identity,profile,{...template,role:'admin'},keys).permissions.qc_records,'none'))
test('owner retains full access',()=>assert.ok(Object.values(resolve(identity,{...profile,role:'owner'},undefined,keys).permissions).every(v=>v==='edit')))
test('inactive profile rejected',()=>assert.throws(()=>resolve(identity,{...profile,active:false},template,keys)))
test('pending profile rejected',()=>assert.throws(()=>resolve(identity,{...profile,status:'pending'},template,keys)))
test('missing profile rejected',()=>assert.throws(()=>resolve(identity,undefined,template,keys)))
test('wrong email rejected',()=>assert.throws(()=>resolve(identity,{...profile,email:'other@example.com'},template,keys)))
test('wrong UID rejected',()=>assert.throws(()=>resolve(identity,{...profile,firebaseUid:'other'},template,keys)))
test('unknown role rejected',()=>assert.throws(()=>resolve(identity,{...profile,role:'unknown'},template,keys)))
console.log('SUCCESS: '+n+' Firebase identity checks passed (no network, no writes)')
