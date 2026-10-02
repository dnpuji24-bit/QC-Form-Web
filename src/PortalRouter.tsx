import { useEffect, useMemo, useRef, useState } from 'react'
import CompanyMasterPanel from './CompanyMasterPanel'
import MasterActivityWorkspace from './MasterActivityWorkspace'
import MasterPaddockWorkspace from './MasterPaddockWorkspace'
import PlanWorkspace, { type PlanWorkspaceHandle } from './PlanWorkspace'
import { UsersApproval } from './AdminPages'
import { canOpenDataUnm, canOpenQc, canViewAccess } from './accessControl'
import { hydrateUserAccess } from './userAccess'
import { GROUP_BRAND } from './groupConfig'
import type { User } from './types'
import './portal.css'

type PortalMode='chooser'|'qc'|'data-unm'|'users'
type DataView='home'|'plan'|'master-paddock'|'master-activity'|'company'

const MODE_KEY='unm_portal_mode'
const TOKEN_KEY='qc_token'
const USER_KEY='qc_user'

function readStored(key:string){return sessionStorage.getItem(key)||localStorage.getItem(key)||''}
function readUser():User|null{try{return JSON.parse(readStored(USER_KEY)||'null') as User|null}catch{return null}}
function hasSession(){return Boolean(readStored(TOKEN_KEY)&&readUser())}
function dataUnmAllowed(user:User|null){return Boolean(user&&canOpenDataUnm(user))}
function qcAllowed(user:User|null){return Boolean(user&&canOpenQc(user))}

