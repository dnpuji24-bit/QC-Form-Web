import { useEffect, useMemo, useState } from 'react'
import { collection, doc, getDocs, writeBatch } from 'firebase/firestore'
import { firestoreDb } from './firebase'
import type { User } from './types'

type Props={user:User}
type PlanRow={id:string;planLineId:string;year:number;monthKey:string;monthLabel:string;week:string;inputDate:string;startDate:string;endDate:string;companyCode:string;farm:string;pid:string;description:string;activity:string;targetAreaHa:number;actualAreaHa:number;balanceHa:number;variety:string;masterVariety:string;sourceStatus:string;status:string;stage:string;notes:string;type:string;activityCategory:string;lastModifiedSource:string}
type ImportLog={id:string;sourceFileName:string;total:number;created:number;updated:number;unchanged:number;protected:number;warnings:number;errors:number;importedBy:string;importedAt:string}

function text(value:unknown){return value===null||value===undefined?'':String(value).trim()}
function num(value:unknown){const n=Number(value||0);return Number.isFinite(n)?n:0}
function dateValue(value:unknown){if(!value)return'';if(typeof value==='string')return value;if(typeof value==='object'&&value!==null&&'toDate' in value&&typeof (value as {toDate?:unknown}).toDate==='function'){try{return((value as {toDate:()=>Date}).toDate()).toISOString()}catch{return''}}return''}
function rowFromData(id:string,data:Record<string,unknown>):PlanRow{return{id,planLineId:text(data.planLineId||data.planCode||id),year:num(data.year),monthKey:text(data.monthKey||data.month),monthLabel:text(data.monthLabel),week:text(data.week),inputDate:text(data.inputDate),startDate:text(data.startDate),endDate:text(data.endDate),companyCode:text(data.companyCode).toUpperCase(),farm:text(data.farm),pid:text(data.pid),description:text(data.description),activity:text(data.activity),targetAreaHa:num(data.targetAreaHa),actualAreaHa:num(data.actualAreaHa),balanceHa:num(data.balanceHa),variety:text(data.variety),masterVariety:text(data.masterVariety),sourceStatus:text(data.sourceStatus),status:text(data.status),stage:text(data.stage),notes:text(data.notes),type:text(data.type),activityCategory:text(data.activityCategory),lastModifiedSource:text(data.lastModifiedSource)}}
function logFromData(id:string,data:Record<string,unknown>):ImportLog{return{id,sourceFileName:text(data.sourceFileName),total:num(data.total),created:num(data.created),updated:num(data.updated),unchanged:num(data.unchanged),protected:num(data.protected),warnings:num(data.warnings),errors:num(data.errors),importedBy:text(data.importedBy),importedAt:dateValue(data.importedAt)}}
function formatHa(value:number,digits=2){return`${new Intl.NumberFormat('id-ID',{minimumFractionDigits:digits,maximumFractionDigits:digits}).format(value)} Ha`}
function formatDate(value:string){if(!value)return'-';const d=new Date(value);return Number.isNaN(d.getTime())?value:d.toLocaleDateString('id-ID',{day:'2-digit',month:'2-digit',year:'numeric'})}
function formatDateTime(value:string){if(!value)return'-';const d=new Date(value);return Number.isNaN(d.getTime())?value:d.toLocaleString('id-ID',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'})}

export default function MonthlyPlanListPanel({user}:Props){
  const[rows,setRows]=useState<PlanRow[]>([]),[logs,setLogs]=useState<ImportLog[]>([]),[busy,setBusy]=useState(false),[message,setMessage]=useState('')
  const[month,setMonth]=useState('ALL'),[week,setWeek]=useState('ALL'),[company,setCompany]=useState('ALL'),[farm,setFarm]=useState('ALL'),[status,setStatus]=useState('ALL'),[query,setQuery]=useState('')
  const isOwner=user.role==='owner'

  async function load(){if(!firestoreDb){setMessage('Firestore belum tersedia.');return}setBusy(true);setMessage('Memuat Monthly Plan…');try{const[planSnap,logSnap]=await Promise.all([getDocs(collection(firestoreDb,'monthly_plans')),getDocs(collection(firestoreDb,'monthly_plan_import_logs'))]);const next=planSnap.docs.map(x=>rowFromData(x.id,x.data() as Record<string,unknown>)).sort((a,b)=>b.monthKey.localeCompare(a.monthKey)||a.week.localeCompare(b.week)||a.pid.localeCompare(b.pid,undefined,{numeric:true})||a.planLineId.localeCompare(b.planLineId,undefined,{numeric:true}));const nextLogs=logSnap.docs.map(x=>logFromData(x.id,x.data() as Record<string,unknown>)).sort((a,b)=>b.importedAt.localeCompare(a.importedAt)).slice(0,10);setRows(next);setLogs(nextLogs);setMessage(`Monthly Plan siap: ${next.length} Plan Line.`)}catch(error){setMessage(error instanceof Error?error.message:'Monthly Plan gagal dimuat.')}finally{setBusy(false)}}
  useEffect(()=>{void load()},[])

  const months=useMemo(()=>[...new Set(rows.map(x=>x.monthKey).filter(Boolean))].sort().reverse(),[rows])
  const companies=useMemo(()=>[...new Set(rows.map(x=>x.companyCode).filter(Boolean))].sort(),[rows])
  const farms=useMemo(()=>[...new Set(rows.filter(x=>company==='ALL'||x.companyCode===company).map(x=>x.farm).filter(Boolean))].sort((a,b)=>a.localeCompare(b,undefined,{numeric:true})),[rows,company])
  const statuses=useMemo(()=>[...new Set(rows.map(x=>x.sourceStatus||x.status).filter(Boolean))].sort(),[rows])
  const filtered=useMemo(()=>{const needle=query.trim().toLowerCase();return rows.filter(row=>(month==='ALL'||row.monthKey===month)&&(week==='ALL'||row.week===week)&&(company==='ALL'||row.companyCode===company)&&(farm==='ALL'||row.farm===farm)&&(status==='ALL'||(row.sourceStatus||row.status)===status)&&(!needle||`${row.planLineId} ${row.pid} ${row.description} ${row.activity} ${row.variety} ${row.notes}`.toLowerCase().includes(needle)))},[rows,month,week,company,farm,status,query])
  const totals=useMemo(()=>filtered.reduce((acc,row)=>({target:acc.target+row.targetAreaHa,actual:acc.actual+row.actualAreaHa,balance:acc.balance+row.balanceHa}),{target:0,actual:0,balance:0}),[filtered])
  const hasActiveFilter=month!=='ALL'||week!=='ALL'||company!=='ALL'||farm!=='ALL'||status!=='ALL'||query.trim()!==''

  async function deleteRows(targets:PlanRow[],label:string){
    if(!isOwner){setMessage('Hanya Owner yang boleh menghapus Monthly Plan.');return}
    if(!firestoreDb){setMessage('Firestore belum tersedia.');return}
    if(!targets.length){setMessage('Tidak ada Monthly Plan yang dipilih untuk dihapus.');return}
    const webEdited=targets.filter(row=>row.lastModifiedSource.toUpperCase()==='WEB').length
    const expected=`HAPUS ${targets.length}`
    const warning=webEdited?`\nPERHATIAN: ${webEdited} record pernah diubah melalui Web dan ikut terhapus.`:''
    const answer=window.prompt(`Akan menghapus ${targets.length} Monthly Plan (${label}) dari Firestore.${warning}\n\nRiwayat import tetap disimpan. Penghapusan tidak dapat dibatalkan dari web.\nKetik ${expected} untuk lanjut.`,'')
    if(answer!==expected)return
    setBusy(true);setMessage(`Menghapus ${targets.length} Monthly Plan…`)
    try{
      for(let start=0;start<targets.length;start+=450){
        const batch=writeBatch(firestoreDb)
        targets.slice(start,start+450).forEach(row=>batch.delete(doc(firestoreDb!,'monthly_plans',row.id)))
        await batch.commit()
      }
      const deletedIds=new Set(targets.map(row=>row.id))
      setRows(current=>current.filter(row=>!deletedIds.has(row.id)))
      setMessage(`Hapus selesai: ${targets.length} Monthly Plan dihapus. Riwayat import tidak dihapus. Anda sekarang dapat mengupload file pengganti melalui Update / Import Excel.`)
    }catch(error){setMessage(error instanceof Error?error.message:'Monthly Plan gagal dihapus.')}finally{setBusy(false)}
  }

  async function deleteOne(row:PlanRow){await deleteRows([row],`Plan ID ${row.planLineId}`)}
  async function deleteFiltered(){await deleteRows(filtered,hasActiveFilter?'sesuai filter saat ini':'SEMUA Monthly Plan')}

  return <section>
    <div className="section-head"><div><div className="eyebrow">MONTHLY PLAN</div><h2>Daftar Plan</h2><p className="muted">Data hasil import Excel. Perubahan dengan Plan ID yang sama dapat langsung di-import sebagai UPDATE. Fitur hapus digunakan jika Anda ingin mengganti dataset, menghapus Plan Line yang sudah tidak ada, atau mengganti struktur PID/Plan ID.</p></div><div style={{display:'flex',gap:10,flexWrap:'wrap'}}><button type="button" disabled={busy} onClick={()=>void load()}>{busy?'Memuat…':'Refresh'}</button>{isOwner&&<button type="button" disabled={busy||!filtered.length} onClick={()=>void deleteFiltered()} style={{borderColor:'#b91c1c',color:'#b91c1c'}}>{hasActiveFilter?`Hapus Sesuai Filter (${filtered.length})`:`Hapus Semua Plan (${filtered.length})`}</button>}</div></div>
    {message&&<div className="alert" style={{whiteSpace:'pre-line'}}>{message}</div>}
    {isOwner&&<div className="panel" style={{marginTop:18,borderColor:'#fecaca'}}><strong>Safety Hapus Monthly Plan</strong><p className="muted" style={{marginBottom:0}}>Hapus mengikuti filter yang sedang aktif. Jika semua filter = Semua dan pencarian kosong, tombol akan menghapus seluruh Monthly Plan. Sistem meminta konfirmasi <strong>HAPUS + jumlah record</strong>. Riwayat import tidak ikut dihapus.</p></div>}
    <div className="panel" style={{marginTop:18}}><div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(180px,1fr))',gap:12}}>
      <label><span>Bulan</span><select value={month} onChange={e=>setMonth(e.target.value)}><option value="ALL">Semua Bulan</option>{months.map(x=><option key={x} value={x}>{x}</option>)}</select></label>
      <label><span>Week</span><select value={week} onChange={e=>setWeek(e.target.value)}><option value="ALL">Semua Week</option>{['W1','W2','W3','W4'].map(x=><option key={x}>{x}</option>)}</select></label>
      <label><span>Company</span><select value={company} onChange={e=>{setCompany(e.target.value);setFarm('ALL')}}><option value="ALL">Semua Company</option>{companies.map(x=><option key={x}>{x}</option>)}</select></label>
      <label><span>Farm</span><select value={farm} onChange={e=>setFarm(e.target.value)}><option value="ALL">Semua Farm</option>{farms.map(x=><option key={x}>{x}</option>)}</select></label>
      <label><span>Status</span><select value={status} onChange={e=>setStatus(e.target.value)}><option value="ALL">Semua Status</option>{statuses.map(x=><option key={x}>{x}</option>)}</select></label>
      <label><span>Cari</span><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Plan ID / PID / Activity / Variety"/></label>
    </div></div>
    <div className="cards" style={{marginTop:18}}><div className="card"><span>PLAN LINE</span><strong>{filtered.length}</strong></div><div className="card"><span>TARGET</span><strong>{formatHa(totals.target)}</strong></div><div className="card"><span>DIKERJAKAN</span><strong>{formatHa(totals.actual)}</strong></div><div className="card"><span>BALANCE</span><strong style={{color:totals.balance<0?'#b91c1c':undefined}}>{formatHa(totals.balance)}</strong></div></div>
    <div className="panel" style={{marginTop:18}}><div className="table-wrap"><table><thead><tr><th>Plan ID Baru</th><th>Bulan / Week</th><th>Tanggal</th><th>Company / Farm</th><th>PID</th><th>Deskripsi</th><th>Variety</th><th>Target</th><th>Dikerjakan</th><th>Balance</th><th>Status</th><th>Sumber Update</th><th>Keterangan</th>{isOwner&&<th>Aksi</th>}</tr></thead><tbody>{filtered.map(row=><tr key={row.id}><td><strong>{row.planLineId}</strong></td><td>{row.monthKey}<br/><span className="muted">{row.week}</span></td><td>{formatDate(row.inputDate)}<br/><span className="muted">{row.startDate||row.endDate?`${formatDate(row.startDate)} – ${formatDate(row.endDate)}`:'-'}</span></td><td>{row.companyCode||'-'}<br/><span className="muted">{row.farm||'-'}</span></td><td>{row.pid}<br/><span className="muted">{row.stage||'-'}</span></td><td>{row.description}<br/><span className="muted">{row.activity||'-'}</span></td><td>{row.variety||row.masterVariety||'-'}</td><td>{formatHa(row.targetAreaHa)}</td><td>{formatHa(row.actualAreaHa)}</td><td style={{color:row.balanceHa<0?'#b91c1c':undefined,fontWeight:700}}>{formatHa(row.balanceHa)}</td><td>{row.sourceStatus||row.status||'-'}</td><td>{row.lastModifiedSource||'EXCEL'}</td><td>{row.notes||'-'}</td>{isOwner&&<td><button type="button" disabled={busy} onClick={()=>void deleteOne(row)} style={{borderColor:'#b91c1c',color:'#b91c1c'}}>Hapus</button></td>}</tr>)}</tbody></table></div>{!filtered.length&&<p className="muted">Tidak ada record sesuai filter.</p>}</div>
    <div className="panel" style={{marginTop:18}}><h3>Riwayat Import Monthly Plan</h3><p className="muted">10 import terakhir. Riwayat ini tetap disimpan walaupun data Monthly Plan dihapus, supaya jejak import tidak hilang.</p><div className="table-wrap"><table><thead><tr><th>Waktu</th><th>File</th><th>Total</th><th>C/U/N/P</th><th>Warning</th><th>Error</th><th>Oleh</th></tr></thead><tbody>{logs.map(log=><tr key={log.id}><td>{formatDateTime(log.importedAt)}</td><td>{log.sourceFileName}</td><td>{log.total}</td><td>{log.created}/{log.updated}/{log.unchanged}/{log.protected}</td><td>{log.warnings}</td><td>{log.errors}</td><td>{log.importedBy}</td></tr>)}</tbody></table></div>{!logs.length&&<p className="muted">Belum ada riwayat import.</p>}</div>
  </section>
}
