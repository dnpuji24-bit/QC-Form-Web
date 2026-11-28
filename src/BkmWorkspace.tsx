import {useEffect,useRef,useState,type ClipboardEvent,type KeyboardEvent} from 'react'
import {Alert,AutoComplete,Button,Input,InputNumber,Select,Typography,Tooltip,Popover,message as antdMessage} from 'antd'
import {firebaseAuth} from './firebase'
import {canEditAccess} from './accessControl'
import {bkmAvailableCandidates,type BkmCandidate} from './bkmAggregation.mjs'
import {bkmManualCandidate,bkmRealization,type BkmActivity,type BkmPaddock} from './bkmRealization.mjs'
import {loadBkmCandidates,listBkm,saveBkm,type BkmDocument,type BkmInputRow,type BkmMaterialEntry,type BkmTotalInput} from './bkmFirestore'
import {bkmOperationCandidate,bkmOperationFields,bkmOperationIncomplete,operationFieldLimits,type BkmOperationFields} from './bkmOperation'
import {blankMaterial,hasMaterial} from './bkmMaterial'
import type {User} from './types'
import './bkm.css'

function ToolbarIcon({name}:{name:'save'|'excel'|'print'|'info'|'check'|'clear'|'copy'|'trash'}){
 const paths={save:'M5 3h12l4 4v14H3V3h2zm2 0v7h10V3M7 21v-7h10v7',excel:'M5 3h10l4 4v14H5z M15 3v5h4 M8 11l5 7m0-7l-5 7',print:'M7 8V3h10v5M7 17H3V8h18v9h-4M7 13h10v8H7z M17 11h1',info:'M12 11v6m0-10h.01 M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0',check:'m5 12 4 4L19 6',clear:'M6 6l12 12M18 6L6 18',copy:'M8 8h12v12H8z M4 16V4h12',trash:'M4 6h16M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7m4-7v7'}
 return <svg aria-hidden="true" focusable="false" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d={paths[name]}/></svg>
}
const today=()=>{const d=new Date();return [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-')}
const blank=():BkmInputRow=>({filterWo:'',activityFilter:'',candidate:null,bkm:'',note:'',hiManual:true,hiOverride:null,hkOverride:null,operationFields:{}})
const initial=():BkmDocument=>({id:'',revision:0,date:today(),company:'',division:'UnM',number:'',rows:Array.from({length:10},blank)})
const format=(n:number|null|undefined)=>n===null||n===undefined?'':n.toLocaleString('id-ID',{maximumFractionDigits:4})
const formatPercent=(n:number|null)=>n===null?'':n.toLocaleString('id-ID',{maximumFractionDigits:0})+'%'
const operationGrid=(doc:BkmDocument)=>doc.rows.map(row=>({...row,candidate:bkmOperationCandidate(row,doc.company)}))
const actualRows=(doc:BkmDocument)=>operationGrid(doc).filter(row=>row.candidate)
const idsFor=(rows:BkmInputRow[])=>rows.map(r=>r.candidate!.id)
const autoMaterial=(doc:BkmDocument):BkmMaterialEntry[]=>actualRows(doc).flatMap(r=>r.candidate!.material.map(m=>({pid:r.candidate!.pid,...m,wo:r.candidate!.wo,bkm:r.bkm,note:'Alokasi terukur'+(r.candidate!.warnings.some(w=>w.includes('material'))?' (parsial)':''),extra:Array(doc.materialColumns?.length||0).fill('')})))
function materialGrid(doc:BkmDocument){
 if(doc.materialEntries?.length)return doc.materialEntries
 const automatic=doc.materialEntries??autoMaterial(doc)
 return [...automatic,...Array.from({length:Math.max(0,10-automatic.length)},()=>blankMaterial(doc.materialColumns?.length||0))]
}
function qcMaterialGrid(doc:BkmDocument){
 const rows=autoMaterial(doc)
 return [...rows,...Array.from({length:Math.max(0,materialGrid(doc).length-rows.length)},()=>blankMaterial(doc.materialColumns?.length||0))]
}
const materialValues=(m:BkmMaterialEntry,i:number)=>[i+1,m.pid,m.code,m.name,m.unit,m.hi??'',m.shi??'',m.wo,m.bkm,m.note,...m.extra]
const effective=(r:BkmInputRow,field:'hk'|'target'|'hi'|'shi')=>field==='hk'?(r.hkOverride??r.candidate?.hk??null):field==='target'?(r.candidate?.wo?r.candidate.target:null):field==='hi'?bkmRealization(r.candidate,r.hiOverride,r.hiManual).hi:bkmRealization(r.candidate,r.hiOverride,r.hiManual).balance
const notes=(r:BkmInputRow)=>[r.note,...(r.candidate?.warnings||[])].filter(Boolean).join(' · ')
function operationUnit(rows:BkmInputRow[]){
 const units=new Set(rows.map(row=>row.candidate?.uom.trim()||''))
 return units.size===1?[...units][0]:null
}
const total=(rows:BkmInputRow[],field:'hk'|'target'|'shi')=>rows.length&&(field==='hk'||operationUnit(rows)!==null)&&rows.every(r=>effective(r,field)!==null)?rows.reduce((a,r)=>a+(effective(r,field)??0),0):null
const unitKey=(unit:string)=>unit.trim().toLowerCase()
function operationSummary(rows:BkmInputRow[],input?:BkmTotalInput){
 const units=[...new Map(rows.flatMap(row=>{
  const unit=row.candidate?.uom.trim()
  return unit?[[unitKey(unit),unit] as const]:[]
 })).values()]
 const selected=input?units.find(unit=>unitKey(unit)===unitKey(input.uom)):undefined
 const unit=selected??(units.length===1?units[0]:'')
 const quantities=unit?rows.filter(row=>unitKey(row.candidate?.uom||'')===unitKey(unit))
  .map(row=>effective(row,'hi')).filter(value=>value!==null):[]
 const automatic=quantities.length?quantities.reduce((sum,value)=>sum+value,0):null
 const hi=selected?input?.hiOverride??automatic:automatic
 return {units,unit,hi,hk:total(rows,'hk'),target:total(rows,'target'),shi:total(rows,'shi')}
}
const values=(r:BkmInputRow,i:number)=>{const c=r.candidate,a=bkmRealization(c,r.hiOverride,r.hiManual);return [i+1,c?.operationCode||'',c?.description||'',c?.pid||'',c?.area??'',effective(r,'hk')??'',c?.uom||'',effective(r,'target')??'',a.hi??'',a.balance??'',a.progress!=null?a.progress/100:'',c?.wo||'',r.bkm,notes(r)]}
const opHeaders=['No','Opr Code','Desc','Paddock / Block','Luas Area','Jml HK','UoM','Luas WO','HI','SHI','%','No WO','No BKM','Keterangan']
const matHeaders=['No','Block/Paddock','No Material','Nama Material','UoM','Qty HI','Qty SHI','No WO','No BKM','Keterangan']
async function downloadExcel(report:BkmDocument){
 const {buildBkmWorkbook}=await import('./bkmTemplateWorkbook.mjs')
 const rows=actualRows(report)
 const summary=operationSummary(rows,report.operationTotal)
 const wb=buildBkmWorkbook({number:report.number,company:report.company,division:report.division,date:report.date,
  operations:operationGrid(report).map(values),materials:materialGrid(report).map(materialValues),materialColumns:report.materialColumns||[],exactRowCounts:true,
  totals:['Total','','','','',summary.hk,summary.unit,summary.target,summary.hi,summary.shi]})
 const buffer=await wb.xlsx.writeBuffer()
 const url=URL.createObjectURL(new Blob([new Uint8Array(buffer)],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}))
 const a=document.createElement('a');a.href=url;a.download='Rekap-BKM-'+report.date+'.xlsx';document.body.appendChild(a)
 try{a.click()}finally{a.remove();window.setTimeout(()=>URL.revokeObjectURL(url),1000)}
}
// Widths in cm from B:Q of the original sheet; merged columns use summed widths.
const opPaperWidths=[1.710972,2.769305,5.856111,2.081389,2.257778,1.569861,1.075972,2.240139,2.099028,1.781528,1.340556,2.751667,2.345972,2.451806]
const matPaperWidths=[1.710972,2.769305,5.856111,5.909028,1.075972,2.240139,2.099028,1.781528,4.092223,4.797778]
// Convert the template's physical widths to CSS pixels; actions are web-only.
const toCssPixels=(cm:number)=>cm*96/2.54
const opEntryWidths=[...opPaperWidths.map(toCssPixels),56]
const matEntryWidths=matPaperWidths.map(toCssPixels)
const gridWidth=(widths:number[])=>widths.reduce((sum,width)=>sum+width,0)
function EntryCols({widths}:{widths:number[]}){return <colgroup>{widths.map((w,i)=><col key={i} style={{width:w}}/>)}</colgroup>}
function PaperCols({widths}:{widths:number[]}){
 const sum=gridWidth(widths)
 return <colgroup>{widths.map((v,i)=><col key={i} style={{width:(v/sum*100)+'%'}}/>)}</colgroup>
}
function SheetHeading({title,columns,extraColumns=0}:{title:string;columns:number;extraColumns?:number}){
 return <>
  <tr className="bkm-sheet-band"><th colSpan={columns}>{title}</th>{extraColumns>0&&<td colSpan={extraColumns}/>}</tr>
  <tr className="bkm-sheet-gap" aria-hidden="true"><td colSpan={columns+extraColumns}/></tr>
 </>
}
function OperationHeader({actions=false}:{actions?:boolean}){
 return <thead>
  <SheetHeading title="Operation" columns={opHeaders.length} extraColumns={actions?1:0}/>
  <tr className="bkm-sheet-header">
   <th scope="col" className="bkm-frozen-no" rowSpan={3}>No</th>
   <th colSpan={2}>Pekerjaan</th><th colSpan={2}>Field</th><th colSpan={6}>Target Kerja</th>
   {opHeaders.slice(11).map(h=><th scope="col" rowSpan={3} key={h}>{h}</th>)}
   {actions&&<th scope="col" rowSpan={3}>Aksi</th>}
  </tr>
  <tr className="bkm-sheet-header">
   {opHeaders.slice(1,8).map(h=><th scope="col" rowSpan={2} key={h}>{h}</th>)}
   <th colSpan={3}>Actual</th>
  </tr>
  <tr className="bkm-sheet-header">{opHeaders.slice(8,11).map(h=><th scope="col" key={h}>{h}</th>)}</tr>
 </thead>
}
function MaterialHeader({extra,actions=false}:{extra:string[];actions?:boolean}){
 return <thead>
  <SheetHeading title="Material" columns={matHeaders.length} extraColumns={extra.length+(actions?1:0)}/>
  <tr className="bkm-sheet-header">{[...matHeaders,...extra,...(actions?['Aksi']:[])].map((h,i)=><th scope="col" className={i===0?'bkm-frozen-no':undefined} key={h}>{h}</th>)}</tr>
 </thead>
}
function Paper({report,onEditMaterial}:{report:BkmDocument;onEditMaterial?:()=>void}){
 const ops=operationGrid(report),mats=materialGrid(report)
 return <div className="bkm-paper"><div className="bkm-paper-content" style={{width:gridWidth(opPaperWidths.map(toCssPixels))}}>
  <h2 className="bkm-sheet-title">REKAP BUKU KERJA MANDOR</h2>
  <div className="bkm-print-meta">{[['No',report.number],['PT',report.company],['Divisi',report.division],['Tanggal',report.date]].map(([k,v])=><div key={k}><b>{k}</b><span>: {v}</span></div>)}</div>
  <table className="bkm-print-table bkm-sheet-grid bkm-operation-sheet"><PaperCols widths={opPaperWidths}/><OperationHeader/>
   <tbody>{ops.map((row,i)=><tr key={i}>{values(row,i).map((v,j)=><td className={j>0&&typeof v==='number'?'bkm-sheet-numeric':undefined} key={j}>{j===10&&typeof v==='number'?formatPercent(v*100):typeof v==='number'?format(v):v}</td>)}</tr>)}</tbody>
   <OperationTotal rows={ops.filter(row=>row.candidate)} input={report.operationTotal}/>
  </table>
  {onEditMaterial&&<Button className="bkm-paper-material-edit" onClick={onEditMaterial}>Isi Material</Button>}
  <table className="bkm-print-table bkm-sheet-grid bkm-material-sheet"><PaperCols widths={[...matPaperWidths,...(report.materialColumns||[]).map(()=>2.5)]}/><MaterialHeader extra={report.materialColumns||[]}/>
   <tbody>{mats.map((m,i)=><tr key={i}>{materialValues(m,i).map((v,j)=><td className={j>0&&typeof v==='number'?'bkm-sheet-numeric':undefined} key={j}>{typeof v==='number'?format(v):v}</td>)}</tr>)}</tbody>
  </table>
  <table className="bkm-sign"><thead><tr><th>Disetujui Oleh</th><th>Diverifikasi oleh,</th><th>Dibuat oleh,</th></tr></thead><tbody><tr><td/><td/><td/></tr></tbody><tfoot><tr><th>General Manager</th><th>Manager</th><th>Asisten</th></tr></tfoot></table>
 </div></div>
}
function OperationTotal({rows,input,actions=false,onChange}:{rows:BkmInputRow[];input?:BkmTotalInput;actions?:boolean;onChange?:(value:BkmTotalInput)=>void}){
 const {units,unit,hi,hk,target,shi}=operationSummary(rows,input)
 const [search,setSearch]=useState<string|null>(null)
 return <tfoot className="bkm-operation-total"><tr>
  <td colSpan={5}>Total</td>
  <td className="bkm-sheet-numeric">{format(hk)}</td>
  <td className="bkm-total-unit">{onChange?<OperationCell field="uom" label="UoM Total" value={search??unit}
   disabled={!units.length} options={units.map(value=>({value,label:value}))} onChange={setSearch}
   onSelect={option=>{setSearch(null);if(unitKey(option.value)!==unitKey(unit))onChange({uom:option.value,hiOverride:null})}}
   onCommit={()=>setSearch(null)}/>:unit}</td>
  <td className="bkm-sheet-numeric">{format(target)}</td>
  <td className="bkm-sheet-numeric">{onChange?<InputNumber size="small" variant="borderless" controls={false}
   aria-label="Total HI" title="Isi angka manual atau kosongkan untuk kembali ke total otomatis" min={0} decimalSeparator=","
   value={hi} disabled={!unit} onChange={value=>onChange({uom:unit,hiOverride:value})}/>:format(hi)}</td>
  <td className="bkm-sheet-numeric">{format(shi)}</td>
  <td/><td colSpan={3}/>{actions&&<td/>}
 </tr></tfoot>
}
type OperationOption={value:string;label:string;searchText?:string;detail?:string}
function numberOptions(values:string[],prefix:string):OperationOption[]{
 const numbers=new Map<string,string>()
 for(const value of values){
  const number=value.trim()
  if(number&&!numbers.has(number.toUpperCase()))numbers.set(number.toUpperCase(),number)
 }
 return [...numbers.values()].map(value=>({value,label:value,searchText:prefix+' '+value}))
}
const optionValue=(value:string)=>'\u0000'+value
const searchWords=(value:string)=>value.normalize('NFKD').replace(/\p{M}/gu,'')
 .toLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim()
function searchOperationOptions(options:OperationOption[],query:string){
 const words=searchWords(query)
 if(!words)return options
 const terms=words.split(' '),compact=terms.join('')
 return options.flatMap(option=>{
  const label=searchWords(option.label).replaceAll(' ','')
  const text=searchWords(option.searchText||option.label)
  const combined=text.replaceAll(' ','')
  if(!combined.includes(compact)&&!terms.every(term=>text.includes(term)))return []
  const rank=label===compact?0:label.startsWith(compact)?1:combined.includes(compact)?2:3
  return [{option,rank}]
 }).sort((a,b)=>a.rank-b.rank).map(({option})=>option)
}
function OperationCell({field,label,value,disabled,options=[],onChange,onSelect,onCommit}:{
 field:keyof BkmOperationFields|'bkm';label:string;value:string;disabled:boolean;options?:OperationOption[];
 onChange:(value:string)=>void;onSelect?:(option:OperationOption)=>void;onCommit?:()=>void;
}){
 const [open,setOpen]=useState(false)
 const [query,setQuery]=useState('')
 const inputRef=useRef<React.ComponentRef<typeof AutoComplete>>(null)
 const props={'aria-label':label,size:'small' as const,variant:'borderless' as const,value,disabled}
 const maxLength=field==='bkm'?120:operationFieldLimits[field]
 if(!onSelect)return <Input {...props} maxLength={maxLength} onChange={event=>onChange(event.target.value)}/>
 const matches=searchOperationOptions(options,query)
 return <span style={{display:'contents'}} onKeyDownCapture={event=>{
   if(event.key!=='Tab')return
   // Leave the cell without accepting the highlighted suggestion.
   event.stopPropagation()
   setOpen(false)
   setQuery('')
   onCommit?.()
  }}><AutoComplete {...props} className={field==='pid'&&value?'bkm-paddock-filled':undefined}
  ref={inputRef} open={open&&!disabled&&matches.length>0}
  onOpenChange={next=>{setOpen(next);if(!next)setQuery('')}} onBlur={onCommit}
  defaultActiveFirstOption options={matches.map(option=>({...option,value:optionValue(option.value)}))}
  suffix={options.length>0&&<button type="button" className="bkm-dropdown-toggle" disabled={disabled}
   aria-label={'Buka pilihan '+label} aria-expanded={open&&!disabled}
   onMouseDown={event=>{event.preventDefault();event.stopPropagation()}} onClick={event=>{
    event.stopPropagation()
    if(open&&matches.length){setOpen(false);setQuery('');return}
    inputRef.current?.focus()
    setQuery('')
    setOpen(true)
   }}><span aria-hidden="true">▾</span></button>}
  popupMatchSelectWidth={field==='description'?320:240}
  filterOption={false}
  optionRender={({data})=><div>{data.label}{data.detail&&<small className="bkm-option-detail">{data.detail}</small>}</div>}
  onChange={text=>{if(!text.startsWith('\u0000')){const input=text.slice(0,maxLength);setQuery(input);setOpen(true);onChange(input)}}}
  onSelect={(_,option)=>{setOpen(false);setQuery('');onSelect({...option,value:option.value.slice(1)})}}/></span>
}
export default function BkmWorkspace({user,offlineOnly=false}:{user:User;offlineOnly?:boolean}){
 const uid=user.firebaseUid||''
 const draftKey='qc_bkm_draft_v1:'+firebaseAuth?.app.options.projectId+':'+uid
 const [report,setReport]=useState<BkmDocument>(()=>{try{const v=JSON.parse(localStorage.getItem(draftKey)||'null');return v?.date&&Array.isArray(v.rows)?{...v,rows:v.rows.map((r:BkmInputRow)=>!v.id&&r.hiManual===undefined?{...r,hiManual:true,hiOverride:r.hiOverride??null}:r)}:initial()}catch{return initial()}})
 const [candidates,setCandidates]=useState<BkmCandidate[]>([])
 const [masterActivities,setMasterActivities]=useState<BkmActivity[]>([])
 const [masterPaddocks,setMasterPaddocks]=useState<BkmPaddock[]>([])
 const [masterMaterials,setMasterMaterials]=useState<{code:string;name:string;unit:string}[]>([])
 const [loadedDate,setLoadedDate]=useState('')
 const [loadedAt,setLoadedAt]=useState('')
 const [saved,setSaved]=useState<BkmDocument[]>([])
 const [view,setView]=useState<'input'|'data'|'preview'>('input')
 const materialTable=useRef<HTMLTableElement>(null)
 const focusMaterial=useRef(false)
 useEffect(()=>{
  if(view==='input'&&focusMaterial.current){
   focusMaterial.current=false
   const first=materialTable.current?.querySelector<HTMLInputElement>('tbody input:not([disabled])')
   first?.scrollIntoView({block:'center',inline:'nearest'})
   first?.focus({preventScroll:true})
  }
 },[view])
 const [busy,setBusy]=useState(false)
 const [notice,noticeHolder]=antdMessage.useMessage()
 const [saving,setSaving]=useState(false)
 const [saveConfirmed,setSaveConfirmed]=useState(false)
 const saveLock=useRef(false)
 const successTimer=useRef<number|undefined>(undefined)
 const setMessage=(value:string)=>{if(value)void notice.open({type:value.includes('disimpan dan dikonfirmasi')||value.includes('Draft lokal tersimpan')?'success':'info',content:value,duration:4,key:'bkm-feedback'});else notice.destroy('bkm-feedback')}
 useEffect(()=>()=>{if(successTimer.current!==undefined)window.clearTimeout(successTimer.current)},[])
 const [error,setError]=useState('')
 const requestId=useRef(0)
 const editable=canEditAccess(user,'data_plan_actual')
 const [online,setOnline]=useState(()=>navigator.onLine)
 useEffect(()=>{const update=()=>setOnline(navigator.onLine);window.addEventListener('online',update);window.addEventListener('offline',update);return()=>{window.removeEventListener('online',update);window.removeEventListener('offline',update)}},[])
 const serverAvailable=online&&!offlineOnly
 const selected=actualRows(report)
 const actualIds=selected.flatMap(r=>r.candidate!.actualIds)
 const gridMaterials=materialGrid(report)
 const operationFields=report.rows.map(bkmOperationFields)
 const materialPaddockOptions=[...new Set(operationFields.map(fields=>fields.pid.trim().toUpperCase()).filter(Boolean))]
  .map(pid=>({value:pid,label:pid}))
 const materialWoOptions=numberOptions(operationFields.map(fields=>fields.wo),'WO')
 const materialBkmOptions=numberOptions(report.rows.map(row=>row.bkm),'BKM')
 const validMaterials=gridMaterials.every(m=>!hasMaterial(m)||(m.pid.trim()&&m.name.trim()&&m.unit.trim()))
 const incompleteOperation=report.rows.some(row=>bkmOperationIncomplete(row,report.company))
 const valid=!incompleteOperation&&validMaterials&&!!report.company.trim()&&!!report.division.trim()&&selected.length>0&&new Set(idsFor(selected)).size===selected.length&&new Set(actualIds).size===actualIds.length&&!selected.some(r=>r.candidate?.conflict||r.candidate?.company!==report.company.toUpperCase())
 const companies=[...new Set([...candidates.map(c=>c.company),...masterPaddocks.map(p=>p.company)])].sort()
 const materialColumns=report.materialColumns||[]
 const materialWidths=[...matEntryWidths,...materialColumns.map(()=>100),56]
 const [newColumn,setNewColumn]=useState('')
 const sourceLoaded=loadedDate===report.date
 const scoped=sourceLoaded?candidates.filter(c=>c.company===report.company.toUpperCase()):[]
 const activitiesByCode=new Map(masterActivities.map(activity=>[activity.operationCode,activity]))
 const paddocksByPid=new Map(masterPaddocks.filter(p=>p.pid&&p.company===report.company.toUpperCase()).map(p=>[p.pid,p]))
 const woOptions=[...new Set(scoped.map(c=>c.wo).filter(Boolean))].sort().map(value=>({value,label:value,searchText:'WO '+value}))
 const ids=selected.map(r=>r.candidate!.id)
 useEffect(()=>()=>{requestId.current++},[])
 function patchHeader<K extends 'date'|'company'|'division'|'number'>(key:K,value:string){
  if((key==='date'||key==='company')&&(selected.length||incompleteOperation)&&!window.confirm('Mengubah tanggal/PT akan mengosongkan isian pekerjaan. Lanjut?'))return
  setReport(old=>({...old,[key]:value,...(key==='date'||key==='company'?{id:'',revision:0,rows:Array.from({length:10},blank),materialEntries:undefined,materialColumns:undefined,operationTotal:undefined}:{})}))
  if(key==='date'){requestId.current++;setBusy(false);setCandidates([]);setLoadedDate('');setLoadedAt('');setSaved([])}
 }
 function patch(i:number,patch:Partial<BkmInputRow>){setReport(old=>({...old,rows:old.rows.map((r,j)=>i===j?{...r,...patch}:r)}))}
 function editOperation(i:number,row:BkmInputRow,field:keyof BkmOperationFields,value:string){
  patch(i,{operationFields:{...row.operationFields,[field]:value},
   ...(field==='description'?{activityFilter:''}:{})})
 }
 function moveCell(e:KeyboardEvent<HTMLElement>,i:number,col:'bkm'|'note'){
  if(!['ArrowUp','ArrowDown','Enter'].includes(e.key)||e.shiftKey||e.ctrlKey||e.altKey||e.metaKey)return
  const next=i+(e.key==='ArrowUp'?-1:1)
  const el=document.getElementById('bkm-cell-'+next+'-'+col)
  if(el){e.preventDefault();el.focus()}
 }
 function pasteCells(e:ClipboardEvent<HTMLElement>,i:number,col:'bkm'|'note'){
  const raw=e.clipboardData.getData('text/plain')
  if(!raw.includes('\t')&&!raw.includes('\n'))return
  e.preventDefault()
  const rows=raw.replace(/\r/g,'').replace(/\n$/,'').split('\n').slice(0,100-i)
  setReport(old=>{
   const next=old.rows.map(r=>({...r}))
   for(let offset=0;offset<rows.length;offset++){
    const at=i+offset
    while(next.length<=at)next.push(blank())
    const fields=rows[offset].split('\t')
    if(col==='bkm'){next[at].bkm=fields[0].slice(0,120);if(fields.length>1)next[at].note=fields[1].slice(0,800)}
    else next[at].note=fields[0].slice(0,800)
   }
   return {...old,rows:next}
  })
 }
 async function load(){
  if(!serverAvailable){setError('Muat sumber memerlukan internet.');return}
  if(selected.length&&!window.confirm('Muat ulang sumber? Pilihan lama yang tidak lagi ditemukan akan dikosongkan.'))return
  const token=++requestId.current,date=report.date
  setBusy(true);setError('');setMessage('')
  try{
   const result=await loadBkmCandidates(date)
   if(token!==requestId.current||firebaseAuth?.currentUser?.uid!==uid)return
   setCandidates(result.candidates);setMasterActivities(result.masterActivities);setMasterPaddocks(result.masterPaddocks);setMasterMaterials(result.masterMaterials);setLoadedDate(date);setLoadedAt(result.loadedAt)
   const names=new Map(result.masterActivities.map(activity=>[activity.operationCode,activity.description]))
   setReport(old=>({...old,company:old.company||([...new Set(result.candidates.map(c=>c.company))].length===1?result.candidates[0].company:''),rows:old.rows.map(row=>{
    if(!row.candidate)return row
    const source=result.candidates.find(c=>c.id===row.candidate?.id)
    if(source)return {...row,candidate:{...source,description:names.get(source.operationCode)||source.description}}
    if(row.candidate.id.startsWith('["manual",'))return row
    return {...row,candidate:null,...(Object.keys(row.operationFields||{}).length?{operationFields:bkmOperationFields(row)}:{})}
   })}))
   setMessage(result.candidates.length+' pekerjaan dari '+result.sourceCount+' record harian. Pilih PT dan pekerjaan.')
  }catch(e){if(token===requestId.current)setError(e instanceof Error?e.message:'Data gagal dimuat.')}
  finally{if(token===requestId.current)setBusy(false)}
 }
 function localSave(){
  try{
   if(!uid||firebaseAuth?.currentUser?.uid!==uid)throw Error('Akun tidak sesuai.')
   localStorage.setItem(draftKey,JSON.stringify(report));setMessage('Draft lokal tersimpan pada perangkat ini. Belum dikirim ke Firestore.');setError('')
  }catch(e){setError(e instanceof Error?e.message:'Draft lokal tidak dapat disimpan.')}
 }
 async function save(){
  if(!serverAvailable||!editable||!valid||busy||saveLock.current)return
  saveLock.current=true;setSaving(true);setSaveConfirmed(false)
  setBusy(true);setError('');setMessage('')
  try{const result=await saveBkm(report);setReport(old=>({...old,...result}));setMessage('Rekap BKM disimpan dan dikonfirmasi oleh Firestore.');setSaveConfirmed(true);if(successTimer.current!==undefined)window.clearTimeout(successTimer.current);successTimer.current=window.setTimeout(()=>setSaveConfirmed(false),2200)}
  catch(e){setError(e instanceof Error?e.message:'Simpan belum berhasil. Draft tidak dihapus.')}
  finally{saveLock.current=false;setSaving(false);setBusy(false)}
 }
 async function showSaved(){
  if(!serverAvailable){setError('Data Rekap server membutuhkan koneksi.');return}
  setView('data');setBusy(true);setError('')
  try{setSaved(await listBkm(report.date))}
  catch(e){setError(e instanceof Error?e.message:'Data Rekap belum dapat dibaca.')}
  finally{setBusy(false)}
 }
 function openSaved(doc:BkmDocument){
  setReport(doc);setView('input')
  setCandidates([]);setLoadedDate('');setMessage('Snapshot tersimpan dibuka. Muat sumber bila ingin memperbarui angka.')
 }
 function editMaterial(i:number,patch:Partial<BkmMaterialEntry>){
  setReport(old=>({...old,materialEntries:materialGrid(old).map((row,index)=>index===i?{...row,...patch}:row)}))
 }
 function addMaterialColumn(){
  const title=newColumn.trim()
  if(!title||title.length>60||[...matHeaders,...materialColumns,'Aksi'].some(v=>v.toLowerCase()===title.toLowerCase())||materialColumns.length>=8)return
  setReport(old=>({...old,materialColumns:[...(old.materialColumns||[]),title],materialEntries:materialGrid(old).map(m=>({...m,extra:[...m.extra,'']}))}));setNewColumn('')
 }
 function print(){
  setView('preview')
  window.setTimeout(()=>{
   document.body.classList.add('qc-bkm-print')
   try{window.print()}finally{document.body.classList.remove('qc-bkm-print')}
  },100)
 }
 return <section className="bkm-workspace">
  {noticeHolder}
  {!serverAvailable&&<Alert type="warning" showIcon title="Mode offline · hanya draft BKM akun ini" description="Data sumber baru dan penyimpanan Firestore memerlukan koneksi. Draft lokal yang tersimpan tetap dapat diedit dan dicetak."/>}
  <div className="bkm-toolbar bkm-top-toolbar">
   <div className="bkm-tabs">
    <Button aria-label="Input Rekap BKM" aria-pressed={view==='input'} type={view==='input'?'primary':'default'} onClick={()=>setView('input')}>Input</Button>
    <Button aria-label="Data Rekap BKM" aria-pressed={view==='data'} disabled={!serverAvailable} type={view==='data'?'primary':'default'} loading={busy&&view==='data'} onClick={()=>void showSaved()}>Data Rekap</Button>
    <Button aria-pressed={view==='preview'} type={view==='preview'?'primary':'default'} onClick={()=>setView('preview')}>Preview</Button>
   </div>
   <div className="bkm-output-actions">
    <Tooltip title="Export Excel"><span><Button className="bkm-icon-button bkm-excel-button" aria-label="Export Excel" icon={<ToolbarIcon name="excel"/>} disabled={busy||!valid} onClick={()=>{void downloadExcel(report).catch(e=>setError(e instanceof Error?e.message:"Export Excel gagal."))}}/></span></Tooltip>
    <Tooltip title="Print / PDF"><span><Button className="bkm-icon-button bkm-print-button" aria-label="Print / PDF" icon={<ToolbarIcon name="print"/>} disabled={busy||!valid} onClick={print}/></span></Tooltip>
   </div>
  </div>
  {error&&<Alert type="error" title={error} showIcon closable onClose={()=>setError('')}/>}
  {view==='data'?<><div className="bkm-toolbar"><label>Tanggal <input type="date" disabled={busy} value={report.date} onChange={e=>patchHeader('date',e.target.value)}/></label><Button onClick={()=>void showSaved()} loading={busy}>Cari rekap</Button></div><div className="bkm-grid-scroll"><table className="bkm-grid"><thead><tr><th>No</th><th>PT</th><th>Divisi</th><th>Tanggal</th><th>Pekerjaan</th><th>Aksi</th></tr></thead><tbody>{saved.map(d=><tr key={d.id}><td>{d.number||'—'}</td><td>{d.company}</td><td>{d.division}</td><td>{d.date}</td><td>{actualRows(d).length}</td><td><Button onClick={()=>openSaved(d)}>Buka</Button></td></tr>)}</tbody></table></div>{!saved.length&&!busy&&<p>Belum ada rekap yang ditampilkan pada tanggal ini.</p>}</>:view==='preview'?<Paper report={report} onEditMaterial={editable&&!busy?()=>{
   focusMaterial.current=true
   setView('input')
  }:undefined}/>:<>
   <Typography.Title level={4} className="bkm-sheet-title">REKAP BUKU KERJA MANDOR</Typography.Title>
   <div className="bkm-header-fields">
    <label>No <Input disabled={busy} value={report.number} maxLength={120} onChange={e=>patchHeader('number',e.target.value)} placeholder="Opsional"/></label>
    <label>PT <Select disabled={busy} showSearch value={report.company||undefined} placeholder="Pilih PT" options={[...new Set([...companies,report.company].filter(Boolean))].map(value=>({value,label:value}))} onChange={v=>patchHeader('company',v)}/></label>
    <label>Divisi <Input disabled={busy} value={report.division} maxLength={120} onChange={e=>patchHeader('division',e.target.value)}/></label>
    <label>Tanggal <input type="date" disabled={busy} value={report.date} onChange={e=>patchHeader('date',e.target.value)}/></label>
   </div>
   <div className="bkm-toolbar bkm-input-toolbar">
    <div className="bkm-input-actions">
     <Button aria-label="Muat sumber tanggal" disabled={!serverAvailable||busy} loading={busy&&!saving} onClick={()=>void load()}><span className="bkm-desktop-label">Muat sumber tanggal</span><span className="bkm-mobile-label">Muat sumber</span></Button>
     <Button aria-label="Simpan draft lokal" disabled={busy||!editable} onClick={localSave}><span className="bkm-desktop-label">Simpan draft lokal</span><span className="bkm-mobile-label">Draft lokal</span></Button>
     <Tooltip title={saving?'Sedang menyimpan':!serverAvailable?'Simpan Rekap memerlukan internet':!editable?'Tidak memiliki izin edit':!valid?'Lengkapi data sebelum menyimpan':'Simpan Rekap'}><span><Button className={'bkm-icon-button bkm-save-button'+(saveConfirmed?' bkm-save-confirmed':'')} aria-label="Simpan Rekap" type="primary" disabled={busy||!serverAvailable||!editable||!valid} loading={saving} icon={<ToolbarIcon name={saveConfirmed?'check':'save'}/>} onClick={()=>void save()}/></span></Tooltip>
     <Popover trigger="click" title="Petunjuk Rekap BKM" content={<div className="bkm-help-content">Klik Muat sumber tanggal. Tanpa WO, pilih Desc dari Master Activity dan Paddock dari master PT terkait. Pilih No WO untuk memakai data pekerjaan dari WO tersebut. Jika satu WO berisi beberapa pekerjaan, pilih Desc dan Paddock dari daftar yang tersaring. Anda juga bisa mengetik langsung di sel. Pada baris Total, pilih UoM untuk menjumlahkan HI per satuan. Isi Total HI secara manual atau kosongkan untuk kembali ke hitungan otomatis.</div>}><Button className="bkm-icon-button bkm-info-button" aria-label="Petunjuk Rekap BKM" icon={<ToolbarIcon name="info"/>}/></Popover>
    </div>
    {loadedAt&&<small className="bkm-source-time">Sumber: {new Date(loadedAt).toLocaleString('id-ID')}</small>}
   </div>
   <div className="bkm-grid-scroll"><table className="bkm-grid bkm-operation bkm-sheet-grid bkm-operation-sheet bkm-entry-grid" style={{width:gridWidth(opEntryWidths)}}><EntryCols widths={opEntryWidths}/><OperationHeader actions/><tbody>
    {report.rows.map((r,i)=>{
     const source=r.candidate
     const c=bkmOperationCandidate(r,report.company)
     const fields=bkmOperationFields(r)
     const resolved={...r,candidate:c}
     const realization=bkmRealization(c,r.hiOverride,r.hiManual)
     const disabled=busy||!editable
     const activityFilter=r.activityFilter||''
     const knownWo=woOptions.find(option=>option.value.toUpperCase()===fields.wo.trim().toUpperCase())?.value
     const matchesWo=knownWo?bkmAvailableCandidates(scoped,report.company,knownWo,ids,source?.id||''):[]
     const jobs=matchesWo.filter(job=>!activityFilter||job.operationCode===activityFilter)
     const activities=knownWo?[...new Map(matchesWo.filter(job=>job.operationCode).map(job=>
      [job.operationCode,activitiesByCode.get(job.operationCode)||job] as const)).values()]:[...activitiesByCode.values()]
     const actOptions=activities.map(a=>({value:a.operationCode,label:a.description,searchText:a.description+' '+a.operationCode,detail:activities.filter(x=>x.description===a.description).length>1?a.operationCode:''}))
     const options=knownWo?jobs.map(x=>({value:x.id,label:x.pid,searchText:[x.pid,x.description,x.wo,x.operationCode].join(' '),detail:jobs.filter(j=>j.pid===x.pid).length>1?[x.description,x.operationCode].join(' · '):''})):
      [...paddocksByPid.values()].map(p=>({value:p.pid,label:p.pid}))
     const applyCandidate=(found:BkmCandidate,filterWo:string)=>{
      const master=activitiesByCode.get(found.operationCode)
      const next=master?{...found,description:master.description}:found
      const unit=r.operationFields?.uom
      patch(i,{candidate:next,filterWo,activityFilter:next.operationCode,operationFields:unit===undefined?{}:{uom:unit},
       ...(next.id!==source?.id?{hiManual:true,hiOverride:null,hkOverride:null,note:next.notes}: {})})
     }
     const resetWo=(wo:string,filterWo='')=>{
      patch(i,{candidate:null,filterWo,activityFilter:'',hiManual:true,hiOverride:null,hkOverride:null,
       ...(r.note===source?.notes?{note:''}:{}),operationFields:wo?{wo}:{}})
     }
     const chooseWo=(wo:string)=>{
      const matches=bkmAvailableCandidates(scoped,report.company,wo,ids,source?.id||'')
      const match=matches.find(job=>job.id===source?.id)||(matches.length===1?matches[0]:undefined)
      if(match){applyCandidate(match,wo);return}
      resetWo(wo,wo)
     }
     const commitWo=()=>{
      if(r.operationFields?.wo===undefined)return
      if(knownWo){
       if(r.filterWo!==knownWo||fields.wo!==knownWo)chooseWo(knownWo)
       return
      }
      const previousWo=source?.wo||r.filterWo
      if(previousWo&&previousWo.toUpperCase()!==fields.wo.trim().toUpperCase())resetWo(fields.wo.trim())
     }
     return <tr key={i}>
     <td>{i+1}</td><td className="bkm-auto">{c?.operationCode||activityFilter}</td>
     <td title={fields.description}><OperationCell field="description" label={'Description baris '+(i+1)} value={fields.description} disabled={disabled}
      options={actOptions} onChange={value=>editOperation(i,r,'description',value)}
      onSelect={option=>{
       const match=matchesWo.filter(job=>job.operationCode===option.value)
       if(knownWo&&match.length===1){applyCandidate(match[0],knownWo);return}
       const activity=activitiesByCode.get(option.value),paddock=paddocksByPid.get(fields.pid.trim().toUpperCase())
       if(!knownWo&&!fields.wo.trim()&&activity&&paddock){applyCandidate(bkmManualCandidate(paddock.company,paddock,activity),'');return}
       patch(i,{activityFilter:option.value,operationFields:{...r.operationFields,description:option.label}})
      }}/></td>
     <td className="bkm-paddock-cell" title={fields.pid}><OperationCell field="pid" label={'Paddock baris '+(i+1)} value={fields.pid} disabled={disabled}
      options={options} onChange={value=>editOperation(i,r,'pid',value)}
      onSelect={option=>{
       const found=jobs.find(job=>job.id===option.value)
       if(found&&knownWo){applyCandidate(found,knownWo);return}
       const activity=activitiesByCode.get(activityFilter),paddock=paddocksByPid.get(option.value)
       if(!fields.wo.trim()&&activity&&paddock){applyCandidate(bkmManualCandidate(paddock.company,paddock,activity),'');return}
       patch(i,{operationFields:{...r.operationFields,pid:option.label}})
      }}/></td>
     <td className="bkm-auto">{format(c?.area)}</td>
     <td><InputNumber size="small" variant="borderless" controls={false} aria-label={'HK baris '+(i+1)} min={0} step={0.5} decimalSeparator="," value={effective(resolved,'hk')} disabled={disabled||!c} onChange={v=>patch(i,{hkOverride:v})}/></td>
     <td title={fields.uom}><OperationCell field="uom" label={'UoM baris '+(i+1)} value={fields.uom} disabled={disabled} onChange={value=>editOperation(i,r,'uom',value)}/></td>
     <td className="bkm-auto">{format(effective(resolved,'target'))}</td>
     <td><InputNumber size="small" variant="borderless" aria-label={'HI baris '+(i+1)} min={0} step={1} decimalSeparator="," controls={false} value={realization.hi} disabled={disabled||!c} onChange={v=>patch(i,{hiManual:true,hiOverride:v})}/></td>
     <td className="bkm-auto">{format(realization.balance)}</td><td className="bkm-auto">{formatPercent(realization.progress)}</td>
     <td title={fields.wo}><OperationCell field="wo" label={'WO baris '+(i+1)} value={fields.wo} disabled={disabled}
      options={woOptions} onChange={value=>editOperation(i,r,'wo',value)}
      onSelect={option=>chooseWo(option.value)}
      onCommit={commitWo}/></td>
     <td><Input size="small" variant="borderless" id={'bkm-cell-'+i+'-bkm'} onKeyDown={e=>moveCell(e,i,'bkm')} onPaste={e=>pasteCells(e,i,'bkm')} aria-label={'BKM baris '+(i+1)} value={r.bkm} disabled={busy||!editable} maxLength={120} onChange={e=>patch(i,{bkm:e.target.value})}/></td>
     <td><div className="bkm-note-cell"><Input.TextArea size="small" variant="borderless" id={'bkm-cell-'+i+'-note'} onKeyDown={e=>moveCell(e,i,'note')} onPaste={e=>pasteCells(e,i,'note')} aria-label={'Keterangan baris '+(i+1)} value={r.note} disabled={busy||!editable} maxLength={800} autoSize={{minRows:1,maxRows:3}} onChange={e=>patch(i,{note:e.target.value})}/>{!!c?.warnings.length&&<Popover trigger="click" title="Catatan sumber" content={<div className="bkm-help-content">{c.warnings.map(w=><div key={w}>{w}</div>)}</div>}><Button size="small" type="text" className="bkm-cell-action bkm-warning-icon" aria-label={'Catatan sumber baris '+(i+1)} icon={<ToolbarIcon name="info"/>}/></Popover>}</div></td>
     <td><div className="bkm-cell-actions"><Tooltip title="Bersihkan"><span><Button size="small" type="text" className="bkm-cell-action" aria-label={'Bersihkan baris '+(i+1)} icon={<ToolbarIcon name="clear"/>} disabled={disabled} onClick={()=>patch(i,blank())}/></span></Tooltip><Tooltip title="Duplikat isian"><span><Button size="small" type="text" className="bkm-cell-action" aria-label={'Duplikat isian baris '+(i+1)} icon={<ToolbarIcon name="copy"/>} disabled={disabled||report.rows.length>=100} onClick={()=>setReport(old=>({...old,rows:[...old.rows.slice(0,i+1),{...r,candidate:null,operationFields:{...fields,pid:''},hiManual:true,hiOverride:null,hkOverride:null},...old.rows.slice(i+1)]}))}/></span></Tooltip></div></td>
    </tr>})}
   </tbody><OperationTotal rows={selected} input={report.operationTotal} actions
    onChange={busy||!editable?undefined:operationTotal=>setReport(old=>({...old,operationTotal}))}/></table></div>
   {incompleteOperation&&<Alert type="warning" title="Lengkapi Desc dan Paddock pada setiap baris Operation yang diisi."/>}
   <div className="bkm-toolbar"><Button disabled={!editable||report.rows.length>=100} onClick={()=>setReport(old=>({...old,rows:[...old.rows,blank()]}))}>+ Tambah baris</Button><Button disabled={!editable||report.rows.length<=1} onClick={()=>{const last=report.rows.at(-1);if(!last||(!bkmOperationCandidate(last,report.company)&&!bkmOperationIncomplete(last,report.company))||window.confirm('Hapus isian pada baris terakhir?'))setReport(old=>({...old,rows:old.rows.slice(0,-1)}))}}>Hapus baris terakhir</Button><Button disabled={busy||!editable} onClick={()=>{if(window.confirm('Buat rekap baru? Draft lokal yang sudah disimpan tetap ada sampai ditimpa.')){setReport(initial());setCandidates([]);setLoadedDate('');setLoadedAt('')}}}>Rekap baru</Button></div>
   <div className="bkm-toolbar"><Button disabled={busy||!editable||gridMaterials.length>=100} onClick={()=>setReport(old=>({...old,materialEntries:[...materialGrid(old),blankMaterial(old.materialColumns?.length||0)]}))}>+ Tambah baris Material</Button><Button disabled={busy||!editable} onClick={()=>{if(window.confirm('Ganti isian Material dengan alokasi QC yang terverifikasi?'))setReport(old=>({...old,materialEntries:qcMaterialGrid(old)}))}}>Ambil Material dari QC</Button><Input style={{width:180}} value={newColumn} onChange={e=>setNewColumn(e.target.value)} maxLength={60} placeholder="Nama kolom tambahan"/><Button disabled={busy||!editable||!newColumn.trim()||materialColumns.length>=8||[...matHeaders,...materialColumns,'Aksi'].some(v=>v.toLowerCase()===newColumn.trim().toLowerCase())} onClick={addMaterialColumn}>+ Tambah kolom</Button></div>
   <datalist id="bkm-master-materials">{masterMaterials.map((m,i)=><option key={i} value={m.name}/>)}</datalist>
   <div className="bkm-grid-scroll"><table ref={materialTable} className="bkm-grid bkm-sheet-grid bkm-material-sheet bkm-entry-grid" style={{width:gridWidth(materialWidths)}}><EntryCols widths={materialWidths}/><MaterialHeader extra={materialColumns} actions/><tbody onClick={event=>{
    const target=event.target
    if(target instanceof Element&&!target.closest('input,button'))target.closest('td')?.querySelector<HTMLInputElement>('input:not([disabled])')?.focus()
   }}>{gridMaterials.map((m,i)=><tr key={i}>
    <td>{i+1}</td><td title={m.pid}><OperationCell field="pid" label={'Material Paddock '+(i+1)} value={m.pid}
     disabled={busy||!editable} options={materialPaddockOptions}
     onChange={value=>editMaterial(i,{pid:value})} onSelect={option=>editMaterial(i,{pid:option.value})}/></td>
    <td><Input size="small" variant="borderless" aria-label={'No Material '+(i+1)} value={m.code} disabled={busy||!editable} onChange={e=>editMaterial(i,{code:e.target.value})}/></td>
    <td><Input size="small" variant="borderless" aria-label={'Nama Material '+(i+1)} list="bkm-master-materials" value={m.name} disabled={busy||!editable} onChange={e=>{const name=e.target.value,match=masterMaterials.filter(x=>x.name===name);editMaterial(i,{name,...(match.length===1?{code:match[0].code,unit:match[0].unit}:{})})}}/></td>
    <td><Input size="small" variant="borderless" aria-label={'UoM Material '+(i+1)} value={m.unit} disabled={busy||!editable} onChange={e=>editMaterial(i,{unit:e.target.value})}/></td>
    <td><InputNumber size="small" variant="borderless" controls={false} aria-label={'Qty HI '+(i+1)} min={0} decimalSeparator="," value={m.hi} disabled={busy||!editable} onChange={v=>editMaterial(i,{hi:v})}/></td>
    <td><InputNumber size="small" variant="borderless" controls={false} aria-label={'Qty SHI '+(i+1)} min={0} decimalSeparator="," value={m.shi} disabled={busy||!editable} onChange={v=>editMaterial(i,{shi:v})}/></td>
    <td title={m.wo}><OperationCell field="wo" label={'No WO Material '+(i+1)} value={m.wo}
     disabled={busy||!editable} options={materialWoOptions}
     onChange={value=>editMaterial(i,{wo:value})} onSelect={option=>editMaterial(i,{wo:option.value})}/></td>
    <td title={m.bkm}><OperationCell field="bkm" label={'No BKM Material '+(i+1)} value={m.bkm}
     disabled={busy||!editable} options={materialBkmOptions}
     onChange={value=>editMaterial(i,{bkm:value})} onSelect={option=>editMaterial(i,{bkm:option.value})}/></td>
    <td><Input size="small" variant="borderless" aria-label={'note Material '+(i+1)} value={m.note} disabled={busy||!editable} onChange={e=>editMaterial(i,{note:e.target.value})}/></td>
    {materialColumns.map((h,j)=><td key={h}><Input size="small" variant="borderless" aria-label={h+' Material '+(i+1)} maxLength={800} value={m.extra[j]||''} disabled={busy||!editable} onChange={e=>editMaterial(i,{extra:m.extra.map((v,k)=>k===j?e.target.value:v)})}/></td>)}
    <td><div className="bkm-cell-actions">
     <Tooltip title="Bersihkan isi baris"><span><Button size="small" type="text" className="bkm-cell-action" aria-label={'Bersihkan Material baris '+(i+1)} icon={<ToolbarIcon name="clear"/>} disabled={busy||!editable||!hasMaterial(m)} onClick={()=>editMaterial(i,blankMaterial(materialColumns.length))}/></span></Tooltip>
     <Tooltip title="Hapus baris Material"><span><Button size="small" type="text" className="bkm-cell-action" aria-label={'Hapus Material baris '+(i+1)} icon={<ToolbarIcon name="trash"/>} disabled={busy||!editable||gridMaterials.length<=1} onClick={()=>setReport(old=>({...old,materialEntries:materialGrid(old).filter((_,j)=>j!==i)}))}/></span></Tooltip>
    </div></td>
   </tr>)}</tbody></table></div>
   {!validMaterials&&<Alert type="warning" title="Lengkapi Paddock, Nama Material dan UoM pada setiap baris Material yang diisi."/>}
   <small>Pilihan Paddock, No WO, dan No BKM Material mengikuti isian Operation pada rekap ini. Material bisa diisi manual, termasuk Qty HI dan Qty SHI (akumulasi material). Kolom tambahan disimpan dan ikut dalam Excel serta PDF. Tidak mengubah transaksi stok atau Actual Plan.</small>
  </>}
 </section>
}
