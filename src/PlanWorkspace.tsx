import { useEffect, useMemo, useState } from 'react'
import MonthlyPlanWorkspace from './MonthlyPlanWorkspace'
import DailyPlanWorkspace from './DailyPlanWorkspace'
import ActualPlanWorkspace from './ActualPlanWorkspace'
import PlanReconciliationPanel from './PlanReconciliationPanel'
import PlanSummaryDashboard from './PlanSummaryDashboard'
import PlanCalendarRecap from './PlanCalendarRecap'
import type { User } from './types'
import { canViewAccess } from './accessControl'

type Props={user:User}
type Tab='summary'|'calendar'|'monthly'|'daily'|'actual'|'reconciliation'

export default function PlanWorkspace({user}:Props){
  const[tab,setTab]=useState<Tab>('monthly'),[actualPrefill,setActualPrefill]=useState<string[]>([]),[dailyJump,setDailyJump]=useState<{date:string;monthlyPlanLineId:string;pid:string}|null>(null)
  const allowed=useMemo(()=>({
    summary:canViewAccess(user,'data_plan_summary'),
    calendar:canViewAccess(user,'data_plan_summary')||canViewAccess(user,'data_plan_daily')||canViewAccess(user,'data_plan_actual'),
    monthly:canViewAccess(user,'data_plan_monthly')||canViewAccess(user,'data_plan_monthly_import'),
    daily:canViewAccess(user,'data_plan_daily')||canViewAccess(user,'data_plan_daily_import'),
    actual:canViewAccess(user,'data_plan_actual')||canViewAccess(user,'data_plan_actual_import'),
    reconciliation:canViewAccess(user,'data_plan_reconciliation'),
  }),[user])
  useEffect(()=>{if(allowed[tab])return;const first=(['summary','calendar','monthly','daily','actual','reconciliation'] as Tab[]).find(key=>allowed[key]);if(first)setTab(first)},[tab,allowed])
  return <section className="plan-workspace-shell">
    <div className="segmented plan-primary-nav" aria-label="Menu Plan">
      {allowed.summary&&<button type="button" className={tab==='summary'?'active':''} onClick={()=>setTab('summary')}>Summary</button>}
      {allowed.calendar&&<button type="button" className={tab==='calendar'?'active':''} onClick={()=>setTab('calendar')}>Calendar Rekap</button>}
      {allowed.monthly&&<button type="button" className={tab==='monthly'?'active':''} onClick={()=>setTab('monthly')}>Monthly Plan</button>}
      {allowed.daily&&<button type="button" className={tab==='daily'?'active':''} onClick={()=>{setDailyJump(null);setTab('daily')}}>Daily Plan</button>}
      {allowed.actual&&<button type="button" className={tab==='actual'?'active':''} onClick={()=>setTab('actual')}>Actual Plan</button>}
      {allowed.reconciliation&&<button type="button" className={tab==='reconciliation'?'active':''} onClick={()=>setTab('reconciliation')}>Rekonsiliasi</button>}
    </div>
    <div key={tab} className="ui-view-transition plan-tab-transition">
      {tab==='summary'?<PlanSummaryDashboard/>:tab==='calendar'?<PlanCalendarRecap/>:tab==='monthly'?<MonthlyPlanWorkspace user={user} onOpenDailyPlan={request=>{setDailyJump(request);setTab('daily')}}/>:tab==='daily'?<DailyPlanWorkspace user={user} jumpRequest={dailyJump} onCopyToActual={ids=>{setActualPrefill(ids);setTab('actual')}}/>:tab==='actual'?<ActualPlanWorkspace user={user} prefillDailyPlanIds={actualPrefill}/>:<PlanReconciliationPanel/>}
    </div>
  </section>
}
