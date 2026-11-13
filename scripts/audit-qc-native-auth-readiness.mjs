// Read-only production audit; reports role aggregates, never identities or credentials.
import {createRequire} from 'node:module'
import {isApprovedFirebaseProfile,resolveFirebaseProfile} from '../src/qcFirebaseIdentity.mjs'
import {permissionKeys} from '../server/qc-photo-access/nativeAdminCore.mjs'
const PROJECT='form-qc-unm'
const roles=['owner','manager','admin','asisten','mandor_spraying','mandor_fertilizer','pengunjung']
const modes=['none','view','edit']
const requireAdmin=createRequire(new URL('../server/qc-photo-access/package.json',import.meta.url))
async function main(){
 if(process.argv.length!==3||process.argv[2]!=='--read-only-confirmed')throw Error('CONFIRMATION_REQUIRED')
 if(process.env.FIRESTORE_EMULATOR_HOST||process.env.FIREBASE_AUTH_EMULATOR_HOST)throw Error('EMULATOR_ENVIRONMENT')
 for(const k of ['GCLOUD_PROJECT','GOOGLE_CLOUD_PROJECT','FIREBASE_PROJECT_ID'])if(process.env[k]!==PROJECT)throw Error('PROJECT_CONFIRMATION_REQUIRED')
 const {initializeApp,applicationDefault,deleteApp}=requireAdmin('firebase-admin/app')
 const {getFirestore}=requireAdmin('firebase-admin/firestore')
 const {getAuth}=requireAdmin('firebase-admin/auth')
 const app=initializeApp({projectId:PROJECT,credential:applicationDefault()})
 try{
  const db=getFirestore(app),auth=getAuth(app)
  const [users,templates]=await Promise.all([db.collection('users').select('active','status','role','email','username','fullName','firebaseUid').get(),db.collection('role_access').select('role','permissions').get()])
  const byRole=new Map(templates.docs.map(d=>[d.id,d.data()]))
  const roleReport=Object.fromEntries(roles.map(role=>{
   const t=byRole.get(role),p=t?.permissions
   const templateStatus=!t?'missing':t.role!==role?'role_mismatch':!p||typeof p!=='object'||Array.isArray(p)?'invalid_map':'present'
   const missingKeys=permissionKeys.filter(k=>!p||!Object.hasOwn(p,k))
   const invalidKeys=permissionKeys.filter(k=>p&&Object.hasOwn(p,k)&&!modes.includes(p[k]))
   const effective=Object.fromEntries(permissionKeys.map(k=>[k,role==='owner'?'edit':templateStatus==='present'&&modes.includes(p[k])?p[k]:'none']))
   return [role,{profiles:0,approvedActive:0,identityReady:0,templateStatus,missingKeys,invalidKeys,permissions:effective}]
  }))
  const stats={profiles:users.size,approvedActive:0,identityReady:0,identityMissing:0,identityDisabled:0,identityMismatchOrInvalid:0,lookupErrors:0,unknownRole:0,approvedActiveWithoutCompleteTemplate:0,approvedActiveWithoutAnyAccess:0}
  for(const d of users.docs){
   const p=d.data(),r=Object.hasOwn(roleReport,p.role)?roleReport[p.role]:null
   if(r)r.profiles++
   if(!isApprovedFirebaseProfile(p))continue
   stats.approvedActive++
   if(!r){stats.unknownRole++;continue}
   r.approvedActive++
   if(p.role!=='owner'&&(r.templateStatus!=='present'||r.missingKeys.length||r.invalidKeys.length))stats.approvedActiveWithoutCompleteTemplate++
   if(Object.values(r.permissions).every(x=>x==='none'))stats.approvedActiveWithoutAnyAccess++
   let account
   try{account=await auth.getUser(d.id)}catch(e){if(e?.code==='auth/user-not-found')stats.identityMissing++;else stats.lookupErrors++;continue}
   if(account.disabled){stats.identityDisabled++;continue}
   try{resolveFirebaseProfile({uid:account.uid,email:account.email},p,byRole.get(p.role),permissionKeys);stats.identityReady++;r.identityReady++}catch{stats.identityMismatchOrInvalid++}
  }
  const blockers=[]
  if(!roleReport.owner.identityReady)blockers.push('NO_VERIFIED_ACTIVE_OWNER')
  if(stats.approvedActive!==stats.identityReady)blockers.push('ACTIVE_IDENTITY_REVIEW_REQUIRED')
  if(stats.approvedActiveWithoutCompleteTemplate)blockers.push('ROLE_TEMPLATE_REVIEW_REQUIRED')
  console.log(JSON.stringify({project:PROJECT,mode:'read-only',stats,roleReport,blockers,writes:0,cutoverApproved:false},null,2))
  console.log('SUCCESS: aggregate authentication readiness audit completed; no user or role changes')
  if(blockers.length)process.exitCode=2
 }finally{await deleteApp(app)}
}
main().catch(e=>{const m=String(e?.message||'');console.error(/^[A-Z][A-Z0-9_]+$/.test(m)?m:'AUTH_READINESS_AUDIT_FAILED');process.exitCode=1})
