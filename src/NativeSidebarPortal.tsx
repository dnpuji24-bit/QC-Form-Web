import {useContext,useEffect,useState} from 'react'
import {Button,Layout,Tag,Typography,Alert} from 'antd'
import {signOut} from 'firebase/auth'
import {firebaseAuth} from './firebase'
import {NativeOfflineContext} from './nativeOfflineRuntime'
import {OFFLINE_PROFILE_KEY} from './qcOfflineLease.mjs'
import {canViewAccess,type PermissionKey} from './accessControl'
import type {User} from './types'
import App,{type QcWorkspaceView} from './App'
import PlanWorkspace,{type PlanTab} from './PlanWorkspace'
import PlanSummaryDashboard from './PlanSummaryDashboard'
import PlanCalendarRecap from './PlanCalendarRecap'
import PlanOfflineBanner from './PlanOfflineBanner'
import NativeUsersAccess from './NativeUsersAccess'
import CompanyMasterPanel from './CompanyMasterPanel'
import MasterActivityWorkspace from './MasterActivityWorkspace'
import UnitDispatchWorkspace from './UnitDispatchWorkspace'
import MasterEmployeeWorkspace from './MasterEmployeeWorkspace'
import NozzleCalculatorWorkspace from './NozzleCalculatorWorkspace'
import MasterPaddockWorkspace from './MasterPaddockWorkspace'
import BkmWorkspace from './BkmWorkspace'
import './native-sidebar.css'

