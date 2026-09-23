import { useEffect, useState } from 'react'
import ActualPlanImportPanel from './ActualPlanImportPanel'
import ActualPlanListPanel from './ActualPlanListPanel'
import ActualPlanWebEntryPanel from './ActualPlanWebEntryPanel'
import type { User } from './types'

type Props={user:User;prefillDailyPlanIds?:string[]}
type View='plan'|'import'

export default function ActualPlanWorkspace({user,prefillDailyPlanIds=[]}:Props){
  const[view,setView]=useState<View>('plan')
  const[selectedDate,setSelectedDate]=useState(new Date().toISOString().slice(0,10))
  const[refreshKey,setRefreshKey]=useState(0)
  useEffect(()=>{if(prefillDailyPlanIds.length)setView('plan')},[prefillDailyPlanIds.join('|')])
  return <section className="plan-subworkspace">
    <div className="segmented plan-secondary-nav" aria-label="Menu Actual Plan">
      <button type="button" className={view==='plan'?'active':''} onClick={()=>setView('plan')}>Actual per Tanggal</button>
      <button type="button" className={view==='import'?'active':''} onClick={()=>setView('import')}>Update / Import Excel</button>
    </div>
    {view==='plan'?<div className="period-workspace">
      <ActualPlanWebEntryPanel user={user} prefillDailyPlanIds={prefillDailyPlanIds} selectedDate={selectedDate} onDateChange={setSelectedDate} onSaved={()=>setRefreshKey(x=>x+1)}/>
      <ActualPlanListPanel user={user} selectedDate={selectedDate} compact refreshKey={refreshKey}/>
    </div>:<ActualPlanImportPanel user={user}/>}
  </section>
}
