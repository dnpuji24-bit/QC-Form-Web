import { Button, Card, Input, Segmented } from 'antd'
import { useMemo, useState } from 'react'
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
  const[requestedView,setView]=useState<View>('plan')
  const[editorOpen,setEditorOpen]=useState(false)
  const[year,setYear]=useState(now.getFullYear())
  const[monthNumber,setMonthNumber]=useState(now.getMonth()+1)
  const[week,setWeek]=useState(currentWeek(now.getDate()))
  const[refreshKey,setRefreshKey]=useState(0)
  const monthKey=useMemo(()=>year+'-'+String(monthNumber).padStart(2,'0'),[year,monthNumber])
  const canPlan=canViewAccess(user,'data_plan_monthly'),editPlan=canEditAccess(user,'data_plan_monthly'),canImport=canViewAccess(user,'data_plan_monthly_import'),editImport=canEditAccess(user,'data_plan_monthly_import')
  if (!canPlan && !canImport) return null
  const view = requestedView === 'plan' && !canPlan ? 'import' : !canImport ? 'plan' : requestedView
  return <section className="plan-subworkspace">
    <Segmented<View> size="small" className="plan-antd-nav" aria-label="Menu Monthly Plan" value={view}
      options={[
        ...(canPlan ? [{value: 'plan' as const, label: 'Plan per Periode'}] : []),
        ...(canImport ? [{value: 'import' as const, label: 'Update / Import Excel'}] : []),
        ...(canImport ? [{value: 'sync' as const, label: 'Sinkron Master'}] : []),
      ]} onChange={setView} />
    {view==='plan'?<div className="period-workspace">
      <Card size="small" className="plan-period-card">
        <div className="plan-period-controls">
        <label><span>Tahun</span><Input type="number" min="2020" max="2100" value={year} onChange={e=>setYear(Number(e.target.value)||now.getFullYear())}/></label>
        <label><span>Bulan</span><select aria-label="Bulan" value={monthNumber} onChange={e=>setMonthNumber(Number(e.target.value))}>{monthNames.map((name,i)=><option key={name} value={i+1}>{String(i+1).padStart(2,'0')} · {name}</option>)}</select></label>
        <label><span>Week</span><select aria-label="Week" value={week} onChange={e=>setWeek(e.target.value)}><option value="ALL">Semua Week</option>{['W1','W2','W3','W4'].map(x=><option key={x}>{x}</option>)}</select></label>
        </div>
      </Card>
      {editPlan&&week!=='ALL'&&<div className="plan-editor">
        <Button type={editorOpen?'default':'primary'} aria-expanded={editorOpen} aria-controls="monthly-plan-editor"
          onClick={()=>setEditorOpen(open=>!open)}>{editorOpen?'Tutup Form':'Tambah Monthly Plan'}</Button>
        <div id="monthly-plan-editor" hidden={!editorOpen}>
          <MonthlyPlanWebEntryPanel user={user} selectedMonth={monthKey} selectedWeek={week} onSaved={()=>setRefreshKey(x=>x+1)}/>
        </div>
      </div>}
      {editPlan&&week==='ALL'&&<div className="monthly-all-week-note">Pilih satu week untuk menambah Monthly Plan.</div>}
      {!editPlan&&<div className="alert">Mode Hanya Lihat: input, edit, update, cancel, dan hapus Monthly Plan dinonaktifkan.</div>}
      <MonthlyPlanListPanel user={user} selectedMonth={monthKey} selectedWeek={week} compact refreshKey={refreshKey} onOpenDailyPlan={onOpenDailyPlan} onOpenActualSource={onOpenActualSource}/>
    </div>:view==='import'?(editImport?<MonthlyPlanImportPanel user={user}/>:<div className="panel"><div className="alert">Mode Hanya Lihat: Update / Import Excel dinonaktifkan.</div></div>):(editImport?<MonthlyPlanMasterSyncPanel user={user}/>:<div className="panel"><div className="alert">Mode Hanya Lihat: Sinkron Master dinonaktifkan.</div></div>)}
  </section>
}
