import type { NozzleSpec,NozzlePoint,DropletClass } from './nozzlePerformance'
import { DROPLET_LABELS,nozzleSpecId } from './nozzlePerformance'

type RawRow=unknown[]
type ParseResult={specs:NozzleSpec[];errors:string[];sheet:string;count:number}
function norm(input:unknown){return String(input??'').trim().toLowerCase().replace(/\s+/g,' ')}
function num(input:unknown){
 if(typeof input==='number')return input
 const value=String(input??'').trim().replace(',','.')
 return value?Number(value):NaN
}
const LABELS=['warna nozzle','jenis nozzle','tekanan (bar)','ukuran droplet','lerap rating','debit (l/menit)']
/** Accepts workbook table from TeeJet_Halaman_21_TTI60(1).xlsx with header A6:F6.
 *  Ignore columns G onward (application rates), which are *derived* from flow.
 */
export function parseNozzleSheet(rows:RawRow[],sheet:string):ParseResult{
 const errors:string[]=[],groups=new Map<string,NozzleSpec>(),seen=new Set<string>()
 const headerIndex=rows.findIndex(row=>LABELS.every(label=>row.some(cell=>norm(cell)===label)))
 if(headerIndex<0)return {specs:[],sheet,count:0,errors:['Header tidak cocok. Wajib: Warna Nozzle | Jenis Nozzle | Tekanan (bar) | Ukuran Droplet | LERAP Rating | Debit (L/menit).']}
 const header=rows[headerIndex].map(norm)
 const columns=LABELS.map(label=>header.indexOf(label))
 let count=0
 rows.slice(headerIndex+1).forEach((row,index)=>{
  const n=headerIndex+2+index,cell=(at:number)=>row[columns[at]]
  const color=String(cell(0)??'').trim(),code=String(cell(1)??'').trim(),bar=num(cell(2)),droplet=String(cell(3)??'').trim().toUpperCase(),lerap=String(cell(4)??'—').trim()||'—',flow=num(cell(5))
  if(!color&&!code&&(!Number.isFinite(bar)))return
  if(!code||!color||!(bar>0)||!(flow>0)||!(droplet in DROPLET_LABELS)){
   errors.push('Baris '+n+': warna/kode/tekanan/debit/droplet tidak valid.');return
  }
  const id=nozzleSpecId(code),key=id+'@'+bar
  if(seen.has(key)){errors.push('Baris '+n+': kombinasi '+code+' / '+bar+' bar ganda.');return}
  seen.add(key);count++
  let group=groups.get(id)
  if(!group){group={code,color,points:[],sourceSheet:sheet};groups.set(id,group)}
  if(norm(group.color)!==norm(color)){errors.push('Baris '+n+': warna berbeda untuk kode '+code);return}
  const point:NozzlePoint={bar,litersPerMinute:flow,droplet:droplet as DropletClass,lerap}
  group.points.push(point)
 })
 const specs=[...groups.values()].map(spec=>({...spec,points:spec.points.sort((x,y)=>x.bar-y.bar)})).sort((a,b)=>a.code.localeCompare(b.code,undefined,{numeric:true}))
 if(!specs.length&&!errors.length)errors.push('Tidak ada baris nozzle yang ditemukan.')
 return {specs,errors,sheet,count}
}

export async function parseNozzleWorkbook(file:File):Promise<ParseResult>{
 const XLSX=await import('xlsx')
 const wb=XLSX.read(await file.arrayBuffer(),{type:'array'})
 const failures:string[]=[]
 for(const sheet of wb.SheetNames){
  const rows=XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[sheet],{header:1,raw:true,defval:''}) as unknown[][]
  const result=parseNozzleSheet(rows,sheet)
  if(result.specs.length)return result
  failures.push(...result.errors)
 }
 return {specs:[],sheet:'',count:0,errors:failures.slice(0,6)}
}
