import { collection, doc, getDocs, limit, query, serverTimestamp, setDoc, where } from 'firebase/firestore'
import { firebaseAuth, firestoreDb } from './firebase'
import type { User } from './types'
import type { FertilizerScanResult, ScanFilling, ScanUnit } from './FertilizerReportScanner'
import { cloneFertilizerScanResult, fertilizerLearningSnapshot, type FertilizerLearningSnapshot } from './fertilizerScanFeedback'

type OcrMemoryRule={
  field:string
  from:string
  to:string
  count:number
}

const text=(value:unknown)=>String(value??'').trim()
const norm=(value:unknown)=>text(value).toLowerCase().replace(/\s+/g,' ').trim()
const key=(field:string,from:string,to:string)=>field+'\u0000'+norm(from)+'\u0000'+norm(to)

function collectPairs(original:FertilizerLearningSnapshot,corrected:FertilizerLearningSnapshot){
  const out:Array<{field:string;from:string;to:string}>=[]
  const push=(field:string,a:unknown,b:unknown)=>{
    const from=text(a),to=text(b)
    if(from&&to&&norm(from)!==norm(to))out.push({field,from,to})
  }
  push('date',original.date,corrected.date)
  push('shift',original.shift,corrected.shift)
  push('mandor',original.mandor,corrected.mandor)
  push('assistant',original.assistant,corrected.assistant)
  const unitCount=Math.min(original.units.length,corrected.units.length)
  for(let i=0;i<unitCount;i++){
    const a=original.units[i],b=corrected.units[i]
    push('unit',a.unit,b.unit)
    push('noUnit',a.noUnit,b.noUnit)
    push('paddock',a.paddock,b.paddock)
    push('type',a.type,b.type)
    push('activity',a.activity,b.activity)
    const fillCount=Math.min(a.fillings.length,b.fillings.length)
    for(let j=0;j<fillCount;j++){
      const af=a.fillings[j],bf=b.fillings[j]
      push('jenisPupuk',af.jenisPupuk,bf.jenisPupuk)
      push('dosis',af.dosis,bf.dosis)
      push('statusHose',af.statusHose,bf.statusHose)
      push('jumlah',af.jumlah,bf.jumlah)
      push('hasilKerja',af.hasilKerja,bf.hasilKerja)
      push('pemerataanPupuk',af.pemerataanPupuk,bf.pemerataanPupuk)
    }
  }
  return out
}

export async function saveFertilizerOcrFeedback(args:{
  user:User
  original:FertilizerScanResult
  corrected:FertilizerScanResult
  sourceFileName:string
  applyMode:'replace'|'append'
}):Promise<{saved:boolean;changedFieldCount:number}>{
  if(!firestoreDb||!firebaseAuth?.currentUser)return{saved:false,changedFieldCount:0}
  const original=fertilizerLearningSnapshot(args.original),corrected=fertilizerLearningSnapshot(args.corrected)
  const pairs=collectPairs(original,corrected)
  const id='fertocrfb_'+Date.now()+'_'+crypto.randomUUID().slice(0,8)
  try{
    await setDoc(doc(firestoreDb,'fertilizer_ocr_feedback',id),{
      formType:'fertilizer',
      engine:'tesseract',
      inputtedBy:args.user.username,
      firebaseUid:firebaseAuth.currentUser.uid,
      sourceFileName:text(args.sourceFileName).slice(0,180),
      applyMode:args.applyMode,
      originalConfidence:Number(args.original.confidence||0),
      original,
      corrected,
      correctionPairs:pairs.slice(0,120),
      changedFieldCount:pairs.length,
      acceptedWithoutCorrection:pairs.length===0,
      clientCreatedAt:new Date().toISOString(),
      createdAt:serverTimestamp(),
    })
    return{saved:true,changedFieldCount:pairs.length}
  }catch(error){
    console.info('OCR Correction Learning tidak dapat disimpan.',error)
    return{saved:false,changedFieldCount:pairs.length}
  }
}

export async function loadFertilizerOcrMemory(user:Pick<User,'username'>):Promise<OcrMemoryRule[]>{
  if(!firestoreDb||!firebaseAuth?.currentUser||!user.username)return[]
  try{
    const q=query(collection(firestoreDb,'fertilizer_ocr_feedback'),where('inputtedBy','==',user.username),limit(50))
    const snapshot=await getDocs(q)
    const counts=new Map<string,OcrMemoryRule>()
    for(const item of snapshot.docs){
      const data=item.data() as {correctionPairs?:Array<{field?:unknown;from?:unknown;to?:unknown}>}
      for(const pair of data.correctionPairs||[]){
        const field=text(pair.field),from=text(pair.from),to=text(pair.to)
        if(!field||!from||!to||norm(from)===norm(to))continue
        const k=key(field,from,to),existing=counts.get(k)
        counts.set(k,existing?{...existing,count:existing.count+1}:{field,from,to,count:1})
      }
    }
    return[...counts.values()].filter(rule=>rule.count>=2).sort((a,b)=>b.count-a.count).slice(0,80)
  }catch(error){
    console.info('OCR Correction Memory belum dapat dimuat.',error)
    return[]
  }
}

function applyValue(field:string,value:string,rules:OcrMemoryRule[]){
  const current=text(value)
  if(!current)return current
  const match=rules.find(rule=>rule.field===field&&norm(rule.from)===norm(current))
  return match?match.to:current
}

function applyFill(fill:ScanFilling,rules:OcrMemoryRule[]):ScanFilling{
  return{
    ...fill,
    jenisPupuk:applyValue('jenisPupuk',fill.jenisPupuk,rules),
    dosis:applyValue('dosis',fill.dosis,rules),
    statusHose:applyValue('statusHose',fill.statusHose,rules),
    jumlah:applyValue('jumlah',fill.jumlah,rules),
    hasilKerja:applyValue('hasilKerja',fill.hasilKerja,rules),
    pemerataanPupuk:applyValue('pemerataanPupuk',fill.pemerataanPupuk,rules),
  }
}

function applyUnit(unit:ScanUnit,rules:OcrMemoryRule[]):ScanUnit{
  return{
    ...unit,
    unit:applyValue('unit',unit.unit,rules),
    noUnit:applyValue('noUnit',unit.noUnit,rules),
    paddock:applyValue('paddock',unit.paddock,rules),
    type:applyValue('type',unit.type,rules),
    activity:applyValue('activity',unit.activity,rules),
    fillings:unit.fillings.map(fill=>applyFill(fill,rules)),
  }
}

export async function applyFertilizerOcrMemory(result:FertilizerScanResult,user:Pick<User,'username'>):Promise<FertilizerScanResult>{
  const rules=await loadFertilizerOcrMemory(user)
  if(!rules.length)return result
  const next=cloneFertilizerScanResult(result)
  next.date=applyValue('date',next.date,rules)
  next.shift=applyValue('shift',next.shift,rules)
  next.mandor=applyValue('mandor',next.mandor,rules)
  next.assistant=applyValue('assistant',next.assistant,rules)
  next.units=next.units.map(unit=>applyUnit(unit,rules))
  next.ocrLearningRulesApplied=rules.length
  return next
}
