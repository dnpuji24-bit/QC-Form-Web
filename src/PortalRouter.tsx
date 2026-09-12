import { useEffect, useMemo, useState } from 'react'
import CompanyMasterPanel from './CompanyMasterPanel'
import MasterActivityWorkspace from './MasterActivityWorkspace'
import MasterPaddockWorkspace from './MasterPaddockWorkspace'
import { GROUP_BRAND } from './groupConfig'
import type { User } from './types'
import './portal.css'

type PortalMode='chooser'|'qc'|'data-unm'
type DataView='home'|'plan'|'master-paddock'|'master-activity'|'company'

const MODE_KEY='unm_portal_mode'
const TOKEN_KEY='qc_token'
const USER_KEY='qc_user'

function readStored(key:string){return sessionStorage.getItem(key)||localStorage.getItem(key)||''}
function readUser():User|null{try{return JSON.parse(readStored(USER_KEY)||'null') as User|null}catch{return null}}
function hasSession(){return Boolean(readStored(TOKEN_KEY)&&readUser())}
function dataUnmAllowed(user:User|null){return Boolean(user&&['owner','asisten'].includes(user.role))}

export default function PortalRouter(){
  const[loggedIn,setLoggedIn]=useState(()=>hasSession())
  const[user,setUser]=useState<User|null>(()=>readUser())
  const[mode,setMode]=useState<PortalMode>(()=>hasSession()?((sessionStorage.getItem(MODE_KEY) as PortalMode)||'chooser'):'chooser')
  const[dataView,setDataView]=useState<DataView>('home')

  useEffect(()=>{
    let previous=hasSession()
    const sync=()=>{
      const next=hasSession(),nextUser=readUser()
      setLoggedIn(next);setUser(nextUser)
      if(!next&&previous){sessionStorage.removeItem(MODE_KEY);setMode('chooser');setDataView('home')}
      if(next&&!previous){sessionStorage.removeItem(MODE_KEY);setMode('chooser');setDataView('home')}
      previous=next
    }
    const timer=window.setInterval(sync,350)
    window.addEventListener('focus',sync)
    return()=>{window.clearInterval(timer);window.removeEventListener('focus',sync)}
  },[])

  const canData=useMemo(()=>dataUnmAllowed(user),[user])
  if(!loggedIn||!user)return null

  function choose(next:PortalMode){
    if(next==='data-unm'&&!canData)return
    sessionStorage.setItem(MODE_KEY,next)
    setMode(next)
    if(next!=='data-unm')setDataView('home')
  }

  if(mode==='qc')return <button className="portal-return-button" type="button" onClick={()=>choose('chooser')} aria-label="Kembali ke menu utama">☰ Menu Utama</button>

  if(mode==='data-unm')return <div className="portal-layer">
    <header className="portal-topbar">
      <div><div className="portal-eyebrow">DATA UnM</div><h1>Planning & Master Data</h1></div>
      <div className="portal-user"><div><strong>{user.fullName}</strong><span>{user.role.replaceAll('_',' ')}</span></div><button type="button" onClick={()=>choose('chooser')}>Menu Utama</button></div>
    </header>
    <main className="portal-content">
      {dataView==='home'&&<>
        <section className="portal-hero compact"><div><span className="portal-kicker">WORKSPACE OPERASIONAL</span><h2>Data UnM</h2><p>Kelola rencana kerja dan master data yang menjadi sumber Form QC.</p></div></section>
        <section className="portal-grid data-grid">
          <button className="portal-card" type="button" onClick={()=>setDataView('plan')}><span className="portal-icon">PL</span><strong>Plan</strong><p>Monthly Plan dan Daily Plan. Activity ACTIVE akan menjadi sumber pilihan kegiatan dan komposisi bahan.</p><span className="portal-link">Buka Plan →</span></button>
          <button className="portal-card" type="button" onClick={()=>setDataView('master-paddock')}><span className="portal-icon">MP</span><strong>Master Paddock</strong><p>Lihat daftar paddock Firestore serta update/import per Company dengan filter Farm opsional.</p><span className="portal-link">Buka Master Paddock →</span></button>
          <button className="portal-card" type="button" onClick={()=>setDataView('master-activity')}><span className="portal-icon">MA</span><strong>Master Activity</strong><p>Kelola Activity, komposisi bahan/dosis, Master Material, dan status ACTIVE/INACTIVE.</p><span className="portal-link">Buka Master Activity →</span></button>
          <button className="portal-card" type="button" onClick={()=>setDataView('company')}><span className="portal-icon">CO</span><strong>Company & Prefix</strong><p>Tambah, edit, aktif/nonaktifkan Company serta mapping prefix PID seperti JAGF → GPA.</p><span className="portal-link">Buka Company →</span></button>
        </section>
      </>}
      {dataView==='plan'&&<section><div className="portal-section-head"><div><span className="portal-kicker">DATA UnM</span><h2>Plan</h2><p>Tempat Monthly Plan dan Daily Plan.</p></div><button type="button" onClick={()=>setDataView('home')}>← Kembali</button></div><div className="portal-placeholder"><strong>Modul Plan berikutnya</strong><p>Master Paddock dan Master Activity sudah menjadi fondasi. Tahap selanjutnya kita hubungkan Monthly Plan dan Daily Plan ke Activity ACTIVE, komposisi bahan, serta target paddock.</p></div></section>}
      {dataView==='master-paddock'&&<section><div className="portal-section-head"><div><span className="portal-kicker">DATA UnM</span><h2>Master Paddock</h2><p>Lihat data Firestore atau lakukan update dari Area Plant dan Area Harvest.</p></div><button type="button" onClick={()=>setDataView('home')}>← Kembali</button></div><MasterPaddockWorkspace user={user}/></section>}
      {dataView==='master-activity'&&<section><div className="portal-section-head"><div><span className="portal-kicker">DATA UnM</span><h2>Master Activity</h2><p>Activity, komposisi bahan per hektar, Master Material, dan status penggunaan di Plan.</p></div><button type="button" onClick={()=>setDataView('home')}>← Kembali</button></div><MasterActivityWorkspace user={user}/></section>}
      {dataView==='company'&&<section><div className="portal-section-head"><div><span className="portal-kicker">DATA UnM</span><h2>Company & Prefix</h2><p>Master klasifikasi perusahaan MSG berdasarkan prefix PID.</p></div><button type="button" onClick={()=>setDataView('home')}>← Kembali</button></div><CompanyMasterPanel user={user}/></section>}
    </main>
  </div>

  return <div className="portal-layer chooser-layer">
    <header className="portal-topbar">
      <div><div className="portal-eyebrow">{GROUP_BRAND}</div><h1>Operational Portal</h1></div>
      <div className="portal-user"><div><strong>{user.fullName}</strong><span>{user.role.replaceAll('_',' ')}</span></div></div>
    </header>
    <main className="portal-content chooser-content">
      <section className="portal-hero"><div><span className="portal-kicker">SELAMAT DATANG</span><h2>Pilih area kerja</h2><p>Setelah login, pilih sistem yang akan digunakan. Anda dapat kembali ke menu ini kapan saja.</p></div></section>
      <section className="portal-grid">
        <button className="portal-card primary-card" type="button" onClick={()=>choose('qc')}><span className="portal-icon">QC</span><strong>Form QC</strong><p>Input Spraying, Fertilizer, monitoring Data QC, laporan, dan dashboard.</p><span className="portal-link">Masuk Form QC →</span></button>
        {canData&&<button className="portal-card" type="button" onClick={()=>choose('data-unm')}><span className="portal-icon">DU</span><strong>Data UnM</strong><p>Plan, Master Paddock, Master Activity, Company, dan master operasional untuk sumber data kegiatan.</p><span className="portal-link">Masuk Data UnM →</span></button>}
      </section>
      {!canData&&<p className="portal-note">Role Anda saat ini menggunakan Form QC. Akses Data UnM tersedia untuk Owner dan Asisten.</p>}
    </main>
  </div>
}
