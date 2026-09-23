import { useMemo, useState } from 'react'
import MonthlyPlanImportPanel from './MonthlyPlanImportPanel'
import MonthlyPlanListPanel from './MonthlyPlanListPanel'
import MonthlyPlanMasterSyncPanel from './MonthlyPlanMasterSyncPanel'
import MonthlyPlanWebEntryPanel from './MonthlyPlanWebEntryPanel'
import type { User } from './types'

type Props={user:User}
type View='plan'|'import'|'sync'
const monthNames=['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des']
function currentWeek(day:number){return day<=7?'W1':day<=15?'W2':day<=22?'W3':'W4'}

export default function MonthlyPlanWorkspace({user}:Props){
  const now=new Date()
  const[view,setView]=useState<View>('plan')
  const[year,setYear]=useState(now.getFullYear())
  const[monthNumber,setMonthNumber]=useState(now.getMonth()+1)
  const[week,setWeek]=useState(currentWeek(now.getDate()))
  const[refreshKey,setRefreshKey]=useState(0)
  const monthKey=useMemo(()=>year+'-'+String(monthNumber).padStart(2,'0'),[year,monthNumber])
  return <section className="plan-subworkspace">
    <div className="segmented plan-secondary-nav" aria-label="Menu Monthly Plan">
      <button type="button" className={view==='plan'?'active':''} onClick={()=>setView('plan')}>Plan per Periode</button>
      <button type="button" className={view==='import'?'active':''} onClick={()=>setView('import')}>Update / Import Excel</button>
      <button type="button" className={view==='sync'?'active':''} onClick={()=>setView('sync')}>Sinkron Master</button>
    </div>
    {view==='plan'?<div className="period-workspace">
      <section className="panel monthly-period-selector">
        <div><span className="eyebrow">PERIODE AKTIF</span><h3>Monthly Planning</h3></div>
        <label><span>Tahun</span><input type="number" min="2020" max="2100" value={year} onChange={e=>setYear(Number(e.target.value)||now.getFullYear())}/></label>
        <label><span>Bulan</span><select value={monthNumber} onChange={e=>setMonthNumber(Number(e.target.value))}>{monthNames.map((name,i)=><option key={name} value={i+1}>{String(i+1).padStart(2,'0')} · {name}</option>)}</select></label>
        <label><span>Week</span><select value={week} onChange={e=>setWeek(e.target.value)}>{['W1','W2','W3','W4'].map(x=><option key={x}>{x}</option>)}</select></label>
        <div className="monthly-period-badge"><span>Aktif</span><strong>{monthKey} · {week}</strong></div>
      </section>
      <MonthlyPlanWebEntryPanel user={user} selectedMonth={monthKey} selectedWeek={week} onSaved={()=>setRefreshKey(x=>x+1)}/>
      <MonthlyPlanListPanel user={user} selectedMonth={monthKey} selectedWeek={week} compact refreshKey={refreshKey}/>
    </div>:view==='import'?<MonthlyPlanImportPanel user={user}/>:<MonthlyPlanMasterSyncPanel user={user}/>}
  </section>
}
