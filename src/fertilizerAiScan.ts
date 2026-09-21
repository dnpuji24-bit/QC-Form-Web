import { getAI, getGenerativeModel, getTemplateGenerativeModel, GoogleAIBackend, Schema } from 'firebase/ai'
import { firebaseApp } from './firebase'
import type { MasterData, MaterialMaster, PlanMaster, User } from './types'
import { loadFertilizerScanLearningExamples } from './fertilizerScanFeedback'
import { adaptiveGeminiCandidates, geminiErrorKind, isAdaptiveTransientGeminiError, recordGeminiAttempt } from './geminiAdaptiveRouter'
import type { FertilizerScanResult, ScanFilling, ScanUnit } from './FertilizerReportScanner'

type AiPayload={
  date?:string;shift?:string;mandor?:string;assistant?:string;transcription?:string
  units?:Array<{unit?:string;noUnit?:string;paddock?:string;type?:string;activity?:string;catatan?:string;rataRataDosisAktualTertulis?:number|string;fillings?:Array<{pengisianKe?:number;dosis?:number|string;statusHose?:string;jenisPupuk?:string;jumlah?:number|string;hasilKerja?:number|string;pemerataanPupuk?:string|number;dosisAktualTertulis?:number|string}>}>
}

const text=(v:unknown)=>String(v??'').trim()
const unique=(items:unknown[])=>[...new Set(items.map(text).filter(Boolean))]
const strNum=(v:unknown)=>v===null||v===undefined||v===''?'':String(v).replace(',','.')
function blankFilling(index=1):ScanFilling{return{pengisianKe:index,dosis:'',statusHose:'Lancar',jenisPupuk:'',jumlah:'',hasilKerja:'',pemerataanPupuk:''}}
function normalizeDate(v:unknown){const s=text(v);const m=s.match(/^(20\d{2})-(\d{2})-(\d{2})$/);return m?s:''}
function completionScore(result:FertilizerScanResult){
  let required=4,filled=0
  if(result.date)filled++;if(result.shift)filled++;if(result.mandor)filled++;if(result.assistant)filled++
  result.units.forEach(u=>{required+=5;if(u.unit)filled++;if(u.noUnit)filled++;if(u.paddock)filled++;if(u.activity)filled++;if(u.type)filled++;u.fillings.forEach(f=>{required+=5;if(f.jenisPupuk)filled++;if(f.dosis)filled++;if(f.jumlah)filled++;if(f.hasilKerja)filled++;if(f.statusHose)filled++})})
  return required?Math.max(0,Math.min(100,Math.round(filled/required*100))):0
}
function validate(result:FertilizerScanResult,master:MasterData){
  const warnings:string[]=[]
  const plans=((master.plans||master.plan||[])as PlanMaster[]).filter(p=>{const c=text(p.category||p.keterangan).toLowerCase();return !c||/fertil|pupuk/.test(c)})
  const unitTypes=Object.keys(master.unitMap||{}),unitNumbers=unique(Object.values(master.unitMap||{}).flat()),paddocks=unique(plans.map(p=>p.paddock)),activities=unique(plans.map(p=>p.activity)),materials=unique(((master.materials||[])as MaterialMaster[]).map(m=>m.material))
  if(!result.date)warnings.push('Tanggal belum terbaca.');if(!result.mandor)warnings.push('Mandor belum terbaca.')
  result.units.forEach((u,i)=>{
    if(!u.unit)warnings.push('Unit '+(i+1)+': Jenis Unit belum terbaca.');else if(!unitTypes.includes(u.unit))warnings.push('Unit '+(i+1)+': Jenis Unit tidak cocok dengan Master Unit.')
    if(!u.noUnit)warnings.push('Unit '+(i+1)+': No. Unit belum terbaca.');else if(!unitNumbers.includes(u.noUnit))warnings.push('Unit '+(i+1)+': No. Unit tidak cocok dengan Master Unit.')
    if(!u.paddock)warnings.push('Unit '+(i+1)+': Paddock belum terbaca.');else if(!paddocks.includes(u.paddock))warnings.push('Unit '+(i+1)+': Paddock tidak cocok dengan Master/Plan.')
    if(!u.activity)warnings.push('Unit '+(i+1)+': Activity belum terbaca.');else if(!activities.includes(u.activity))warnings.push('Unit '+(i+1)+': Activity tidak cocok dengan Plan.')
    const actualDoses:number[]=[];u.fillings.forEach((f,j)=>{if(!f.jenisPupuk)warnings.push('Unit '+(i+1)+' Pengisian '+(j+1)+': Jenis Pupuk belum terbaca.');else if(!materials.includes(f.jenisPupuk))warnings.push('Unit '+(i+1)+' Pengisian '+(j+1)+': Jenis Pupuk tidak cocok dengan Master Material.');if(!f.jumlah)warnings.push('Unit '+(i+1)+' Pengisian '+(j+1)+': Jumlah belum terbaca.');if(!f.hasilKerja)warnings.push('Unit '+(i+1)+' Pengisian '+(j+1)+': Hasil Kerja belum terbaca.');const jumlah=Number(strNum(f.jumlah)),hasil=Number(strNum(f.hasilKerja));if(jumlah>0&&hasil>0){const calculated=jumlah/hasil;actualDoses.push(calculated);const reported=Number(strNum(f.dosisAktualTertulis));if(reported>0&&Math.abs(reported-calculated)>Math.max(5,calculated*.02))warnings.push('Unit '+(i+1)+' Pengisian '+(j+1)+': Dosis Aktual tertulis berbeda dari hitungan Jumlah/Hasil.') }});const reportedAverage=Number(strNum(u.rataRataDosisAktualTertulis));if(reportedAverage>0&&actualDoses.length){const calculatedAverage=actualDoses.reduce((s,v)=>s+v,0)/actualDoses.length;if(Math.abs(reportedAverage-calculatedAverage)>Math.max(5,calculatedAverage*.02))warnings.push('Unit '+(i+1)+': Rata-rata Dosis Aktual tertulis berbeda dari rata-rata hasil hitung.')}
  })
  return warnings
}
async function filePart(file:Blob,mimeType:string){
  const data=await new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onerror=()=>reject(new Error('Foto laporan tidak dapat dibaca.'));reader.onloadend=()=>{const raw=String(reader.result||''),comma=raw.indexOf(',');resolve(comma>=0?raw.slice(comma+1):raw)};reader.readAsDataURL(file)})
  return{inlineData:{data,mimeType}}
}
function compactMaster(master:MasterData){
  const plans=((master.plans||master.plan||[])as PlanMaster[]).filter(p=>{const c=text(p.category||p.keterangan).toLowerCase();return !c||/fertil|pupuk/.test(c)})
  const planRows=plans.map(p=>({paddock:text(p.paddock),activity:text(p.activity),type:text(p.type)})).filter((x,i,a)=>x.paddock&&a.findIndex(y=>y.paddock===x.paddock&&y.activity===x.activity&&y.type===x.type)===i)
  return{
    shifts:unique(master.shifts||[]),mandor:unique(master.names||[]),assistants:unique(master.assistants||[]),
    units:Object.fromEntries(Object.entries(master.unitMap||{}).map(([k,v])=>[k,unique(v)])),
    fertilizerMaterials:unique(((master.materials||[])as MaterialMaster[]).map(m=>m.material)),
    plans:planRows.slice(0,1200),
  }
}
const responseSchema=Schema.object({properties:{
  date:Schema.string(),shift:Schema.string(),mandor:Schema.string(),assistant:Schema.string(),transcription:Schema.string(),
  units:Schema.array({items:Schema.object({properties:{
    unit:Schema.string(),noUnit:Schema.string(),paddock:Schema.string(),type:Schema.string(),activity:Schema.string(),catatan:Schema.string(),rataRataDosisAktualTertulis:Schema.string(),
    fillings:Schema.array({items:Schema.object({properties:{
      pengisianKe:Schema.number(),dosis:Schema.string(),statusHose:Schema.string(),jenisPupuk:Schema.string(),jumlah:Schema.string(),hasilKerja:Schema.string(),pemerataanPupuk:Schema.string(),dosisAktualTertulis:Schema.string(),
    }})}),
  }})}),
}})

