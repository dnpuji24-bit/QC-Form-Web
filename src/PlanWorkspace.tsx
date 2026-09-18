import { useState } from 'react'
import MonthlyPlanWorkspace from './MonthlyPlanWorkspace'
import DailyPlanWorkspace from './DailyPlanWorkspace'
import type { User } from './types'

type Props={user:User}
type Tab='monthly'|'daily'

export default function PlanWorkspace({user}:Props){
  const[tab,setTab]=useState<Tab>('monthly')
  return <section>
    <div className="segmented" aria-label="Menu Plan" style={{marginBottom:18}}>
      <button type="button" className={tab==='monthly'?'active':''} onClick={()=>setTab('monthly')}>Monthly Plan</button>
      <button type="button" className={tab==='daily'?'active':''} onClick={()=>setTab('daily')}>Daily Plan</button>
    </div>
    {tab==='monthly'?<MonthlyPlanWorkspace user={user}/>:<DailyPlanWorkspace user={user}/>}
  </section>
}
