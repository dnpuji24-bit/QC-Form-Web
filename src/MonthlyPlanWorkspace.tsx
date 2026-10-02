import { useEffect, useMemo, useState } from 'react'
import MonthlyPlanImportPanel from './MonthlyPlanImportPanel'
import MonthlyPlanListPanel from './MonthlyPlanListPanel'
import MonthlyPlanMasterSyncPanel from './MonthlyPlanMasterSyncPanel'
import MonthlyPlanWebEntryPanel from './MonthlyPlanWebEntryPanel'
import type { User } from './types'
import { canEditAccess, canViewAccess } from './accessControl'

type Props={user:User;onOpenDailyPlan?:(request:{date:string;monthlyPlanLineId:string;pid:string})=>void;onOpenActualSource?:(request:{monthlyPlanLineId:string;actualReportIds:string[];label:string})=>void}
type View='plan'|'import'|'sync'
const monthNames=['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des']
function currentWeek(day:number){return day<=7?'W1':day<=15?'W2':day<=22?'W3':'W4'}

export default function MonthlyPlanWorkspace({user,onOpenDailyPlan,onOpenActualSource}:Props){
  const now=new Date()
  const[view,setView]=useState<View>('plan')
  const[year,setYear]=useState(now.getFullYear())
  const[monthNumber,setMonthNumber]=useState(now.getMonth()+1)
  const[week,setWeek]=useState(currentWeek(now.getDate()))
  const[refreshKey,setRefreshKey]=useState(0)
  const monthKey=useMemo(()=>year+'-'+String(monthNumber).padStart(2,'0'),[year,monthNumber])
  const canPlan=canViewAccess(user,'data_plan_monthly'),editPlan=canEditAccess(user,'data_plan_monthly'),canImport=canViewAccess(user,'data_plan_monthly_import'),editImport=canEditAccess(user,'data_plan_monthly_import')
  useEffect(()=>{if(view==='plan'&&!canPlan)setView(canImport?'import':'plan');if((view==='import'||view==='sync')&&!canImport)setView(canPlan?'plan':'import')},[view,canPlan,canImport])
  return <section className="plan-subworkspace">
    <div className="segmented plan-secondary-nav" aria-label="Menu Monthly Plan">
      {canPlan&&<button type="button" className={view==='plan'?'active':''} onClick={()=>setView('plan')}>Plan per Periode</button>}
      {canImport&&<button type="button" className={view==='import'?'active':''} onClick={()=>setView('import')}>Update / Import Excel</button>}
      {canImport&&<button type="button" className={view==='sync'?'active':''} onClick={()=>setView('sync')}>Sinkron Master</button>}
    </div>
    {view==='plan'?<div className="period-workspace">
      <section className="panel monthly-period-selector premium-period-selector">
        <div><span className="eyebrow">PERIODE AKTIF</span><h3>Monthly Planning</h3></div>
        <label><span>Tahun</span><input type="number" min="2020" max="2100" value={year} onChange={e=>setYear(Number(e.target.value)||now.getFullYear())}/></label>
        <label><span>Bulan</span><select value={monthNumber} onChange={e=>setMonthNumber(Number(e.target.value))}>{monthNames.map((name,i)=><option key={name} value={i+1}>{String(i+1).padStart(2,'0')} · {name}</option>)}</select></label>
        <label><span>Week</span><select value={week} onChange={e=>setWeek(e.target.value)}><option value="ALL">Semua Week</option>{['W1','W2','W3','W4'].map(x=><option key={x}>{x}</option>)}</select></label>
        <div className="monthly-period-badge"><span>Aktif</span><strong>{monthKey} · {week==='ALL'?'Semua Week':week}</strong></div>
      </section>
      {editPlan&&week!=='ALL'&&<MonthlyPlanWebEntryPanel user={user} selectedMonth={monthKey} selectedWeek={week} onSaved={()=>setRefreshKey(x=>x+1)}/>}
      {editPlan&&week==='ALL'&&<div className="panel monthly-all-week-note"><strong>Mode Semua Week</strong><span>Daftar dan ringkasan menampilkan W1–W4 sekaligus. Pilih W1, W2, W3, atau W4 untuk menambah Monthly Plan baru.</span></div>}
      {!editPlan&&<div className="alert">Mode Hanya Lihat: input, edit, update, cancel, dan hapus Monthly Plan dinonaktifkan.</div>}
      <MonthlyPlanListPanel user={user} selectedMonth={monthKey} selectedWeek={week} compact refreshKey={refreshKey} onOpenDailyPlan={onOpenDailyPlan} onOpenActualSource={onOpenActualSource}/>
    </div>:view==='import'?(editImport?<MonthlyPlanImportPanel user={user}/>:<div className="panel"><div className="alert">Mode Hanya Lihat: Update / Import Excel dinonaktifkan.</div></div>):(editImport?<MonthlyPlanMasterSyncPanel user={user}/>:<div className="panel"><div className="alert">Mode Hanya Lihat: Sinkron Master dinonaktifkan.</div></div>)}
  </section>
}
