import { useEffect, useMemo, useState } from 'react'
import { collection, doc, getDocs, query as fsQuery, where, writeBatch } from 'firebase/firestore'
import { firestoreDb } from './firebase'
import type { User } from './types'

type Props={user:User;selectedMonth?:string;selectedWeek?:string;compact?:boolean;refreshKey?:number}
type PlanRow={id:string;planLineId:string;year:number;monthKey:string;monthLabel:string;week:string;inputDate:string;startDate:string;endDate:string;companyCode:string;farm:string;pid:string;description:string;activity:string;targetAreaHa:number;sourceActualAreaHa:number;sourceBalanceHa:number;variety:string;masterVariety:string;sourceStatus:string;storedStatus:string;stage:string;notes:string;type:string;activityCategory:string;lastModifiedSource:string}
type DailyRef={monthlyPlanLineId:string;areaHa:number}
type ActualRef={monthlyPlanLineId:string;actualAreaHa:number}
type ImportLog={id:string;sourceFileName:string;total:number;created:number;updated:number;unchanged:number;protected:number;warnings:number;errors:number;importedBy:string;importedAt:string}
type ViewRow=PlanRow&{scheduledAreaHa:number;unallocatedAreaHa:number;systemActualAreaHa:number;systemBalanceHa:number;progressPct:number;systemStatus:string}

