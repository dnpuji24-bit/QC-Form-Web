import { collection, doc, getDocs, limit, query, serverTimestamp, setDoc, where } from 'firebase/firestore'
import { firebaseAuth, firestoreDb } from './firebase'
import type { User } from './types'
import type { FertilizerScanResult, ScanFilling, ScanUnit } from './FertilizerReportScanner'

export type FertilizerLearningSnapshot={
  date:string
  shift:string
  mandor:string
  assistant:string
  units:Array<{
    unit:string
    noUnit:string
    paddock:string
    type:string
    activity:string
    catatan:string
    rataRataDosisAktualTertulis?:string
    fillings:Array<{
      pengisianKe:number
      dosis:string
      statusHose:string
      jenisPupuk:string
      jumlah:string
      hasilKerja:string
      pemerataanPupuk:string
      dosisAktualTertulis?:string
    }>
  }>
}

export type FertilizerLearningExample={
  original:FertilizerLearningSnapshot
  corrected:FertilizerLearningSnapshot
  changedFields:string[]
}

const text=(value:unknown)=>String(value??'').trim()

function fillingSnapshot(fill:ScanFilling){
  return{
    pengisianKe:Number(fill.pengisianKe)||0,
    dosis:text(fill.dosis),
    statusHose:text(fill.statusHose),
    jenisPupuk:text(fill.jenisPupuk),
    jumlah:text(fill.jumlah),
    hasilKerja:text(fill.hasilKerja),
    pemerataanPupuk:text(fill.pemerataanPupuk),
    dosisAktualTertulis:text(fill.dosisAktualTertulis),
  }
}

function unitSnapshot(unit:ScanUnit){
  return{
    unit:text(unit.unit),
    noUnit:text(unit.noUnit),
    paddock:text(unit.paddock),
    type:text(unit.type),
    activity:text(unit.activity),
    catatan:text(unit.catatan),
    rataRataDosisAktualTertulis:text(unit.rataRataDosisAktualTertulis),
    fillings:(unit.fillings||[]).map(fillingSnapshot),
  }
}

export function fertilizerLearningSnapshot(result:FertilizerScanResult):FertilizerLearningSnapshot{
  return{
    date:text(result.date),
    shift:text(result.shift),
    mandor:text(result.mandor),
    assistant:text(result.assistant),
    units:(result.units||[]).map(unitSnapshot),
  }
}

export function cloneFertilizerScanResult(result:FertilizerScanResult):FertilizerScanResult{
  return JSON.parse(JSON.stringify(result)) as FertilizerScanResult
}

function diffValues(before:unknown,after:unknown,path='',out:string[]=[]):string[]{
  if(Array.isArray(before)||Array.isArray(after)){
    const a=Array.isArray(before)?before:[],b=Array.isArray(after)?after:[]
    const length=Math.max(a.length,b.length)
    if(a.length!==b.length)out.push(path?path+'.length':'length')
    for(let i=0;i<length;i++)diffValues(a[i],b[i],path+'['+i+']',out)
    return out
  }
  if(before&&typeof before==='object'||after&&typeof after==='object'){
    const a=(before&&typeof before==='object'?before:{}) as Record<string,unknown>
    const b=(after&&typeof after==='object'?after:{}) as Record<string,unknown>
    const keys=new Set([...Object.keys(a),...Object.keys(b)])
    for(const key of keys)diffValues(a[key],b[key],path?path+'.'+key:key,out)
    return out
  }
  if(text(before)!==text(after))out.push(path||'value')
  return out
}

export async function saveFertilizerScanFeedback(args:{
  user:User
  original:FertilizerScanResult
  corrected:FertilizerScanResult
  sourceFileName:string
  applyMode:'replace'|'append'
}):Promise<{saved:boolean;changedFieldCount:number;feedbackId?:string}>{
  if(!firestoreDb||!firebaseAuth?.currentUser)return{saved:false,changedFieldCount:0}

  const original=fertilizerLearningSnapshot(args.original)
  const corrected=fertilizerLearningSnapshot(args.corrected)
  const changedFields=[...new Set(diffValues(original,corrected))].slice(0,160)
  const feedbackId='fertscanfb_'+Date.now()+'_'+crypto.randomUUID().slice(0,8)

  try{
    await setDoc(doc(firestoreDb,'fertilizer_scan_feedback',feedbackId),{
      formType:'fertilizer',
      inputtedBy:args.user.username,
      firebaseUid:firebaseAuth.currentUser.uid,
      sourceModel:text(args.original.sourceModel)||'gemini',
      sourceFileName:text(args.sourceFileName).slice(0,180),
      applyMode:args.applyMode,
      originalConfidence:Number(args.original.confidence||0),
      originalWarnings:(args.original.warnings||[]).slice(0,30),
      originalRawText:text(args.original.rawText).slice(0,6000),
      original,
      corrected,
      changedFields,
      changedFieldCount:changedFields.length,
      acceptedWithoutCorrection:changedFields.length===0,
      clientCreatedAt:new Date().toISOString(),
      createdAt:serverTimestamp(),
    })
    return{saved:true,changedFieldCount:changedFields.length,feedbackId}
  }catch(error){
    console.info('Correction Learning Fertilizer tidak dapat disimpan.',error)
    return{saved:false,changedFieldCount:changedFields.length}
  }
}

export async function loadFertilizerScanLearningExamples(user:Pick<User,'username'>):Promise<FertilizerLearningExample[]>{
  if(!firestoreDb||!firebaseAuth?.currentUser||!user.username)return[]
  try{
    const q=query(
      collection(firestoreDb,'fertilizer_scan_feedback'),
      where('inputtedBy','==',user.username),
      limit(24),
    )
    const snapshot=await getDocs(q)
    return snapshot.docs
      .map(item=>item.data() as Record<string,unknown>)
      .filter(item=>Number(item.changedFieldCount||0)>0&&item.original&&item.corrected)
      .sort((a,b)=>text(b.clientCreatedAt).localeCompare(text(a.clientCreatedAt)))
      .slice(0,4)
      .map(item=>({
        original:item.original as FertilizerLearningSnapshot,
        corrected:item.corrected as FertilizerLearningSnapshot,
        changedFields:Array.isArray(item.changedFields)?item.changedFields.map(text).filter(Boolean).slice(0,80):[],
      }))
  }catch(error){
    console.info('Contoh Correction Learning belum dapat dimuat.',error)
    return[]
  }
}
