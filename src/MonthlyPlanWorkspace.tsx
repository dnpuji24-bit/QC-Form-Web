import { useState } from 'react'
import MonthlyPlanImportPanel from './MonthlyPlanImportPanel'
import MonthlyPlanListPanel from './MonthlyPlanListPanel'
import MonthlyPlanMasterSyncPanel from './MonthlyPlanMasterSyncPanel'
import MonthlyPlanWebEntryPanel from './MonthlyPlanWebEntryPanel'
import type { User } from './types'

type Props={user:User}
type View='list'|'web'|'import'|'sync'

export default function MonthlyPlanWorkspace({user}:Props){
  const[view,setView]=useState<View>('list')
  return <section>
    <div className="segmented" aria-label="Menu Monthly Plan">
      <button type="button" className={view==='list'?'active':''} onClick={()=>setView('list')}>Daftar Plan</button>
      <button type="button" className={view==='web'?'active':''} onClick={()=>setView('web')}>Input Monthly</button>
      <button type="button" className={view==='import'?'active':''} onClick={()=>setView('import')}>Update / Import Excel</button>
      <button type="button" className={view==='sync'?'active':''} onClick={()=>setView('sync')}>Sinkron Master Paddock</button>
    </div>
    {view==='list'?<MonthlyPlanListPanel user={user}/>:view==='web'?<MonthlyPlanWebEntryPanel user={user}/>:view==='import'?<MonthlyPlanImportPanel user={user}/>:<MonthlyPlanMasterSyncPanel user={user}/>}
  </section>
}
