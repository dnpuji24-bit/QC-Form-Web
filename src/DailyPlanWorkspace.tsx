import { useState } from 'react'
import DailyPlanImportPanel from './DailyPlanImportPanel'
import DailyPlanListPanel from './DailyPlanListPanel'
import DailyPlanWebEntryPanel from './DailyPlanWebEntryPanel'
import type { DailyComposerRequest } from './dailyPlanWorkspaceTypes'
import type { User } from './types'

type Props={user:User;onCopyToActual?:(dailyPlanIds:string[])=>void}
type View='plan'|'import'

export default function DailyPlanWorkspace({user,onCopyToActual}:Props){
  const[view,setView]=useState<View>('plan')
  const[selectedDate,setSelectedDate]=useState(new Date().toISOString().slice(0,10))
  const[refreshKey,setRefreshKey]=useState(0)
  const[composerRequest,setComposerRequest]=useState<DailyComposerRequest>(null)
  function changed(){setRefreshKey(x=>x+1)}
  return <section className="plan-subworkspace">
    <div className="segmented plan-secondary-nav" aria-label="Menu Daily Plan">
      <button type="button" className={view==='plan'?'active':''} onClick={()=>setView('plan')}>Daily per Tanggal</button>
      <button type="button" className={view==='import'?'active':''} onClick={()=>setView('import')}>Update / Import Excel</button>
    </div>
    {view==='plan'?<div className="period-workspace">
      <DailyPlanWebEntryPanel user={user} selectedDate={selectedDate} onDateChange={setSelectedDate} onSaved={changed} composerRequest={composerRequest} onComposerRequestHandled={()=>setComposerRequest(null)}/>
      <DailyPlanListPanel user={user} onCopyToActual={onCopyToActual} selectedDate={selectedDate} compact refreshKey={refreshKey} onChanged={changed} onEditGroup={group=>setComposerRequest({mode:'edit-saved',group})} onDuplicateGroup={group=>setComposerRequest({mode:'duplicate-saved',group})}/>
    </div>:<DailyPlanImportPanel user={user}/>}
  </section>
}
