import { useEffect, useMemo, useState } from 'react'
import { collection, doc, getDoc, getDocs, query as fsQuery, serverTimestamp, where, writeBatch } from 'firebase/firestore'
import { firebaseAuth, firebaseAuthPersistenceReady, firestoreDb } from './firebase'
import DailyActionIcon from './DailyPlanActionIcon'
import { actualPlansToWhatsApp } from './actualPlanActions'
import type { SavedActualRow } from './actualPlanWorkspaceTypes'
import type { PlanMaterialLine } from './planInputUtils'
import type { User } from './types'

type Props={
  user:User
  selectedDate?:string
  compact?:boolean
  refreshKey?:number
  onEditActual?:(row:SavedActualRow)=>void
  onDuplicateActual?:(row:SavedActualRow)=>void
  onChanged?:()=>void
}
type Row=SavedActualRow&{dailySourcePlanIdRaw:string;monthlyLegacyPlanId:string;paddockRaw:string;masterPending:boolean}
type Log={id:string;sourceFileName:string;total:number;created:number;updated:number;unchanged:number;protected:number;dailyLinked:number;dailyPending:number;monthlyLinked:number;masterPending:number;warnings:number;errors:number;importedBy:string;importedAt:string}

function text(v:unknown){return v===null||v===undefined?'':String(v).trim()}
function num(v:unknown){const n=Number(v||0);return Number.isFinite(n)?n:0}
function dt(v:unknown){if(!v)return'';if(typeof v==='string')return v;if(typeof v==='object'&&v!==null&&'toDate'in v&&typeof(v as {toDate?:unknown}).toDate==='function'){try{return(v as {toDate:()=>Date}).toDate().toISOString()}catch{return''}}return''}
function materialsFromData(value:unknown):PlanMaterialLine[]{if(!Array.isArray(value))return[];return value.map(item=>{const x=(item&&typeof item==='object'?item:{}) as Record<string,unknown>;return{material:text(x.material),dosePerHa:num(x.dosePerHa),doseUnit:text(x.doseUnit),totalMaterial:num(x.totalMaterial),unit:text(x.unit)}}).filter(x=>x.material||x.dosePerHa||x.totalMaterial)}
function row(id:string,d:Record<string,unknown>):Row{return{id,actualReportId:text(d.actualReportId||id),workGroupId:text(d.workGroupId)||text(d.actualReportId||id),planningOrder:num(d.planningOrder)||999999,date:text(d.date),monthKey:text(d.monthKey),shift:text(d.shift),sourceType:text(d.sourceType),dailyLinkStatus:text(d.dailyLinkStatus),monthlyLinkStatus:text(d.monthlyLinkStatus),dailyPlanId:text(d.dailyPlanId),monthlyPlanLineId:text(d.monthlyPlanLineId),dailySourcePlanIdRaw:text(d.dailySourcePlanIdRaw),monthlyLegacyPlanId:text(d.monthlyLegacyPlanId),companyCode:text(d.companyCode),farm:text(d.farm),pid:text(d.pid),paddockRaw:text(d.paddockRaw),activity:text(d.activity),actualAreaHa:num(d.actualAreaHa),plannedDailyAreaHa:num(d.plannedDailyAreaHa),dailyVarianceHa:num(d.dailyVarianceHa),manpower:num(d.manpower),unitName:text(d.unitName),unitReady:num(d.unitReady),unitStandby:num(d.unitStandby),unitBreakdown:num(d.unitBreakdown),foreman:text(d.foreman),notes:text(d.notes),materials:materialsFromData(d.materials),masterPending:d.masterPending===true}}
function log(id:string,d:Record<string,unknown>):Log{return{id,sourceFileName:text(d.sourceFileName),total:num(d.total),created:num(d.created),updated:num(d.updated),unchanged:num(d.unchanged),protected:num(d.protected),dailyLinked:num(d.dailyLinked),dailyPending:num(d.dailyPending),monthlyLinked:num(d.monthlyLinked),masterPending:num(d.masterPending),warnings:num(d.warnings),errors:num(d.errors),importedBy:text(d.importedBy),importedAt:dt(d.importedAt)}}
function ha(v:number){return new Intl.NumberFormat('id-ID',{minimumFractionDigits:2,maximumFractionDigits:2}).format(v)+' Ha'}
function date(v:string){if(!v)return'-';const d=new Date(v+'T00:00:00');return Number.isNaN(d.getTime())?v:d.toLocaleDateString('id-ID')}
function dateTime(v:string){if(!v)return'-';const d=new Date(v);return Number.isNaN(d.getTime())?v:d.toLocaleString('id-ID')}
async function writerContext(appUser:User){const db=firestoreDb,auth=firebaseAuth;if(!db||!auth)throw new Error('Firebase belum tersedia.');await firebaseAuthPersistenceReady;if(typeof auth.authStateReady==='function')await auth.authStateReady();const current=auth.currentUser;if(!current)throw new Error('Sesi Firebase belum aktif. Login ulang lalu coba lagi.');const snap=await getDoc(doc(db,'users',current.uid));if(!snap.exists())throw new Error('Profil user tidak ditemukan.');const p=snap.data() as Record<string,unknown>;if(p.active!==true||!['owner','asisten'].includes(text(p.role))||!['owner','asisten'].includes(appUser.role))throw new Error('Role tidak memiliki izin mengubah Actual Plan.');return{db,username:text(p.username)||appUser.username}}

