import {signOut} from 'firebase/auth'
import { Alert, App as AntApp, Button, Card, Layout, Tag, Typography } from 'antd'
import {firebaseAuth} from './firebase'
import NativeUsersAccess from './NativeUsersAccess'
import {nativePortalEnabled} from './qcNativePortalConfig'
import { useEffect, useMemo, useRef, useState } from 'react'
import CompanyMasterPanel from './CompanyMasterPanel'
import MasterActivityWorkspace from './MasterActivityWorkspace'
import UnitDispatchWorkspace from './UnitDispatchWorkspace'
import MasterEmployeeWorkspace from './MasterEmployeeWorkspace'
import NozzleCalculatorWorkspace from './NozzleCalculatorWorkspace'
import MasterPaddockWorkspace from './MasterPaddockWorkspace'
import PlanWorkspace, { type PlanWorkspaceHandle } from './PlanWorkspace'
import PlanSummaryDashboard from './PlanSummaryDashboard'
import PlanCalendarRecap from './PlanCalendarRecap'
import PlanOfflineBanner from './PlanOfflineBanner'
import { UsersApproval } from './AdminPages'
import { canOpenDataUnm, canOpenQc, canViewAccess } from './accessControl'
import { hydrateUserAccess } from './userAccess'
import { GROUP_BRAND } from './groupConfig'
import type { User } from './types'
import './portal.css'

