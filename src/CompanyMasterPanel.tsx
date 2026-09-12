import { useEffect, useMemo, useState } from 'react'
import { collection, doc, getDocs, serverTimestamp, setDoc } from 'firebase/firestore'
import { firebaseAuth, firestoreDb } from './firebase'
import { FALLBACK_COMPANIES, companyDocId, normalizeCompanyCode, normalizePrefix, planningAreaFallback, type CompanyRecord } from './companyMaster'
import type { User } from './types'

type Props={user:User}
type FormState={code:string;name:string;prefixes:string;planningAreaHa:string;active:boolean}
const EMPTY:FormState={code:'',name:'',prefixes:'',planningAreaHa:'',active:true}

function numberValue(value:unknown){const parsed=Number(value||0);return Number.isFinite(parsed)?parsed:0}
function formatHa(value:number){return `${new Intl.NumberFormat('id-ID',{minimumFractionDigits:2,maximumFractionDigits:2}).format(value)} Ha`}
function dataFromDoc(id:string,data:Record<string,unknown>):CompanyRecord{
  const code=normalizeCompanyCode(String(data.code||id))
  const storedArea=numberValue(data.planningAreaHa)
  return{
    id,
    code,
    name:String(data.name||''),
    prefixes:Array.isArray(data.prefixes)?data.prefixes.map(item=>normalizePrefix(String(item))).filter(Boolean):[],
    active:data.active!==false,
    planningAreaHa:storedArea>0?storedArea:planningAreaFallback(code),
  }
}

