import { useEffect, useState } from 'react'
import MasterPaddockImportPanelV2 from './MasterPaddockImportPanelV2'
import MasterPaddockListPanel from './MasterPaddockListPanel'
import type { User } from './types'
import { canEditAccess, canViewAccess } from './accessControl'

type Props={user:User}

type View='list'|'import'

export default function MasterPaddockWorkspace({user}:Props){
  const[view,setView]=useState<View>('import')
  const canList=canViewAccess(user,'data_master_paddock_list'),canImport=canViewAccess(user,'data_master_paddock_import'),editImport=canEditAccess(user,'data_master_paddock_import')
  useEffect(()=>{if(view==='list'&&!canList)setView(canImport?'import':'list');if(view==='import'&&!canImport)setView(canList?'list':'import')},[view,canList,canImport])
  return <section>
    <div className="segmented" aria-label="Menu Master Paddock">
      {canList&&<button type="button" className={view==='list'?'active':''} onClick={()=>setView('list')}>Daftar Paddock</button>}
      {canImport&&<button type="button" className={view==='import'?'active':''} onClick={()=>setView('import')}>Update / Import</button>}
    </div>
    {view==='list'?<MasterPaddockListPanel/>:(editImport?<MasterPaddockImportPanelV2 user={user}/>:<div className="panel"><div className="alert">Mode Hanya Lihat: Update / Import Master Paddock dinonaktifkan.</div></div>)} 
  </section>
}
