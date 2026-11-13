// Candidate release regression. Demo Firestore emulator only. No credentials or live project.
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {createHash} from 'node:crypto'
import {initializeTestEnvironment,assertFails,assertSucceeds} from '@firebase/rules-unit-testing'
import {doc,collection,getDoc,getDocs,setDoc,updateDoc,deleteDoc,writeBatch,serverTimestamp} from 'firebase/firestore'
const projectId='demo-qc-photo-test',host=process.env.FIRESTORE_EMULATOR_HOST||''
if(process.env.GCLOUD_PROJECT!==projectId||!/^127\.0\.0\.1:\d{1,5}$/.test(host))throw Error('DEMO_LOOPBACK_REQUIRED')
const baseline=readFileSync(new URL('./firestore.legacy-audit-release.rules',import.meta.url),'utf8')
const candidate=readFileSync(new URL('./firestore.native-admin-pilot-release.rules',import.meta.url),'utf8')
const hash=s=>createHash('sha256').update(s.replace(/\r\n/g,'\n').trimEnd()).digest('hex')
assert.equal(hash(baseline),'1969b01dc886befc8fa65982c5a57fcbf464581a73a1e4916e1485f8922e8e5c')
const start='    // Isolated native-admin atomic pair pilot.',end='    match /{document=**} {'
assert.equal(candidate.split(start).length,2)
const i=candidate.indexOf(start),j=candidate.indexOf(end,i)
assert.ok(i>=0&&j>i)
assert.equal(candidate.slice(0,i)+candidate.slice(j),baseline)
console.log('PASS: exact deployed baseline retained outside isolated pilot addition')
const [h,p]=host.split(':')
const env=await initializeTestEnvironment({projectId,firestore:{host:h,port:Number(p),rules:candidate}})
const state='qc_admin_live_pilot_state',audit='qc_admin_live_pilot_audit'
const run='a'.repeat(32),other='b'.repeat(32)
const db=uid=>uid?env.authenticatedContext(uid).firestore():env.unauthenticatedContext().firestore()
const ref=(client,c,uid)=>doc(client,c,uid)
const data=(uid,kind,extra={})=>({ownerUid:uid,runId:run,kind,testOnly:true,createdAt:serverTimestamp(),...extra})
function pair(client,uid,stateExtra={},auditExtra={}){
 const batch=writeBatch(client)
 batch.set(ref(client,state,uid),data(uid,'state',stateExtra))
 batch.set(ref(client,audit,uid),data(uid,'audit',auditExtra))
 return batch.commit()
}
let n=1
async function check(label,fn){await fn();n++;console.log('PASS: '+label)}
async function absent(uid){await env.withSecurityRulesDisabled(async ctx=>{for(const c of [state,audit])assert.equal((await getDoc(ref(ctx.firestore(),c,uid))).exists(),false)})}
try{
 await env.clearFirestore()
 await env.withSecurityRulesDisabled(async ctx=>{
  const admin=ctx.firestore()
  for(const [uid,role,active,status] of [['owner1','owner',true,'APPROVED'],['owner2','owner',true,'approved'],['pending','owner',true,'PENDING'],['inactive','owner',false,'APPROVED'],['mixed','owner',true,'Approved'],['viewer','manager',true,'APPROVED'],['mandor','mandor_spraying',true,'APPROVED']]){
   await setDoc(doc(admin,'users',uid),{role,active,status,username:uid})
  }
  await setDoc(doc(admin,'role_access','manager'),{role:'manager',permissions:{qc_records:'view',qc_logs:'view'}})
  await setDoc(doc(admin,'role_access','mandor_spraying'),{role:'mandor_spraying',permissions:{qc_spraying:'edit'}})
  await setDoc(doc(admin,'qc_legacy_activity_logs','log1'),{Description:'synthetic'})
  await setDoc(doc(admin,'qc_records','old1'),{formType:'spray',inputtedBy:'mandor'})
 })
 const owner=db('owner1'),second=db('owner2')
 await check('anonymous and non-Owner cannot create pilot pair',async()=>{await assertFails(pair(db(), 'owner1'));await assertFails(pair(db('viewer'),'viewer'));await absent('viewer')})
 await check('pending, inactive, mixed-case and missing profiles denied',async()=>{for(const uid of ['pending','inactive','mixed','missing']){await assertFails(pair(db(uid),uid));await absent(uid)}})
 await check('Owner cannot target another Owner',async()=>{await assertFails(pair(owner,'owner2'));await absent('owner2')})
 await check('state alone denied',async()=>{await assertFails(setDoc(ref(owner,state,'owner1'),data('owner1','state')));await absent('owner1')})
 await check('audit alone denied',async()=>{await assertFails(setDoc(ref(owner,audit,'owner1'),data('owner1','audit')));await absent('owner1')})
 await check('mismatched run IDs denied atomically',async()=>{await assertFails(pair(owner,'owner1',{}, {runId:other}));await absent('owner1')})
 await check('non-synthetic data and unexpected fields denied',async()=>{await assertFails(pair(owner,'owner1',{testOnly:false}));await assertFails(pair(owner,'owner1',{}, {extra:'no'}));await absent('owner1')})
 await check('forged UID, kind and invalid run ID denied',async()=>{await assertFails(pair(owner,'owner1',{ownerUid:'owner2'}));await assertFails(pair(owner,'owner1',{}, {kind:'state'}));await assertFails(pair(owner,'owner1',{runId:'bad'},{runId:'bad'}));await absent('owner1')})
 await check('client timestamp rejected',async()=>{await assertFails(pair(owner,'owner1',{createdAt:new Date(0)}));await absent('owner1')})
 await check('approved uppercase Owner creates both documents atomically',async()=>{await assertSucceeds(pair(owner,'owner1'));for(const c of [state,audit]){const s=await getDoc(ref(owner,c,'owner1'));assert.equal(s.data().runId,run);assert.equal(s.data().ownerUid,'owner1');assert.ok(s.data().createdAt)}})
 await check('approved lowercase Owner can create own isolated pair',()=>assertSucceeds(pair(second,'owner2')))
 await check('other Owner, viewer and anonymous cannot read pair',async()=>{for(const client of [second,db('viewer'),db()])for(const c of [state,audit])await assertFails(getDoc(ref(client,c,'owner1')))})
 await check('collection listing denied even for Owner',async()=>{for(const c of [state,audit])await assertFails(getDocs(collection(owner,c)))})
 await check('same and different run cannot overwrite immutable pair',async()=>{await assertFails(pair(owner,'owner1'));await assertFails(pair(owner,'owner1',{runId:other},{runId:other}));assert.equal((await getDoc(ref(owner,state,'owner1'))).data().runId,run)})
 await check('direct update and delete denied for both documents',async()=>{for(const c of [state,audit]){await assertFails(updateDoc(ref(owner,c,'owner1'),{runId:other}));await assertFails(deleteDoc(ref(owner,c,'owner1')))}})
 await check('existing single counterpart cannot be repaired by client',async()=>{await env.withSecurityRulesDisabled(async ctx=>{await deleteDoc(ref(ctx.firestore(),audit,'owner2'))});await assertFails(setDoc(ref(second,audit,'owner2'),data('owner2','audit')));assert.equal((await getDoc(ref(second,audit,'owner2'))).exists(),false)})
 await check('legacy log remains readable but immutable; existing QC access retained',async()=>{const viewer=db('viewer');await assertSucceeds(getDoc(doc(viewer,'qc_legacy_activity_logs','log1')));await assertFails(updateDoc(doc(owner,'qc_legacy_activity_logs','log1'),{Description:'changed'}));await assertSucceeds(getDoc(doc(viewer,'qc_records','old1')));await assertSucceeds(setDoc(doc(db('mandor'),'qc_records','new1'),{formType:'spray',inputtedBy:'mandor'}))})
 await check('pilot does not enable user profile writes or native name requests',async()=>{await assertFails(updateDoc(doc(owner,'users','owner1'),{role:'manager'}));await assertFails(setDoc(doc(owner,'qc_native_name_requests','fake'),{status:'pending'}))})
 console.log('SUCCESS: '+n+' isolated native admin pilot rules checks passed (demo emulator only)')
}finally{await env.cleanup()}
