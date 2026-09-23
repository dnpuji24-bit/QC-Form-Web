import { useEffect, useState } from 'react'
import ActualPlanImportPanel from './ActualPlanImportPanel'
import ActualPlanListPanel from './ActualPlanListPanel'
import ActualPlanWebEntryPanel from './ActualPlanWebEntryPanel'
import type { User } from './types'

type Props={user:User;prefillDailyPlanIds?:string[]}
type View='list'|'web'|'import'

export default function ActualPlanWorkspace({user,prefillDailyPlanIds=[]}:Props){
  const[view,setView]=useState<View>(prefillDailyPlanIds.length?'web':'list')
  useEffect(()=>{if(prefillDailyPlanIds.length)setView('web')},[prefillDailyPlanIds.join('|')])
  return <section className="plan-subworkspace">
    <div className="segmented plan-secondary-nav" aria-label="Menu Actual Plan">
      <button type="button" className={view==='list'?'active':''} onClick={()=>setView('list')}>Daftar Actual</button>
      <button type="button" className={view==='web'?'active':''} onClick={()=>setView('web')}>Input Actual</button>
      <button type="button" className={view==='import'?'active':''} onClick={()=>setView('import')}>Update / Import Excel</button>
    </div>
    {view==='list'?<ActualPlanListPanel user={user}/>:view==='web'?<ActualPlanWebEntryPanel user={user} prefillDailyPlanIds={prefillDailyPlanIds}/>:<ActualPlanImportPanel user={user}/>}
  </section>
}
