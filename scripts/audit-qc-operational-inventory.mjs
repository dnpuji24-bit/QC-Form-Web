// Aggregate-only inventory, not an import or source parity certificate.
import {createRequire} from 'node:module'
const PROJECT='form-qc-unm'
const groups={
 operational:['qc_records','monthly_plans','daily_plans','daily_reports','paddock_cycles'],
 master:['master_companies','master_paddocks','master_activities','master_materials','master_units','master_shifts','master_foremen','master_unit_numbers','master_activity_types','master_activity_categories','master_nozzles','master_nozzle_specs','master_droppers','master_assistants','master_water_qualities','master_weather_conditions'],
 identity:['users','role_access','user_access','registration_requests','firebase_registration_requests'],
 history:['qc_legacy_activity_logs','qc_operational_audit','qc_admin_audit','qc_native_name_requests','qc_native_name_pending','qc_archive_markers','qc_historical_correction_locks']
}
const requireAdmin=createRequire(new URL('../server/qc-photo-access/package.json',import.meta.url))
async function main(){
 if(process.argv.length!==3||process.argv[2]!=='--read-only-confirmed')throw Error('CONFIRMATION_REQUIRED')
 if(process.env.FIRESTORE_EMULATOR_HOST||process.env.FIREBASE_AUTH_EMULATOR_HOST)throw Error('EMULATOR_ENVIRONMENT')
 for(const k of ['GCLOUD_PROJECT','GOOGLE_CLOUD_PROJECT','FIREBASE_PROJECT_ID'])if(process.env[k]!==PROJECT)throw Error('PROJECT_CONFIRMATION_REQUIRED')
 const {initializeApp,applicationDefault,deleteApp}=requireAdmin('firebase-admin/app')
 const {getFirestore}=requireAdmin('firebase-admin/firestore')
 const app=initializeApp({projectId:PROJECT,credential:applicationDefault()})
 try{
  const db=getFirestore(app),inventory={}
  async function count(q){return (await q.count().get()).data().count}
  for(const [name,cols] of Object.entries(groups)){
   inventory[name]={}
   for(const col of cols)inventory[name][col]=await count(db.collection(col))
  }
  const qc=db.collection('qc_records')
  const bySaveType={}
  for(const type of ['draft','ready','uploaded'])bySaveType[type]=await count(qc.where('saveType','==',type))
  const byFormType={}
  for(const type of ['spray','fertilizer'])byFormType[type]=await count(qc.where('formType','==',type))
  console.log(JSON.stringify({project:PROJECT,mode:'read-only',inventory,qcBySaveType:bySaveType,qcByFormType:byFormType,writes:0,cutoverApproved:false,caveat:'Counts are a point-in-time inventory of queried collections, not proof of legacy parity, nested photo completeness, or runtime independence.'},null,2))
  console.log('SUCCESS: operational Firestore inventory completed; no imports or writes')
 }finally{await deleteApp(app)}
}
main().catch(e=>{const m=String(e?.message||'');console.error(/^[A-Z][A-Z0-9_]+$/.test(m)?m:'OPERATIONAL_INVENTORY_FAILED');process.exitCode=1})