type Destination={id:string;label:string;keys:PermissionKey[]}
const qc:Destination[]=[
 {id:'qc/dashboard',label:'Dashboard QC',keys:['qc_dashboard']},
 {id:'qc/spray',label:'Input Spraying',keys:['qc_spraying']},
 {id:'qc/fertilizer',label:'Input Fertilizer',keys:['qc_fertilizer']},
 {id:'qc/records',label:'Data QC',keys:['qc_records']},
 {id:'qc/logs',label:'Activity Logs',keys:['qc_logs']},
 {id:'qc/settings',label:'Pengaturan',keys:['qc_settings']},
]
const plan:Destination[]=[
 {id:'plan/monthly',label:'Monthly Plan',keys:['data_plan_monthly','data_plan_monthly_import']},
 {id:'plan/daily',label:'Daily Plan',keys:['data_plan_daily','data_plan_daily_import']},
 {id:'plan/actual',label:'Actual Plan',keys:['data_plan_actual','data_plan_actual_import']},
 {id:'plan/bkm',label:'Rekap BKM',keys:['data_plan_actual']},
 {id:'plan/reconciliation',label:'Rekonsiliasi',keys:['data_plan_reconciliation']},
]
const master:Destination[]=[
 {id:'paddock',label:'Master Paddock',keys:['data_master_paddock_list','data_master_paddock_import']},
 {id:'activity',label:'Master Activity',keys:['data_master_activity_list','data_master_activity_manage','data_master_activity_resources','data_master_activity_import']},
 {id:'employees',label:'Master Karyawan',keys:['data_master_employees']},
 {id:'company',label:'Company & Prefix',keys:['data_company']},
]
const operations:Destination[]=[
 {id:'units',label:'Unit Management',keys:['data_unit_dispatch']},
 {id:'nozzle',label:'Kalkulator Nozzle',keys:['data_master_activity_resources']},
]
const reporting:Destination[]=[
 {id:'summary',label:'Summary',keys:['data_plan_summary']},
 {id:'calendar',label:'Calendar Rekap',keys:['data_plan_summary','data_plan_daily','data_plan_actual']},
]
function readUser():User|null{
 try{return JSON.parse(sessionStorage.getItem('qc_user')||localStorage.getItem('qc_user')||'null')}catch{return null}
}
export default function NativeSidebarPortal(){
 const [user]=useState(readUser)
 const [selected,setSelected]=useState('home')
 const [opened,setOpened]=useState<string[]>(['data','plan'])
 const [collapsed,setCollapsed]=useState(()=>window.innerWidth<800)
 const [qcOpened,setQcOpened]=useState(false)
 const [qcView,setQcView]=useState<QcWorkspaceView>('dashboard')
 const [planOpened,setPlanOpened]=useState(false)
 const [planView,setPlanView]=useState<PlanTab>('monthly')
 const [logoutBusy,setLogoutBusy]=useState(false)
 const [error,setError]=useState('')
 const offline=useContext(NativeOfflineContext)
 const allowed=(item:Destination)=>!!user&&item.keys.some(key=>canViewAccess(user,key))
 const destinations=[...qc,...plan,...master,...operations,...reporting].filter(allowed)
 const canUsers=user?.role==='owner'&&!offline
 const current=selected==='home'||selected==='users'&&canUsers||destinations.some(x=>x.id===selected)?selected:'home'
 const qcActive=current.startsWith('qc/')
 const planActive=current.startsWith('plan/')&&current!=='plan/bkm'
 useEffect(()=>{if(current!==selected)setSelected(current)},[current,selected])
 if(!user)return null
 const toggle=(id:string)=>setOpened(old=>old.includes(id)?old.filter(x=>x!==id):[...old,id])
 function navigate(id:string){
  if(id!=='home'&&!(id==='users'&&canUsers)&&!destinations.some(x=>x.id===id))return
  if(id.startsWith('qc/')){setQcView(id.slice(3) as QcWorkspaceView);setQcOpened(true)}
  if(id.startsWith('plan/')&&id!=='plan/bkm'){setPlanView(id.slice(5) as PlanTab);setPlanOpened(true)}
  setSelected(id)
  if(window.innerWidth<800)setCollapsed(true)
 }
 async function logout(){
  if(logoutBusy||!firebaseAuth||!window.confirm('Keluar? Antrean lokal yang sudah tersimpan tetap dipertahankan.'))return
  setLogoutBusy(true);setError('')
  try{await signOut(firebaseAuth);try{localStorage.removeItem(OFFLINE_PROFILE_KEY)}catch{}}
  catch{setError('Keluar belum berhasil. Coba kembali.')}
  finally{setLogoutBusy(false)}
 }
 const item=(d:Destination)=><button key={d.id} type="button" className={'qc-side-item'+(current===d.id?' active':'')} aria-current={current===d.id?'page':undefined} onClick={()=>navigate(d.id)}>{d.label}</button>
 const group=(id:string,label:string,items:Destination[])=>{
  const visible=items.filter(allowed)
  if(!visible.length)return null
  return <div className="qc-side-group"><button type="button" className="qc-side-group-title" aria-expanded={opened.includes(id)} onClick={()=>toggle(id)}><span>{label}</span><span aria-hidden>{opened.includes(id)?'▾':'▸'}</span></button>{opened.includes(id)&&<div className="qc-side-children">{visible.map(item)}</div>}</div>
 }
 const hasData=[...plan,...master,...operations].some(allowed)
 const title=current==='home'?'Operational Portal':current==='users'?'Users & Access':destinations.find(d=>d.id===current)?.label||'Operational Portal'
 return <Layout className={'qc-sidebar-shell'+(collapsed?' sidebar-hidden':'')}>
  <aside className="qc-sidebar" aria-label="Menu utama">
   <div className="qc-sidebar-brand"><strong>MSG</strong><small>Operational Portal</small></div>
   <nav>
    <button type="button" className={'qc-side-item'+(current==='home'?' active':'')} onClick={()=>navigate('home')}>Beranda</button>
    {group('qc','Form QC',qc)}
    {hasData&&<div className="qc-side-group"><button type="button" className="qc-side-group-title" aria-expanded={opened.includes('data')} onClick={()=>toggle('data')}><span>Data UnM</span><span aria-hidden>{opened.includes('data')?'▾':'▸'}</span></button>{opened.includes('data')&&<div className="qc-side-children">{group('plan','Plan',plan)}{group('master','Master Data',master)}{operations.filter(allowed).map(item)}</div>}</div>}
    {group('report','Laporan',reporting)}
    {canUsers&&<button type="button" className={'qc-side-item'+(current==='users'?' active':'')} onClick={()=>navigate('users')}>Users &amp; Access</button>}
   </nav>
  </aside>
  <div className="qc-sidebar-main">
   <header className="qc-sidebar-header"><Button onClick={()=>setCollapsed(v=>!v)} aria-expanded={!collapsed} aria-label={collapsed?'Tampilkan sidebar':'Sembunyikan sidebar'}>☰</Button><Typography.Title level={2} style={{margin:0,flex:1}}>{title}</Typography.Title>{offline&&<Tag color="orange">Offline</Tag>}<span className="qc-sidebar-account">{user.fullName} · {user.role}</span><Button loading={logoutBusy} onClick={()=>void logout()}>Keluar</Button></header>
   <main className="qc-sidebar-content">
    {error&&<Alert type="error" title={error}/>}
    {current==='home'&&<div className="qc-sidebar-home"><Typography.Title level={3}>Pilih area kerja</Typography.Title><Typography.Paragraph>Gunakan menu di sebelah kiri untuk membuka modul. Klik nama grup untuk menampilkan atau menyembunyikan submenu.</Typography.Paragraph><div className="qc-sidebar-shortcuts">
     {qc.some(allowed)&&<Button onClick={()=>{setOpened(v=>[...new Set([...v,'qc'])]);navigate(qc.find(allowed)!.id)}}>Buka Form QC</Button>}
     {hasData&&<Button onClick={()=>{setOpened(v=>[...new Set([...v,'data','plan'])]);navigate([...plan,...operations,...master].find(allowed)!.id)}}>Buka Data UnM</Button>}
     {reporting.filter(allowed).map(d=><Button key={d.id} onClick={()=>navigate(d.id)}>Buka {d.label}</Button>)}
     {canUsers&&<Button onClick={()=>navigate('users')}>Buka Users &amp; Access</Button>}
    </div></div>}
    {qcOpened&&<div hidden={!qcActive}><App embedded requestedView={qcView} onViewChange={v=>{setQcView(v);if(qcActive&&destinations.some(d=>d.id==='qc/'+v))setSelected('qc/'+v)}}/></div>}
    {planOpened&&<div hidden={!planActive}><PlanWorkspace embedded requestedTab={planView} user={user} onTabChange={v=>{setPlanView(v);if(planActive&&destinations.some(d=>d.id==='plan/'+v))setSelected('plan/'+v)}}/></div>}
    {current==='plan/bkm'&&<BkmWorkspace user={user}/>}
    {current==='paddock'&&<MasterPaddockWorkspace user={user}/>}
    {current==='activity'&&<MasterActivityWorkspace user={user}/>}
    {current==='employees'&&<MasterEmployeeWorkspace user={user}/>}
    {current==='company'&&<CompanyMasterPanel user={user}/>}
    {current==='units'&&<UnitDispatchWorkspace user={user}/>}
    {current==='nozzle'&&<NozzleCalculatorWorkspace/>}
    {current==='summary'&&<><PlanOfflineBanner/><PlanSummaryDashboard/></>}
    {current==='calendar'&&<><PlanOfflineBanner/><PlanCalendarRecap/></>}
    {current==='users'&&canUsers&&<NativeUsersAccess/>}
   </main>
  </div>
 </Layout>
}
