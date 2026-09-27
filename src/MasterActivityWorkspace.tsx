import { useState } from 'react'
import MasterActivityImportPanel from './MasterActivityImportPanel'
import MasterActivityListPanel from './MasterActivityListPanel'
import MasterActivityManagePanel from './MasterActivityManagePanel'
import MasterOperationalResourcePanel from './MasterOperationalResourcePanel'
import type { User } from './types'

type Props={user:User}
type View='list'|'manage'|'resource'|'import'

export default function MasterActivityWorkspace({user}:Props){
  const[view,setView]=useState<View>('list')
  return <section>
    <div className="segmented" aria-label="Menu Master Activity">
      <button type="button" className={view==='list'?'active':''} onClick={()=>setView('list')}>Daftar Activity</button>
      <button type="button" className={view==='manage'?'active':''} onClick={()=>setView('manage')}>Kelola Master</button>
      <button type="button" className={view==='resource'?'active':''} onClick={()=>setView('resource')}>Master Resource</button>
      <button type="button" className={view==='import'?'active':''} onClick={()=>setView('import')}>Update / Import</button>
    </div>
    {view==='list'?<MasterActivityListPanel/>:view==='manage'?<MasterActivityManagePanel user={user}/>:view==='resource'?<MasterOperationalResourcePanel user={user}/>:<MasterActivityImportPanel user={user} onOpenManage={()=>setView('manage')}/>} 
  </section>
}
