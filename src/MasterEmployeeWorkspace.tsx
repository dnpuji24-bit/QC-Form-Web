import {useEffect,useMemo,useState} from 'react'
import {collection,getDocs} from 'firebase/firestore'
import {firestoreDb} from './firebase'
import {canViewAccess} from './accessControl'
import type {User} from './types'
import MasterResourceImportPanel from './MasterResourceImportPanel'

type Employee={id:string;employeeId:string;fullName:string;jobTitle:string;joinDate:string;unitCode:string;reserveStatus:string;implement:string;front:string;frontRaw:string;shift:string;shiftRaw:string;supervisorName:string;workGroup:string;needsReview:boolean}
const txt=(value:unknown)=>String(value??'').trim()
export default function MasterEmployeeWorkspace({user}:{user:User}){
  const [rows,setRows]=useState<Employee[]>([]),[busy,setBusy]=useState(false),[message,setMessage]=useState('')
  const [search,setSearch]=useState(''),[showImport,setShowImport]=useState(false)
  async function load(){
    if(!firestoreDb)return
    setBusy(true);setMessage('')
    try{
      const snap=await getDocs(collection(firestoreDb,'master_employees'))
      setRows(snap.docs.map(x=>{const d=x.data();return{id:x.id,employeeId:txt(d.employeeId),
        fullName:txt(d.fullName),jobTitle:txt(d.jobTitle),joinDate:txt(d.joinDate),
        unitCode:txt(d.unitCode),reserveStatus:txt(d.sourceReserveStatus),
        implement:txt(d.implement),front:txt(d.front),frontRaw:txt(d.frontRaw),
        shift:txt(d.shift),shiftRaw:txt(d.shiftRaw),supervisorName:txt(d.supervisorName),
        workGroup:txt(d.workGroup),needsReview:d.needsReview===true||!txt(d.employeeId)}})
        .sort((a,b)=>a.fullName.localeCompare(b.fullName,'id',{numeric:true})))
    }catch(e){setMessage(e instanceof Error?e.message:'Master Karyawan gagal dimuat.')}
    finally{setBusy(false)}
  }
  useEffect(()=>{void load()},[])
  const filtered=useMemo(()=>{
    const q=search.trim().toLowerCase()
    return rows.filter(x=>!q||[x.employeeId,x.fullName,x.jobTitle,x.unitCode,x.implement,x.front,x.shift,x.supervisorName].some(v=>v.toLowerCase().includes(q)))
  },[rows,search])
  if(!canViewAccess(user,'data_master_employees'))return <p>Anda belum memiliki akses Master Karyawan.</p>
  return <section className="master-employee-workspace">
    <div className="section-head">
      <div><div className="eyebrow">DATA UnM / MASTER KARYAWAN</div><h2>Daftar Karyawan</h2>
        <p className="muted">Identitas, jabatan, Front, Shift, pengawas dan referensi unit. Terpisah dari Unit Management dan belum mengaktifkan penugasan operator atau absensi.</p></div>
      <div className="row-actions">
        <button type="button" disabled={busy} onClick={()=>void load()}>↻ Refresh</button>
        <button type="button" onClick={()=>setShowImport(v=>!v)}>{showImport?'Tutup Import':'Import Karyawan'}</button>
      </div>
    </div>
    {message&&<p className="alert" role="status">{message}</p>}
    {showImport&&<MasterResourceImportPanel user={user} kind="employee" onImported={()=>void load()}/>}
    <div className="panel" style={{marginTop:12}}>
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(140px,1fr))',gap:10}}>
        {[
          {label:'Total Karyawan',value:rows.length},
          {label:'Employee ID Kosong',value:rows.filter(x=>!x.employeeId).length},
          {label:'Status Cadangan',value:rows.filter(x=>x.reserveStatus.toUpperCase()==='CADANGAN').length},
          {label:'Perlu Review',value:rows.filter(x=>x.needsReview).length}
        ].map(x=><div key={x.label} style={{borderRadius:9,background:'#f3f6fa',padding:12}}><small className="muted">{x.label}</small><strong style={{display:'block',fontSize:23}}>{x.value}</strong></div>)}
      </div>
      <label style={{display:'grid',gap:5,marginTop:12}}>Cari Employee ID, nama, jabatan, unit, Front, Shift atau pengawas
        <input type="search" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Cari karyawan…"/>
      </label>
      {busy&&<p className="muted">Memuat Master Karyawan…</p>}
      <div className="table-wrap" style={{marginTop:12,maxHeight:620,overflow:'auto'}}>
        <table><thead><tr><th>Employee ID</th><th>Nama</th><th>Jabatan</th><th>Join Date</th><th>Unit Code (referensi)</th><th>Front</th><th>Shift sumber</th><th>Pengawas</th><th>Status</th></tr></thead>
          <tbody>{filtered.map(x=><tr key={x.id}>
            <td>{x.employeeId||<span style={{color:'#b45309'}}>Belum ada</span>}</td><td><strong>{x.fullName}</strong></td>
            <td>{x.jobTitle||'—'}</td><td>{x.joinDate||'—'}</td><td>{x.unitCode||'—'}</td>
            <td>{x.front||x.frontRaw||'—'}</td><td>{x.shift||x.shiftRaw||'—'}</td>
            <td>{x.supervisorName||'—'}</td><td>{x.reserveStatus|| (x.needsReview?'Perlu Review':'Belum ditentukan')}</td>
          </tr>)}</tbody>
        </table>
      </div>
      {!filtered.length&&!busy&&<p className="muted">{rows.length?'Tidak ada karyawan yang cocok.':'Belum ada data karyawan. Gunakan Import Karyawan untuk membaca Sheet1.'}</p>}
      <small className="muted">Menampilkan {filtered.length} dari {rows.length} karyawan. Unit Code dan Shift sumber belum dipakai untuk penjadwalan unit secara otomatis.</small>
    </div>
  </section>
}
