import {initializeApp,applicationDefault} from 'firebase-admin/app'
import {getAuth} from 'firebase-admin/auth'
import {getFirestore} from 'firebase-admin/firestore'
import {createClient} from '@supabase/supabase-js'
import {randomUUID} from 'node:crypto'
import {readFileSync} from 'node:fs'
const project='form-qc-unm', origin='https://form-qc-unm--react-test-ayyxz4hj.web.app'
const url='https://mcfwnstdfhhtcbksgrlj.supabase.co'
const apiKey=readFileSync('src/firebase.ts','utf8').match(/VITE_FIREBASE_API_KEY \|\| '([^']+)'/)?.[1]
if(!apiKey||!process.env.SUPABASE_SECRET_KEY?.startsWith('sb_secret_'))throw Error('Missing configuration')
if(process.env.GOOGLE_CLOUD_PROJECT!==project||process.env.FIRESTORE_EMULATOR_HOST)throw Error('Unexpected project/environment')
initializeApp({credential:applicationDefault(),projectId:project})
const db=getFirestore(),auth=getAuth()
const storage=createClient(url,process.env.SUPABASE_SECRET_KEY,{auth:{persistSession:false,autoRefreshToken:false}}).storage.from('qc-photos-test')
const credentials=[['ALLOW',process.env.TEST_ALLOW_EMAIL,process.env.TEST_ALLOW_PASSWORD],['DENY',process.env.TEST_DENY_EMAIL,process.env.TEST_DENY_PASSWORD]]
async function login([label,email,password]){
  const res=await fetch('https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key='+apiKey,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email,password,returnSecureToken:true})})
  if(!res.ok)throw Error(label+' Firebase login failed: '+res.status)
  const {idToken,localId}=await res.json()
  if(!idToken||!localId)throw Error(label+' no Firebase token')
  await auth.verifyIdToken(idToken,true)
  const p=(await db.doc('users/'+localId).get()).data()
  if(!p||p.active!==true)throw Error(label+' profile inactive or missing')
  const role=p.role==='owner'?null:(await db.doc('role_access/'+p.role).get()).data()
  const permission=p.role==='owner'?'edit':role?.permissions?.qc_records
  if(label==='ALLOW'?!['view','edit'].includes(permission):permission!=='none')throw Error(label+' Data QC permission does not match expected test')
  console.log(label+' Firebase login and current permission verified')
  return {uid:localId,idToken}
}
const a=await login(credentials[0]),b=await login(credentials[1])
if(a.uid===b.uid)throw Error('Use two different accounts')
const recordId='qc-photo-staging-'+randomUUID(),photoId=randomUUID(),revision=randomUUID()
const objectPath=b.uid+'/qc/'+recordId+'/'+photoId+'.png'
const record=db.doc('qc_photo_staging_records/'+recordId),meta=db.doc('qc_photo_staging_metadata/'+recordId+'/photos/'+photoId)
const bytes=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jR1sAAAAASUVORK5CYII=','base64')
let uploaded=false,created=false
try{
  const up=await storage.upload(objectPath,bytes,{contentType:'image/png',upsert:false})
  if(up.error)throw Error('Test upload failed')
  uploaded=true
  const batch=db.batch()
  batch.create(record,{formType:'spray',ownerUid:b.uid,clientRevision:revision,testOnly:true})
  batch.create(meta,{photoId,qcRecordId:recordId,ownerUid:b.uid,recordRevision:revision,provider:'supabase',bucket:'qc-photos-test',objectPath,kind:'main',contentType:'image/png',testOnly:true})
  await batch.commit();created=true
  async function request(token){return fetch(url+'/functions/v1/qc-photo-sign',{method:'POST',headers:{Origin:origin,Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({recordId,photoId})})}
  const allowed=await request(a.idToken)
  console.log('ALLOW HTTP '+allowed.status)
  if(allowed.status!==200)throw Error('Expected HTTP 200 for permitted user')
  const signed=await allowed.json()
  if(signed.expiresIn!==60||typeof signed.signedUrl!=='string'||new URL(signed.signedUrl).origin!==url)throw Error('Invalid signed response')
  const photo=await fetch(signed.signedUrl)
  if(!photo.ok||!Buffer.from(await photo.arrayBuffer()).equals(bytes))throw Error('Downloaded image mismatch')
  console.log('PASS: private image downloaded and bytes match')
  const denied=await request(b.idToken)
  console.log('DENY HTTP '+denied.status)
  if(denied.status!==403)throw Error('Expected HTTP 403 for denied user')
  console.log('PASS: account without Data QC access denied')
}finally{
  if(created){const batch=db.batch();batch.delete(meta);batch.delete(record);await batch.commit();console.log('Staging documents removed')}
  if(uploaded){const r=await storage.remove([objectPath]);if(r.error)throw Error('Staging object cleanup failed');console.log('Staging image removed')}
}
console.log('SUCCESS: live two-account access test passed; no operational QC records changed.')
