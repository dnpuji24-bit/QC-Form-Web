import { useState } from 'react'
import ActualPlanImportPanel from './ActualPlanImportPanel'
import ActualPlanListPanel from './ActualPlanListPanel'
import ActualPlanWebEntryPanel from './ActualPlanWebEntryPanel'
import type { User } from './types'

type Props={user:User}
type View='list'|'web'|'import'

export default function ActualPlanWorkspace({user}:Props){
  const[view,setView]=useState<View>('list')
  return <section>
    <div className="segmented" aria-label="Menu Actual Plan">
      <button type="button" className={view==='list'?'active':''} onClick={()=>setView('list')}>Daftar Actual</button>
      <button type="button" className={view==='web'?'active':''} onClick={()=>setView('web')}>Input dari Daily Plan</button>
      <button type="button" className={view==='import'?'active':''} onClick={()=>setView('import')}>Update / Import Excel</button>
    </div>
    {view==='list'?<ActualPlanListPanel/>:view==='web'?<ActualPlanWebEntryPanel user={user}/>:<ActualPlanImportPanel user={user}/>}
  </section>
}
