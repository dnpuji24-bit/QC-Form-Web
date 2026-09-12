import { useState } from 'react'
import MasterActivityImportPanel from './MasterActivityImportPanel'
import MasterActivityListPanel from './MasterActivityListPanel'
import type { User } from './types'

type Props={user:User}
type View='list'|'import'

export default function MasterActivityWorkspace({user}:Props){
  const[view,setView]=useState<View>('list')
  return <section>
    <div className="segmented" aria-label="Menu Master Activity">
      <button type="button" className={view==='list'?'active':''} onClick={()=>setView('list')}>Daftar Activity</button>
      <button type="button" className={view==='import'?'active':''} onClick={()=>setView('import')}>Update / Import</button>
    </div>
    {view==='list'?<MasterActivityListPanel/>:<MasterActivityImportPanel user={user}/>} 
  </section>
}
