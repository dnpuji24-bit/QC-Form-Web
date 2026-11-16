// All I/O dependencies for the real form are redirected here at bundle time.
// No cloud SDK, token, fetch, or production adapter is imported.
import {enqueueOperationalBatch,listOperationalJobs} from '../src/qcOperationalQueue.mjs'
export const fixtureUid='uat-spray'
export const fixtureDate='2026-11-12'
export const firebaseAuth={currentUser:{uid:fixtureUid}}
export const firestoreDb={fixture:true}
export const operationalSaveEnabled=true
export const qcFormPhotoStagingEnabled=false
export const testFormPhotos=async()=>{throw Error('STAGING_DISABLED')}
export const flushQueue=async()=>({sent:0,left:0,failures:[]})
export const saveDraftFirestoreFirst=async()=>{throw Error('LEGACY_WRITE_DISABLED')}
export const sendOrQueue=async()=>{throw Error('LEGACY_WRITE_DISABLED')}
const factory={open(name,version){
 if(name!=='qc_operational_queue_v1'||version!==1)throw Error('QUEUE_SCOPE')
 return indexedDB.open('qc_uat_spray_form_capture_v1',version)
}}
export async function queueOperationalSession(items){
 return enqueueOperationalBatch(items.map(({record,intent})=>{
  if(record.formType!=='spray'||record.ownerUid!==fixtureUid||!record.id.startsWith('qc-v2-'))throw Error('FIXTURE_RECORD_SCOPE')
  return {scope:'uat-form-capture',uploaderUid:fixtureUid,record,baseRevision:intent.baseRevision,changes:intent.changes,action:'syncRecord'}
 }),factory)
}
export const queueOperationalQc=async()=>{throw Error('NOT_TESTED')}
export const operationalQueuedRecords=()=>listOperationalJobs(fixtureUid,factory)
const dp=(id,shift,pid,foreman,order,overrides={})=>({dailyPlanId:id,monthlyPlanLineId:'MP-'+id,companyCode:'UAT',farm:'Farm UAT',date:fixtureDate,shift,foreman,pid,activity:'Post Emergence',description:'Post A',type:'SPRAY',activityCategory:'Spray',masterVariety:'UAT-V1',areaHa:20,sourceType:'monthly',unitName:'Boom Sprayer',planningOrder:order,materials:[{material:'Synthetic A',dosePerHa:2,doseUnit:'L',unit:'L',totalMaterial:40},{material:'Synthetic B',dosePerHa:.5,doseUnit:'kg',unit:'kg',totalMaterial:10}],...overrides})
export const plans=[
 dp('DP-1','Shift 1','A-001','Mandor A',1),
 dp('DP-2','Shift II','B-002','Mandor B',2),
 dp('DP-C1','1','C-003','Mandor A',3),
 dp('DP-C2','2','C-003','Mandor B',4),
 dp('DP-F','2','F-004','Mandor B',5,{activity:'Top Dressing',type:'FERTILIZER',activityCategory:'Fertilizer'}),
 dp('DP-OLD','2','OLD-001','Mandor B',6,{date:'2026-11-11'})
]
const resources={master_units:[{id:'boom',name:'Boom Sprayer'}],master_unit_numbers:[{id:'u1',name:'SP001',parentUnitId:'boom'},{id:'u2',name:'SP002',parentUnitId:'boom'},{id:'u3',name:'SP003',parentUnitId:'boom'}],master_shifts:[{id:'s1',name:'1'},{id:'s2',name:'2'}],master_foremen:[{id:'m1',name:'Mandor A'},{id:'m2',name:'Mandor B'}],master_assistants:[{id:'a1',name:'Asisten A'}],master_nozzles:[{id:'n1',name:'TeeJet'}],master_droppers:[{id:'d1',name:'No'}],master_water_qualities:[{id:'w1',name:'Clean'}],master_weather_conditions:[{id:'c1',name:'Sunny'}]}
export function collection(db,name){if(db!==firestoreDb||!(name==='daily_plans'||Object.hasOwn(resources,name)))throw Error('FIXTURE_COLLECTION_DENIED');return {name}}
export function where(field,op,value){if(field!=='date'||op!=='==')throw Error('FIXTURE_QUERY_DENIED');return {field,value}}
export function query(col,filter){return {...col,filter}}
export async function getDocs(q){
 const rows=q.name==='daily_plans'?plans.filter(p=>p.date===q.filter?.value):resources[q.name]
 if(!rows)throw Error('FIXTURE_COLLECTION_DENIED')
 return {docs:rows.map(row=>({id:row.id??row.dailyPlanId,data:()=>structuredClone(row)}))}
}
export const getDocsFromServer=getDocs
