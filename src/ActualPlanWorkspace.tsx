import { useEffect, useState } from 'react'
import ActualPlanImportPanel from './ActualPlanImportPanel'
import ActualPlanListPanel from './ActualPlanListPanel'
import ActualPlanWebEntryPanel from './ActualPlanWebEntryPanel'
import type { ActualComposerRequest, SavedActualRow } from './actualPlanWorkspaceTypes'
import type { User } from './types'
import { canEditAccess, canViewAccess } from './accessControl'

type Props={user:User;prefillDailyPlanIds?:string[];jumpRequest?:{monthlyPlanLineId:string;actualReportIds:string[];label:string}|null}
type View='plan'|'import'

export default function ActualPlanWorkspace({user,prefillDailyPlanIds=[],jumpRequest=null}:Props){
  const[view,setView]=useState<View>('plan')
  const[selectedDate,setSelectedDate]=useState(new Date().toISOString().slice(0,10))
  const[refreshKey,setRefreshKey]=useState(0)
  const[composerRequest,setComposerRequest]=useState<ActualComposerRequest>(null)
  useEffect(()=>{if(prefillDailyPlanIds.length||jumpRequest)setView('plan')},[prefillDailyPlanIds.join('|'),jumpRequest?.monthlyPlanLineId,jumpRequest?.actualReportIds.join('|')])

  function editActual(row:SavedActualRow){setView('plan');setSelectedDate(row.date);setComposerRequest({mode:'edit-saved',row})}
  function duplicateActual(row:SavedActualRow){setView('plan');setSelectedDate(row.date);setComposerRequest({mode:'duplicate-saved',row})}
  const canPlan=canViewAccess(user,'data_plan_actual'),editPlan=canEditAccess(user,'data_plan_actual'),canImport=canViewAccess(user,'data_plan_actual_import'),editImport=canEditAccess(user,'data_plan_actual_import')
  useEffect(()=>{if(view==='plan'&&!canPlan)setView(canImport?'import':'plan');if(view==='import'&&!canImport)setView(canPlan?'plan':'import')},[view,canPlan,canImport])
  return <section className="plan-subworkspace">
    <div className="segmented plan-secondary-nav" aria-label="Menu Actual Plan">
      {canPlan&&<button type="button" className={view==='plan'?'active':''} onClick={()=>setView('plan')}>Actual per Tanggal</button>}
      {canImport&&<button type="button" className={view==='import'?'active':''} onClick={()=>setView('import')}>Update / Import Excel</button>}
    </div>
    {view==='plan'?<div className="period-workspace">
      {editPlan&&<ActualPlanWebEntryPanel user={user} prefillDailyPlanIds={prefillDailyPlanIds} selectedDate={selectedDate} onDateChange={setSelectedDate} onSaved={()=>setRefreshKey(x=>x+1)} composerRequest={composerRequest} onComposerRequestHandled={()=>setComposerRequest(null)}/>}
      {!editPlan&&<div className="alert">Mode Hanya Lihat: input dan perubahan Actual Plan dinonaktifkan.</div>}
      <ActualPlanListPanel user={user} selectedDate={selectedDate} compact refreshKey={refreshKey} onEditActual={editActual} onDuplicateActual={duplicateActual} onChanged={()=>setRefreshKey(x=>x+1)} readOnly={!editPlan} jumpRequest={jumpRequest}/>
    </div>:(editImport?<ActualPlanImportPanel user={user}/>:<div className="panel"><div className="alert">Mode Hanya Lihat: Update / Import Excel dinonaktifkan.</div></div>)}
  </section>
}