function isTransientGeminiError(error:unknown){return isAdaptiveTransientGeminiError(error)}
function modelCandidates(){const preferred=String(import.meta.env.VITE_GEMINI_SCAN_MODEL||'gemini-3.8-flash').trim();const adaptive=adaptiveGeminiCandidates(preferred).filter(model=>model!=='gemini-3.8-flash');return['gemini-3.8-flash',...adaptive]}

export async function scanFertilizerReportWithGemini(file:File,master:MasterData,defaults:{date:string;shift:string;mandor:string;assistant:string},learningUser?:Pick<User,'username'>,onRouteUpdate?:(message:string)=>void):Promise<FertilizerScanResult>{
  if(!firebaseApp)throw new Error('Firebase belum tersedia.')
  const ai=getAI(firebaseApp,{backend:new GoogleAIBackend()})
  const masterContext=compactMaster(master)
  const learningExamples=learningUser?await loadFertilizerScanLearningExamples(learningUser):[]
  const prompt=[
    'Anda membaca FOTO LAPORAN LAPANGAN QC FERTILIZER.',
    'Ekstrak data faktual dari foto ke JSON sesuai schema. Jangan menebak data yang tidak terlihat.',
    'Aturan penting:',
    '- Tanggal keluarkan YYYY-MM-DD. Jika tidak terbaca, kosongkan.',
    '- Untuk Jenis Unit, No. Unit, Paddock, Activity, Type, Mandor, Asisten, dan Jenis Pupuk: gunakan NILAI PERSIS dari master bila yakin cocok. Jika tidak yakin, kosongkan; jangan membuat nama baru.',
    '- Desimal koma pada foto dikonversi menjadi angka desimal.',
    '- Satu laporan dapat berisi beberapa unit, tetapi buat Unit Card HANYA untuk unit yang benar-benar menjadi unit utama pada header/tabel pekerjaan. Nomor unit yang hanya disebut di bagian Catatan sebagai referensi, sumber sisa pupuk, unit rusak, atau unit tujuan pemindahan JANGAN dibuat sebagai unit baru.',
    '- Bila Catatan menyebut unit lain, pertahankan nomor unit itu hanya di teks catatan unit utama.',
    '- Setiap baris/pengisian harus dipertahankan terpisah pada fillings.',
    '- dosisAktualTertulis adalah nilai Dosis Aktual (Kg/Ha) yang memang tertulis pada laporan. Jangan menghitung atau mengarang nilai ini; kosongkan bila tidak terbaca.',
    '- rataRataDosisAktualTertulis adalah nilai rata-rata Dosis Aktual yang memang tertulis pada baris rata-rata laporan. Jangan menghitungnya sendiri.',
    '- statusHose hanya "Lancar" atau "Tidak Lancar". Jika tidak tertulis, gunakan "Lancar".',
    '- pemerataanPupuk pertahankan seperti yang tertulis (1,2,3,4,>4) atau kosong.',
    '- catatan hanya untuk issue/kendala/downtime yang benar-benar terlihat.',
    '- transcription berisi transkripsi ringkas teks penting yang terbaca, untuk audit manusia.',
    '- Correction Learning di bawah adalah contoh koreksi pengguna sebelumnya. Gunakan hanya untuk mengenali pola penamaan/struktur yang berulang. JANGAN menyalin nilai contoh bila tidak terlihat pada foto saat ini.',
    learningExamples.length?'Contoh Correction Learning (AI original -> koreksi manusia): '+JSON.stringify(learningExamples):'Belum ada contoh Correction Learning untuk pengguna ini.',
    'Default session yang sudah ada di form (gunakan hanya jika field pada foto tidak ada, bukan untuk mengarang unit): '+JSON.stringify(defaults),
    'Master valid aplikasi: '+JSON.stringify(masterContext),
  ].join('\n')
  const image=await filePart(file,file.type||'image/jpeg')
  const templateModel=getTemplateGenerativeModel(ai)
  const templateInputs={
    mimeType:file.type||'image/jpeg',
    imageData:image.inlineData.data,
    defaultsJson:JSON.stringify(defaults),
    masterContextJson:JSON.stringify(masterContext),
    learningExamplesJson:learningExamples.length?JSON.stringify(learningExamples):'[]',
  }
  const templateByModel:Record<string,string>={
    'gemini-3.8-flash':'fertilizer-scan-v1-3-8',
  }
  const routeStarted=typeof performance!=='undefined'?performance.now():Date.now()
  const routeAttempts:Array<{model:string;ok:boolean;latencyMs:number;errorKind?:string;errorDetail?:string;via?:'template'|'direct';templateId?:string}>=[]
  let parsed:AiPayload|undefined,modelUsed='',sourceTemplateId='',lastError:unknown
  for(const modelName of modelCandidates()){
    const attemptStarted=typeof performance!=='undefined'?performance.now():Date.now()
    onRouteUpdate?.('Mencoba '+modelName+'...')
    try{
      const templateId=templateByModel[modelName]
      const generated=templateId
        ?await templateModel.generateContent(templateId,templateInputs)
        :await getGenerativeModel(ai,{model:modelName,generationConfig:{responseMimeType:'application/json',responseSchema,temperature:0.1}}).generateContent([prompt,image])
      const raw=generated.response.text()
      try{parsed=JSON.parse(raw)}catch{throw new Error('Gemini mengembalikan JSON yang tidak dapat dibaca.')}
      const attemptEnded=typeof performance!=='undefined'?performance.now():Date.now(),latencyMs=Math.max(0,Math.round(attemptEnded-attemptStarted))
      recordGeminiAttempt(modelName,true,latencyMs)
      routeAttempts.push({model:modelName,ok:true,latencyMs,via:templateId?'template':'direct',templateId})
      modelUsed=modelName
      sourceTemplateId=templateId||''
      onRouteUpdate?.(modelName+(templateId?' via Server Prompt Template':'')+' berhasil dalam '+(latencyMs/1000).toFixed(1)+' detik.')
      break
    }catch(error){
      const attemptEnded=typeof performance!=='undefined'?performance.now():Date.now(),latencyMs=Math.max(0,Math.round(attemptEnded-attemptStarted)),errorKind=geminiErrorKind(error),errorDetail=(error instanceof Error?error.message:String(error||'')).replace(/\s+/g,' ').slice(0,220)
      recordGeminiAttempt(modelName,false,latencyMs,error)
      routeAttempts.push({model:modelName,ok:false,latencyMs,errorKind,errorDetail,via:templateByModel[modelName]?'template':'direct',templateId:templateByModel[modelName]})
      lastError=error
      const templateFailure=Boolean(templateByModel[modelName])
      if(!isTransientGeminiError(error)&&!templateFailure)throw error
      onRouteUpdate?.(templateFailure
        ?modelName+' Server Prompt Template belum siap; mencoba model berikutnya...'
        :modelName+' sedang tidak stabil; mencoba model berikutnya...')
    }
  }
  if(!parsed)throw lastError instanceof Error?lastError:new Error('Semua model Gemini sementara tidak tersedia.')
  const units:ScanUnit[]=(parsed.units||[]).map((u,ui)=>({
    unit:text(u.unit),noUnit:text(u.noUnit),paddock:text(u.paddock),type:text(u.type)||'Fertilizer',activity:text(u.activity),catatan:text(u.catatan),rataRataDosisAktualTertulis:strNum(u.rataRataDosisAktualTertulis),
    fillings:(u.fillings||[]).map((f,fi)=>({pengisianKe:Number(f.pengisianKe)||fi+1,dosis:strNum(f.dosis),statusHose:/tidak/i.test(text(f.statusHose))?'Tidak Lancar':'Lancar',jenisPupuk:text(f.jenisPupuk),jumlah:strNum(f.jumlah),hasilKerja:strNum(f.hasilKerja),pemerataanPupuk:text(f.pemerataanPupuk),dosisAktualTertulis:strNum(f.dosisAktualTertulis)})),
  })).filter(u=>Boolean(u.unit||u.noUnit||u.paddock||u.activity||u.fillings.length))
  if(!units.length)units.push({unit:'',noUnit:'',paddock:'',type:'Fertilizer',activity:'',catatan:'',fillings:[blankFilling()]})
  units.forEach(u=>{if(!u.fillings.length)u.fillings=[blankFilling()]})
  const routeEnded=typeof performance!=='undefined'?performance.now():Date.now(),routeTotalMs=Math.max(0,Math.round(routeEnded-routeStarted))
  const result:FertilizerScanResult={date:normalizeDate(parsed.date)||defaults.date,shift:text(parsed.shift)||defaults.shift,mandor:text(parsed.mandor)||defaults.mandor,assistant:text(parsed.assistant)||defaults.assistant,units,rawText:text(parsed.transcription),confidence:0,warnings:[],sourceModel:modelUsed,sourceTemplateId:sourceTemplateId||undefined,routeAttempts,routeTotalMs}
  result.warnings=validate(result,master);result.confidence=completionScore(result)
  return result
}
