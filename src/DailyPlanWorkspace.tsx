import { useEffect, useState } from 'react'
import DailyPlanImportPanel from './DailyPlanImportPanel'
import DailyPlanListPanel from './DailyPlanListPanel'
import DailyPlanWebEntryPanel from './DailyPlanWebEntryPanel'
import type { DailyComposerRequest } from './dailyPlanWorkspaceTypes'
import type { User } from './types'
import { canEditAccess, canViewAccess } from './accessControl'

type Props={user:User;onCopyToActual?:(dailyPlanIds:string[])=>void;jumpRequest?:{date:string;monthlyPlanLineId:string;pid:string}|null}
type View='plan'|'import'

export default function DailyPlanWorkspace({user,onCopyToActual,jumpRequest}:Props){
  const[view,setView]=useState<View>('plan')
  const[selectedDate,setSelectedDate]=useState(jumpRequest?.date||new Date().toISOString().slice(0,10))
  const[refreshKey,setRefreshKey]=useState(0)
  const[composerRequest,setComposerRequest]=useState<DailyComposerRequest>(null)
  const[monthlyFocus,setMonthlyFocus]=useState(jumpRequest?.monthlyPlanLineId||'')
  useEffect(()=>{if(!jumpRequest)return;setView('plan');setSelectedDate(jumpRequest.date);setMonthlyFocus(jumpRequest.monthlyPlanLineId)},[jumpRequest?.date,jumpRequest?.monthlyPlanLineId,jumpRequest?.pid])
  function changed(){setRefreshKey(x=>x+1)}
  const canPlan=canViewAccess(user,'data_plan_daily'),editPlan=canEditAccess(user,'data_plan_daily'),canImport=canViewAccess(user,'data_plan_daily_import'),editImport=canEditAccess(user,'data_plan_daily_import')
  useEffect(()=>{if(view==='plan'&&!canPlan)setView(canImport?'import':'plan');if(view==='import'&&!canImport)setView(canPlan?'plan':'import')},[view,canPlan,canImport])
  return <section className="plan-subworkspace">
    <div className="segmented plan-secondary-nav" aria-label="Menu Daily Plan">
      {canPlan&&<button type="button" className={view==='plan'?'active':''} onClick={()=>setView('plan')}>Daily per Tanggal</button>}
      {canImport&&<button type="button" className={view==='import'?'active':''} onClick={()=>setView('import')}>Update / Import Excel</button>}
    </div>
    {view==='plan'?<div className="period-workspace">
      {editPlan&&<DailyPlanWebEntryPanel user={user} selectedDate={selectedDate} onDateChange={setSelectedDate} onSaved={changed} composerRequest={composerRequest} onComposerRequestHandled={()=>setComposerRequest(null)}/>}
      {!editPlan&&<div className="alert">Mode Hanya Lihat: input dan perubahan Daily Plan dinonaktifkan.</div>}
      <DailyPlanListPanel user={user} onCopyToActual={onCopyToActual} selectedDate={selectedDate} compact refreshKey={refreshKey} focusMonthlyPlanLineId={monthlyFocus} focusPid={jumpRequest?.pid||''} onClearMonthlyFocus={()=>setMonthlyFocus('')} onChanged={changed} onEditGroup={group=>setComposerRequest({mode:'edit-saved',group})} onDuplicateGroup={group=>setComposerRequest({mode:'duplicate-saved',group})} readOnly={!editPlan}/>
    </div>:(editImport?<DailyPlanImportPanel user={user}/>:<div className="panel"><div className="alert">Mode Hanya Lihat: Update / Import Excel dinonaktifkan.</div></div>)}
  </section>
}
