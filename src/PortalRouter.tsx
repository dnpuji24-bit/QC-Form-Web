import {signOut} from 'firebase/auth'
import { Alert, App as AntApp, Button, Card, Layout, Tag, Typography } from 'antd'
import {firebaseAuth} from './firebase'
import NativeUsersAccess from './NativeUsersAccess'
import {nativePortalEnabled} from './qcNativePortalConfig'
import { useContext, useEffect, useMemo, useRef, useState } from 'react'
import {NativeOfflineContext} from './nativeOfflineRuntime'
import {OFFLINE_PROFILE_KEY} from './qcOfflineLease.mjs'
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
import { canOpenDataUnm, canOpenQc, canViewAccess, type PermissionKey } from './accessControl'
import { hydrateUserAccess } from './userAccess'
import { GROUP_BRAND } from './groupConfig'
import type { User } from './types'
import './portal.css'
import './data-unm-menu.css'

type PortalMode='chooser'|'qc'|'data-unm'|'users'|'summary'|'calendar'
type DataView='home'|'plan'|'master-paddock'|'master-activity'|'company'|'nozzle-calculator'|'unit-management'|'master-employees'

type DataDestination = {
  view: Exclude<DataView, 'home'>
  title: string
  group: 'Operasional' | 'Master data'
  permissions: PermissionKey[]
  icon: string
}

const dataDestinations: DataDestination[] = [
  { view: 'plan', title: 'Plan', group: 'Operasional',
    permissions: ['data_plan_monthly', 'data_plan_monthly_import', 'data_plan_daily', 'data_plan_daily_import', 'data_plan_actual', 'data_plan_actual_import', 'data_plan_reconciliation'],
    icon: 'M7 3v4m10-4v4M3 10h18M5 5h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Zm2 9h3m4 0h3' },
  { view: 'unit-management', title: 'Unit Management', group: 'Operasional',
    permissions: ['data_unit_dispatch'],
    icon: 'M3 6h11v10H3zm11 4h4l3 4v2h-7M8 18a2 2 0 1 1-4 0 2 2 0 0 1 4 0Zm12 0a2 2 0 1 1-4 0 2 2 0 0 1 4 0Z' },
  { view: 'nozzle-calculator', title: 'Kalkulator Nozzle', group: 'Operasional',
    permissions: ['data_master_activity_resources'],
    icon: 'M6 3h12a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Zm2 5h8M8 12h2m4 0h2m-8 4h2m4 0h2' },
  { view: 'master-paddock', title: 'Master Paddock', group: 'Master data',
    permissions: ['data_master_paddock_list', 'data_master_paddock_import'],
    icon: 'm3 6 6-3 6 3 6-3v15l-6 3-6-3-6 3Zm6-3v15m6-12v15' },
  { view: 'master-activity', title: 'Master Activity', group: 'Master data',
    permissions: ['data_master_activity_list', 'data_master_activity_manage', 'data_master_activity_resources', 'data_master_activity_import'],
    icon: 'm3 7 2 2 3-4m3 2h10M3 15l2 2 3-4m3 2h10' },
  { view: 'master-employees', title: 'Master Karyawan', group: 'Master data',
    permissions: ['data_master_employees'],
    icon: 'M13 7a3 3 0 1 1-6 0 3 3 0 0 1 6 0ZM3 20v-2a6 6 0 0 1 12 0v2m1-16a3 3 0 0 1 0 6m2 4a5 5 0 0 1 3 5' },
  { view: 'company', title: 'Company & Prefix', group: 'Master data',
    permissions: ['data_company'],
    icon: 'M4 21V3h11v18m0-12h5v12M2 21h20M7 7h1m3 0h1m-5 4h1m3 0h1m-5 4h1m3 0h1' },
]

const MODE_KEY='unm_portal_mode'
const TOKEN_KEY='qc_token'
const USER_KEY='qc_user'

function readStored(key:string){return sessionStorage.getItem(key)||localStorage.getItem(key)||''}
function readUser():User|null{try{return JSON.parse(readStored(USER_KEY)||'null') as User|null}catch{return null}}
function hasSession(){return Boolean(readStored(TOKEN_KEY)&&readUser())}
function dataUnmAllowed(user:User|null){return Boolean(user&&canOpenDataUnm(user))}
function qcAllowed(user:User|null){return Boolean(user&&canOpenQc(user))}

