import { useState } from 'react'
import MasterPaddockImportPanelV2 from './MasterPaddockImportPanelV2'
import MasterPaddockListPanel from './MasterPaddockListPanel'
import type { User } from './types'

type Props={user:User}

type View='list'|'import'

export default function MasterPaddockWorkspace({user}:Props){
  const[view,setView]=useState<View>('import')
  return <section>
    <div className="segmented" aria-label="Menu Master Paddock">
      <button type="button" className={view==='list'?'active':''} onClick={()=>setView('list')}>Daftar Paddock</button>
      <button type="button" className={view==='import'?'active':''} onClick={()=>setView('import')}>Update / Import</button>
    </div>
    {view==='list'?<MasterPaddockListPanel/>:<MasterPaddockImportPanelV2 user={user}/>} 
  </section>
}