function text(value:unknown){return value===null||value===undefined?'':String(value).trim()}
function num(value:unknown){const n=Number(value||0);return Number.isFinite(n)?n:0}
function dateValue(value:unknown){if(!value)return'';if(typeof value==='string')return value;if(typeof value==='object'&&value!==null&&'toDate' in value&&typeof (value as {toDate?:unknown}).toDate==='function'){try{return((value as {toDate:()=>Date}).toDate()).toISOString()}catch{return''}}return''}
function rowFromData(id:string,data:Record<string,unknown>):PlanRow{return{id,planLineId:text(data.planLineId||data.planCode||id),year:num(data.year),monthKey:text(data.monthKey||data.month),monthLabel:text(data.monthLabel),week:text(data.week),inputDate:text(data.inputDate),startDate:text(data.startDate),endDate:text(data.endDate),companyCode:text(data.companyCode).toUpperCase(),farm:text(data.farm),pid:text(data.pid),description:text(data.description),activity:text(data.activity),targetAreaHa:num(data.targetAreaHa),sourceActualAreaHa:num(data.actualAreaHa),sourceBalanceHa:num(data.balanceHa),variety:text(data.variety),masterVariety:text(data.masterVariety),sourceStatus:text(data.sourceStatus),storedStatus:text(data.status),stage:text(data.stage),notes:text(data.notes),type:text(data.type),activityCategory:text(data.activityCategory),lastModifiedSource:text(data.lastModifiedSource)}}
function logFromData(id:string,data:Record<string,unknown>):ImportLog{return{id,sourceFileName:text(data.sourceFileName),total:num(data.total),created:num(data.created),updated:num(data.updated),unchanged:num(data.unchanged),protected:num(data.protected),warnings:num(data.warnings),errors:num(data.errors),importedBy:text(data.importedBy),importedAt:dateValue(data.importedAt)}}
function formatHa(value:number,digits=2){return new Intl.NumberFormat('id-ID',{minimumFractionDigits:digits,maximumFractionDigits:digits}).format(value)+' Ha'}
function formatPct(value:number){return new Intl.NumberFormat('id-ID',{minimumFractionDigits:0,maximumFractionDigits:1}).format(value)+'%'}
function formatDate(value:string){if(!value)return'-';const d=new Date(value);return Number.isNaN(d.getTime())?value:d.toLocaleDateString('id-ID',{day:'2-digit',month:'2-digit',year:'numeric'})}
function formatDateTime(value:string){if(!value)return'-';const d=new Date(value);return Number.isNaN(d.getTime())?value:d.toLocaleString('id-ID',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'})}
function autoStatus(row:PlanRow,actual:number){const original=(row.sourceStatus||row.storedStatus).toUpperCase();if(original.includes('CANCEL'))return'CANCELLED';if(actual<=0)return'PLANNED';if(actual<row.targetAreaHa-0.0001)return'ON PROGRESS';if(Math.abs(actual-row.targetAreaHa)<=0.0001)return'DONE';return'OVER ACTUAL'}

export default function MonthlyPlanListPanel({user,selectedMonth,selectedWeek,compact=false,refreshKey=0}:Props){
  const[rows,setRows]=useState<PlanRow[]>([]),[daily,setDaily]=useState<DailyRef[]>([]),[actuals,setActuals]=useState<ActualRef[]>([]),[logs,setLogs]=useState<ImportLog[]>([]),[busy,setBusy]=useState(false),[message,setMessage]=useState('')
  const[month,setMonth]=useState('ALL'),[week,setWeek]=useState('ALL'),[company,setCompany]=useState('ALL'),[farm,setFarm]=useState('ALL'),[status,setStatus]=useState('ALL'),[query,setQuery]=useState('')
  const isOwner=user.role==='owner'

  async function load(){if(!firestoreDb){setMessage('Firestore belum tersedia.');return}setBusy(true);const monthFilter=selectedMonth||new Date().toISOString().slice(0,7);setMessage('Memuat Monthly '+monthFilter+'…');try{
    const planSnap=await getDocs(fsQuery(collection(firestoreDb,'monthly_plans'),where('monthKey','==',monthFilter)))
    const next=planSnap.docs.map(x=>rowFromData(x.id,x.data() as Record<string,unknown>)).sort((a,b)=>a.week.localeCompare(b.week)||a.pid.localeCompare(b.pid,undefined,{numeric:true})||a.planLineId.localeCompare(b.planLineId,undefined,{numeric:true}))
    const ids=next.map(x=>x.planLineId).filter(Boolean),dailyDocs:any[]=[],actualDocs:any[]=[]
    for(let i=0;i<ids.length;i+=30){const part=ids.slice(i,i+30);const[d,a]=await Promise.all([getDocs(fsQuery(collection(firestoreDb,'daily_plans'),where('monthlyPlanLineId','in',part))),getDocs(fsQuery(collection(firestoreDb,'daily_reports'),where('monthlyPlanLineId','in',part)))]);dailyDocs.push(...d.docs);actualDocs.push(...a.docs)}
    setRows(next);setDaily(dailyDocs.map(x=>{const d=x.data() as Record<string,unknown>;return{monthlyPlanLineId:text(d.monthlyPlanLineId),areaHa:num(d.areaHa)}}));setActuals(actualDocs.map(x=>{const d=x.data() as Record<string,unknown>;return{monthlyPlanLineId:text(d.monthlyPlanLineId),actualAreaHa:num(d.actualAreaHa)}}))
    if(compact)setLogs([]);else{const logSnap=await getDocs(collection(firestoreDb,'monthly_plan_import_logs'));setLogs(logSnap.docs.map(x=>logFromData(x.id,x.data() as Record<string,unknown>)).sort((a,b)=>b.importedAt.localeCompare(a.importedAt)).slice(0,10))}
    setMessage('Monthly '+monthFilter+': '+next.length+' Plan Line. Progress hanya dihitung dari link periode aktif.')
  }catch(error){setMessage(error instanceof Error?error.message:'Monthly Plan gagal dimuat.')}finally{setBusy(false)}}
  useEffect(()=>{void load()},[selectedMonth,refreshKey])

  const scheduledMap=useMemo(()=>{const map=new Map<string,number>();daily.forEach(x=>{if(x.monthlyPlanLineId)map.set(x.monthlyPlanLineId,(map.get(x.monthlyPlanLineId)||0)+x.areaHa)});return map},[daily])
  const actualMap=useMemo(()=>{const map=new Map<string,number>();actuals.forEach(x=>{if(x.monthlyPlanLineId)map.set(x.monthlyPlanLineId,(map.get(x.monthlyPlanLineId)||0)+x.actualAreaHa)});return map},[actuals])
  const viewRows=useMemo<ViewRow[]>(()=>rows.map(row=>{const scheduledAreaHa=scheduledMap.get(row.planLineId)||0,systemActualAreaHa=actualMap.get(row.planLineId)||0,unallocatedAreaHa=row.targetAreaHa-scheduledAreaHa,systemBalanceHa=row.targetAreaHa-systemActualAreaHa,progressPct=row.targetAreaHa>0?systemActualAreaHa/row.targetAreaHa*100:0;return{...row,scheduledAreaHa,unallocatedAreaHa,systemActualAreaHa,systemBalanceHa,progressPct,systemStatus:autoStatus(row,systemActualAreaHa)}}),[rows,scheduledMap,actualMap])
  const months=useMemo(()=>[...new Set(viewRows.map(x=>x.monthKey).filter(Boolean))].sort().reverse(),[viewRows])
  const companies=useMemo(()=>[...new Set(viewRows.map(x=>x.companyCode).filter(Boolean))].sort(),[viewRows])
  const farms=useMemo(()=>[...new Set(viewRows.filter(x=>company==='ALL'||x.companyCode===company).map(x=>x.farm).filter(Boolean))].sort((a,b)=>a.localeCompare(b,undefined,{numeric:true})),[viewRows,company])
  const statuses=['PLANNED','ON PROGRESS','DONE','OVER ACTUAL','CANCELLED']
  const activeWeek=selectedWeek||week
  const filtered=useMemo(()=>{const needle=query.trim().toLowerCase();return viewRows.filter(row=>(selectedMonth?row.monthKey===selectedMonth:(month==='ALL'||row.monthKey===month))&&(activeWeek==='ALL'||row.week===activeWeek)&&(company==='ALL'||row.companyCode===company)&&(farm==='ALL'||row.farm===farm)&&(status==='ALL'||row.systemStatus===status)&&(!needle||[row.planLineId,row.pid,row.description,row.activity,row.variety,row.notes].join(' ').toLowerCase().includes(needle)))},[viewRows,selectedMonth,month,activeWeek,company,farm,status,query])
  const totals=useMemo(()=>filtered.reduce((acc,row)=>({target:acc.target+row.targetAreaHa,scheduled:acc.scheduled+row.scheduledAreaHa,unallocated:acc.unallocated+row.unallocatedAreaHa,actual:acc.actual+row.systemActualAreaHa,balance:acc.balance+row.systemBalanceHa}),{target:0,scheduled:0,unallocated:0,actual:0,balance:0}),[filtered])
  const hasActiveFilter=month!=='ALL'||week!=='ALL'||company!=='ALL'||farm!=='ALL'||status!=='ALL'||query.trim()!==''

  async function deleteRows(targets:ViewRow[],label:string){
    if(!isOwner){setMessage('Hanya Owner yang boleh menghapus Monthly Plan.');return}
    if(!firestoreDb){setMessage('Firestore belum tersedia.');return}
    if(!targets.length){setMessage('Tidak ada Monthly Plan yang dipilih untuk dihapus.');return}
    const ids=new Set(targets.map(x=>x.planLineId)),linkedDaily=daily.filter(x=>ids.has(x.monthlyPlanLineId)).length,linkedActual=actuals.filter(x=>ids.has(x.monthlyPlanLineId)).length,webEdited=targets.filter(row=>row.lastModifiedSource.toUpperCase()==='WEB').length
    const expected='HAPUS '+targets.length
    const dependency=linkedDaily||linkedActual?'\nPERHATIAN: terdapat '+linkedDaily+' Daily Plan dan '+linkedActual+' Actual yang masih mereferensikan Monthly Plan ini. Data downstream tidak ikut terhapus.':''
    const warning=webEdited?'\n'+webEdited+' record pernah diubah melalui Web dan ikut terhapus.':''
    const answer=window.prompt('Akan menghapus '+targets.length+' Monthly Plan ('+label+') dari Firestore.'+dependency+warning+'\n\nRiwayat import tetap disimpan. Ketik '+expected+' untuk lanjut.','')
    if(answer!==expected)return
    setBusy(true);setMessage('Menghapus '+targets.length+' Monthly Plan…')
    try{for(let start=0;start<targets.length;start+=450){const batch=writeBatch(firestoreDb);targets.slice(start,start+450).forEach(row=>batch.delete(doc(firestoreDb!,'monthly_plans',row.id)));await batch.commit()}const deletedIds=new Set(targets.map(row=>row.id));setRows(current=>current.filter(row=>!deletedIds.has(row.id)));setMessage('Hapus selesai: '+targets.length+' Monthly Plan dihapus. Daily/Actual downstream tidak dihapus.')}catch(error){setMessage(error instanceof Error?error.message:'Monthly Plan gagal dihapus.')}finally{setBusy(false)}
  }

  if(compact)return <section className="monthly-period-list">
    <div className="section-head compact-saved-head"><div><div className="eyebrow">MONTHLY PERIODE</div><h3>{selectedMonth||'-'} · {selectedWeek||'Semua Week'}</h3><p className="muted">{filtered.length} plan line pada periode aktif.</p></div><button type="button" disabled={busy} onClick={()=>void load()}>{busy?'…':'Refresh'}</button></div>
    {message&&<div className="alert">{message}</div>}
    <div className="cards compact-period-cards"><div className="card"><span>PLAN LINE</span><strong>{filtered.length}</strong></div><div className="card"><span>TARGET</span><strong>{formatHa(totals.target)}</strong></div><div className="card"><span>DAILY</span><strong>{formatHa(totals.scheduled)}</strong></div><div className="card"><span>ACTUAL</span><strong>{formatHa(totals.actual)}</strong></div></div>
    <div className="monthly-period-card-list">{filtered.map(row=><article className="monthly-period-card" key={row.id}><div><span className="eyebrow">{row.week} · {row.companyCode}</span><h4>{row.description||row.activity}</h4><p>📍 {row.pid} · {row.farm||'-'}</p></div><div className="monthly-period-metrics"><span>Target <b>{formatHa(row.targetAreaHa)}</b></span><span>Daily <b>{formatHa(row.scheduledAreaHa)}</b></span><span>Actual <b>{formatHa(row.systemActualAreaHa)}</b></span><span>Balance <b>{formatHa(row.systemBalanceHa)}</b></span></div>{isOwner&&<button type="button" className="danger monthly-card-delete" disabled={busy} onClick={()=>void deleteRows([row],'Plan ID '+row.planLineId)}>Hapus</button>}</article>)}</div>
    {!filtered.length&&<div className="daily-draft-empty">Belum ada Monthly Plan pada periode ini.</div>}
  </section>

  return <section>
    <div className="section-head"><div><div className="eyebrow">MONTHLY PLAN</div><h2>Daftar & Progress</h2><p className="muted">Target Monthly tidak pernah dikurangi langsung. Sistem menghitung Sisa Belum Dijadwalkan = Target − Daily Plan, dan Balance Aktual = Target − Actual/Daily Report yang memiliki monthlyPlanLineId yang sama.</p></div><div style={{display:'flex',gap:10,flexWrap:'wrap'}}><button type="button" disabled={busy} onClick={()=>void load()}>{busy?'Memuat…':'Refresh Progress'}</button>{isOwner&&<button type="button" disabled={busy||!filtered.length} onClick={()=>void deleteRows(filtered,hasActiveFilter?'sesuai filter saat ini':'SEMUA Monthly Plan')} style={{borderColor:'#b91c1c',color:'#b91c1c'}}>{hasActiveFilter?'Hapus Sesuai Filter ('+filtered.length+')':'Hapus Semua Plan ('+filtered.length+')'}</button>}</div></div>
    {message&&<div className="alert" style={{whiteSpace:'pre-line'}}>{message}</div>}
    <div className="panel" style={{marginTop:18}}><div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(180px,1fr))',gap:12}}>
      <label><span>Bulan</span><select value={month} onChange={e=>setMonth(e.target.value)}><option value="ALL">Semua Bulan</option>{months.map(x=><option key={x} value={x}>{x}</option>)}</select></label>
      <label><span>Week</span><select value={week} onChange={e=>setWeek(e.target.value)}><option value="ALL">Semua Week</option>{['W1','W2','W3','W4'].map(x=><option key={x}>{x}</option>)}</select></label>
      <label><span>Company</span><select value={company} onChange={e=>{setCompany(e.target.value);setFarm('ALL')}}><option value="ALL">Semua Company</option>{companies.map(x=><option key={x}>{x}</option>)}</select></label>
      <label><span>Farm</span><select value={farm} onChange={e=>setFarm(e.target.value)}><option value="ALL">Semua Farm</option>{farms.map(x=><option key={x}>{x}</option>)}</select></label>
      <label><span>Status Sistem</span><select value={status} onChange={e=>setStatus(e.target.value)}><option value="ALL">Semua Status</option>{statuses.map(x=><option key={x}>{x}</option>)}</select></label>
      <label><span>Cari</span><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Plan ID / PID / Activity / Variety"/></label>
    </div></div>
    <div className="cards" style={{marginTop:18}}>
      <div className="card"><span>PLAN LINE</span><strong>{filtered.length}</strong></div>
      <div className="card"><span>TARGET MONTHLY</span><strong>{formatHa(totals.target)}</strong></div>
      <div className="card"><span>DAILY PLAN</span><strong>{formatHa(totals.scheduled)}</strong></div>
      <div className="card"><span>BELUM DIJADWALKAN</span><strong style={{color:totals.unallocated<0?'#b91c1c':undefined}}>{formatHa(totals.unallocated)}</strong></div>
      <div className="card"><span>ACTUAL</span><strong>{formatHa(totals.actual)}</strong></div>
      <div className="card"><span>BALANCE ACTUAL</span><strong style={{color:totals.balance<0?'#b91c1c':undefined}}>{formatHa(totals.balance)}</strong></div>
    </div>
    <div className="panel" style={{marginTop:18}}><div className="table-wrap"><table><thead><tr><th>Plan ID</th><th>Bulan / Week</th><th>Company / Farm</th><th>PID</th><th>Activity</th><th>Target</th><th>Daily Plan</th><th>Belum Dijadwalkan</th><th>Actual</th><th>Balance</th><th>Progress</th><th>Status Sistem</th><th>Sumber</th><th>Keterangan</th>{isOwner&&<th>Aksi</th>}</tr></thead><tbody>{filtered.map(row=><tr key={row.id}><td><strong>{row.planLineId}</strong></td><td>{row.monthKey}<br/><span className="muted">{row.week}</span></td><td>{row.companyCode||'-'}<br/><span className="muted">{row.farm||'-'}</span></td><td>{row.pid}<br/><span className="muted">{row.stage||'-'}</span></td><td>{row.description}<br/><span className="muted">{row.activity||'-'}</span></td><td>{formatHa(row.targetAreaHa)}</td><td>{formatHa(row.scheduledAreaHa)}</td><td style={{color:row.unallocatedAreaHa<0?'#b91c1c':undefined}}>{formatHa(row.unallocatedAreaHa)}</td><td>{formatHa(row.systemActualAreaHa)}</td><td style={{color:row.systemBalanceHa<0?'#b91c1c':undefined,fontWeight:700}}>{formatHa(row.systemBalanceHa)}</td><td>{formatPct(row.progressPct)}</td><td><strong>{row.systemStatus}</strong></td><td>{row.lastModifiedSource||'EXCEL'}</td><td>{row.notes||'-'}</td>{isOwner&&<td><button type="button" disabled={busy} onClick={()=>void deleteRows([row],'Plan ID '+row.planLineId)} style={{borderColor:'#b91c1c',color:'#b91c1c'}}>Hapus</button></td>}</tr>)}</tbody></table></div>{!filtered.length&&<p className="muted">Tidak ada record sesuai filter.</p>}</div>
    <div className="panel" style={{marginTop:18}}><h3>Riwayat Import Monthly Plan</h3><p className="muted">10 import terakhir.</p><div className="table-wrap"><table><thead><tr><th>Waktu</th><th>File</th><th>Total</th><th>C/U/N/P</th><th>Warning</th><th>Error</th><th>Oleh</th></tr></thead><tbody>{logs.map(log=><tr key={log.id}><td>{formatDateTime(log.importedAt)}</td><td>{log.sourceFileName}</td><td>{log.total}</td><td>{log.created}/{log.updated}/{log.unchanged}/{log.protected}</td><td>{log.warnings}</td><td>{log.errors}</td><td>{log.importedBy}</td></tr>)}</tbody></table></div>{!logs.length&&<p className="muted">Belum ada riwayat import Monthly Plan.</p>}</div>
  </section>
}
