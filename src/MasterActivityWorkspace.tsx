import { useEffect, useMemo, useState } from 'react'
import MasterActivityImportPanel from './MasterActivityImportPanel'
import MasterActivityListPanel from './MasterActivityListPanel'
import MasterActivityManagePanel from './MasterActivityManagePanel'
import MasterOperationalResourcePanel from './MasterOperationalResourcePanel'
import type { User } from './types'
import { canEditAccess, canViewAccess } from './accessControl'

type Props={user:User}
type View='list'|'manage'|'resource'|'import'

export default function MasterActivityWorkspace({user}:Props){
  const[view,setView]=useState<View>('list')
  const allowed=useMemo(()=>({
    list:canViewAccess(user,'data_master_activity_list'),
    manage:canViewAccess(user,'data_master_activity_manage'),
    resource:canViewAccess(user,'data_master_activity_resources'),
    import:canViewAccess(user,'data_master_activity_import'),
  }),[user])
  useEffect(()=>{if(allowed[view])return;const first=(['list','manage','resource','import'] as View[]).find(key=>allowed[key]);if(first)setView(first)},[view,allowed])
  return <section className="master-activity-workspace">
    <div className="segmented master-activity-segmented" aria-label="Menu Master Activity">
      {allowed.list&&<button type="button" className={view==='list'?'active':''} onClick={()=>setView('list')}>Daftar Activity</button>}
      {allowed.manage&&<button type="button" className={view==='manage'?'active':''} onClick={()=>setView('manage')}>Kelola Master</button>}
      {allowed.resource&&<button type="button" className={view==='resource'?'active':''} onClick={()=>setView('resource')}>Master Resource</button>}
      {allowed.import&&<button type="button" className={view==='import'?'active':''} onClick={()=>setView('import')}>Update / Import</button>}
    </div>
    {view==='list'?<MasterActivityListPanel user={user} readOnly={!canEditAccess(user,'data_master_activity_list')}/>:view==='manage'?(canEditAccess(user,'data_master_activity_manage')?<MasterActivityManagePanel user={user}/>:<div className="panel"><div className="alert">Mode Hanya Lihat: Kelola Master dinonaktifkan.</div></div>):view==='resource'?(canEditAccess(user,'data_master_activity_resources')?<MasterOperationalResourcePanel user={user}/>:<div className="panel"><div className="alert">Mode Hanya Lihat: Master Resource dinonaktifkan.</div></div>):(canEditAccess(user,'data_master_activity_import')?<MasterActivityImportPanel user={user} onOpenManage={()=>setView('manage')}/>:<div className="panel"><div className="alert">Mode Hanya Lihat: Update / Import dinonaktifkan.</div></div>)} 
  </section>
}
