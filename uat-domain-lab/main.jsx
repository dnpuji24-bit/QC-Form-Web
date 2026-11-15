import React,{useRef,useState} from 'react'
import {createRoot} from 'react-dom/client'
import {assertBrowserLab,createLabClient,identities} from './client.mjs'
import './style.css'
assertBrowserLab(window.location)
if(!import.meta.env.DEV)throw Error('LAB_DEV_ONLY')
const sections=[
 ['master_paddocks','Master Paddock','uat-p1',{area100:1000}],
 ['master_activities','Master Activity','uat-a1',{formType:'spray'}],
 ['monthly_plans','Monthly Plan','uat-m1',{pid:'uat-p1',activityId:'uat-a1',targetArea100:800}],
 ['daily_plans','Daily Plan','uat-d1',{pid:'uat-p1',activityId:'uat-a1',monthlyPlanLineId:'uat-m1',targetArea100:500,formType:'spray'}],
 ['qc_records','QC Spray / Fertilizer','uat-q1',{pid:'uat-p1',monthlyPlanLineId:'uat-m1',dailyPlanId:'uat-d1',formType:'spray',actualArea100:400}],
 ['daily_reports','Actual Plan','uat-q1',{}]
]
const labels={area100:'Luas paddock (0,01 Ha)',targetArea100:'Target luas (0,01 Ha)',actualArea100:'Luas aktual (0,01 Ha)',pid:'Paddock ID',activityId:'Activity ID',monthlyPlanLineId:'Monthly Plan ID',dailyPlanId:'Daily Plan ID',formType:'Jenis form'}
function Lab(){
 const session=useRef(null),lock=useRef(false)
 const [account,setAccount]=useState('planner'),[who,setWho]=useState(null),[busy,setBusy]=useState(false),[idx,setIdx]=useState(0)
 const [id,setId]=useState(sections[0][2]),[fields,setFields]=useState({...sections[0][3]})
 const [result,setResult]=useState('Belum ada operasi.'),[status,setStatus]=useState('idle')
 const [collection,title]=sections[idx]
 function select(i){setIdx(i);setId(sections[i][2]);setFields({...sections[i][3]});setStatus('idle');setResult('Belum ada operasi.')}
 async function run(fn){
  if(lock.current)return
  lock.current=true;setBusy(true);setStatus('busy');setResult('Memproses…')
  try{
   if(!session.current)session.current=await createLabClient(()=>assertBrowserLab(window.location))
   const out=await fn(session.current)
   setResult(JSON.stringify(out??{ok:true},null,2));setStatus('success')
  }catch(e){setResult('DITOLAK / GAGAL: '+(e.code||e.message||'UNKNOWN'));setStatus('error')}
  finally{lock.current=false;setBusy(false)}
 }
 function payload(){
  return Object.fromEntries(Object.entries(fields).map(([k,v])=>[k,k.endsWith('100')?Number(v):v]))
 }
 return <main><header><strong>QC UnM / UAT LAB</strong><span className="pill">EMULATOR ONLY</span></header>
 <h1>Laboratorium QC & Planning</h1><p className="muted">Data sintetis · Bukan portal operasional · Tidak ada koneksi produksi atau foto.</p>
 <section><h2>1. Autentikasi</h2><label htmlFor="account">Akun sintetis</label><select id="account" value={account} disabled={busy} onChange={e=>setAccount(e.target.value)}>{Object.entries(identities).map(([k,a])=><option key={k} value={k}>{k} — {a.role}</option>)}</select>
 <div className="buttons"><button id="login" disabled={busy} onClick={()=>run(async s=>{setWho(null);const u=await s.signIn(account);setWho({...u,role:identities[account].role});return u})}>Login emulator</button><button id="logout" disabled={busy||!who} onClick={()=>run(async s=>{setWho(null);await s.signOut()})}>Logout</button></div>
 <p id="session">{who?who.uid+' · '+who.role+' · claim UAT: '+who.claim:'Belum login'}</p></section>
 <section><h2>2. Alur data</h2><nav aria-label="Modul UAT">{sections.map(([c,t],i)=><button key={c} data-testid={'nav-'+c} aria-pressed={idx===i} disabled={busy} onClick={()=>select(i)}>{t}</button>)}</nav>
 <h3>{title}</h3><label htmlFor="record-id">ID sintetis</label><input id="record-id" value={id} disabled={busy} onChange={e=>setId(e.target.value)}/>
 {Object.entries(fields).map(([key,value])=><div key={key}><label htmlFor={'field-'+key}>{labels[key]}</label>{key==='formType'?<select id={'field-'+key} disabled={busy} value={value} onChange={e=>setFields({...fields,[key]:e.target.value})}><option value="spray">Spray</option><option value="fertilizer">Fertilizer</option></select>:<input id={'field-'+key} type={key.endsWith('100')?'number':'text'} min={key.endsWith('100')?1:undefined} step={key.endsWith('100')?1:undefined} disabled={busy} value={value} onChange={e=>setFields({...fields,[key]:e.target.value})}/>}</div>)}
 <div className="buttons"><button id="create" disabled={busy||!who||collection==='daily_reports'} onClick={()=>run(s=>collection==='qc_records'?s.createQcPair(id,payload()):s.createPlan(collection,id,payload()))}>{collection==='qc_records'?'Simpan QC + Actual':'Buat data'}</button><button id="read" disabled={busy||!who} onClick={()=>run(s=>s.read(collection,id))}>Baca ID</button><button id="list" disabled={busy||!who} onClick={()=>run(s=>s.list(collection))}>Daftar (maks. 20)</button></div></section>
 <section><h2>3. Hasil transaksi</h2><pre id="result" data-status={status} aria-live="polite">{result}</pre></section>
 <footer>demo-qc-uat-foundation · cutover · create-only</footer></main>
}
createRoot(document.getElementById('root')).render(<Lab/>)
