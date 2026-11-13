// Real HTTP -> Firebase Auth emulator -> Firestore transaction integration.
import assert from 'node:assert/strict'
import {createServer} from 'node:http'
import {initializeApp,deleteApp} from 'firebase-admin/app'
import {getFirestore,FieldValue} from 'firebase-admin/firestore'
import {getAuth} from 'firebase-admin/auth'
import {createNativeAdminHandler} from './nativeAdminHttp.mjs'
import {permissionKeys} from './nativeAdminCore.mjs'
const projectId='demo-qc-photo-test'
const local=v=>/^(localhost|127\.0\.0\.1):\d+$/.test(v||'')
if(process.env.GCLOUD_PROJECT!==projectId||!local(process.env.FIRESTORE_EMULATOR_HOST)||!local(process.env.FIREBASE_AUTH_EMULATOR_HOST))throw Error('Both local demo emulators required')
const app=initializeApp({projectId}),db=getFirestore(app),auth=getAuth(app),origin='http://localhost:5173'
const server=createServer(createNativeAdminHandler({db,auth,stamp:()=>FieldValue.serverTimestamp(),allowedOrigin:origin}))
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve))
const url='http://127.0.0.1:'+server.address().port
const permissions=Object.fromEntries(permissionKeys.map(k=>[k,'none']))
const users=db.collection('users'),requests=db.collection('firebase_registration_requests')
let n=0
async function identity(uid,role){
 const email=uid+'@example.test',password='demo-only-password'
 await auth.createUser({uid,email,password,emailVerified:true})
 if(role)await users.doc(uid).set({username:uid,fullName:uid,email,role,status:'approved',active:true})
 const r=await fetch('http://'+process.env.FIREBASE_AUTH_EMULATOR_HOST+'/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=demo-key',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email,password,returnSecureToken:true})})
 assert.equal(r.status,200)
 return {email,token:(await r.json()).idToken}
}
async function check(label,fn){await fn();n++;console.log('PASS: '+label)}
async function call(token,command,status){
 const r=await fetch(url,{method:'POST',headers:{Origin:origin,'Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify(command)})
 assert.equal(r.status,status)
 return r.json()
}
try{
 const owner=await identity('httpowner','owner'),manager=await identity('httpmanager','manager'),applicant=await identity('httpapplicant',null)
 await db.collection('role_access').doc('manager').set({role:'manager',permissions})
 await requests.doc('httpapplicant').set({username:'httpapplicant',fullName:'Demo Applicant',email:applicant.email,status:'approved_for_provisioning',approvedRole:'manager',reviewedBy:'httpowner'})
 await check('non-owner HTTP activation denied',async()=>{await call(manager.token,{action:'activate',uid:'httpapplicant'},403);assert.equal((await users.doc('httpapplicant').get()).exists,false)})
 await check('Owner HTTP activation commits profile and request',async()=>{const r=await call(owner.token,{action:'activate',uid:'httpapplicant'},200);assert.equal(r.ok,true);assert.equal((await users.doc('httpapplicant').get()).data().active,true);assert.equal((await requests.doc('httpapplicant').get()).data().status,'activated')})
 await check('duplicate activation denied',()=>call(owner.token,{action:'activate',uid:'httpapplicant'},409))
 await check('Owner HTTP permission update commits',async()=>{await call(owner.token,{action:'setPermissions',role:'manager',permissions:{...permissions,qc_records:'view'}},200);assert.equal((await db.collection('role_access').doc('manager').get()).data().permissions.qc_records,'view')})
 await check('Owner HTTP deactivation commits',async()=>{await call(owner.token,{action:'setActive',uid:'httpapplicant',active:false},200);assert.equal((await users.doc('httpapplicant').get()).data().active,false)})
 await check('inactive Owner denied with existing token',async()=>{await users.doc('httpowner').update({active:false});await call(owner.token,{action:'setActive',uid:'httpapplicant',active:true},403);assert.equal((await users.doc('httpapplicant').get()).data().active,false)})
 await check('audit rows only for committed changes',async()=>{const rows=await db.collection('qc_admin_audit').where('actorUid','==','httpowner').get();assert.equal(rows.size,3)})
 await check('legacy uppercase Owner can use verified HTTP session',async()=>{await users.doc('httpowner').update({active:true,status:'APPROVED'});await call(owner.token,{action:'setActive',uid:'httpapplicant',active:true},200);assert.equal((await users.doc('httpapplicant').get()).data().active,true)})
 await check('legacy uppercase pending Owner denied over HTTP',async()=>{await users.doc('httpowner').update({status:'PENDING'});await call(owner.token,{action:'setActive',uid:'httpapplicant',active:false},403);assert.equal((await users.doc('httpapplicant').get()).data().active,true)})
 console.log('SUCCESS: '+n+' live local HTTP administration checks passed (Auth + Firestore emulators only)')
}finally{await new Promise(resolve=>server.close(resolve));await deleteApp(app)}