export default function ActualPlanListPanel({user,selectedDate,compact=false,refreshKey=0,onEditActual,onDuplicateActual,onChanged}:Props){
  const[rows,setRows]=useState<Row[]>([]),[logs,setLogs]=useState<Log[]>([]),[busy,setBusy]=useState(false),[message,setMessage]=useState('')
  const[selectedIds,setSelectedIds]=useState<string[]>([]),[copyDate,setCopyDate]=useState(new Date().toISOString().slice(0,10)),[copyRowId,setCopyRowId]=useState(''),[rowCopyDate,setRowCopyDate]=useState(new Date().toISOString().slice(0,10))
  const[month,setMonth]=useState('ALL'),[source,setSource]=useState('ALL'),[link,setLink]=useState('ALL'),[company,setCompany]=useState('ALL'),[farm,setFarm]=useState('ALL'),[activity,setActivity]=useState('ALL'),[query,setQuery]=useState('')

  async function load(){
    if(!firestoreDb){setMessage('Firestore belum tersedia.');return}
    const dateFilter=selectedDate||new Date().toISOString().slice(0,10)
    setBusy(true)
    try{
      const[a,b]=await Promise.all([getDocs(fsQuery(collection(firestoreDb,'daily_reports'),where('date','==',dateFilter))),compact?Promise.resolve(null):getDocs(collection(firestoreDb,'actual_plan_import_logs'))])
      const rr=a.docs.map(x=>row(x.id,x.data() as Record<string,unknown>)).sort((x,y)=>x.shift.localeCompare(y.shift,undefined,{numeric:true})||(x.planningOrder||999999)-(y.planningOrder||999999)||x.pid.localeCompare(y.pid,undefined,{numeric:true}))
      const ll=b?b.docs.map(x=>log(x.id,x.data() as Record<string,unknown>)).sort((x,y)=>y.importedAt.localeCompare(x.importedAt)).slice(0,10):[]
      setRows(rr);setLogs(ll);setSelectedIds([]);setMessage('Actual '+dateFilter+': '+rr.length+' record.')
    }catch(e){setMessage(e instanceof Error?e.message:'Actual Plan gagal dimuat.')}finally{setBusy(false)}
  }
  useEffect(()=>{void load()},[selectedDate,refreshKey])

  const months=useMemo(()=>[...new Set(rows.map(x=>x.monthKey).filter(Boolean))].sort().reverse(),[rows])
  const companies=useMemo(()=>[...new Set(rows.map(x=>x.companyCode).filter(Boolean))].sort(),[rows])
  const farms=useMemo(()=>[...new Set(rows.filter(x=>company==='ALL'||x.companyCode===company).map(x=>x.farm).filter(Boolean))].sort(),[rows,company])
  const activities=useMemo(()=>[...new Set(rows.map(x=>x.activity).filter(Boolean))].sort(),[rows])
  const filtered=useMemo(()=>{const q=query.trim().toLowerCase();return rows.filter(r=>(month==='ALL'||r.monthKey===month)&&(source==='ALL'||r.sourceType===source)&&(link==='ALL'||r.dailyLinkStatus===link)&&(company==='ALL'||r.companyCode===company)&&(farm==='ALL'||r.farm===farm)&&(activity==='ALL'||r.activity===activity)&&(!q||[r.actualReportId,r.dailySourcePlanIdRaw,r.monthlyLegacyPlanId,r.dailyPlanId,r.monthlyPlanLineId,r.pid,r.paddockRaw,r.activity,r.foreman,r.unitName,r.notes].join(' ').toLowerCase().includes(q)))},[rows,month,source,link,company,farm,activity,query])
  const selectedRows=useMemo(()=>{const ids=new Set(selectedIds);return filtered.filter(row=>ids.has(row.id))},[filtered,selectedIds])
  const shifts=useMemo(()=>[...new Set(filtered.map(row=>row.shift||'-'))].sort((a,b)=>a.localeCompare(b,undefined,{numeric:true})),[filtered])
  const totals=useMemo(()=>filtered.reduce((a,r)=>({area:a.area+r.actualAreaHa,man:a.man+r.manpower,linked:a.linked+(r.dailyLinkStatus==='LINKED'?1:0),pending:a.pending+(r.dailyLinkStatus!=='LINKED'?1:0)}),{area:0,man:0,linked:0,pending:0}),[filtered])

  function toggleRow(id:string){setSelectedIds(current=>current.includes(id)?current.filter(x=>x!==id):[...current,id])}
  function toggleAll(){const ids=filtered.map(row=>row.id),all=ids.length>0&&ids.every(id=>selectedIds.includes(id));setSelectedIds(all?[]:ids)}
  async function copyWa(targets:Row[]){if(!targets.length){setMessage('Pilih minimal satu Actual untuk Copy WA.');return}const wa=actualPlansToWhatsApp(targets);try{await navigator.clipboard.writeText(wa);setMessage('Actual disalin ke clipboard. Tinggal paste ke WhatsApp.')}catch{window.prompt('Salin Actual berikut:',wa)}}

  async function moveRow(target:Row,direction:-1|1){
    const sameShift=filtered.filter(row=>(row.shift||'-')===(target.shift||'-')),index=sameShift.findIndex(row=>row.id===target.id),swap=sameShift[index+direction]
    if(!swap)return
    setBusy(true)
    try{
      const{db,username}=await writerContext(user),batch=writeBatch(db),targetOrder=target.planningOrder<999999?target.planningOrder:index+1,swapOrder=swap.planningOrder<999999?swap.planningOrder:index+direction+1
      batch.set(doc(db,'daily_reports',target.id),{planningOrder:swapOrder,lastModifiedSource:'WEB',updatedAt:serverTimestamp(),updatedBy:username},{merge:true})
      batch.set(doc(db,'daily_reports',swap.id),{planningOrder:targetOrder,lastModifiedSource:'WEB',updatedAt:serverTimestamp(),updatedBy:username},{merge:true})
      await batch.commit();setMessage('Urutan Actual diperbarui.');await load();onChanged?.()
    }catch(error){setMessage(error instanceof Error?error.message:'Urutan Actual gagal diperbarui.')}finally{setBusy(false)}
  }

  async function deleteActual(target:Row){
    if(!window.confirm('Hapus Actual '+target.actualReportId+' untuk PID '+target.pid+'?'))return
    setBusy(true)
    try{
      const{db}=await writerContext(user),batch=writeBatch(db);batch.delete(doc(db,'daily_reports',target.id));await batch.commit();setMessage('Actual '+target.actualReportId+' berhasil dihapus.');await load();onChanged?.()
    }catch(error){setMessage(error instanceof Error?error.message:'Hapus Actual gagal.')}finally{setBusy(false)}
  }

  async function copyRowsToDate(targets:Row[],targetDate:string){
    if(!targets.length){setMessage('Pilih minimal satu Actual yang akan disalin.');return}
    if(!targetDate){setMessage('Pilih tanggal tujuan.');return}
    if(!window.confirm('Salin '+targets.length+' Actual ke '+targetDate+'? Daily Plan link tetap dipertahankan.'))return
    setBusy(true)
    try{
      const{db,username}=await writerContext(user),snap=await getDocs(fsQuery(collection(db,'daily_reports'),where('date','==',targetDate))),existing=snap.docs.map(x=>row(x.id,x.data() as Record<string,unknown>)),prefix='AR-'+targetDate.replaceAll('-','')+'-'
      let seq=existing.map(x=>x.actualReportId.startsWith(prefix)?Number(x.actualReportId.slice(prefix.length)):0).filter(Number.isFinite).reduce((m,x)=>Math.max(m,x),0)
      const orderByShift=new Map<string,number>();existing.forEach(r=>orderByShift.set(r.shift,Math.max(orderByShift.get(r.shift)||0,r.planningOrder<999999?r.planningOrder:0)))
      const batch=writeBatch(db)
      for(const sourceRow of targets){
        seq++;const actualReportId=prefix+String(seq).padStart(4,'0'),planningOrder=(orderByShift.get(sourceRow.shift)||0)+1;orderByShift.set(sourceRow.shift,planningOrder)
        batch.set(doc(db,'daily_reports',actualReportId),{actualReportId,workGroupId:'AWG-'+targetDate.replaceAll('-','')+'-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,7),planningOrder,dailySourcePlanIdRaw:sourceRow.dailyPlanId,sourceType:sourceRow.sourceType,dailyPlanId:sourceRow.dailyPlanId,dailyLinkStatus:sourceRow.dailyLinkStatus,monthlyPlanLineId:sourceRow.monthlyPlanLineId,monthlyLinkStatus:sourceRow.monthlyLinkStatus,date:targetDate,year:Number(targetDate.slice(0,4)),monthKey:targetDate.slice(0,7),shift:sourceRow.shift,activity:sourceRow.activity,paddockRaw:sourceRow.pid,pid:sourceRow.pid,actualAreaHa:sourceRow.actualAreaHa,areaUnit:'Ha',manpower:sourceRow.manpower,unitName:sourceRow.unitName,unitReady:sourceRow.unitReady,unitStandby:sourceRow.unitStandby,unitBreakdown:sourceRow.unitBreakdown,foreman:sourceRow.foreman,notes:sourceRow.notes,materials:sourceRow.materials,plannedDailyAreaHa:sourceRow.plannedDailyAreaHa,dailyVarianceHa:sourceRow.plannedDailyAreaHa-sourceRow.actualAreaHa,companyCode:sourceRow.companyCode,farm:sourceRow.farm,masterPending:false,copiedFromActualReportId:sourceRow.actualReportId,sourceOrigin:'WEB',lastModifiedSource:'WEB',createdAt:serverTimestamp(),createdBy:username,updatedAt:serverTimestamp(),updatedBy:username})
      }
      await batch.commit();setMessage(targets.length+' Actual berhasil disalin ke '+targetDate+'. Daily link tetap sama.');setCopyRowId('');onChanged?.()
    }catch(error){setMessage(error instanceof Error?error.message:'Copy Actual ke tanggal gagal.')}finally{setBusy(false)}
  }

  if(compact)return <section className="actual-period-saved">
    <div className="section-head compact-saved-head"><div><div className="eyebrow">ACTUAL TERSIMPAN</div><h3>Actual Plan · {selectedDate||'-'}</h3><p className="muted">{filtered.length} record. Edit, duplikat, urutkan, Copy WA, salin tanggal, dan hapus memakai card seperti Daily Plan.</p></div><button type="button" disabled={busy} onClick={()=>void load()}>{busy?'…':'Refresh'}</button></div>
    {message&&<div className="alert">{message}</div>}
    <div className="plan-summary-grid daily-draft-summary"><div><span>Record</span><strong>{filtered.length}</strong></div><div><span>Total Actual</span><strong>{ha(totals.area)}</strong></div><div><span>Total HK</span><strong>{totals.man}</strong></div><div><span>Daily Linked</span><strong>{totals.linked}</strong></div></div>
    <div className="panel daily-bulk-actions compact-bulk-actions"><div><strong>{selectedRows.length} Actual dipilih</strong><span className="muted">Aksi massal untuk Actual tersimpan</span></div><div className="row-actions"><button type="button" onClick={toggleAll}>{filtered.length&&filtered.every(row=>selectedIds.includes(row.id))?'Batal Semua':'Pilih Semua'}</button><button type="button" onClick={()=>void copyWa(selectedRows)} disabled={!selectedRows.length}>Copy WA</button><label className="daily-copy-date"><span>Copy tanggal</span><input type="date" value={copyDate} onChange={e=>setCopyDate(e.target.value)}/></label><button type="button" onClick={()=>void copyRowsToDate(selectedRows,copyDate)} disabled={!selectedRows.length||busy}>Salin</button></div></div>
    <div className="actual-saved-shifts">{shifts.map(shift=>{const shiftRows=filtered.filter(r=>(r.shift||'-')===shift);return <section key={shift} className="daily-draft-shift"><div className="daily-draft-shift-title"><strong>SHIFT {shift}</strong><span>{shiftRows.length} actual</span></div><div className="daily-draft-card-list">{shiftRows.map((r,index)=><article className={'daily-draft-card '+(selectedIds.includes(r.id)?'daily-saved-selected':'')} key={r.id}>
      <div className="daily-draft-card-head"><div className="daily-draft-title-row"><label className="daily-saved-select" title="Pilih Actual"><input type="checkbox" checked={selectedIds.includes(r.id)} onChange={()=>toggleRow(r.id)}/></label><div><span className="eyebrow"># {index+1} · {r.sourceType}</span><h4>{r.activity||'-'} <small>({ha(r.actualAreaHa)})</small></h4></div></div>
        <div className="daily-saved-group-actions" aria-label="Aksi Actual tersimpan">
          <button type="button" className="daily-icon-action" title="Naik" aria-label="Naik" disabled={index===0||busy} onClick={()=>void moveRow(r,-1)}><DailyActionIcon name="up"/></button>
          <button type="button" className="daily-icon-action" title="Turun" aria-label="Turun" disabled={index===shiftRows.length-1||busy} onClick={()=>void moveRow(r,1)}><DailyActionIcon name="down"/></button>
          <button type="button" className="daily-icon-action wa" title="Copy WA" aria-label="Copy WA" onClick={()=>void copyWa([r])}><DailyActionIcon name="wa"/></button>
          <button type="button" className="daily-icon-action" title="Salin ke tanggal" aria-label="Salin ke tanggal" onClick={()=>{setCopyRowId(current=>current===r.id?'':r.id);setRowCopyDate(selectedDate||new Date().toISOString().slice(0,10))}}><DailyActionIcon name="calendar"/></button>
          <button type="button" className="daily-icon-action" title="Duplikat ke form" aria-label="Duplikat" onClick={()=>onDuplicateActual?.(r)}><DailyActionIcon name="copy"/></button>
          <button type="button" className="daily-icon-action" title="Edit di form utama" aria-label="Edit" onClick={()=>onEditActual?.(r)}><DailyActionIcon name="edit"/></button>
          <button type="button" className="daily-icon-action danger" title="Hapus Actual" aria-label="Hapus" disabled={busy} onClick={()=>void deleteActual(r)}><DailyActionIcon name="trash"/></button>
        </div>
      </div>
      {copyRowId===r.id&&<div className="daily-card-copy-date"><label><span>Salin ke tanggal</span><input type="date" value={rowCopyDate} onChange={e=>setRowCopyDate(e.target.value)}/></label><button type="button" onClick={()=>setCopyRowId('')}>Batal</button><button type="button" className="primary" onClick={()=>void copyRowsToDate([r],rowCopyDate)}>Salin</button></div>}
      <div className="daily-draft-pids"><span>📍 {r.pid||'-'} <b>{ha(r.actualAreaHa)}</b></span></div>
      <div className="daily-draft-details"><span>👷 Mandor <b>{r.foreman||'-'}</b></span><span>HK <b>{r.manpower}</b></span><span>🚜 Alat <b>{r.unitName||'-'}</b></span><span>⚙️ 🟢{r.unitReady} · 🔴{r.unitBreakdown} · 🟡{r.unitStandby}</span><span>Plan <b>{r.plannedDailyAreaHa?ha(r.plannedDailyAreaHa):'-'}</b></span></div>
      {r.materials.length>0&&<div className="daily-draft-materials">{r.materials.map(m=><span key={m.material+'|'+m.unit}><b>{m.material}</b> · Tot {m.totalMaterial.toLocaleString('id-ID',{maximumFractionDigits:4})} {m.unit}</span>)}</div>}
      {r.notes&&<div className="daily-draft-note">ℹ️ {r.notes}</div>}
    </article>)}</div></section>})}</div>
    {!filtered.length&&<div className="daily-draft-empty">Belum ada Actual Plan pada tanggal ini.</div>}
  </section>

  return <section><div className="section-head"><div><div className="eyebrow">ACTUAL PLAN</div><h2>Daftar Actual / Daily Report</h2><p className="muted">Edit memakai form utama Actual agar perubahan Daily/PID mengganti record yang sama dan Actual ID tetap.</p></div><button type="button" disabled={busy} onClick={()=>void load()}>{busy?'Memuat…':'Refresh'}</button></div>{message&&<div className="alert">{message}</div>}
    <div className="panel" style={{marginTop:18}}><div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(170px,1fr))',gap:12}}><label><span>Bulan</span><select value={month} onChange={e=>setMonth(e.target.value)}><option value="ALL">Semua Bulan</option>{months.map(x=><option key={x}>{x}</option>)}</select></label><label><span>Sumber</span><select value={source} onChange={e=>setSource(e.target.value)}><option value="ALL">Semua Sumber</option><option value="MONTHLY">MONTHLY</option><option value="ADHOC">ADHOC</option><option value="SUPPORT">SUPPORT</option><option value="HISTORICAL">HISTORICAL</option></select></label><label><span>Daily Link</span><select value={link} onChange={e=>setLink(e.target.value)}><option value="ALL">Semua Status</option><option value="LINKED">LINKED</option><option value="NOT_FOUND">PENDING</option><option value="AMBIGUOUS">AMBIGUOUS</option></select></label><label><span>Company</span><select value={company} onChange={e=>{setCompany(e.target.value);setFarm('ALL')}}><option value="ALL">Semua Company</option>{companies.map(x=><option key={x}>{x}</option>)}</select></label><label><span>Farm</span><select value={farm} onChange={e=>setFarm(e.target.value)}><option value="ALL">Semua Farm</option>{farms.map(x=><option key={x}>{x}</option>)}</select></label><label><span>Kegiatan</span><select value={activity} onChange={e=>setActivity(e.target.value)}><option value="ALL">Semua Kegiatan</option>{activities.map(x=><option key={x}>{x}</option>)}</select></label><label><span>Cari</span><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Actual ID / Daily ID / Monthly ID / PID / mandor"/></label></div></div>
    <div className="cards" style={{marginTop:18}}><div className="card"><span>ACTUAL</span><strong>{filtered.length}</strong></div><div className="card"><span>LUAS ACTUAL</span><strong>{ha(totals.area)}</strong></div><div className="card"><span>TENAGA</span><strong>{totals.man}</strong></div><div className="card"><span>DAILY LINKED</span><strong>{totals.linked}</strong></div><div className="card"><span>DAILY PENDING</span><strong>{totals.pending}</strong></div></div>
    <div className="panel" style={{marginTop:18}}><div className="table-wrap"><table><thead><tr><th>Actual ID</th><th>Tanggal</th><th>Sumber</th><th>Daily</th><th>Monthly</th><th>Company / Farm</th><th>PID</th><th>Kegiatan</th><th>Actual</th><th>Plan Harian</th><th>Selisih</th><th>Mandor</th><th>Aksi</th></tr></thead><tbody>{filtered.map(r=><tr key={r.id}><td><strong>{r.actualReportId}</strong></td><td>{date(r.date)}</td><td>{r.sourceType}</td><td>{r.dailyPlanId||'-'}</td><td>{r.monthlyPlanLineId||'-'}</td><td>{r.companyCode||'-'}<br/><span className="muted">{r.farm||'-'}</span></td><td>{r.pid}</td><td>{r.activity}</td><td>{ha(r.actualAreaHa)}</td><td>{r.plannedDailyAreaHa?ha(r.plannedDailyAreaHa):'-'}</td><td>{r.plannedDailyAreaHa?ha(r.dailyVarianceHa):'-'}</td><td>{r.foreman||'-'}</td><td><button type="button" onClick={()=>onEditActual?.(r)}>Edit</button></td></tr>)}</tbody></table></div></div>
    <div className="panel" style={{marginTop:18}}><h3>Riwayat Import Actual</h3><div className="table-wrap"><table><thead><tr><th>Waktu</th><th>File</th><th>Actual</th><th>C/U/N/P</th><th>Daily L/P</th><th>Monthly Linked</th><th>Master Pending</th><th>W/E</th><th>Oleh</th></tr></thead><tbody>{logs.map(x=><tr key={x.id}><td>{dateTime(x.importedAt)}</td><td>{x.sourceFileName}</td><td>{x.total}</td><td>{x.created}/{x.updated}/{x.unchanged}/{x.protected}</td><td>{x.dailyLinked}/{x.dailyPending}</td><td>{x.monthlyLinked}</td><td>{x.masterPending}</td><td>{x.warnings}/{x.errors}</td><td>{x.importedBy}</td></tr>)}</tbody></table></div></div>
  </section>
}
