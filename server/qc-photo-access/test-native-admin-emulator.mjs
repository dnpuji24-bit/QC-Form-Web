// Emulator-only runner for the native admin service. Never accepts production credentials.
import {initializeApp,deleteApp} from 'firebase-admin/app'
import {getFirestore,FieldValue} from 'firebase-admin/firestore'
import {getAuth} from 'firebase-admin/auth'
import {administer,permissionKeys} from './nativeAdminCore.mjs'
import {executeNativeAdmin} from './nativeAdminService.mjs'
import assert from 'node:assert/strict'
const projectId='demo-qc-photo-test'
if(process.env.GCLOUD_PROJECT!==projectId||! /^(localhost|127\.0\.0\.1):\d+$/.test(process.env.FIRESTORE_EMULATOR_HOST||'')||! /^(localhost|127\.0\.0\.1):\d+$/.test(process.env.FIREBASE_AUTH_EMULATOR_HOST||''))throw Error('Both local demo emulators required')
const app=initializeApp({projectId}),db=getFirestore(app),auth=getAuth(app)
const actor={uid:'owner1',email:'owner@example.test'}
const owner={username:'owner',fullName:'Owner',email:actor.email,role:'owner',active:true,status:'approved'}
const permissions=Object.fromEntries(permissionKeys.map(k=>[k,'none']))
const users=db.collection('users'),requests=db.collection('firebase_registration_requests'),templates=db.collection('role_access')
let n=0
const check=async(label,fn)=>{await fn();console.log('PASS: '+label);n++}
const run=(command,who=actor)=>administer({db,auth,actor:who,command,stamp:()=>FieldValue.serverTimestamp()})
async function applicant(uid,username,emailVerified=true){
 const email=uid+'@example.test'
 await auth.createUser({uid,email,emailVerified,password:'test-only-password'})
 await requests.doc(uid).set({username,fullName:'Test Applicant',email,requestedRole:'manager',approvedRole:'manager',status:'approved_for_provisioning',reviewedBy:actor.uid})
}
try{
 await auth.createUser({uid:actor.uid,email:actor.email,emailVerified:true,password:'test-only-password'})
 await users.doc(actor.uid).set(owner)
 const login=await fetch('http://'+process.env.FIREBASE_AUTH_EMULATOR_HOST+'/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=demo-key',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:actor.email,password:'test-only-password',returnSecureToken:true})})
 if(!login.ok)throw Error('Auth emulator login failed')
 const {idToken}=await login.json()
 const service=(authorization,command)=>executeNativeAdmin({db,auth,authorization,command,stamp:()=>FieldValue.serverTimestamp()})
 await check('missing bearer rejected',()=>assert.rejects(service('',{action:'activate',uid:'alice'}),/AUTH_REQUIRED/))
 await check('invalid Firebase token rejected',()=>assert.rejects(service('Bearer invalid',{action:'activate',uid:'alice'})))
 await users.doc('legacy').set({username:'LegacyUser',role:'manager',active:true,status:'approved'})
 await templates.doc('manager').set({role:'manager',permissions})
 await templates.doc('admin').set({role:'admin',permissions})
 await applicant('alice','alice')
 await applicant('bob','legacyuser')
 await applicant('carol','carol',false)
 await applicant('dave','alice')
 await check('non-owner cannot activate',()=>assert.rejects(run({action:'activate',uid:'alice'},{uid:'legacy',email:'legacy@example.test'}),/OWNER_REQUIRED/))
 await check('unverified email rejected',()=>assert.rejects(run({action:'activate',uid:'carol'}),/AUTH_IDENTITY_NOT_VERIFIED/))
 await check('case-insensitive legacy username collision rejected',()=>assert.rejects(run({action:'activate',uid:'bob'}),/DUPLICATE_USERNAME/))
 await check('approved identity activated atomically',async()=>{await service('Bearer '+idToken,{action:'activate',uid:'alice'});assert.equal((await users.doc('alice').get()).data().active,true);assert.equal((await requests.doc('alice').get()).data().status,'activated')})
 await check('duplicate activation rejected',()=>assert.rejects(run({action:'activate',uid:'alice'}),/INVALID_APPROVAL/))
 await check('new username collision rejected',()=>assert.rejects(run({action:'activate',uid:'dave'}),/DUPLICATE_USERNAME/))
 await check('Owner cannot be targeted',()=>assert.rejects(run({action:'setActive',uid:actor.uid,active:false}),/INVALID_TARGET/))
 await check('Owner role cannot be granted',()=>assert.rejects(run({action:'setRole',uid:'alice',role:'owner'}),/INVALID_ROLE/))
 await check('role changed with valid template',async()=>{await run({action:'setRole',uid:'alice',role:'admin'});assert.equal((await users.doc('alice').get()).data().role,'admin')})
 await check('deactivation reflected in profile',async()=>{await run({action:'setActive',uid:'alice',active:false});assert.equal((await users.doc('alice').get()).data().active,false)})
 await check('reactivation reflected in profile',async()=>{await run({action:'setActive',uid:'alice',active:true});assert.equal((await users.doc('alice').get()).data().active,true)})
 await check('invalid permission map denied',()=>assert.rejects(run({action:'setPermissions',role:'admin',permissions:{qc_records:'edit'}}),/INVALID_PERMISSIONS/))
 await check('manual permission map saved',async()=>{await run({action:'setPermissions',role:'admin',permissions:{...permissions,qc_records:'view'}});assert.equal((await templates.doc('admin').get()).data().permissions.qc_records,'view')})
 await check('only successful operations produce atomic audit rows',async()=>{const logs=await db.collection('qc_admin_audit').get();assert.equal(logs.size,5);assert.ok(logs.docs.every(d=>d.data().actorUid===actor.uid&&d.data().createdAt))})
 await users.doc(actor.uid).update({status:'APPROVED'})
 await users.doc('legacy').update({status:'APPROVED'})
 await applicant('eve','eve')
 await check('legacy uppercase Owner can activate new native applicant',async()=>{await service('Bearer '+idToken,{action:'activate',uid:'eve'});assert.equal((await users.doc('eve').get()).data().status,'approved')})
 await check('legacy approved target can change role without changing status',async()=>{await run({action:'setRole',uid:'legacy',role:'admin'});const p=(await users.doc('legacy').get()).data();assert.equal(p.role,'admin');assert.equal(p.status,'APPROVED')})
 await check('legacy approved target can deactivate and reactivate',async()=>{await run({action:'setActive',uid:'legacy',active:false});assert.equal((await users.doc('legacy').get()).data().active,false);await run({action:'setActive',uid:'legacy',active:true});const p=(await users.doc('legacy').get()).data();assert.equal(p.active,true);assert.equal(p.status,'APPROVED')})
 await check('uppercase pending target remains protected',async()=>{await users.doc('legacy').update({status:'PENDING',active:false});await assert.rejects(run({action:'setActive',uid:'legacy',active:true}),/TARGET_PROTECTED/)})
 await check('uppercase pending Owner cannot administer',async()=>{await users.doc(actor.uid).update({status:'PENDING'});await assert.rejects(run({action:'setActive',uid:'eve',active:false}),/OWNER_REQUIRED/);await users.doc(actor.uid).update({status:'APPROVED'})})
 await check('inactive uppercase Owner remains denied',async()=>{await users.doc(actor.uid).update({active:false});await assert.rejects(run({action:'setActive',uid:'eve',active:false}),/OWNER_REQUIRED/)})
 console.log('SUCCESS: '+n+' native administration checks passed (Auth + Firestore emulators only)')
}finally{await deleteApp(app)}