export default function PortalRouter(){
  const[loggedIn,setLoggedIn]=useState(()=>hasSession())
  const[user,setUser]=useState<User|null>(()=>readUser())
  const[mode,setMode]=useState<PortalMode>(()=>hasSession()?((sessionStorage.getItem(MODE_KEY) as PortalMode)||'chooser'):'chooser')
  const[dataView,setDataView]=useState<DataView>('home')
  const planWorkspaceRef=useRef<PlanWorkspaceHandle|null>(null)

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

  useEffect(()=>{
    if(!loggedIn||!user)return
    let cancelled=false
    void hydrateUserAccess(user).then(hydrated=>{
      if(cancelled)return
      const before=JSON.stringify(user.permissions||{}),after=JSON.stringify(hydrated.permissions||{})
      if(before===after&&user.firebaseUid===hydrated.firebaseUid)return
      setUser(hydrated)
      sessionStorage.setItem(USER_KEY,JSON.stringify(hydrated))
      localStorage.setItem(USER_KEY,JSON.stringify(hydrated))
    })
    return()=>{cancelled=true}
  },[loggedIn,user?.username])

  const canData=useMemo(()=>dataUnmAllowed(user),[user])
  const canQc=useMemo(()=>qcAllowed(user),[user])
  const canUsers=user?.role==='owner'
  if(!loggedIn||!user)return null

  function choose(next:PortalMode){
    if(next==='data-unm'&&!canData)return
    if(next==='qc'&&!canQc)return
    if(next==='users'&&!canUsers)return
    sessionStorage.setItem(MODE_KEY,next)
    setMode(next)
    if(next!=='data-unm')setDataView('home')
  }

  if(mode==='qc')return <button className="portal-return-button" type="button" onClick={()=>choose('chooser')} aria-label="Kembali ke menu utama">☰ Menu Utama</button>

  if(mode==='users')return <div className="portal-layer">
    <header className="portal-topbar">
      <div><div className="portal-eyebrow">ADMINISTRASI</div><h1>Users & Access</h1></div>
      <div className="portal-user"><div><strong>{user.fullName}</strong><span>{user.role.replaceAll('_',' ')}</span></div><button type="button" onClick={()=>choose('chooser')}>Menu Utama</button></div>
    </header>
    <main className="portal-content">
      <section className="portal-section-head"><div><span className="portal-kicker">HOME / USERS</span><h2>Pengguna & Hak Akses</h2><p>Approval akun, role, serta izin lihat/edit per menu dan sub menu.</p></div><button type="button" onClick={()=>choose('chooser')}>← Kembali</button></section>
      <UsersApproval token={readStored(TOKEN_KEY)}/>
    </main>
  </div>

  if(mode==='data-unm')return <div className="portal-layer">
    <header className="portal-topbar">
      <div><div className="portal-eyebrow">DATA UnM</div><h1>Planning & Master Data</h1></div>
      <div className="portal-user"><div><strong>{user.fullName}</strong><span>{user.role.replaceAll('_',' ')}</span></div><button type="button" onClick={()=>choose('chooser')}>Menu Utama</button></div>
    </header>
    <main className="portal-content"><div key={dataView} className="ui-view-transition portal-view-transition">
      {dataView==='home'&&<>
        <section className="portal-hero compact data-home-hero"><div><span className="portal-kicker">WORKSPACE OPERASIONAL</span><h2>Data UnM</h2><p>Plan dan master data operasional.</p></div></section>
        <section className="portal-grid data-grid data-shortcut-grid">
          {(['data_plan_summary','data_plan_monthly','data_plan_daily','data_plan_actual','data_plan_reconciliation'] as const).some(key=>canViewAccess(user,key))&&<button className="portal-card" type="button" onClick={()=>setDataView('plan')}><span className="portal-icon">PL</span><strong>Plan</strong><p>Monthly Plan dan Daily Plan. Activity ACTIVE akan menjadi sumber pilihan kegiatan dan komposisi bahan.</p><span className="portal-link">Buka Plan →</span></button>}
          {(canViewAccess(user,'data_master_paddock_list')||canViewAccess(user,'data_master_paddock_import'))&&<button className="portal-card" type="button" onClick={()=>setDataView('master-paddock')}><span className="portal-icon">MP</span><strong>Master Paddock</strong><p>Lihat daftar paddock Firestore serta update/import per Company dengan filter Farm opsional.</p><span className="portal-link">Buka Master Paddock →</span></button>}
          {(['data_master_activity_list','data_master_activity_manage','data_master_activity_resources','data_master_activity_import'] as const).some(key=>canViewAccess(user,key))&&<button className="portal-card" type="button" onClick={()=>setDataView('master-activity')}><span className="portal-icon">MA</span><strong>Master Activity</strong><p>Kelola Activity, komposisi bahan/dosis, Master Material, dan status ACTIVE/INACTIVE.</p><span className="portal-link">Buka Master Activity →</span></button>}
          {canViewAccess(user,'data_company')&&<button className="portal-card" type="button" onClick={()=>setDataView('company')}><span className="portal-icon">CO</span><strong>Company & Prefix</strong><p>Tambah, edit, aktif/nonaktifkan Company serta mapping prefix PID seperti JAGF → GPA.</p><span className="portal-link">Buka Company →</span></button>}
        </section>
      </>}
      {dataView==='plan'&&<section className="portal-workspace-view"><div className="portal-section-head compact-page-head"><div><span className="portal-kicker">DATA UnM / PLAN</span><h2>Plan</h2><p>Monthly, Daily, Actual dan rekonsiliasi.</p></div><button type="button" onClick={()=>{if(!planWorkspaceRef.current?.goBack())setDataView('home')}}>← Kembali</button></div><PlanWorkspace ref={planWorkspaceRef} user={user}/></section>}
      {dataView==='master-paddock'&&<section><div className="portal-section-head"><div><span className="portal-kicker">DATA UnM</span><h2>Master Paddock</h2><p>Lihat data Firestore atau lakukan update dari Area Plant dan Area Harvest.</p></div><button type="button" onClick={()=>setDataView('home')}>← Kembali</button></div><MasterPaddockWorkspace user={user}/></section>}
      {dataView==='master-activity'&&<section><div className="portal-section-head"><div><span className="portal-kicker">DATA UnM</span><h2>Master Activity</h2><p>Activity, komposisi bahan per hektar, Master Material, dan status penggunaan di Plan.</p></div><button type="button" onClick={()=>setDataView('home')}>← Kembali</button></div><MasterActivityWorkspace user={user}/></section>}
      {dataView==='company'&&<section><div className="portal-section-head"><div><span className="portal-kicker">DATA UnM</span><h2>Company & Prefix</h2><p>Master klasifikasi perusahaan MSG berdasarkan prefix PID.</p></div><button type="button" onClick={()=>setDataView('home')}>← Kembali</button></div><CompanyMasterPanel user={user}/></section>}
    </div></main>
  </div>

  return <div className="portal-layer chooser-layer">
    <header className="portal-topbar">
      <div><div className="portal-eyebrow">{GROUP_BRAND}</div><h1>Operational Portal</h1></div>
      <div className="portal-user"><div><strong>{user.fullName}</strong><span>{user.role.replaceAll('_',' ')}</span></div></div>
    </header>
    <main className="portal-content chooser-content">
      <section className="portal-hero"><div><span className="portal-kicker">SELAMAT DATANG</span><h2>Pilih area kerja</h2><p>Setelah login, pilih sistem yang akan digunakan. Anda dapat kembali ke menu ini kapan saja.</p></div></section>
      <section className="portal-grid">
        {canQc&&<button className="portal-card primary-card" type="button" onClick={()=>choose('qc')}><span className="portal-icon">QC</span><strong>Form QC</strong><p>Input Spraying, Fertilizer, monitoring Data QC, laporan, dan dashboard.</p><span className="portal-link">Masuk Form QC →</span></button>}
        {canData&&<button className="portal-card" type="button" onClick={()=>choose('data-unm')}><span className="portal-icon">DU</span><strong>Data UnM</strong><p>Plan, Master Paddock, Master Activity, Company, dan master operasional untuk sumber data kegiatan.</p><span className="portal-link">Masuk Data UnM →</span></button>}
        {canUsers&&<button className="portal-card users-card" type="button" onClick={()=>choose('users')}><span className="portal-icon">US</span><strong>Users & Access</strong><p>Approval user, role, serta pengaturan izin lihat/edit untuk setiap menu dan sub menu.</p><span className="portal-link">Kelola Users →</span></button>}
      </section>
      {!canData&&<p className="portal-note">Akses Data UnM belum diberikan untuk akun ini. Owner dapat mengaturnya dari Users & Access.</p>}
    </main>
  </div>
}
