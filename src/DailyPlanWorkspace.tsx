import { useState } from 'react'
import DailyPlanImportPanel from './DailyPlanImportPanel'
import DailyPlanListPanel from './DailyPlanListPanel'
import type { User } from './types'

type Props={user:User}
type View='list'|'import'

export default function DailyPlanWorkspace({user}:Props){
  const[view,setView]=useState<View>('list')
  return <section>
    <div className="segmented" aria-label="Menu Daily Plan">
      <button type="button" className={view==='list'?'active':''} onClick={()=>setView('list')}>Daftar Daily Plan</button>
      <button type="button" className={view==='import'?'active':''} onClick={()=>setView('import')}>Update / Import Excel</button>
    </div>
    {view==='list'?<DailyPlanListPanel/>:<DailyPlanImportPanel user={user}/>}
  </section>
}
