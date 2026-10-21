import { collection, documentId, getDocs, limit, orderBy, query, startAfter, where, type Firestore, type QueryDocumentSnapshot, type DocumentData } from 'firebase/firestore'

export type PlanExportKind='daily'|'actual'
export type DateBounds={start:string;end:string}
type DocRow={id:string;data:Record<string,unknown>}
type ExportInput={db:Firestore;kind:PlanExportKind;bounds:DateBounds;onProgress:(message:string)=>void}
const COLLECTIONS:Record<PlanExportKind,string>={daily:'daily_plans',actual:'daily_reports'}
const PRETTY:Record<PlanExportKind,string>={daily:'Daily Plan',actual:'Actual Plan'}

const txt=(value:unknown)=>value===null||value===undefined?'':String(value).trim()
function numeric(value:unknown){const n=Number(value);return Number.isFinite(n)?n:0}
function escapeCell(value:unknown):string|number{
 if(typeof value==='number'&&Number.isFinite(value))return value
 const str=txt(value)
 return /^[=+@\-\t\r]/.test(str)?"'"+str:str
}
function isoDate(value:string){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(value))return false
 const [year,month,day]=value.split('-').map(Number)
 const test=new Date(Date.UTC(year,month-1,day))
 return test.getUTCFullYear()===year&&test.getUTCMonth()===month-1&&test.getUTCDate()===day
}
export function boundsForMonthRange(from:string,to:string):DateBounds{
 if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(from)||!/^\d{4}-(0[1-9]|1[0-2])$/.test(to))throw new Error('Pilih bulan dan tahun mulai/sampai.')
 const [year,month]=to.split('-').map(Number)
 const lastDay=new Date(Date.UTC(year,month,0)).getUTCDate()
 return validateExportBounds({start:from+'-01',end:to+'-'+String(lastDay).padStart(2,'0')})
}
export function validateExportBounds(bounds:DateBounds):DateBounds{
 if(!isoDate(bounds.start)||!isoDate(bounds.end))throw new Error('Tanggal mulai dan tanggal selesai wajib valid.')
 if(bounds.start>bounds.end)throw new Error('Tanggal mulai tidak boleh melewati tanggal selesai.')
 return bounds
}
function serializable(value:unknown):unknown{
 if(value===null||value===undefined)return value??null
 if(Array.isArray(value))return value.map(serializable)
 if(value instanceof Date)return value.toISOString()
 if(typeof value==='object'){
  const item=value as Record<string,unknown>
  if(typeof item.toDate==='function'){try{return (item.toDate as()=>Date)().toISOString()}catch{return null}}
  return Object.fromEntries(Object.entries(item).map(([k,v])=>[k,serializable(v)]))
 }
 return value
}
function json(value:unknown){
 if(value===null||value===undefined)return''
 try{return JSON.stringify(serializable(value))}catch{return''}
}
function materials(data:Record<string,unknown>){
 const raw=Array.isArray(data.materials)?data.materials:Array.isArray(data.materialLines)?data.materialLines:[]
 return raw.map(item=>(item&&typeof item==='object'?item:{}) as Record<string,unknown>)
}
function first(data:Record<string,unknown>,...names:string[]){
 for(const name of names){if(data[name]!==null&&data[name]!==undefined&&data[name]!=='')return data[name]}
 return''
}
const dailyColumns=['Firestore ID','Plan ID','Tanggal','Tahun','Bulan','Shift','Sumber Plan','Status Link Monthly','Monthly Plan Line ID','Work Group ID','Urutan','Activity','Deskripsi','Activity Code','Type','Activity Category','Paddock / PID','Varietas','Company','Farm','Stage','Luas Plan (Ha)','Area Paddock (Ha)','Mandor','HK','Unit','Ready','Standby','Breakdown','Catatan','Catatan PID','Sumber Data','Sumber Perubahan','Link QC / Catatan Tambahan']
const actualColumns=['Firestore ID','Actual ID','Tanggal','Tahun','Bulan','Shift','Sumber Actual','Status Link Daily','Status Link Monthly','Daily Plan ID','Monthly Plan Line ID','Work Group ID','Urutan','Activity','Deskripsi','Type','Activity Category','Paddock / PID','Varietas','Company','Farm','Stage','Luas Actual (Ha)','Luas Daily Plan (Ha)','Selisih Daily (Ha)','Mandor','HK','Unit','Ready','Standby','Breakdown','Catatan','Sumber Data','Sumber Perubahan','Referensi QC']
function rowDaily(row:DocRow){
 const d=row.data
 return[
 row.id,first(d,'dailyPlanId', 'sourcePlanIdRaw'),d.date,first(d,'year'),first(d,'monthKey'),first(d,'shift'),first(d,'sourceType'),first(d,'monthlyLinkStatus'),first(d,'monthlyPlanLineId'),first(d,'workGroupId'),first(d,'planningOrder'),first(d,'activity'),first(d,'description'),first(d,'activityCode'),first(d,'type'),first(d,'activityCategory'),
 first(d,'pid','paddockRaw'),first(d,'masterVariety'),first(d,'companyCode'),first(d,'farm'),first(d,'stage'),numeric(first(d,'areaHa')),numeric(first(d,'areaPaddockHa')),first(d,'foreman'),numeric(first(d,'manpower')),first(d,'unitName'),numeric(first(d,'unitReady')),numeric(first(d,'unitStandby')),numeric(first(d,'unitBreakdown')),first(d,'notes'),first(d,'pidNotes'),first(d,'sourceOrigin'),first(d,'lastModifiedSource'),first(d,'qcRecordId'),
 ]
}
function rowActual(row:DocRow){
 const d=row.data
 return[
 row.id,first(d,'actualReportId'),first(d,'date'),first(d,'year'),first(d,'monthKey'),first(d,'shift'),first(d,'sourceType'),first(d,'dailyLinkStatus'),first(d,'monthlyLinkStatus'),first(d,'dailyPlanId'),first(d,'monthlyPlanLineId'),first(d,'workGroupId'),first(d,'planningOrder'),first(d,'activity'),first(d,'description'),first(d,'type'),first(d,'activityCategory'),
 first(d,'pid','paddockRaw'),first(d,'masterVariety'),first(d,'companyCode'),first(d,'farm'),first(d,'stage'),numeric(first(d,'actualAreaHa','resultArea')),numeric(first(d,'plannedDailyAreaHa')),numeric(first(d,'dailyVarianceHa')),first(d,'foreman'),numeric(first(d,'manpower')),first(d,'unitName'),numeric(first(d,'unitReady')),numeric(first(d,'unitStandby')),numeric(first(d,'unitBreakdown')),first(d,'notes'),first(d,'sourceOrigin'),first(d,'lastModifiedSource'),first(d,'qcRecordId'),
 ]
}
function makeSheet(XLSX:typeof import('xlsx'),headers:string[],data:Array<Array<string|number>>){
 const sheet=XLSX.utils.aoa_to_sheet([headers,...data.map(row=>row.map(escapeCell))])
 sheet['!autofilter']={ref:'A1:'+XLSX.utils.encode_col(headers.length-1)+(data.length+1)}
 sheet['!cols']=headers.map(h=>({wch:Math.min(Math.max(h.length+2,13),30)}))
 return sheet
}
/** Read all matching records from Firestore in cursor-paginated batches; no UI-list page limit. */
export async function fetchPlanExportRows(input:ExportInput):Promise<DocRow[]>{
 const {db,kind,onProgress}=input,bounds=validateExportBounds(input.bounds)
 const rows:DocRow[]=[],seen=new Set<string>()
 let cursor:QueryDocumentSnapshot<DocumentData>|null=null
 while(true){
  const clauses=[
    where('date','>=',bounds.start),where('date','<=',bounds.end),
    orderBy('date','asc'),orderBy(documentId(),'asc'),
  ]
  const q=cursor
   ?query(collection(db,COLLECTIONS[kind]),...clauses,startAfter(cursor),limit(250))
   :query(collection(db,COLLECTIONS[kind]),...clauses,limit(250))
  const snap=await getDocs(q)
  for(const d of snap.docs)if(!seen.has(d.id)){seen.add(d.id);rows.push({id:d.id,data:d.data() as Record<string,unknown>})}
  onProgress('Mengambil '+PRETTY[kind]+': '+rows.length+' record…')
  if(snap.size<250)break
  cursor=snap.docs[snap.docs.length-1]
  // Avoid forcing extremely large Firestore histories into one browser workbook.
  if(rows.length>=100000)throw new Error('Lebih dari 100.000 record dalam satu ekspor. Bagi rentang tanggal menjadi beberapa bagian agar browser tetap stabil.')
 }
 return rows.sort((a,b)=>txt(a.data.date).localeCompare(txt(b.data.date))||txt(a.data.shift).localeCompare(txt(b.data.shift),undefined,{numeric:true})||numeric(a.data.planningOrder)-numeric(b.data.planningOrder)||a.id.localeCompare(b.id))
}
export async function exportPlanRangeExcel(input:ExportInput):Promise<number>{
 const bounds=validateExportBounds(input.bounds)
 const docs=await fetchPlanExportRows(input)
 if(!docs.length)throw new Error('Tidak ada '+PRETTY[input.kind]+' pada rentang '+bounds.start+' hingga '+bounds.end+'.')
 input.onProgress('Membuat workbook Excel untuk '+docs.length+' record…')
 const XLSX=await import('xlsx')
 const workbook=XLSX.utils.book_new(),isDaily=input.kind==='daily'
 const materialSlots=Math.max(5,...docs.map(row=>materials(row.data).length))
 // Cap only column width; preserve extra material lines in the audit sheet if present.
 const slots=Math.min(materialSlots,30)
 const extraColumns=Array.from({length:slots},(_,index)=>['Bahan '+(index+1),'Dosis/Ha '+(index+1),'Satuan Dosis '+(index+1),'Total Bahan '+(index+1),'Satuan Bahan '+(index+1)]).flat()
 const headers=[...(isDaily?dailyColumns:actualColumns),...extraColumns]
 const data=docs.map(row=>{
  const base=isDaily?rowDaily(row):rowActual(row)
  const items=materials(row.data)
  for(let index=0;index<slots;index++){
   const item=items[index]||{}
   base.push(first(item,'material','materialName','name'),numeric(first(item,'dosePerHa')),first(item,'doseUnit'),numeric(first(item,'totalMaterial')),first(item,'unit'))
  }
  return base
 })
 XLSX.utils.book_append_sheet(workbook,makeSheet(XLSX,headers,data),isDaily?'Daily Plan':'Actual Plan')
 const countHa=docs.reduce((total,row)=>total+numeric(first(row.data,isDaily?'areaHa':'actualAreaHa')),0)
 const summary=[
  ['Informasi','Nilai'],['Jenis',PRETTY[input.kind]],['Tanggal Mulai',bounds.start],['Tanggal Selesai',bounds.end],
  ['Jumlah Record',docs.length],['Total Luas (Ha)',countHa],['Sumber Firestore',COLLECTIONS[input.kind]],
  ['Cakupan','Seluruh record pada rentang terpilih; tidak terpengaruh filter/paginasi layar'],
  ['Catatan','1 baris = 1 record/PID; material ditampilkan dalam kolom Bahan 1, 2, dst.'],
 ]
 XLSX.utils.book_append_sheet(workbook,makeSheet(XLSX,['Informasi','Nilai'],summary.slice(1)),'Informasi Export')
 const auditHeaders=['Firestore ID','Data lengkap (JSON)']
 const audit=docs.map(item=>[item.id,json(item.data)])
 XLSX.utils.book_append_sheet(workbook,makeSheet(XLSX,auditHeaders,audit),'Data Lengkap')
 const filename=(isDaily?'Daily_Plan':'Actual_Plan')+'_'+bounds.start+'_sd_'+bounds.end+'.xlsx'
 XLSX.writeFile(workbook,filename,{compression:true})
 return docs.length
}
