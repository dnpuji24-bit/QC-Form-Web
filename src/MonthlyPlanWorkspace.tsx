import { useState } from 'react'
import MonthlyPlanImportPanel from './MonthlyPlanImportPanel'
import MonthlyPlanListPanel from './MonthlyPlanListPanel'
import type { User } from './types'

type Props={user:User}
type View='list'|'import'

export default function MonthlyPlanWorkspace({user}:Props){
  const[view,setView]=useState<View>('list')
  return <section>
    <div className="segmented" aria-label="Menu Monthly Plan">
      <button type="button" className={view==='list'?'active':''} onClick={()=>setView('list')}>Daftar Plan</button>
      <button type="button" className={view==='import'?'active':''} onClick={()=>setView('import')}>Update / Import Excel</button>
    </div>
    {view==='list'?<MonthlyPlanListPanel/>:<MonthlyPlanImportPanel user={user}/>} 
  </section>
}
