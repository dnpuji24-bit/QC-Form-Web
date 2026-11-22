// Stage 31 - focused security-rule regression against DEMO Firestore + Auth emulators.
// No production project, Hosting, Supabase, real users or historical QC is touched.
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {createRequire} from 'node:module'
import {initializeApp as initClientApp,deleteApp as deleteClientApp} from 'firebase/app'
import {initializeAuth,inMemoryPersistence,connectAuthEmulator,signInWithEmailAndPassword,signOut} from 'firebase/auth'
import {getFirestore,connectFirestoreEmulator,doc,getDoc,deleteDoc,setDoc,updateDoc} from 'firebase/firestore'

const mode=process.argv[2]
assert.ok(['--self-test','--emulator'].includes(mode) && process.argv.length===3,'ARCHIVE_RULES_MODE_REQUIRED')
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8')
const rules=read('firestore.rules')
const project='demo-qc-photo-test'
const config=JSON.parse(read('firebase.native-cutover-browser-emulator.json'))

assert.equal(config.firestore?.rules,'firestore.rules','RULES_MUST_BE_REPO_LOCAL')
assert.equal(config.emulators?.auth?.host,'127.0.0.1','AUTH_BIND_LOOPBACK')
assert.equal(config.emulators?.firestore?.host,'127.0.0.1','FIRESTORE_BIND_LOOPBACK')
assert.match(rules,/function archivedActual\(reportId, data\)/)
for(const [op,expected] of [
  ['create',/!archivedActual\(reportId, request\.resource\.data\)/],
  ['update',/!archivedActual\(reportId, resource\.data\) && !archivedActual\(reportId, request\.resource\.data\)/],
  ['delete',/!archivedActual\(reportId, resource\.data\)/]
]){
  const block=rules.slice(rules.indexOf('match /daily_reports/{reportId}'),rules.indexOf('match /actual_plan_import_logs'))
  assert.match(block,new RegExp('allow '+op+':[^;]*'+expected.source))
}
console.log('PASS: archive guards cover create, update (old + new), and delete (existing data)')
if(mode==='--self-test'){
  console.log('SUCCESS: focused archive rule source contract passed (OFFLINE, NO WRITES)')
  process.exit(0)
}
assert.equal(process.env.GCLOUD_PROJECT,project,'DEMO_PROJECT_REQUIRED')
assert.equal(process.env.FIRESTORE_EMULATOR_HOST,'127.0.0.1:8085','FIRESTORE_EMULATOR_REQUIRED')
assert.equal(process.env.FIREBASE_AUTH_EMULATOR_HOST,'127.0.0.1:9099','AUTH_EMULATOR_REQUIRED')
assert.equal(process.env.QC_UAT_MODE??'','','UNEXPECTED_UAT_MODE')
const require=createRequire(new URL('../server/qc-photo-access/package.json',import.meta.url))
const {initializeApp:initAdminApp,deleteApp:deleteAdminApp}=require('firebase-admin/app')
const {getAuth:getAdminAuth}=require('firebase-admin/auth')
const {getFirestore:getAdminFirestore}=require('firebase-admin/firestore')
const server=initAdminApp({projectId:project},'qc-actual-archive-demo')
const adb=getAdminFirestore(server),authAdmin=getAdminAuth(server)
const client=initClientApp({projectId:project,apiKey:'demo-only-key',authDomain:'localhost'},'qc-actual-archive-demo-client')
const auth=initializeAuth(client,{persistence:inMemoryPersistence})
connectAuthEmulator(auth,'http://127.0.0.1:9099',{disableWarnings:true})
const db=getFirestore(client)
connectFirestoreEmulator(db,'127.0.0.1',8085)
const uid='demo-archive-owner',email='archive-owner@example.test',password='Demo-Only-Archive-2026!'
const createReport=(id,data)=>adb.doc('daily_reports/'+id).set({sourceOrigin:'QC',inputtedBy:'demo-owner',...data})
const ref=id=>doc(db,'daily_reports',id)
let checks=0
async function check(name,fn){try{await fn();console.log('PASS: '+name);checks++}catch(error){throw Error('FAILED: '+name+' ('+String(error?.code||error?.message||error)+')',{cause:error})}}
async function mustDeny(operation){
  await assert.rejects(operation(),error=>error?.code==='permission-denied')
}
try{
  assert.equal((await authAdmin.listUsers(1)).users.length,0,'EMULATOR_MUST_START_EMPTY')
  assert.ok((await adb.collection('daily_reports').limit(1).get()).empty,'EMULATOR_REPORTS_NOT_EMPTY')
  await authAdmin.createUser({uid,email,password,emailVerified:true})
  await adb.doc('users/'+uid).set({active:true,status:'approved',role:'owner',username:'demo-owner',email,fullName:'Demo Owner'})
  await adb.doc('role_access/owner').set({role:'owner',permissions:{data_plan_actual:'edit',qc_records:'edit'}})
  await adb.doc('qc_archive_markers/qc-v2-archive-id').set({testOnly:true})
  await adb.doc('qc_archive_markers/qc-v2-archive-ref').set({testOnly:true})
  await adb.doc('qc_historical_correction_locks/qc-v2-history-locked').set({testOnly:true})
  await createReport('qcactual_qc-v2-archive-id',{qcRecordId:'qc-v2-archive-id'})
  await createReport('custom-actual-archive-ref',{qcRecordId:'qc-v2-archive-ref'})
  await createReport('custom-actual-unlocked',{qcRecordId:'qc-v2-unlocked'})
  await createReport('custom-actual-reassign',{qcRecordId:'qc-v2-archive-ref'})
  await createReport('qcactual_qc-v2-history-locked',{qcRecordId:'qc-v2-history-locked'})
  await signInWithEmailAndPassword(auth,email,password)
  await check('archived Actual remains readable to authorized Owner',async()=>{
    assert.equal((await getDoc(ref('qcactual_qc-v2-archive-id'))).exists(),true)
  })
  await check('archive marker derived from qcactual_ ID blocks delete',async()=>{
    await mustDeny(()=>deleteDoc(ref('qcactual_qc-v2-archive-id')))
  })
  await check('archive marker referenced by qcRecordId blocks delete',async()=>{
    await mustDeny(()=>deleteDoc(ref('custom-actual-archive-ref')))
  })
  await check('existing archived reference cannot be reassigned to bypass update lock',async()=>{
    await mustDeny(()=>updateDoc(ref('custom-actual-reassign'),{qcRecordId:'qc-v2-unlocked'}))
  })
  await check('new Actual pointing to archived QC cannot be created',async()=>{
    await mustDeny(()=>setDoc(ref('custom-actual-new'),{qcRecordId:'qc-v2-archive-ref',sourceOrigin:'MANUAL',inputtedBy:'demo-owner'}))
  })
  await check('historical-correction lock still blocks delete',async()=>{
    await mustDeny(()=>deleteDoc(ref('qcactual_qc-v2-history-locked')))
  })
  await check('regular unarchived Actual can still be deleted by Owner',async()=>{
    await deleteDoc(ref('custom-actual-unlocked'))
    assert.equal((await adb.doc('daily_reports/custom-actual-unlocked').get()).exists,false)
  })
  console.log('SUCCESS: '+checks+' isolated archive/legacy Actual rules checks passed (DEMO ONLY, NO PRODUCTION WRITES)')
}finally{
  try{await signOut(auth)}catch{}
  try{await deleteClientApp(client)}catch{}
  await deleteAdminApp(server)
}
