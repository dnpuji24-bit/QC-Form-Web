import { useEffect, useMemo, useState } from 'react'
import { collection, getDocs } from 'firebase/firestore'
import { firestoreDb } from './firebase'
import { FALLBACK_COMPANIES, type CompanyRecord } from './companyMaster'

type ProgressEntry={date:string;areaHa:number;stage?:string}
type PaddockRow={
  pid:string
  companyCode:string
  companyPrefix:string
  farm:string
  block:string
  paddock:string
  variety:string
  blockLc:string
  areaPlantedHa:number
  currentStage:string
  harvestedCurrentStageHa:number
  remainingHarvestCurrentStageHa:number
  lastHarvestDate:string|null
  active:boolean
  sourceFileName:string
  lastImportBatchId:string
  plantProgress:ProgressEntry[]
  harvestProgress:ProgressEntry[]
}

type ImportLog={
  batchId:string
  companyCode:string
  companyName:string
  farmScope:string
  sourceFileName:string
  created:number
  updated:number
  unchanged:number
  warnings:number
  importedBy:string
  importedAt:string
}

function companyFromData(id:string,data:Record<string,unknown>):CompanyRecord{
  return{id,code:String(data.code||id).toUpperCase(),name:String(data.name||''),prefixes:Array.isArray(data.prefixes)?data.prefixes.map(item=>String(item).toUpperCase()).filter(Boolean):[],active:data.active!==false}
}
function numberValue(value:unknown){const number=Number(value||0);return Number.isFinite(number)?number:0}
function dateValue(value:unknown){
  if(!value)return''
  if(typeof value==='string')return value
  if(typeof value==='object'&&value!==null&&'toDate' in value&&typeof (value as {toDate?:unknown}).toDate==='function'){
    try{return((value as {toDate:()=>Date}).toDate()).toISOString()}catch{return''}
  }
  return''
}
function progressFromData(value:unknown):ProgressEntry[]{
  if(!Array.isArray(value))return[]
  return value.map(item=>{
    const row=(item&&typeof item==='object'?item:{}) as Record<string,unknown>
    return{date:String(row.date||''),areaHa:numberValue(row.areaHa),stage:row.stage?String(row.stage):undefined}
  }).filter(item=>item.date&&item.areaHa>=0).sort((a,b)=>a.date.localeCompare(b.date))
}
function paddockFromData(id:string,data:Record<string,unknown>):PaddockRow{
  return{
    pid:String(data.pid||id),companyCode:String(data.companyCode||''),companyPrefix:String(data.companyPrefix||''),farm:String(data.farm||''),block:String(data.block||''),paddock:String(data.paddock||''),variety:String(data.variety||''),blockLc:String(data.blockLc||''),areaPlantedHa:numberValue(data.areaPlantedHa),currentStage:String(data.currentStage||'PC'),harvestedCurrentStageHa:numberValue(data.harvestedCurrentStageHa),remainingHarvestCurrentStageHa:numberValue(data.remainingHarvestCurrentStageHa),lastHarvestDate:data.lastHarvestDate?String(data.lastHarvestDate):null,active:data.active!==false,sourceFileName:String(data.sourceFileName||''),lastImportBatchId:String(data.lastImportBatchId||''),plantProgress:progressFromData(data.plantProgress),harvestProgress:progressFromData(data.harvestProgress)
  }
}
function logFromData(id:string,data:Record<string,unknown>):ImportLog{
  return{batchId:String(data.batchId||id),companyCode:String(data.companyCode||''),companyName:String(data.companyName||''),farmScope:String(data.farmScope||'ALL'),sourceFileName:String(data.sourceFileName||''),created:numberValue(data.created),updated:numberValue(data.updated),unchanged:numberValue(data.unchanged),warnings:numberValue(data.warnings),importedBy:String(data.importedBy||''),importedAt:dateValue(data.importedAt)}
}
function formatDate(value:string|null){if(!value)return'-';const date=new Date(value);return Number.isNaN(date.getTime())?value:date.toLocaleDateString('id-ID',{day:'2-digit',month:'2-digit',year:'numeric'})}
function formatDateTime(value:string){if(!value)return'-';const date=new Date(value);return Number.isNaN(date.getTime())?value:date.toLocaleString('id-ID',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'})}
function inRange(date:string,from:string,to:string){if(!date)return false;return(!from||date>=from)&&(!to||date<=to)}
function progressInRange(events:ProgressEntry[],from:string,to:string){return events.reduce((sum,item)=>sum+(inRange(item.date,from,to)?item.areaHa:0),0)}

export default function MasterPaddockListPanel(){
  const[rows,setRows]=useState<PaddockRow[]>([])
  const[companies,setCompanies]=useState<CompanyRecord[]>(FALLBACK_COMPANIES)
  const[logs,setLogs]=useState<ImportLog[]>([])
  const[busy,setBusy]=useState(false),[message,setMessage]=useState('')
  const[company,setCompany]=useState('ALL'),[farm,setFarm]=useState('ALL'),[stage,setStage]=useState('ALL'),[query,setQuery]=useState('')
  const[dateFrom,setDateFrom]=useState(''),[dateTo,setDateTo]=useState('')

  async function load(){
    if(!firestoreDb){setMessage('Firestore belum tersedia.');return}
    setBusy(true);setMessage('Memuat Master Paddock Firestore…')
    try{
      const[paddockSnap,companySnap,logSnap]=await Promise.all([getDocs(collection(firestoreDb,'master_paddocks')),getDocs(collection(firestoreDb,'master_companies')),getDocs(collection(firestoreDb,'master_import_logs'))])
      const nextRows=paddockSnap.docs.map(item=>paddockFromData(item.id,item.data() as Record<string,unknown>)).sort((a,b)=>a.pid.localeCompare(b.pid,undefined,{numeric:true}))
      const nextCompanies=companySnap.docs.map(item=>companyFromData(item.id,item.data() as Record<string,unknown>)).filter(item=>item.active).sort((a,b)=>a.code.localeCompare(b.code))
      const nextLogs=logSnap.docs.map(item=>logFromData(item.id,item.data() as Record<string,unknown>)).sort((a,b)=>b.importedAt.localeCompare(a.importedAt)).slice(0,20)
      setRows(nextRows);if(nextCompanies.length)setCompanies(nextCompanies);setLogs(nextLogs);setMessage(`Rekapan Firestore siap: ${nextRows.length} Master Paddock.`)
    }catch(error){setMessage(error instanceof Error?error.message:'Master Paddock Firestore gagal dimuat.')}finally{setBusy(false)}
  }

  useEffect(()=>{void load()},[])

  const farmOptions=useMemo(()=>[...new Set(rows.filter(row=>company==='ALL'||row.companyCode===company).map(row=>row.farm).filter(Boolean))].sort((a,b)=>a.localeCompare(b,undefined,{numeric:true})),[rows,company])
  const stageOptions=useMemo(()=>[...new Set(rows.map(row=>row.currentStage).filter(Boolean))].sort((a,b)=>a.localeCompare(b,undefined,{numeric:true})),[rows])
  const searchSuggestions=useMemo(()=>{
    const source=rows.filter(row=>(company==='ALL'||row.companyCode===company)&&(farm==='ALL'||row.farm===farm)&&(stage==='ALL'||row.currentStage===stage))
    const values=new Set<string>()
    source.forEach(row=>{values.add(row.pid);if(row.variety)values.add(row.variety);if(row.block)values.add(row.block);if(row.paddock)values.add(row.paddock)})
    return[...values].sort((a,b)=>a.localeCompare(b,undefined,{numeric:true})).slice(0,800)
  },[rows,company,farm,stage])
  const filtered=useMemo(()=>{
    const needle=query.trim().toLowerCase(),hasDate=Boolean(dateFrom||dateTo)
    return rows.filter(row=>{
      const base=(company==='ALL'||row.companyCode===company)&&(farm==='ALL'||row.farm===farm)&&(stage==='ALL'||row.currentStage===stage)&&(!needle||`${row.pid} ${row.companyCode} ${row.farm} ${row.block} ${row.paddock} ${row.variety}`.toLowerCase().includes(needle))
      if(!base)return false
      if(!hasDate)return true
      return row.plantProgress.some(item=>inRange(item.date,dateFrom,dateTo))||row.harvestProgress.some(item=>inRange(item.date,dateFrom,dateTo))
    })
  },[rows,company,farm,stage,query,dateFrom,dateTo])
  const totalArea=useMemo(()=>filtered.reduce((sum,row)=>sum+row.areaPlantedHa,0),[filtered])
  const totalHarvest=useMemo(()=>filtered.reduce((sum,row)=>sum+row.harvestedCurrentStageHa,0),[filtered])
  const plantRangeTotal=useMemo(()=>filtered.reduce((sum,row)=>sum+progressInRange(row.plantProgress,dateFrom,dateTo),0),[filtered,dateFrom,dateTo])
  const harvestRangeTotal=useMemo(()=>filtered.reduce((sum,row)=>sum+progressInRange(row.harvestProgress,dateFrom,dateTo),0),[filtered,dateFrom,dateTo])
  const activeCount=useMemo(()=>filtered.filter(row=>row.active).length,[filtered])
  const stageCounts=useMemo(()=>{const map=new Map<string,number>();filtered.forEach(row=>map.set(row.currentStage,(map.get(row.currentStage)||0)+1));return map},[filtered])
  const hasProgressHistory=useMemo(()=>rows.some(row=>row.plantProgress.length||row.harvestProgress.length),[rows])
  const farmSummary=useMemo(()=>{
    const map=new Map<string,{company:string;farm:string;pids:number;area:number;plantRange:number;harvestRange:number;pc:number;r1:number;r2:number}>()
    filtered.forEach(row=>{const key=`${row.companyCode}__${row.farm}`,item=map.get(key)||{company:row.companyCode,farm:row.farm,pids:0,area:0,plantRange:0,harvestRange:0,pc:0,r1:0,r2:0};item.pids+=1;item.area+=row.areaPlantedHa;item.plantRange+=progressInRange(row.plantProgress,dateFrom,dateTo);item.harvestRange+=progressInRange(row.harvestProgress,dateFrom,dateTo);if(row.currentStage==='PC')item.pc+=1;if(row.currentStage==='R1')item.r1+=1;if(row.currentStage==='R2')item.r2+=1;map.set(key,item)})
    return[...map.values()].sort((a,b)=>a.company.localeCompare(b.company)||a.farm.localeCompare(b.farm,undefined,{numeric:true}))
  },[filtered,dateFrom,dateTo])

  function chooseCompany(value:string){setCompany(value);setFarm('ALL')}
  function reset(){setQuery('');setCompany('ALL');setFarm('ALL');setStage('ALL');setDateFrom('');setDateTo('')}

  return <section>
    <div className="section-head"><div><div className="eyebrow">FIRESTORE MASTER</div><h2>Daftar Paddock</h2><p className="muted">Rekapan Master Paddock yang sudah benar-benar tersimpan di Firestore. Area Plan mengambil <strong>Area Paddock (Ha)</strong> dari sheet Area Plant, sedangkan progres tanggal mengambil kolom Progres.</p></div><button type="button" disabled={busy} onClick={()=>void load()}>{busy?'Memuat…':'Refresh'}</button></div>
    {message&&<div className="alert">{message}</div>}
    <div className="panel">
      <div className="record-filters">
        <div><input list="paddock-smart-search" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Smart search PID / variety / block…"/><datalist id="paddock-smart-search">{searchSuggestions.map(item=><option key={item} value={item}/>)}</datalist></div>
        <select value={company} onChange={e=>chooseCompany(e.target.value)}><option value="ALL">Semua Company</option>{companies.map(item=><option key={item.id} value={item.code}>{item.code} - {item.name}</option>)}</select>
        <select value={farm} onChange={e=>setFarm(e.target.value)}><option value="ALL">Semua Farm</option>{farmOptions.map(item=><option key={item} value={item}>Farm {item}</option>)}</select>
        <select value={stage} onChange={e=>setStage(e.target.value)}><option value="ALL">Semua Stage</option>{stageOptions.map(item=><option key={item} value={item}>{item}</option>)}</select>
        <button type="button" onClick={reset}>Reset</button>
      </div>
      <div className="form-grid">
        <label>Progress dari tanggal<input type="date" value={dateFrom} max={dateTo||undefined} onChange={e=>setDateFrom(e.target.value)}/></label>
        <label>Progress sampai tanggal<input type="date" value={dateTo} min={dateFrom||undefined} onChange={e=>setDateTo(e.target.value)}/></label>
        <div><strong>Filter Progress Date</strong><p className="muted" style={{margin:'7px 0 0'}}>Rentang ini menghitung Progres (Ha) Area Plant dan Progres (Ha) Area Geometri Area Harvest pada tanggal yang dipilih.</p></div>
      </div>
      {!hasProgressHistory&&<div className="alert">Riwayat progress per tanggal belum tersimpan pada Master Paddock lama. Upload ulang file Administrasi melalui tab Update / Import agar filter tanggal dapat digunakan.</div>}
    </div>
    <div className="stats-grid">
      <div className="stat"><span>PID</span><strong>{filtered.length}</strong></div>
      <div className="stat"><span>Area Plan / Paddock</span><strong>{totalArea.toFixed(2)} Ha</strong></div>
      <div className="stat"><span>Plant Progress {dateFrom||dateTo?'Rentang':'Tersimpan'}</span><strong>{plantRangeTotal.toFixed(2)} Ha</strong></div>
      <div className="stat"><span>Harvest Progress {dateFrom||dateTo?'Rentang':'Tersimpan'}</span><strong>{harvestRangeTotal.toFixed(2)} Ha</strong></div>
      <div className="stat"><span>Harvest Stage Aktif</span><strong>{totalHarvest.toFixed(2)} Ha</strong></div>
      <div className="stat"><span>Active</span><strong>{activeCount}</strong></div>
      <div className="stat"><span>PC</span><strong>{stageCounts.get('PC')||0}</strong></div>
      <div className="stat"><span>R1</span><strong>{stageCounts.get('R1')||0}</strong></div>
      <div className="stat"><span>R2</span><strong>{stageCounts.get('R2')||0}</strong></div>
    </div>
    <div className="panel">
      <div className="section-head"><div><h3>Rekap per Farm</h3><p className="muted">Mengikuti filter Company, Farm, Stage, smart search, dan Progress Date.</p></div></div>
      <div className="table-wrap"><table><thead><tr><th>Company</th><th>Farm</th><th>PID</th><th>Area Plan</th><th>Plant Progress</th><th>Harvest Progress</th><th>PC</th><th>R1</th><th>R2</th></tr></thead><tbody>{farmSummary.map(item=><tr key={`${item.company}-${item.farm}`}><td>{item.company}</td><td>{item.farm||'-'}</td><td>{item.pids}</td><td>{item.area.toFixed(4)} Ha</td><td>{item.plantRange.toFixed(4)} Ha</td><td>{item.harvestRange.toFixed(4)} Ha</td><td>{item.pc}</td><td>{item.r1}</td><td>{item.r2}</td></tr>)}{!farmSummary.length&&<tr><td colSpan={9} className="empty">Belum ada Master Paddock sesuai filter.</td></tr>}</tbody></table></div>
    </div>
    <div className="panel">
      <div className="section-head"><div><h3>Detail Master Paddock</h3><p className="muted">{filtered.length} paddock ditampilkan.</p></div></div>
      <div className="table-wrap"><table><thead><tr><th>Company</th><th>Farm</th><th>PID</th><th>Block</th><th>Paddock</th><th>Variety</th><th>Area Plan</th><th>Plant Progress</th><th>Harvest Progress</th><th>Stage</th><th>Harvest Stage</th><th>Sisa Stage</th><th>Last Harvest</th><th>Source</th></tr></thead><tbody>{filtered.map(row=><tr key={row.pid}><td>{row.companyCode}</td><td>{row.farm||'-'}</td><td><strong>{row.pid}</strong></td><td>{row.block||'-'}</td><td>{row.paddock||'-'}</td><td>{row.variety||'-'}</td><td>{row.areaPlantedHa.toFixed(4)} Ha</td><td>{progressInRange(row.plantProgress,dateFrom,dateTo).toFixed(4)} Ha</td><td>{progressInRange(row.harvestProgress,dateFrom,dateTo).toFixed(4)} Ha</td><td><span className="badge">{row.currentStage}</span></td><td>{row.harvestedCurrentStageHa.toFixed(4)} Ha</td><td>{row.remainingHarvestCurrentStageHa.toFixed(4)} Ha</td><td>{formatDate(row.lastHarvestDate)}</td><td>{row.sourceFileName||'-'}</td></tr>)}{!filtered.length&&<tr><td colSpan={14} className="empty">Belum ada Master Paddock tersimpan atau tidak ada data sesuai filter.</td></tr>}</tbody></table></div>
    </div>
    <div className="panel">
      <div className="section-head"><div><h3>Riwayat Import Terakhir</h3><p className="muted">20 batch Master Paddock terbaru.</p></div></div>
      <div className="table-wrap"><table><thead><tr><th>Waktu</th><th>Batch</th><th>Company</th><th>Farm</th><th>File</th><th>Create</th><th>Update</th><th>Tidak berubah</th><th>Warning</th><th>Oleh</th></tr></thead><tbody>{logs.map(log=><tr key={log.batchId}><td>{formatDateTime(log.importedAt)}</td><td>{log.batchId}</td><td>{log.companyCode}</td><td>{log.farmScope==='ALL'?'Semua':log.farmScope}</td><td>{log.sourceFileName||'-'}</td><td>{log.created}</td><td>{log.updated}</td><td>{log.unchanged}</td><td>{log.warnings}</td><td>{log.importedBy||'-'}</td></tr>)}{!logs.length&&<tr><td colSpan={10} className="empty">Belum ada riwayat import.</td></tr>}</tbody></table></div>
    </div>
  </section>
}