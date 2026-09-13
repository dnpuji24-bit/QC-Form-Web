import { useState } from 'react'
import MonthlyPlanWorkspace from './MonthlyPlanWorkspace'
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
    {tab==='monthly'?<MonthlyPlanWorkspace user={user}/>:<div className="portal-placeholder"><strong>Daily Plan — tahap berikutnya</strong><p>Daily Plan akan mengikuti pola yang sama: Excel sebagai sumber awal/import, lalu pembaruan berikutnya dapat dilakukan melalui Web. Daily Plan tetap dapat terhubung ke Monthly Plan Line melalui Plan ID dan mendukung ADHOC untuk pekerjaan di luar Monthly Plan.</p></div>}
  </section>
}
