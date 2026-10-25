import { collection, deleteDoc, doc, limit, onSnapshot, orderBy, query, serverTimestamp, setDoc } from 'firebase/firestore'
import { firebaseAuth, firebaseConfigured, firestoreDb, firestoreFeatureEnabled } from './firebase'
import { hydrateReportPhotoPreviews, makeReportPhotoPreview } from './reportPhoto'
import type { QcRecord, User } from './types'

export type FirestoreMode = 'disabled'|'configured'|'active'

export function getFirestoreMode(): FirestoreMode {
  if (!firebaseConfigured) return 'disabled'
  return firebaseAuth?.currentUser || firestoreFeatureEnabled ? 'active' : 'configured'
}

function requireDb(){
  if(!firestoreDb) throw new Error('Firebase belum dikonfigurasi.')
  return firestoreDb
}

async function attachReportPhotoPreviews(record:QcRecord):Promise<void>{
  const fullMain=String(record.photoBase64||'')
  const mainDrive=String(record.photoDriveUrl||'')
  if(fullMain.startsWith('data:image/')){
    const preview=await makeReportPhotoPreview(fullMain)
    if(preview)record.photoPreviewBase64=preview
  }else if(!mainDrive){
    record.photoPreviewBase64=''
  }

  if(Array.isArray(record.holdIntervals)){
    await Promise.all(record.holdIntervals.map(async hold=>{
      const full=String(hold.photoBase64||'')
      const drive=String(hold.photoDriveUrl||'')
      if(full.startsWith('data:image/')){
        const preview=await makeReportPhotoPreview(full)
        if(preview)hold.photoPreviewBase64=preview
      }else if(!drive){
        hold.photoPreviewBase64=''
      }
    }))
  }
}

async function stripLargePayload(record:QcRecord):Promise<QcRecord>{
  // Mutate the transport record intentionally: Apps Script mirrors the same record
  // back to Firestore after saving to Spreadsheet/Drive. Keeping the lightweight
  // preview fields on that record prevents the server mirror from replacing them.
  await attachReportPhotoPreviews(record)
  const clean = JSON.parse(JSON.stringify(record)) as QcRecord
  clean.photoBase64=''
  if(Array.isArray(clean.holdIntervals)){
    clean.holdIntervals=clean.holdIntervals.map(hold=>({...hold,photoBase64:''}))
  }
  return clean
}

function qcActualArea(record:QcRecord){const value=Number(record.actualAreaHa??record.area??record.resultArea??0);return Number.isFinite(value)?value:0}
function qcActualEligible(record:QcRecord){
  const saveType=String(record.saveType||'').toLowerCase(),uploadState=String(record.uploadState||'').toLowerCase()
  return Boolean(record.dailyPlanId)&&qcActualArea(record)>0&&(saveType==='ready'||saveType==='uploaded'||saveType==='upload_queued'||uploadState==='queued'||uploadState==='uploading'||uploadState==='uploaded'||uploadState==='failed')
}
function qcActualReportId(recordId:string){return 'qcactual_'+recordId}
function qcActualMaterials(record:QcRecord){return Array.isArray(record.actualPlanMaterials)?record.actualPlanMaterials:[]}
export async function mirrorQcActualToFirestore(record:QcRecord,user?:User):Promise<boolean>{
  if(!firestoreDb||!firebaseAuth?.currentUser||!qcActualEligible(record))return false
  const db=requireDb(),actualAreaHa=qcActualArea(record),plannedDailyAreaHa=Number(record.plannedDailyAreaHa||0)||0,actualReportId=qcActualReportId(record.id)
  await setDoc(doc(db,'daily_reports',actualReportId),{
    actualReportId,
    workGroupId:'QCA-'+record.id,
    planningOrder:Number(record.dailyPlanningOrder||0)||999999,
    dailySourcePlanIdRaw:String(record.dailyPlanId||''),
    sourceType:String(record.dailyPlanSourceType||'QC'),
    dailyPlanId:String(record.dailyPlanId||''),
    dailyLinkStatus:'LINKED',
    monthlyPlanLineId:String(record.monthlyPlanLineId||''),
    monthlyLinkStatus:record.monthlyPlanLineId?'LINKED':'NOT_APPLICABLE',
    date:String(record.date||''),
    year:Number(String(record.date||'').slice(0,4))||0,
    monthKey:String(record.date||'').slice(0,7),
    shift:String(record.shift||''),
    activity:String(record.activity||record.deskripsi||''),
    description:String(record.deskripsi||record.activity||''),
    paddockRaw:String(record.paddock||''),
    pid:String(record.paddock||''),
    actualAreaHa,
    areaUnit:'Ha',
    manpower:0,
    unitName:String(record.unit||''),
    unitReady:record.unit||record.noUnit?1:0,
    unitStandby:0,
    unitBreakdown:0,
    foreman:String(record.name||record.inputtedBy||''),
    notes:['AUTO QC',String(record.formType||'').toUpperCase(),String(record.noted||record.catatan||'')].filter(Boolean).join(' · '),
    materials:qcActualMaterials(record),
    plannedDailyAreaHa,
    dailyVarianceHa:plannedDailyAreaHa-actualAreaHa,
    companyCode:String(record.companyCode||''),
    farm:String(record.farm||''),
    masterPending:false,
    sourceOrigin:'QC',
    lastModifiedSource:'QC_FORM',
    qcRecordId:record.id,
    qcFormType:record.formType,
    qcSessionId:String(record.sessionId||''),
    inputtedBy:user?.username||String(record.inputtedBy||''),
    createdAt:String(record.createdAt||new Date().toISOString()),
    updatedAt:serverTimestamp(),
    updatedBy:user?.username||String(record.inputtedBy||firebaseAuth.currentUser.email||'firebase-user'),
  },{merge:true})
  return true
}

export async function mirrorRecordToFirestore(record:QcRecord,user?:User):Promise<boolean>{
  if(!firestoreDb||!firebaseAuth?.currentUser) return false
  const db=requireDb(),payload=await stripLargePayload(record)
  await setDoc(doc(db,'qc_records',record.id),{
    ...payload,
    updatedBy:user?.username||String(record.inputtedBy||firebaseAuth.currentUser.email||'firebase-user'),
    updatedAt:serverTimestamp(),
  },{merge:true})
  try{await mirrorQcActualToFirestore(record,user)}catch(error){console.info('QC tersimpan, tetapi bridge ke Actual akan dicoba lagi pada sinkronisasi berikutnya.',error)}
  return true
}

export async function removeQcActualFromFirestore(recordId:string):Promise<boolean>{
  if(!firestoreDb||!firebaseAuth?.currentUser)return false
  await deleteDoc(doc(requireDb(),'daily_reports',qcActualReportId(recordId)))
  return true
}

export async function removeRecordFromFirestore(recordId:string):Promise<boolean>{
  if(!firestoreDb||!firebaseAuth?.currentUser) return false
  await removeQcActualFromFirestore(recordId).catch(()=>false)
  await deleteDoc(doc(requireDb(),'qc_records',recordId))
  return true
}

export function subscribeQcRecords(onRecords:(records:QcRecord[])=>void,onError?:(error:Error)=>void){
  if(!firestoreDb||!firebaseAuth?.currentUser) return ()=>{}
  const q=query(collection(firestoreDb,'qc_records'),orderBy('updatedAt','desc'),limit(1000))
  return onSnapshot(q,snapshot=>{
    onRecords(snapshot.docs.map(item=>hydrateReportPhotoPreviews({id:item.id,...item.data()} as QcRecord)))
  },error=>onError?.(error))
}
