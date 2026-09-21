import { useState } from 'react'
import MonthlyPlanWorkspace from './MonthlyPlanWorkspace'
import DailyPlanWorkspace from './DailyPlanWorkspace'
import ActualPlanWorkspace from './ActualPlanWorkspace'
import PlanReconciliationPanel from './PlanReconciliationPanel'
import type { User } from './types'

type Props={user:User}
type Tab='monthly'|'daily'|'actual'|'reconciliation'

export default function PlanWorkspace({user}:Props){
  const[tab,setTab]=useState<Tab>('monthly')
  return <section>
    <div className="segmented" aria-label="Menu Plan" style={{marginBottom:18}}>
      <button type="button" className={tab==='monthly'?'active':''} onClick={()=>setTab('monthly')}>Monthly Plan</button>
      <button type="button" className={tab==='daily'?'active':''} onClick={()=>setTab('daily')}>Daily Plan</button>
      <button type="button" className={tab==='actual'?'active':''} onClick={()=>setTab('actual')}>Actual Plan</button>
      <button type="button" className={tab==='reconciliation'?'active':''} onClick={()=>setTab('reconciliation')}>Rekonsiliasi</button>
    </div>
    {tab==='monthly'?<MonthlyPlanWorkspace user={user}/>:tab==='daily'?<DailyPlanWorkspace user={user}/>:tab==='actual'?<ActualPlanWorkspace user={user}/>:<PlanReconciliationPanel/>}
  </section>
}
