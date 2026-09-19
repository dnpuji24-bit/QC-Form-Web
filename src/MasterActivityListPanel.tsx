import { useEffect, useMemo, useState } from 'react'
import { collection, getDocs } from 'firebase/firestore'
import { firestoreDb } from './firebase'

type ActivityComponent={sequence:number;label:string;activeIngredient:string;dosePerHa:number;unit:string}
type ActivityRow={
  id:string;activityCode:string;description:string;activity:string;type:string;activityCategory:string
  companyScope:string;active:boolean;components:ActivityComponent[];sourceFileName:string
}
type MaterialRow={id:string;materialName:string;activeIngredient:string;unit:string;category:string;active:boolean}
type ImportLog={batchId:string;companyScope:string;sourceFileName:string;activityCreated:number;activityUpdated:number;activityUnchanged:number;materialCreated:number;materialUpdated:number;materialUnchanged:number;warnings:number;importedBy:string;importedAt:string}

function text(value:unknown){return value===null||value===undefined?'':String(value).trim()}
function numberValue(value:unknown){const parsed=Number(value||0);return Number.isFinite(parsed)?parsed:0}
function normalize(value:string){return value.trim().toLowerCase().replace(/\s+/g,' ')}
function componentFromData(value:unknown):ActivityComponent[]{
  if(!Array.isArray(value))return[]
  return value.map((item,index)=>{const row=(item&&typeof item==='object'?item:{}) as Record<string,unknown>;return{sequence:numberValue(row.sequence)||index+1,label:text(row.label),activeIngredient:text(row.activeIngredient),dosePerHa:numberValue(row.dosePerHa),unit:text(row.unit)}}).filter(item=>item.activeIngredient&&item.dosePerHa>0).sort((a,b)=>a.sequence-b.sequence)
}
function activityFromData(id:string,data:Record<string,unknown>):ActivityRow{return{id,activityCode:text(data.activityCode),description:text(data.description),activity:text(data.activity),type:text(data.type).toUpperCase(),activityCategory:text(data.activityCategory).toUpperCase(),companyScope:text(data.companyScope)||'GLOBAL',active:data.active===true,components:componentFromData(data.components),sourceFileName:text(data.sourceFileName)}}
function materialFromData(id:string,data:Record<string,unknown>):MaterialRow{return{id,materialName:text(data.materialName),activeIngredient:text(data.activeIngredient),unit:text(data.unit),category:text(data.category).toUpperCase(),active:data.active!==false}}
function timestampValue(value:unknown){if(value&&typeof value==='object'&&'toDate' in value&&typeof (value as {toDate?:unknown}).toDate==='function'){try{return((value as {toDate:()=>Date}).toDate()).toISOString()}catch{return''}}return text(value)}
function logFromData(id:string,data:Record<string,unknown>):ImportLog{return{batchId:text(data.batchId)||id,companyScope:text(data.companyScope)||'GLOBAL',sourceFileName:text(data.sourceFileName),activityCreated:numberValue(data.activityCreated),activityUpdated:numberValue(data.activityUpdated),activityUnchanged:numberValue(data.activityUnchanged),materialCreated:numberValue(data.materialCreated),materialUpdated:numberValue(data.materialUpdated),materialUnchanged:numberValue(data.materialUnchanged),warnings:numberValue(data.warnings),importedBy:text(data.importedBy),importedAt:timestampValue(data.importedAt)}}
function formatDose(value:number){return new Intl.NumberFormat('id-ID',{minimumFractionDigits:0,maximumFractionDigits:4}).format(value)}
function formatDateTime(value:string){if(!value)return'-';const date=new Date(value);return Number.isNaN(date.getTime())?value:date.toLocaleString('id-ID',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'})}

export default function MasterActivityListPanel(){
  const[activities,setActivities]=useState<ActivityRow[]>([]),[materials,setMaterials]=useState<MaterialRow[]>([]),[logs,setLogs]=useState<ImportLog[]>([])
  const[busy,setBusy]=useState(false),[message,setMessage]=useState('')
  const[query,setQuery]=useState(''),[type,setType]=useState('ALL'),[category,setCategory]=useState('ALL'),[status,setStatus]=useState('ALL'),[scope,setScope]=useState('ALL')
  const[selectedId,setSelectedId]=useState('')

  async function load(){
    if(!firestoreDb){setMessage('Firestore belum tersedia.');return}
    setBusy(true);setMessage('Memuat Master Activity…')
    try{
      const[activitySnap,materialSnap,logSnap]=await Promise.all([getDocs(collection(firestoreDb,'master_activities')),getDocs(collection(firestoreDb,'master_materials')),getDocs(collection(firestoreDb,'master_activity_import_logs'))])
      const nextActivities=activitySnap.docs.map(item=>activityFromData(item.id,item.data() as Record<string,unknown>)).sort((a,b)=>a.activity.localeCompare(b.activity)||a.description.localeCompare(b.description,undefined,{numeric:true}))
      const nextMaterials=materialSnap.docs.map(item=>materialFromData(item.id,item.data() as Record<string,unknown>)).sort((a,b)=>a.materialName.localeCompare(b.materialName))
      const nextLogs=logSnap.docs.map(item=>logFromData(item.id,item.data() as Record<string,unknown>)).sort((a,b)=>b.importedAt.localeCompare(a.importedAt)).slice(0,10)
      setActivities(nextActivities);setMaterials(nextMaterials);setLogs(nextLogs)
      setSelectedId(current=>current&&nextActivities.some(row=>row.id===current)?current:'')
      setMessage(`Master Activity siap: ${nextActivities.length} Activity, ${nextMaterials.length} Material.`)
    }catch(error){setMessage(error instanceof Error?error.message:'Master Activity gagal dimuat.')}finally{setBusy(false)}
  }

  useEffect(()=>{void load()},[])

  const ingredientProducts=useMemo(()=>{
    const map=new Map<string,MaterialRow[]>()
    materials.filter(item=>item.active).forEach(item=>{const key=normalize(item.activeIngredient),rows=map.get(key)||[];rows.push(item);map.set(key,rows)})
    return map
  },[materials])
  const typeOptions=useMemo(()=>[...new Set(activities.map(item=>item.type).filter(Boolean))].sort(),[activities])
  const categoryOptions=useMemo(()=>[...new Set(activities.map(item=>item.activityCategory).filter(Boolean))].sort(),[activities])
  const scopeOptions=useMemo(()=>[...new Set(activities.map(item=>item.companyScope).filter(Boolean))].sort(),[activities])
  const searchSuggestions=useMemo(()=>{
    const values=new Set<string>()
    activities.forEach(row=>{[row.activityCode,row.description,row.activity,...row.components.map(component=>component.activeIngredient)].filter(Boolean).forEach(value=>values.add(value))})
    materials.forEach(row=>{if(row.materialName)values.add(row.materialName)})
    return [...values].sort((a,b)=>a.localeCompare(b,undefined,{numeric:true})).slice(0,400)
  },[activities,materials])

  const filtered=useMemo(()=>{
    const needle=normalize(query)
    return activities.filter(item=>{
      if(type!=='ALL'&&item.type!==type)return false
      if(category!=='ALL'&&item.activityCategory!==category)return false
      if(scope!=='ALL'&&item.companyScope!==scope)return false
      if(status!=='ALL'&&(status==='ACTIVE'?item.active:!item.active))return false
      if(!needle)return true
      const products=item.components.flatMap(component=>(ingredientProducts.get(normalize(component.activeIngredient))||[]).map(product=>product.materialName))
      return normalize(`${item.activityCode} ${item.description} ${item.activity} ${item.type} ${item.activityCategory} ${item.components.map(component=>component.activeIngredient).join(' ')} ${products.join(' ')}`).includes(needle)
    })
  },[activities,ingredientProducts,query,type,category,status,scope])
  const counts=useMemo(()=>({active:activities.filter(item=>item.active).length,inactive:activities.filter(item=>!item.active).length,spray:activities.filter(item=>item.type==='SPRAY').length,fertilizer:activities.filter(item=>item.type==='FERTILIZER').length}),[activities])
  const selected=useMemo(()=>activities.find(row=>row.id===selectedId)||null,[activities,selectedId])
  const selectedProducts=useMemo(()=>selected?selected.components.reduce((total,component)=>total+(ingredientProducts.get(normalize(component.activeIngredient))||[]).length,0):0,[selected,ingredientProducts])

  function reset(){setQuery('');setType('ALL');setCategory('ALL');setStatus('ALL');setScope('ALL')}
  function selectAndScroll(id:string){setSelectedId(id);requestAnimationFrame(()=>document.getElementById('activity-composition-detail')?.scrollIntoView({behavior:'smooth',block:'start'}))}
  function filterStatus(next:'ACTIVE'|'INACTIVE'){setStatus(next);setType('ALL');setSelectedId('')}
  function filterType(next:'SPRAY'|'FERTILIZER'){setType(next);setStatus('ALL');setSelectedId('')}

  return <section>
    <div className="section-head"><div><div className="eyebrow">FIRESTORE MASTER</div><h2>Daftar Master Activity</h2><p className="muted">Daftar ini menunjukkan tepat apa yang akan dibaca Plan: pilih Activity sekali, lalu komposisi bahan aktif dan dosis/Ha mengikuti otomatis.</p></div><button type="button" disabled={busy} onClick={()=>void load()}>{busy?'Memuat…':'Refresh'}</button></div>
    {message&&<div className="alert">{message}</div>}

    <div className="panel">
      <div className="record-filters">
        <div><input list="master-activity-search" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Cari Activity / bahan aktif / produk…"/><datalist id="master-activity-search">{searchSuggestions.map(item=><option key={item} value={item}/>)}</datalist></div>
        <select value={type} onChange={e=>setType(e.target.value)}><option value="ALL">Semua Type</option>{typeOptions.map(item=><option key={item} value={item}>{item}</option>)}</select>
        <select value={category} onChange={e=>setCategory(e.target.value)}><option value="ALL">Semua Category</option>{categoryOptions.map(item=><option key={item} value={item}>{item}</option>)}</select>
        <select value={scope} onChange={e=>setScope(e.target.value)}><option value="ALL">Semua Scope</option>{scopeOptions.map(item=><option key={item} value={item}>{item}</option>)}</select>
        <select value={status} onChange={e=>setStatus(e.target.value)}><option value="ALL">Semua Status</option><option value="ACTIVE">ACTIVE</option><option value="INACTIVE">INACTIVE</option></select>
        <button type="button" onClick={reset}>Reset</button>
      </div>
    </div>

    <div className="stats-grid">
      <button type="button" className="stat stat-button" onClick={reset}><span>Total Activity</span><strong>{activities.length}</strong><small>Semua</small></button>
      <button type="button" className="stat stat-button" onClick={()=>filterStatus('ACTIVE')}><span>ACTIVE</span><strong>{counts.active}</strong><small>Siap dipakai Plan</small></button>
      <button type="button" className="stat stat-button" onClick={()=>filterStatus('INACTIVE')}><span>INACTIVE</span><strong>{counts.inactive}</strong><small>Tidak muncul di Plan</small></button>
      <button type="button" className="stat stat-button" onClick={()=>filterType('SPRAY')}><span>SPRAY</span><strong>{counts.spray}</strong><small>Filter SPRAY</small></button>
      <button type="button" className="stat stat-button" onClick={()=>filterType('FERTILIZER')}><span>FERTILIZER</span><strong>{counts.fertilizer}</strong><small>Filter FERTILIZER</small></button>
      <div className="stat"><span>Master Material</span><strong>{materials.length}</strong><small>{materials.filter(row=>row.active).length} ACTIVE</small></div>
    </div>

    <div className="panel">
      <div className="section-head"><div><h3>Daftar Activity</h3><p className="muted">Tabel dibuat ringkas. Klik <strong>Lihat Komposisi</strong> untuk melihat bahan, dosis, dan produk yang tersedia secara lengkap.</p></div><span className="badge">{filtered.length} activity</span></div>
      <div className="table-wrap"><table><thead><tr><th>Code</th><th>Deskripsi</th><th>Activity</th><th>Type / Category</th><th>Scope</th><th>Status</th><th>Bahan</th><th>Detail</th></tr></thead><tbody>
        {filtered.map(row=><tr key={row.id}>
          <td><strong>{row.activityCode||'-'}</strong></td>
          <td><strong>{row.description}</strong></td>
          <td>{row.activity}</td>
          <td><div><strong>{row.type}</strong></div><div className="muted">{row.activityCategory}</div></td>
          <td>{row.companyScope}</td>
          <td><span className="badge">{row.active?'ACTIVE':'INACTIVE'}</span><div className="muted">{row.active?'Siap Plan':'Tidak dipilih Plan'}</div></td>
          <td>{row.components.length?<><strong>{row.components.length} bahan</strong><div className="muted">{row.components.map(component=>component.activeIngredient).join(' • ')}</div></>:<span className="muted">Belum ada komposisi</span>}</td>
          <td><button type="button" onClick={()=>selectAndScroll(row.id)}>{selectedId===row.id?'Sedang dilihat':'Lihat Komposisi'}</button></td>
        </tr>)}
        {!filtered.length&&<tr><td colSpan={8} className="empty">Belum ada Activity sesuai filter.</td></tr>}
      </tbody></table></div>
    </div>

    <div className="panel" id="activity-composition-detail">
      <div className="section-head"><div><div className="eyebrow">DETAIL AUTO-RECIPE</div><h3>Komposisi Bahan & Dosis / Ha</h3><p className="muted">Ini adalah komposisi yang nantinya ikut otomatis saat user memilih Activity di Plan.</p></div>{selected&&<button type="button" onClick={()=>setSelectedId('')}>Tutup Detail</button>}</div>
      {!selected?<div className="empty">Pilih <strong>Lihat Komposisi</strong> pada salah satu Activity.</div>:<>
        <div className="stats-grid">
          <div className="stat"><span>Activity Code</span><strong style={{fontSize:'1.1rem'}}>{selected.activityCode||'-'}</strong><small>{selected.description}</small></div>
          <div className="stat"><span>Status</span><strong style={{fontSize:'1.1rem'}}>{selected.active?'ACTIVE':'INACTIVE'}</strong><small>{selected.active?'Siap dipakai Plan':'Tidak muncul di Plan'}</small></div>
          <div className="stat"><span>Type</span><strong style={{fontSize:'1.1rem'}}>{selected.type}</strong><small>{selected.activityCategory}</small></div>
          <div className="stat"><span>Scope</span><strong style={{fontSize:'1.1rem'}}>{selected.companyScope}</strong><small>{selected.activity}</small></div>
          <div className="stat"><span>Jumlah Bahan</span><strong>{selected.components.length}</strong><small>komponen / Ha</small></div>
          <div className="stat"><span>Produk Tersedia</span><strong>{selectedProducts}</strong><small>produk ACTIVE yang cocok</small></div>
        </div>
        {selected.components.length?<div className="table-wrap"><table><thead><tr><th>Urutan</th><th>Bahan Aktif / Komposisi Utama</th><th>Dosis / Ha</th><th>Satuan</th><th>Produk ACTIVE yang dapat digunakan</th><th>Kesiapan</th></tr></thead><tbody>{selected.components.map((component,index)=>{const products=ingredientProducts.get(normalize(component.activeIngredient))||[];return <tr key={`${selected.id}-${component.sequence}-${component.activeIngredient}`}><td><strong>{index+1}</strong></td><td><strong>{component.activeIngredient}</strong></td><td><strong>{formatDose(component.dosePerHa)}</strong></td><td>{component.unit}/Ha</td><td>{products.length?products.map(product=><div key={product.id}>{product.materialName}<span className="muted"> — {product.category}</span></div>):<span className="muted">Belum ada produk ACTIVE yang cocok</span>}</td><td><span className="badge">{products.length?'SIAP':'REVIEW'}</span></td></tr>})}</tbody></table></div>:<div className="alert">Activity ini belum mempunyai komposisi bahan/dosis sehingga tetap INACTIVE dan tidak akan muncul pada pilihan Plan.</div>}
        <div className="panel" style={{marginTop:12}}><strong>Preview saat dipilih di Plan</strong><div style={{marginTop:8}}><div><strong>{selected.description}</strong> — {selected.activity} · {selected.type} · {selected.activityCategory}</div>{selected.components.length?selected.components.map((component,index)=><div key={`preview-${index}`} className="muted">{index+1}. {component.activeIngredient} — {formatDose(component.dosePerHa)} {component.unit}/Ha</div>):<div className="muted">Tidak ada komposisi.</div>}</div></div>
      </>}
    </div>

    <div className="panel">
      <div className="section-head"><div><h3>Riwayat Import Master Activity</h3><p className="muted">10 import terakhir.</p></div></div>
      <div className="table-wrap"><table><thead><tr><th>Waktu</th><th>Scope</th><th>File</th><th>Activity C/U/S</th><th>Material C/U/S</th><th>Warning</th><th>Oleh</th></tr></thead><tbody>{logs.map(log=><tr key={log.batchId}><td>{formatDateTime(log.importedAt)}</td><td>{log.companyScope}</td><td>{log.sourceFileName||'-'}</td><td>{log.activityCreated}/{log.activityUpdated}/{log.activityUnchanged}</td><td>{log.materialCreated}/{log.materialUpdated}/{log.materialUnchanged}</td><td>{log.warnings}</td><td>{log.importedBy||'-'}</td></tr>)}{!logs.length&&<tr><td colSpan={7} className="empty">Belum ada riwayat import Master Activity.</td></tr>}</tbody></table></div>
    </div>
  </section>
}