type PortalMode='chooser'|'qc'|'data-unm'|'users'|'summary'|'calendar'
type DataView='home'|'plan'|'master-paddock'|'master-activity'|'company'|'nozzle-calculator'|'unit-management'|'master-employees'

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
  const[logoutBusy,setLogoutBusy]=useState(false)
  const { notification } = AntApp.useApp()
  async function nativeLogout(){
    if(logoutBusy||!firebaseAuth)return
    if(!window.confirm('Keluar dari akun ini? Antrean lokal yang sudah tersimpan tetap dipertahankan.'))return
    setLogoutBusy(true)
    notification.destroy('portal-logout')
    try {
      await signOut(firebaseAuth)
    } catch {
      notification.error({ title: 'Keluar belum berhasil', description: 'Coba kembali.', key: 'portal-logout', duration: 0 })
    } finally {
      setLogoutBusy(false)
    }
  }
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
    if(nativePortalEnabled||!loggedIn||!user)return
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
  const canSummary=Boolean(user&&canViewAccess(user,'data_plan_summary'))
  const canCalendar=Boolean(user&&(canSummary||canViewAccess(user,'data_plan_daily')||canViewAccess(user,'data_plan_actual')))
  if(!loggedIn||!user)return null

  function choose(next:PortalMode){
    if(next==='data-unm'&&!canData)return
    if(next==='qc'&&!canQc)return
    if(next==='users'&&!canUsers)return
    if(next==='summary'&&!canSummary)return
    if(next==='calendar'&&!canCalendar)return
    sessionStorage.setItem(MODE_KEY,next)
    setMode(next)
    if(next!=='data-unm')setDataView('home')
  }

  if(mode==='qc')return <button className="portal-return-button" type="button" onClick={()=>choose('chooser')} aria-label="Kembali ke menu utama">☰ Menu Utama</button>

  // Both reporting tools are first-class destinations, separate from Plan input.
  // Permission checks are the same as the former Plan tabs.
  if((mode==='summary'&&canSummary)||(mode==='calendar'&&canCalendar)){
    const summary=mode==='summary'
    const heading=summary?'Summary':'Calendar Rekap'
    return <div className="portal-layer portal-report-layer">
      <header className="portal-topbar">
        <div><div className="portal-eyebrow">DATA UnM</div><h1>{heading}</h1></div>
        <div className="portal-user"><div><strong>{user.fullName}</strong><span>{user.role.replaceAll('_',' ')}</span></div><button type="button" onClick={()=>choose('chooser')}>Menu Utama</button></div>
      </header>
      <main className="portal-content portal-report-content">
        <section className="portal-section-head compact-page-head">
          <div><span className="portal-kicker">MENU UTAMA / {summary?'SUMMARY':'CALENDAR REKAP'}</span>
          <h2>{heading}</h2><p>{summary?'Monitoring target, realisasi dan progres pekerjaan seluruh paddock.':'Kalender pekerjaan dan perbandingan Daily Plan dengan Actual per tanggal.'}</p></div>
          <button type="button" onClick={()=>choose('chooser')}>← Kembali</button>
        </section>
        <PlanOfflineBanner/>
        {summary?<PlanSummaryDashboard/>:<PlanCalendarRecap/>}
      </main>
    </div>
  }


  if(mode==='users'&&canUsers)return <div className="portal-layer">
    <header className="portal-topbar">
      <div><div className="portal-eyebrow">ADMINISTRASI</div><h1>Users & Access</h1></div>
      <div className="portal-user"><div><strong>{user.fullName}</strong><span>{user.role.replaceAll('_',' ')}</span></div><button type="button" onClick={()=>choose('chooser')}>Menu Utama</button></div>
    </header>
    <main className="portal-content">
      <section className="portal-section-head"><div><span className="portal-kicker">HOME / USERS</span><h2>Pengguna & Hak Akses</h2><p>Approval akun, role, serta izin lihat/edit per menu dan sub menu.</p></div><button type="button" onClick={()=>choose('chooser')}>← Kembali</button></section>
      {nativePortalEnabled?<NativeUsersAccess/>:<UsersApproval token={readStored(TOKEN_KEY)}/>}
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
          {(['data_plan_monthly','data_plan_monthly_import','data_plan_daily','data_plan_daily_import','data_plan_actual','data_plan_actual_import','data_plan_reconciliation'] as const).some(key=>canViewAccess(user,key))&&<button className="portal-card" type="button" onClick={()=>setDataView('plan')}><span className="portal-icon">PL</span><strong>Plan</strong><p>Monthly Plan dan Daily Plan. Activity ACTIVE akan menjadi sumber pilihan kegiatan dan komposisi bahan.</p><span className="portal-link">Buka Plan →</span></button>}
          {(canViewAccess(user,'data_master_paddock_list')||canViewAccess(user,'data_master_paddock_import'))&&<button className="portal-card" type="button" onClick={()=>setDataView('master-paddock')}><span className="portal-icon">MP</span><strong>Master Paddock</strong><p>Lihat daftar paddock Firestore serta update/import per Company dengan filter Farm opsional.</p><span className="portal-link">Buka Master Paddock →</span></button>}
          {(['data_master_activity_list','data_master_activity_manage','data_master_activity_resources','data_master_activity_import'] as const).some(key=>canViewAccess(user,key))&&<button className="portal-card" type="button" onClick={()=>setDataView('master-activity')}><span className="portal-icon">MA</span><strong>Master Activity</strong><p>Kelola Activity, komposisi bahan/dosis, Master Material, dan status ACTIVE/INACTIVE.</p><span className="portal-link">Buka Master Activity →</span></button>}
          {canViewAccess(user,'data_master_employees')&&<button className="portal-card" type="button" onClick={()=>setDataView('master-employees')}><span className="portal-icon">KY</span><strong>Master Karyawan</strong><p>Daftar karyawan terpisah, jabatan, Front, Shift sumber, dan import dari Sheet1.</p><span className="portal-link">Buka Master Karyawan →</span></button>}
          {canViewAccess(user,'data_unit_dispatch')&&<button className="portal-card" type="button" onClick={()=>setDataView('unit-management')}><span className="portal-icon">UN</span><strong>Unit Management</strong><p>Master Unit, Dispatch per Shift, Standby otomatis, Breakdown, Maintenance dan persetujuan Ready.</p><span className="portal-link">Buka Unit →</span></button>}
          {canViewAccess(user,'data_master_activity_resources')&&<button className="portal-card" type="button" onClick={()=>setDataView('nozzle-calculator')}><span className="portal-icon">NZ</span><strong>Kalkulator Nozzle</strong><p>Hitung tekanan, debit, kategori droplet, dan kecepatan traktor berdasarkan spesifikasi nozzle hasil upload.</p><span className="portal-link">Buka Kalkulator Nozzle →</span></button>}
          {canViewAccess(user,'data_company')&&<button className="portal-card" type="button" onClick={()=>setDataView('company')}><span className="portal-icon">CO</span><strong>Company & Prefix</strong><p>Tambah, edit, aktif/nonaktifkan Company serta mapping prefix PID seperti JAGF → GPA.</p><span className="portal-link">Buka Company →</span></button>}
        </section>
      </>}
      {dataView==='plan'&&<section className="portal-workspace-view"><div className="portal-section-head compact-page-head"><div><span className="portal-kicker">DATA UnM / PLAN</span><h2>Plan</h2><p>Monthly, Daily, Actual dan rekonsiliasi.</p></div><button type="button" onClick={()=>{if(!planWorkspaceRef.current?.goBack())setDataView('home')}}>← Kembali</button></div><PlanWorkspace ref={planWorkspaceRef} user={user}/></section>}
      {dataView==='master-paddock'&&<section><div className="portal-section-head"><div><span className="portal-kicker">DATA UnM</span><h2>Master Paddock</h2><p>Lihat data Firestore atau lakukan update dari Area Plant dan Area Harvest.</p></div><button type="button" onClick={()=>setDataView('home')}>← Kembali</button></div><MasterPaddockWorkspace user={user}/></section>}
      {dataView==='master-activity'&&<section><div className="portal-section-head"><div><span className="portal-kicker">DATA UnM</span><h2>Master Activity</h2><p>Activity, komposisi bahan per hektar, Master Material, dan status penggunaan di Plan.</p></div><button type="button" onClick={()=>setDataView('home')}>← Kembali</button></div><MasterActivityWorkspace user={user}/></section>}
      {dataView==='master-employees'&&canViewAccess(user,'data_master_employees')&&<section><div className="portal-section-head"><div><span className="portal-kicker">DATA UnM / KARYAWAN</span><h2>Master Karyawan</h2><p>Daftar dan import karyawan dari data sumber.</p></div><button type="button" onClick={()=>setDataView('home')}>← Kembali</button></div><MasterEmployeeWorkspace user={user}/></section>}
      {dataView==='unit-management'&&canViewAccess(user,'data_unit_dispatch')&&<section><div className="portal-section-head"><div><span className="portal-kicker">DATA UnM / UNIT</span><h2>Unit Management</h2><p>Penugasan unit, Maintenance dan Breakdown per Shift.</p></div><button type="button" onClick={()=>setDataView('home')}>← Kembali</button></div><UnitDispatchWorkspace user={user}/></section>}
      {dataView==='nozzle-calculator'&&<section><div className="portal-section-head"><div><span className="portal-kicker">DATA UnM / PERHITUNGAN</span><h2>Kalkulator Nozzle</h2><p>Perhitungan tractor spraying dari spesifikasi Excel yang tersimpan di Master Nozzle.</p></div><button type="button" onClick={()=>setDataView('home')}>← Kembali</button></div><NozzleCalculatorWorkspace/></section>}
      {dataView==='company'&&<section><div className="portal-section-head"><div><span className="portal-kicker">DATA UnM</span><h2>Company & Prefix</h2><p>Master klasifikasi perusahaan MSG berdasarkan prefix PID.</p></div><button type="button" onClick={()=>setDataView('home')}>← Kembali</button></div><CompanyMasterPanel user={user}/></section>}
    </div></main>
  </div>

  return <Layout className="portal-layer chooser-layer qc-antd-chooser">
    <Layout.Header className="qc-chooser-header">
      <div>
        <Typography.Text type="secondary">{GROUP_BRAND}</Typography.Text>
        <Typography.Title level={1}>Operational Portal</Typography.Title>
      </div>
      <div className="qc-chooser-account">
        <Typography.Text strong>{user.fullName}</Typography.Text>
        <Tag>{user.role.replaceAll('_',' ')}</Tag>
        {nativePortalEnabled&&<Button loading={logoutBusy} onClick={()=>void nativeLogout()}>Keluar</Button>}
      </div>
    </Layout.Header>
    <Layout.Content className="portal-content chooser-content">
      <Typography.Title level={2}>Pilih area kerja</Typography.Title>
      <nav className="portal-grid" aria-label="Area kerja">
        {canQc&&<PortalDestination title="Form QC" description="Input Spraying dan Fertilizer, Data QC, laporan, dan dashboard." onOpen={()=>choose('qc')} />}
        {canData&&<PortalDestination title="Data UnM" description="Plan, Master Paddock, Master Activity, Company, dan master operasional." onOpen={()=>choose('data-unm')} />}
        {canSummary&&<PortalDestination className="portal-summary-card" title="Summary" description="Monitoring target, Daily Plan, Actual Plan, dan progres per paddock dan activity." onOpen={()=>choose('summary')} />}
        {canCalendar&&<PortalDestination className="portal-calendar-card" title="Calendar Rekap" description="Pekerjaan per hari, minggu, atau bulan beserta realisasi dan selisihnya." onOpen={()=>choose('calendar')} />}
        {canUsers&&<PortalDestination title="Users & Access" description="Approval pengguna, role, serta izin lihat dan edit." onOpen={()=>choose('users')} />}
      </nav>
      {!canData&&<Alert className="qc-chooser-note" type="info" showIcon title="Akses Data UnM belum diberikan untuk akun ini. Owner dapat mengaturnya dari Users & Access." />}
    </Layout.Content>
  </Layout>
}

function PortalDestination({ title, description, onOpen, className }: {
  title: string
  description: string
  onOpen: () => void
  className?: string
}) {
  return <Card className={className}>
    <Typography.Title level={3}>{title}</Typography.Title>
    <Typography.Paragraph type="secondary">{description}</Typography.Paragraph>
    <Button onClick={onOpen}>Buka {title}</Button>
  </Card>
}
