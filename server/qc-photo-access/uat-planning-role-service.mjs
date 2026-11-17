// Dedicated synthetic Planning authorization lab. Never mount in production.
import {keys,roles} from '../../src/qcUatRolePermissions.mjs'
import {permissionsForIdentity} from '../../src/qcUatCustomRoles.mjs'
import {operationalPermissions} from './uat-operational-permissions.mjs'

export const projectId='demo-qc-uat-planning-role',host='127.0.0.1',firestorePort=9085,authPort=9899
const prefix='qc_uat_workspaces/cutover'
const sid=v=>typeof v==='string'&&/^uat-[a-z0-9-]{1,60}$/.test(v)
const scopes=Object.freeze({monthly:'data_plan_monthly',daily:'data_plan_daily',actual:'data_plan_actual',summary:'data_plan_summary'})
const collections=Object.freeze({monthly:'monthly_plans',daily:'daily_plans'})
const fail=code=>{throw Error(code)}
export function guard(e=process.env){
 if(e.GCLOUD_PROJECT!==projectId||e.FIRESTORE_EMULATOR_HOST!==host+':'+firestorePort||e.FIREBASE_AUTH_EMULATOR_HOST!==host+':'+authPort)fail('DEMO_EMULATORS_REQUIRED')
 for(const k of ['GOOGLE_CLOUD_PROJECT','FIREBASE_PROJECT_ID'])if(e[k]&&e[k]!==projectId)fail('WRONG_PROJECT')
}
export function planningMode(permissions,scope,operation){
 if(!Object.hasOwn(scopes,scope)||!['view','edit'].includes(operation))fail('INVALID_PLANNING_OPERATION')
 const mode=permissions?.[scopes[scope]]
 if(mode!=='edit'&&(operation!=='view'||mode!=='view'))fail('PLANNING_PERMISSION_DENIED')
 return mode
}
export function createPlanningService({adb,authAdmin}){
 guard()
 if(authAdmin.app.options.projectId!==projectId||adb.projectId!==projectId)fail('WRONG_PROJECT')
 async function authorize(raw,scope,operation,read){
  guard()
  if(typeof raw!=='string'||!raw||raw.length>16384)fail('INVALID_TOKEN')
  let token
  try{token=await authAdmin.verifyIdToken(raw,true)}catch{fail('INVALID_TOKEN')}
  if(!sid(token.uid)||token.qcUat!==true)fail('UAT_IDENTITY_DENIED')
  return adb.runTransaction(async tx=>{
   const [identity,prod]=await Promise.all([tx.get(adb.doc('qc_uat_identities/'+token.uid)),tx.get(adb.doc('users/'+token.uid))])
   const m=identity.data()
   const p=await operationalPermissions({tx,db:adb,marker:m,productionProfile:prod.exists})
   // This new gate uses the full Owner-managed marker contract for built-ins too.
   if(!Number.isSafeInteger(m.policyRevision)||m.policyRevision<0||m.policyRevision>=1000000)fail('UAT_IDENTITY_DENIED')
   if(roles.includes(m.role)){
    let expected
    try{expected=permissionsForIdentity(m)}catch{fail('UAT_IDENTITY_DENIED')}
    if(Object.keys(p).length!==keys.length||keys.some(k=>!Object.hasOwn(p,k)||p[k]!==expected[k]))fail('UAT_IDENTITY_DENIED')
   }
   const mode=planningMode(p,scope,operation)
   return read?read(tx):{scope,operation,mode}
  })
 }
 return Object.freeze({
  // Capability check only: does not authorize a particular payload or perform a write.
  check:(raw,scope,operation)=>authorize(raw,scope,operation),
  async readPlan(raw,scope,id){
   if(!Object.hasOwn(collections,scope)||!sid(id))fail('INVALID_PLANNING_PATH')
   return authorize(raw,scope,'view',async tx=>{
    const row=(await tx.get(adb.doc(prefix+'/'+collections[scope]+'/'+id))).data()
    if(!row)return null
    const area=scope==='monthly'?row.targetArea100:row.area100
    if(row.testOnly!==true||row.id!==id||!sid(row.pid)||!Number.isSafeInteger(area)||area<0||area>10000000)fail('INVALID_SYNTHETIC_PLAN')
    // Minimal safe projection. No raw document, QC records, photos or cross-domain fields.
    return {id,pid:row.pid,area100:area}
   })
  }
 })
}
