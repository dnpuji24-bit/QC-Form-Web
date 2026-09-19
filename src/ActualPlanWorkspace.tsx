import { useState } from 'react'
import ActualPlanImportPanel from './ActualPlanImportPanel'
import ActualPlanListPanel from './ActualPlanListPanel'
import type { User } from './types'

type Props={user:User}
type View='list'|'import'

export default function ActualPlanWorkspace({user}:Props){
  const[view,setView]=useState<View>('list')
  return <section>
    <div className="segmented" aria-label="Menu Actual Plan">
      <button type="button" className={view==='list'?'active':''} onClick={()=>setView('list')}>Daftar Actual</button>
      <button type="button" className={view==='import'?'active':''} onClick={()=>setView('import')}>Update / Import Excel</button>
    </div>
    {view==='list'?<ActualPlanListPanel/>:<ActualPlanImportPanel user={user}/>}
  </section>
}
