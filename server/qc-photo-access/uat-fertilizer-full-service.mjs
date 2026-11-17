// Trusted in-process full DTO service, strictly demo emulator only.
// No SDK imports, hosted endpoint, storage, or production configuration.
import {createHash} from 'node:crypto'
import {prepareComponentFertilizer,componentActual} from '../../src/qcUatFertilizerMaterialIntegration.mjs'
import {operationalPermissions} from './uat-operational-permissions.mjs'
export const demoProject='demo-qc-uat-fertilizer-full'
export const demoHost='127.0.0.1'
export const firestorePort=9285,authPort=10099
function need(v,code){if(!v)throw Error(code)}
export function guardFullFertilizer(e=process.env){
 need(e.GCLOUD_PROJECT===demoProject,'DEMO_PROJECT_REQUIRED')
 need(e.FIRESTORE_EMULATOR_HOST===demoHost+':'+firestorePort,'FIRESTORE_LOOPBACK_REQUIRED')
 need(e.FIREBASE_AUTH_EMULATOR_HOST===demoHost+':'+authPort,'AUTH_LOOPBACK_REQUIRED')
 for(const k of ['GOOGLE_CLOUD_PROJECT','FIREBASE_PROJECT_ID'])if(e[k])need(e[k]===demoProject,'WRONG_PROJECT')
}
const sid=v=>typeof v==='string'&&/^uat-[a-z0-9-]{1,60}$/.test(v)
const qid=v=>typeof v==='string'&&/^qc-v2-uat-[a-z0-9-]{1,100}$/.test(v)
const plain=v=>v&&Object.getPrototypeOf(v)===Object.prototype
function canonical(v){
 if(v===null||typeof v==='string'||typeof v==='boolean')return JSON.stringify(v)
 if(typeof v==='number'){need(Number.isFinite(v),'INVALID_NUMBER');return JSON.stringify(v)}
 if(Array.isArray(v))return '['+v.map(canonical).join(',')+']'
 need(plain(v),'INVALID_CANONICAL_VALUE')
 return '{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+canonical(v[k])).join(',')+'}'
}
export function fullFertilizerFingerprint(record,baseRevision){
 return 'sha256-v1:'+createHash('sha256').update(canonical({record,baseRevision})).digest('hex')
}
const equal=(a,b)=>canonical(a)===canonical(b)
const workspace='qc_uat_workspaces/cutover'
const componentKeys=q=>q.fertilizerComponents.map(c=>[c.componentId,c.material,c.targetArea100,c.targetDoseKgHa])
export function createFullFertilizerService({db,verifyToken,buildActual}){
 guardFullFertilizer()
 const at=(col,id)=>db.doc(workspace+'/'+col+'/'+id)
 const actualFor=q=>{
  const a=componentActual(q,buildActual)
  return a?{...a,testOnly:true,ownerUid:q.ownerUid,clientRevision:q.clientRevision,operationalPayloadFingerprint:q.operationalPayloadFingerprint}:null
 }
 const auditFor=(q,baseRevision)=>({testOnly:true,recordId:q.id,revision:q.clientRevision,baseRevision,actorUid:q.ownerUid,formType:'fertilizer',saveType:q.saveType,operationalPayloadFingerprint:q.operationalPayloadFingerprint})
 return async function save(token,request){
  guardFullFertilizer()
  need(typeof token==='string'&&token.length>0,'AUTH_REQUIRED')
  let actor;try{actor=await verifyToken(token)}catch{throw Error('INVALID_TOKEN')}
  need(sid(actor?.uid)&&actor.qcUat===true,'UAT_IDENTITY_DENIED')
  need(plain(request)&&Object.keys(request).sort().join(',')==='baseRevision,record','INVALID_REQUEST')
  const {baseRevision}=request,r=structuredClone(request.record)
  need(baseRevision===null||sid(baseRevision),'INVALID_BASE_REVISION')
  need(plain(r)&&qid(r.id)&&sid(r.dailyPlanId)&&sid(r.clientRevision),'INVALID_RECORD_SCOPE')
  need(r.ownerUid===actor.uid&&r.inputtedBy===actor.uid,'OWNER_REQUIRED')
  return db.runTransaction(async tx=>{
   const qref=at('qc_records',r.id),aref=at('daily_reports','qcactual_'+r.id),uref=at('qc_operational_audit',r.id+':'+r.clientRevision)
   const [m,p,d,q,a,u,master]=await Promise.all([tx.get(db.doc('qc_uat_identities/'+actor.uid)),tx.get(db.doc('users/'+actor.uid)),tx.get(at('daily_plans',r.dailyPlanId)),tx.get(qref),tx.get(aref),tx.get(uref),tx.get(at('fertilizer_master','uat-products'))])
   const marker=m.data()
   const permissions=await operationalPermissions({tx,db,marker,productionProfile:p.exists})
   need(permissions.qc_fertilizer==='edit','FORM_EDIT_REQUIRED')
   need(d.exists,'SOURCE_DP_NOT_FOUND')
   need(['draft','ready'].includes(r.saveType),'FINALIZE_NOT_ENABLED')
   const catalog=master.data()
   need(catalog?.testOnly===true&&Array.isArray(catalog.products),'COMPONENT_MASTER_NOT_FOUND')
   const prepared=prepareComponentFertilizer(r,d.data(),catalog.products)
   // No cap against plannedDailyAreaHa: field over-actual is valid.
   const fingerprint=fullFertilizerFingerprint(r,baseRevision)
   const current=q.data()??null,oldActual=a.data()??null,oldAudit=u.data()??null
   if(current){
    need(current.testOnly===true&&current.ownerUid===actor.uid&&current.inputtedBy===actor.uid&&current.formType==='fertilizer','OWNER_REQUIRED')
    need(current.dailyPlanId===r.dailyPlanId&&current.monthlyPlanLineId===r.monthlyPlanLineId&&current.date===r.date&&current.createdAt===r.createdAt&&current.shift===r.shift&&current.name===r.name&&current.paddock===r.paddock&&current.activity===r.activity,'SOURCE_LINK_IMMUTABLE')
    need(current.areaSemantics==='APPLICATION_HA_ONLY'&&Array.isArray(current.fertilizerComponents),'LEGACY_COMPONENT_REVIEW_REQUIRED')
    need(equal(componentKeys(current),componentKeys(prepared)),'COMPONENT_SOURCE_CHANGED')
   }
   const next={...prepared,operationalPayloadFingerprint:fingerprint,operationalSaveId:fingerprint.slice(10),firestoreSaveState:'confirmed'}
   const actual=actualFor(next),audit=auditFor(next,baseRevision)
   if(current?.clientRevision===r.clientRevision){
    need(current.operationalPayloadFingerprint===fingerprint,'QC_REPLAY_PAYLOAD_CONFLICT')
    need(equal(current,next)&&equal(oldActual,actual)&&equal(oldAudit,audit),'QC_REPLAY_PAIR_MISMATCH')
    return {status:'confirmed',replayed:true,record:current}
   }
   need((current?.clientRevision??null)===baseRevision,'QC_REVISION_CONFLICT')
   need(!oldAudit,'AUDIT_REVISION_EXISTS')
   need(!current||current.saveType!=='ready'||r.saveType==='ready','QC_STATUS_REGRESSION')
   need(equal(oldActual,current?actualFor(current):null),'QC_ACTUAL_PAIR_MISMATCH')
   need(actual||!oldActual,'QC_ACTUAL_REMOVAL_REQUIRES_REVIEW')
   tx.set(qref,next)
   if(actual)tx.set(aref,actual)
   tx.create(uref,audit)
   return {status:'confirmed',replayed:false,record:next}
  })
 }
}