export default function PortalRouter({onOpenQc}:{onOpenQc:()=>void}){
  const[loggedIn,setLoggedIn]=useState(()=>hasSession())
  const[user,setUser]=useState<User|null>(()=>readUser())
  const[mode,setMode]=useState<PortalMode>(()=>hasSession()?((sessionStorage.getItem(MODE_KEY) as PortalMode)||'chooser'):'chooser')
  const[dataView,setDataView]=useState<DataView>('home')
  const lastDataMenu = useRef<DataView | null>(null)
  useEffect(() => {
    if (mode !== 'data-unm' || !lastDataMenu.current) return
    if (dataView === 'home') {
      document.getElementById('menu-' + lastDataMenu.current)?.focus()
      lastDataMenu.current = null
    } else {
      document.getElementById('data-workspace-heading')?.focus()
    }
  }, [mode, dataView])
  const[logoutBusy,setLogoutBusy]=useState(false)
  const { notification } = AntApp.useApp()
  async function nativeLogout(){
    if(logoutBusy||!firebaseAuth)return
    if(!window.confirm('Keluar dari akun ini? Antrean lokal yang sudah tersimpan tetap dipertahankan.'))return
    setLogoutBusy(true)
    notification.destroy('portal-logout')
    try {
      await signOut(firebaseAuth)
      try{localStorage.removeItem(OFFLINE_PROFILE_KEY)}catch{}
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
  const offlineMode=useContext(NativeOfflineContext)
  const canUsers=user?.role==='owner'&&!offlineMode
  const canSummary=Boolean(user&&canViewAccess(user,'data_plan_summary'))
  const canCalendar=Boolean(user&&(canSummary||canViewAccess(user,'data_plan_daily')||canViewAccess(user,'data_plan_actual')))
  useEffect(()=>{if(loggedIn&&mode==='qc'&&canQc)onOpenQc()},[loggedIn,mode,canQc,onOpenQc])
  if(!loggedIn||!user)return null

  function choose(next:PortalMode){
    if(next==='data-unm'&&!canData)return
    if(next==='qc'&&!canQc)return
    if(next==='users'&&!canUsers)return
    if(next==='summary'&&!canSummary)return
    if(next==='calendar'&&!canCalendar)return
    sessionStorage.setItem(MODE_KEY,next)
    setMode(next)
    if(next!=='data-unm'){lastDataMenu.current=null;setDataView('home')}
  }

  if(mode==='qc'&&canQc)return <button className="portal-return-button" type="button" onClick={()=>choose('chooser')} aria-label="Kembali ke menu utama">☰ Menu Utama</button>

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

  if(mode==='data-unm'&&canData){
    const destinations = dataDestinations.filter(item =>
      item.permissions.some(key => canViewAccess(user, key)))
    const selected = destinations.find(item => item.view === dataView)
    return <div className="portal-layer data-unm-layer">
      <header className="portal-topbar">
        <h1>Data UnM</h1>
        <div className="portal-user">
          <div><strong>{user.fullName}</strong><span>{user.role.replaceAll('_',' ')}</span></div>
          <Button onClick={()=>choose('chooser')}>Menu Utama</Button>
        </div>
      </header>
      <main className="portal-content"><div key={dataView} className="ui-view-transition portal-view-transition">
        {selected ? <section className="portal-workspace-view">
          <div className="portal-section-head compact-page-head">
            <Typography.Title id="data-workspace-heading" tabIndex={-1} level={2}>{selected.title}</Typography.Title>
            <Button onClick={()=>{
              if(dataView==='plan'&&planWorkspaceRef.current?.goBack())return
              setDataView('home')
            }}>← Kembali</Button>
          </div>
          {dataView==='plan'&&<PlanWorkspace ref={planWorkspaceRef} user={user}/>}
          {dataView==='master-paddock'&&<MasterPaddockWorkspace user={user}/>}
          {dataView==='master-activity'&&<MasterActivityWorkspace user={user}/>}
          {dataView==='master-employees'&&<MasterEmployeeWorkspace user={user}/>}
          {dataView==='unit-management'&&<UnitDispatchWorkspace user={user}/>}
          {dataView==='nozzle-calculator'&&<NozzleCalculatorWorkspace/>}
          {dataView==='company'&&<CompanyMasterPanel user={user}/>}
        </section> : <nav className="data-unm-menu" aria-label="Menu Data UnM">
          {(['Operasional', 'Master data'] as const).map(group => {
            const items = destinations.filter(item => item.group === group)
            if (!items.length) return null
            return <section key={group} className="data-unm-menu-group">
              <h2>{group}</h2>
              <ul>
                {items.map(item => <li key={item.view}>
                  <button type="button" className="data-unm-menu-item" id={'menu-' + item.view}
                    aria-label={'Buka ' + item.title} onClick={() => {
                      lastDataMenu.current = item.view
                      setDataView(item.view)
                    }}>
                    <span className="data-unm-menu-icon">
                      <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d={item.icon}/>
                      </svg>
                    </span>
                    <span>{item.title}</span>
                    <svg className="data-unm-menu-arrow" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="m9 6 6 6-6 6"/>
                    </svg>
                  </button>
                </li>)}
              </ul>
            </section>
          })}
          {!destinations.length&&<p>Belum ada menu operasional untuk akun ini.</p>}
        </nav>}
      </div></main>
    </div>
  }

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
