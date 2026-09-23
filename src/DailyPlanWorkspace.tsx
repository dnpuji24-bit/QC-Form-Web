import { useState } from 'react'
import DailyPlanImportPanel from './DailyPlanImportPanel'
import DailyPlanListPanel from './DailyPlanListPanel'
import DailyPlanWebEntryPanel from './DailyPlanWebEntryPanel'
import type { User } from './types'

type Props={user:User;onCopyToActual?:(dailyPlanIds:string[])=>void}
type View='list'|'web'|'import'

export default function DailyPlanWorkspace({user,onCopyToActual}:Props){
  const[view,setView]=useState<View>('list')
  return <section className="plan-subworkspace">
    <div className="segmented plan-secondary-nav" aria-label="Menu Daily Plan">
      <button type="button" className={view==='list'?'active':''} onClick={()=>setView('list')}>Daftar Daily Plan</button>
      <button type="button" className={view==='web'?'active':''} onClick={()=>setView('web')}>Input Daily</button>
      <button type="button" className={view==='import'?'active':''} onClick={()=>setView('import')}>Update / Import Excel</button>
    </div>
    {view==='list'?<DailyPlanListPanel user={user} onCopyToActual={onCopyToActual}/>:view==='web'?<DailyPlanWebEntryPanel user={user}/>:<DailyPlanImportPanel user={user}/>}
  </section>
}
