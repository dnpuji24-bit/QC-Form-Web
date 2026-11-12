import {readFileSync} from 'node:fs'
import {initializeTestEnvironment,assertSucceeds,assertFails} from '@firebase/rules-unit-testing'
import {doc,setDoc,getDoc,getDocs,collection,updateDoc,deleteDoc,serverTimestamp} from 'firebase/firestore'
const projectId='demo-qc-photo-test',host=process.env.FIRESTORE_EMULATOR_HOST||''
if(process.env.GCLOUD_PROJECT!==projectId||! /^(localhost|127\.0\.0\.1):\d+$/.test(host))throw Error('Local demo emulator only')
const [h,p]=host.split(':')
const env=await initializeTestEnvironment({projectId,firestore:{host:h,port:Number(p),rules:readFileSync('firestore.rules','utf8')}})
const db=(uid)=>env.authenticatedContext(uid,{email:uid+'@example.com'}).firestore()
const ref=(d,uid)=>doc(d,'firebase_registration_requests',uid)
const row=(uid)=>({username:uid,fullName:'Test User',email:uid+'@example.com',requestedRole:'pengunjung',status:'pending',createdAt:serverTimestamp(),source:'firebase_native'})
const review=(d,uid,by,role='manager')=>updateDoc(ref(d,uid),{status:'approved_for_provisioning',approvedRole:role,reviewedBy:by,reviewedAt:serverTimestamp()})
let n=0
async function check(label,p,deny=false){await(deny?assertFails(p):assertSucceeds(p));console.log('PASS: '+label);n++}
try{
 await env.withSecurityRulesDisabled(async c=>{for(const [uid,role,active,status] of [['owner1','owner',true,'approved'],['admin1','admin',true,'approved'],['inactive','owner',false,'approved'],['pendingowner','owner',true,'pending']])await setDoc(doc(c.firestore(),'users',uid),{role,active,status,username:uid})})
 const alice=db('alice'),owner=db('owner1'),bob=db('bob')
 await check('new authenticated account creates pending request',setDoc(ref(alice,'alice'),row('alice')))
 await check('applicant reads own request',getDoc(ref(alice,'alice')))
 await check('other applicant cannot read',getDoc(ref(bob,'alice')),true)
 await check('other applicant cannot list',getDocs(collection(bob,'firebase_registration_requests')),true)
 await check('forged UID denied',setDoc(ref(bob,'fake'),row('bob')),true)
 await check('forged email denied',setDoc(ref(bob,'bob'),{...row('bob'),email:'other@example.com'}),true)
 await check('requested Owner denied',setDoc(ref(bob,'bob'),{...row('bob'),requestedRole:'owner'}),true)
 await check('extra privilege field denied',setDoc(ref(bob,'bob'),{...row('bob'),active:true}),true)
 await check('applicant cannot self approve',review(alice,'alice','alice'),true)
 await check('applicant cannot create active profile',setDoc(doc(alice,'users','alice'),{role:'owner',active:true}),true)
 await check('pending account cannot access master data',getDocs(collection(alice,'master_materials')),true)
 await check('admin cannot review',review(db('admin1'),'alice','admin1'),true)
 await check('inactive Owner cannot review',review(db('inactive'),'alice','inactive'),true)
 await check('unapproved Owner cannot review',review(db('pendingowner'),'alice','pendingowner'),true)
 await check('Owner can list requests',getDocs(collection(owner,'firebase_registration_requests')))
 await check('Owner cannot grant Owner role',review(owner,'alice','owner1','owner'),true)
 await check('Owner approves for provisioning',review(owner,'alice','owner1'))
 await check('approved request still cannot access master data',getDocs(collection(alice,'master_materials')),true)
 await check('review cannot be overwritten',review(owner,'alice','owner1'),true)
 await check('request cannot be deleted',deleteDoc(ref(owner,'alice')),true)
 await check('second applicant registers',setDoc(ref(bob,'bob'),row('bob')))
 await check('Owner can reject',updateDoc(ref(owner,'bob'),{status:'rejected',approvedRole:'',reviewedBy:'owner1',reviewedAt:serverTimestamp()}))
 console.log('SUCCESS: '+n+' native registration rules checks passed (emulator only)')
}finally{await env.cleanup()}