export default function CompanyMasterPanel({user}:Props){
  const[companies,setCompanies]=useState<CompanyRecord[]>([])
  const[form,setForm]=useState<FormState>(EMPTY)
  const[editingId,setEditingId]=useState<string|null>(null)
  const[busy,setBusy]=useState(false)
  const[message,setMessage]=useState('')
  const[usingFallback,setUsingFallback]=useState(false)
  const canEdit=user.role==='owner'

  async function load(){
    if(!firestoreDb){setCompanies(FALLBACK_COMPANIES);setUsingFallback(true);setMessage('Firestore belum tersedia. Menampilkan mapping default sementara.');return}
    setBusy(true)
    try{
      const snap=await getDocs(collection(firestoreDb,'master_companies'))
      const rows=snap.docs.map(item=>dataFromDoc(item.id,item.data() as Record<string,unknown>)).sort((a,b)=>a.code.localeCompare(b.code))
      if(rows.length){setCompanies(rows);setUsingFallback(false);setMessage('')}
      else{setCompanies(FALLBACK_COMPANIES);setUsingFallback(true);setMessage('Master Company belum berisi data. Mapping GPA / JAGF ditampilkan sebagai default sementara; simpan melalui form agar menjadi data Firestore.')}
    }catch(error){
      setCompanies(FALLBACK_COMPANIES);setUsingFallback(true);setMessage(`${error instanceof Error?error.message:'Master Company belum dapat dibaca.'} Mapping GPA / JAGF tetap tersedia untuk preview.`)
    }finally{setBusy(false)}
  }

  useEffect(()=>{void load()},[])

  const duplicatePrefixes=useMemo(()=>{
    const owner=new Map<string,string>(),duplicates=new Set<string>()
    for(const company of companies.filter(item=>!item.fallback||!usingFallback))for(const prefix of company.prefixes){
      const p=normalizePrefix(prefix),previous=owner.get(p)
      if(previous&&previous!==company.id)duplicates.add(p);else owner.set(p,company.id)
    }
    return duplicates
  },[companies,usingFallback])

  function startEdit(company:CompanyRecord){
    setEditingId(company.fallback?null:company.id)
    setForm({code:company.code,name:company.name,prefixes:company.prefixes.join(', '),planningAreaHa:String(company.planningAreaHa||planningAreaFallback(company.code)||''),active:company.active})
    setMessage(company.fallback?'Default sementara dimuat ke form. Klik Simpan untuk membuat Master Company GPA di Firestore.':'')
  }

  function reset(){setEditingId(null);setForm(EMPTY)}

  async function save(){
    if(!canEdit){setMessage('Hanya Owner yang dapat menambah atau mengubah Master Company.');return}
    if(!firestoreDb||!firebaseAuth?.currentUser){setMessage('Firebase Auth / Firestore belum siap. Login ulang lalu coba kembali.');return}
    const code=normalizeCompanyCode(form.code),name=form.name.trim()
    const prefixes=[...new Set(form.prefixes.split(/[;,\s]+/).map(normalizePrefix).filter(Boolean))]
    const planningAreaHa=Number(form.planningAreaHa)
    if(!code||!name||!prefixes.length){setMessage('Company Code, Nama Perusahaan, dan minimal satu Prefix PID wajib diisi.');return}
    if(!Number.isFinite(planningAreaHa)||planningAreaHa<=0){setMessage('Luas Planning Company wajib diisi dengan angka lebih besar dari 0 Ha.');return}
    const targetId=editingId||companyDocId(code)
    const conflict=companies.find(company=>company.id!==targetId&&company.prefixes.some(prefix=>prefixes.includes(normalizePrefix(prefix))))
    if(conflict){setMessage(`Prefix bentrok dengan ${conflict.code}: ${conflict.prefixes.filter(prefix=>prefixes.includes(normalizePrefix(prefix))).join(', ')}`);return}
    setBusy(true)
    try{
      await setDoc(doc(firestoreDb,'master_companies',targetId),{
        code,name,prefixes,planningAreaHa,active:form.active,
        updatedAt:serverTimestamp(),updatedBy:user.username,
        ...(editingId?{}:{createdAt:serverTimestamp(),createdBy:user.username}),
      },{merge:true})
      setMessage(`${code} berhasil disimpan dengan luas planning ${formatHa(planningAreaHa)}.`);reset();await load()
    }catch(error){setMessage(error instanceof Error?error.message:'Gagal menyimpan Master Company.')}
    finally{setBusy(false)}
  }

  return <section>
    <div className="section-head"><div><div className="eyebrow">MASTER DATA</div><h2>Company & Prefix PID</h2></div><span className="badge">MSG Group</span></div>
    <div className="panel form-stack">
      <h3>{editingId?'Edit Company':'Tambah Company / Prefix'}</h3>
      <p className="muted">Mapping ini dikelola manual. Contoh: prefix <strong>JAGF</strong> → <strong>GPA</strong>. Luas Planning Company juga disimpan di sini agar setiap perusahaan MSG dapat memiliki kapasitas area yang berbeda.</p>
      <div className="form-grid">
        <label>Company Code<input value={form.code} disabled={busy||Boolean(editingId)} placeholder="GPA" onChange={e=>setForm(v=>({...v,code:e.target.value.toUpperCase()}))}/></label>
        <label>Nama Perusahaan<input value={form.name} disabled={busy} placeholder="PT Global Papua Abadi" onChange={e=>setForm(v=>({...v,name:e.target.value}))}/></label>
        <label>Prefix PID<input value={form.prefixes} disabled={busy} placeholder="JAGF, ABCF" onChange={e=>setForm(v=>({...v,prefixes:e.target.value.toUpperCase()}))}/><span className="muted">Pisahkan beberapa prefix dengan koma.</span></label>
        <label>Luas Planning Company (Ha)<input type="number" min="0" step="0.01" value={form.planningAreaHa} disabled={busy} placeholder="28000" onChange={e=>setForm(v=>({...v,planningAreaHa:e.target.value}))}/><span className="muted">Contoh GPA: 28.000 Ha. Nilai ini tidak dihitung dari file paddock.</span></label>
        <label>Status<select value={form.active?'ACTIVE':'INACTIVE'} disabled={busy} onChange={e=>setForm(v=>({...v,active:e.target.value==='ACTIVE'}))}><option value="ACTIVE">ACTIVE</option><option value="INACTIVE">INACTIVE</option></select></label>
      </div>
      <div className="row-actions"><button type="button" className="primary" disabled={busy||!canEdit} onClick={()=>void save()}>{busy?'Memproses…':'Simpan Company'}</button><button type="button" disabled={busy} onClick={reset}>Reset</button><button type="button" disabled={busy} onClick={()=>void load()}>Refresh</button></div>
      {!canEdit&&<div className="alert">Role Asisten dapat melihat mapping Company tetapi perubahan Company dibatasi untuk Owner.</div>}
      {message&&<div className="alert">{message}</div>}
    </div>

    <div className="panel">
      <div className="section-head"><div><h3>Daftar Company</h3><p className="muted">Nonaktifkan mapping yang tidak lagi dipakai; jangan menghapus histori perusahaan.</p></div><span className="badge">{companies.length} company</span></div>
      <div className="table-wrap"><table><thead><tr><th>Code</th><th>Perusahaan</th><th>Prefix PID</th><th>Luas Planning</th><th>Status</th><th>Aksi</th></tr></thead><tbody>
        {companies.map(company=><tr key={company.id}><td><strong>{company.code}</strong>{company.fallback&&<div className="muted">default sementara</div>}</td><td>{company.name}</td><td>{company.prefixes.join(', ')||'-'}{company.prefixes.some(prefix=>duplicatePrefixes.has(normalizePrefix(prefix)))&&<div className="muted">⚠ prefix duplikat</div>}</td><td>{company.planningAreaHa?formatHa(company.planningAreaHa):'-'}</td><td>{company.active?'ACTIVE':'INACTIVE'}</td><td><button type="button" disabled={!canEdit||busy} onClick={()=>startEdit(company)}>Edit</button></td></tr>)}
        {!companies.length&&<tr><td colSpan={6} className="empty">Belum ada Master Company.</td></tr>}
      </tbody></table></div>
    </div>
  </section>
}
