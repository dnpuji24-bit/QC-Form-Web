import { useState } from 'react'
import MonthlyPlanWorkspace from './MonthlyPlanWorkspace'
import DailyPlanWorkspace from './DailyPlanWorkspace'
import ActualPlanWorkspace from './ActualPlanWorkspace'
import PlanReconciliationPanel from './PlanReconciliationPanel'
import PlanSummaryDashboard from './PlanSummaryDashboard'
import type { User } from './types'

type Props={user:User}
type Tab='summary'|'monthly'|'daily'|'actual'|'reconciliation'

export default function PlanWorkspace({user}:Props){
  const[tab,setTab]=useState<Tab>('monthly'),[actualPrefill,setActualPrefill]=useState<string[]>([]),[dailyJump,setDailyJump]=useState<{date:string;monthlyPlanLineId:string;pid:string}|null>(null)
  return <section className="plan-workspace-shell">
    <div className="segmented plan-primary-nav" aria-label="Menu Plan">
      <button type="button" className={tab==='summary'?'active':''} onClick={()=>setTab('summary')}>Summary</button>
      <button type="button" className={tab==='monthly'?'active':''} onClick={()=>setTab('monthly')}>Monthly Plan</button>
      <button type="button" className={tab==='daily'?'active':''} onClick={()=>{setDailyJump(null);setTab('daily')}}>Daily Plan</button>
      <button type="button" className={tab==='actual'?'active':''} onClick={()=>setTab('actual')}>Actual Plan</button>
      <button type="button" className={tab==='reconciliation'?'active':''} onClick={()=>setTab('reconciliation')}>Rekonsiliasi</button>
    </div>
    {tab==='summary'?<PlanSummaryDashboard/>:tab==='monthly'?<MonthlyPlanWorkspace user={user} onOpenDailyPlan={request=>{setDailyJump(request);setTab('daily')}}/>:tab==='daily'?<DailyPlanWorkspace user={user} jumpRequest={dailyJump} onCopyToActual={ids=>{setActualPrefill(ids);setTab('actual')}}/>:tab==='actual'?<ActualPlanWorkspace user={user} prefillDailyPlanIds={actualPrefill}/>:<PlanReconciliationPanel/>}
  </section>
}
