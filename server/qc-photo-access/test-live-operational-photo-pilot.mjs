// Explicitly authorized live synthetic test. No writes to operational QC or Actual Plan.
import assert from 'node:assert/strict'
import {initializeApp,applicationDefault,deleteApp} from 'firebase-admin/app'
import {getAuth} from 'firebase-admin/auth'
import {getFirestore} from 'firebase-admin/firestore'
import {randomUUID} from 'node:crypto'
import {readFileSync} from 'node:fs'
import {prepareOperationalPhotoManifest} from '../../src/qcOperationalPhotoManifest.mjs'
const project='form-qc-unm',url='https://mcfwnstdfhhtcbksgrlj.supabase.co',origin='https://form-qc-unm--react-test-ayyxz4hj.web.app'
if(process.argv.slice(2).join(' ')!=='--synthetic-live-confirmed'||process.env.GOOGLE_CLOUD_PROJECT!==project||process.env.FIRESTORE_EMULATOR_HOST||process.env.FIREBASE_AUTH_EMULATOR_HOST)throw Error('LIVE_PILOT_CONFIRMATION_REQUIRED')
const apiKey=readFileSync(new URL('../../src/firebase.ts',import.meta.url),'utf8').match(/VITE_FIREBASE_API_KEY \|\| '([^']+)'/)?.[1]
if(!apiKey)throw Error('FIREBASE_CONFIG_MISSING')
const app=initializeApp({projectId:project,credential:applicationDefault()}),db=getFirestore(app),auth=getAuth(app)
const png='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jR1sAAAAASUVORK5CYII='
const bytes=Buffer.from(png,'base64')
const recordId='qc-live-photo-pilot-'+randomUUID(),revision=randomUUID()
const intent=db.doc('qc_photo_live_pilot_intents/'+recordId),record=db.doc('qc_photo_live_pilot_records/'+recordId)
let createdIntent=false,createdRecord=false
let n=0
const pass=label=>{n++;console.log('PASS: '+label)}
async function login(label,email,password){
 if(!email||!password)throw Error(label+'_CREDENTIALS_REQUIRED')
 const response=await fetch('https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key='+encodeURIComponent(apiKey),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email,password,returnSecureToken:true}),signal:AbortSignal.timeout(20000)})
 if(!response.ok)throw Error(label+'_LOGIN_HTTP_'+response.status)
 const data=await response.json(),actor=await auth.verifyIdToken(data.idToken,true)
 const p=(await db.doc('users/'+actor.uid).get()).data()
 if(!p||p.active!==true||!['approved','APPROVED'].includes(p.status)||String(p.email||'').trim().toLowerCase()!==String(actor.email||'').trim().toLowerCase())throw Error(label+'_PROFILE_INVALID')
 const template=p.role==='owner'?null:(await db.doc('role_access/'+p.role).get()).data()
 if(label==='OWNER'?p.role!=='owner':(p.role==='owner'||template?.role!==p.role||template?.permissions?.qc_records!=='none'))throw Error(label+'_PERMISSION_INVALID')
 pass(label+' real Firebase identity and current profile verified')
 return {uid:actor.uid,token:data.idToken}
}
async function call(name,token,data,expectedOrigin=origin){
 return fetch(url+'/functions/v1/qc-photo-live-pilot-'+name,{method:'POST',headers:{Origin:expectedOrigin,Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify(data),signal:AbortSignal.timeout(60000)})
}
function expectStatus(r,status,label){if(r.status!==status)throw Error(label+'_HTTP_'+r.status+'_EXPECTED_'+status)}
try{
 const owner=await login('OWNER',process.env.TEST_OWNER_EMAIL,process.env.TEST_OWNER_PASSWORD)
 const denied=await login('DENIED',process.env.TEST_DENY_EMAIL,process.env.TEST_DENY_PASSWORD)
 if(owner.uid===denied.uid)throw Error('DISTINCT_ACCOUNTS_REQUIRED')
 const base={ownerUid:owner.uid,formType:'fertilizer',clientRevision:revision,testOnly:true}
 const input={recordId,formType:'fertilizer',baseRevision:null,clientRevision:revision,kind:'main',contentType:'image/png',base64:png}
 expectStatus(await call('upload','invalid',input),401,'INVALID_TOKEN');pass('hosted upload rejects invalid Firebase token')
 expectStatus(await call('upload',owner.token,input,'https://wrong.example.test'),403,'WRONG_ORIGIN');pass('hosted upload rejects wrong origin')
 expectStatus(await call('upload',owner.token,{...input,recordId:'qc-v2-forbidden-probe'}),403,'OPERATIONAL_SCOPE');pass('pilot rejects operational namespace')
 expectStatus(await call('upload',owner.token,input),409,'MISSING_INTENT');pass('upload requires isolated reservation')
 await intent.create(base);createdIntent=true
 expectStatus(await call('upload',denied.token,input),403,'OTHER_OWNER');pass('another account cannot upload to Owner reservation')
 const changes=[{kind:'main'},{kind:'hold',holdId:'hold-pilot'},{kind:'scan'}].map(x=>({...x,action:'replace',dataUrl:'data:image/png;base64,'+png}))
 const prepared=await prepareOperationalPhotoManifest({recordId,uploaderUid:owner.uid,changes})
 const manifest={}
 for(const {slot,reference} of prepared.uploads){
  const ref={...reference,bucket:'qc-photos-test'}
  const payload={...input,kind:ref.kind,...(ref.holdId?{holdId:ref.holdId}:{})}
  const res=await call('upload',owner.token,payload);expectStatus(res,200,'UPLOAD_'+slot)
  const result=await res.json()
  for(const key of ['photoId','objectPath','sha256','size','bucket'])assert.equal(result[key],ref[key])
  manifest[slot]=ref;pass(slot+' real upload matches hash, size and path')
  if(slot==='main'){
   const retry=await call('upload',owner.token,payload);expectStatus(retry,200,'RETRY')
   assert.deepEqual(await retry.json(),result);pass('immutable upload retry returns identical reference')
  }
 }
 const main={recordId,photoId:manifest.main.photoId}
 expectStatus(await call('sign',owner.token,main),403,'UNCONFIRMED');pass('unconfirmed pilot record cannot sign')
 await record.create({...base,firestoreSaveState:'confirmed',operationalPhotoManifest:manifest});createdRecord=true
 const stored=(await record.get()).data()
 assert.deepEqual(stored.operationalPhotoManifest,manifest);pass('Firestore pilot manifest matches all three uploaded references')
 for(const [slot,ref] of Object.entries(manifest)){
  const response=await call('sign',owner.token,{recordId,photoId:ref.photoId});expectStatus(response,200,'SIGN_'+slot)
  const signed=await response.json()
  const signedUrl=new URL(signed.signedUrl)
  assert.equal(signedUrl.origin,url);assert.equal(signed.expiresIn,60)
  assert.ok(signedUrl.pathname.startsWith('/storage/v1/object/sign/qc-photos-test/'))
  const download=await fetch(signedUrl,{signal:AbortSignal.timeout(20000)});assert.equal(download.status,200)
  assert.ok(Buffer.from(await download.arrayBuffer()).equals(bytes));pass(slot+' signed URL downloads exact original bytes')
 }
 expectStatus(await call('sign',denied.token,main),403,'NO_PERMISSION');pass('account without Data QC access cannot sign')
 expectStatus(await call('sign',owner.token,{...main,objectPath:'forged'}),400,'CLIENT_PATH');pass('client-supplied path denied')
 console.log('SUCCESS: '+n+' live pilot checks passed; operational records untouched')
}finally{
 try{
  if(createdRecord)await record.delete()
  if(createdIntent)await intent.delete()
  console.log('Pilot Firestore fixtures removed if created')
  console.log('Pilot storage cleanup reference (test bucket only): '+recordId)
  console.log('Up to three 68-byte synthetic objects may remain; remove only this exact test prefix after review.')
 }finally{await deleteApp(app)}
}
