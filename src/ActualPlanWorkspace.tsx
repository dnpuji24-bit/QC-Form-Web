import { Button, Input, Segmented } from 'antd'
import { useEffect, useState } from 'react'
import ActualPlanImportPanel from './ActualPlanImportPanel'
import ActualPlanListPanel from './ActualPlanListPanel'
import ActualPlanWebEntryPanel from './ActualPlanWebEntryPanel'
import type { ActualComposerRequest, SavedActualRow } from './actualPlanWorkspaceTypes'
import type { User } from './types'
import { canEditAccess, canViewAccess } from './accessControl'
import PlanPeriodExcelExport from './PlanPeriodExcelExportPanel'

type Props={user:User;prefillDailyPlanIds?:string[];jumpRequest?:{monthlyPlanLineId:string;actualReportIds:string[];label:string}|null}
type View='plan'|'import'

export default function ActualPlanWorkspace({user,prefillDailyPlanIds=[],jumpRequest=null}:Props){
  const[requestedView,setView]=useState<View>('plan')
  const[editorOpen,setEditorOpen]=useState(false)
  const[selectedDate,setSelectedDate]=useState(new Date().toISOString().slice(0,10))
  const[refreshKey,setRefreshKey]=useState(0)
  const[composerRequest,setComposerRequest]=useState<ActualComposerRequest>(null)
  useEffect(()=>{if(prefillDailyPlanIds.length||jumpRequest)setView('plan');if(prefillDailyPlanIds.length)setEditorOpen(true)},[prefillDailyPlanIds.join('|'),jumpRequest?.monthlyPlanLineId,jumpRequest?.actualReportIds.join('|')])

  function editActual(row:SavedActualRow){setView('plan');setSelectedDate(row.date);setEditorOpen(true);setComposerRequest({mode:'edit-saved',row})}
  function duplicateActual(row:SavedActualRow){setView('plan');setSelectedDate(row.date);setEditorOpen(true);setComposerRequest({mode:'duplicate-saved',row})}
  const canPlan=canViewAccess(user,'data_plan_actual'),editPlan=canEditAccess(user,'data_plan_actual'),canImport=canViewAccess(user,'data_plan_actual_import'),editImport=canEditAccess(user,'data_plan_actual_import')
  if (!canPlan && !canImport) return null
  const view = !canPlan ? 'import' : !canImport ? 'plan' : requestedView
  return <section className="plan-subworkspace">
    <Segmented<View> size="small" className="plan-antd-nav" aria-label="Menu Actual Plan" value={view}
      options={[
        ...(canPlan ? [{value: 'plan' as const, label: 'Actual per Tanggal'}] : []),
        ...(canImport ? [{value: 'import' as const, label: 'Update / Import Excel'}] : []),
      ]} onChange={setView} />
    {(canPlan||canImport)&&<div className="plan-period-export-row"><PlanPeriodExcelExport kind="actual" /></div>}
    {view==='plan'?<div className="period-workspace">
      <div className="plan-browse-controls">
        <label>Tanggal <Input type="date" value={selectedDate} onChange={event=>{if(event.target.value)setSelectedDate(event.target.value)}}/></label>
        {editPlan&&<Button type={editorOpen?'default':'primary'} aria-expanded={editorOpen}
          aria-controls="actual-plan-editor" onClick={()=>setEditorOpen(open=>!open)}>{editorOpen?'Tutup Form':'Buka Form Actual'}</Button>}
      </div>
      {editPlan&&<div id="actual-plan-editor" hidden={!editorOpen}><ActualPlanWebEntryPanel user={user} prefillDailyPlanIds={prefillDailyPlanIds} selectedDate={selectedDate} onDateChange={setSelectedDate} onSaved={()=>setRefreshKey(x=>x+1)} composerRequest={composerRequest} onComposerRequestHandled={()=>setComposerRequest(null)}/></div>}
      {!editPlan&&<div className="alert">Mode Hanya Lihat: input dan perubahan Actual Plan dinonaktifkan.</div>}
      <ActualPlanListPanel user={user} selectedDate={selectedDate} compact refreshKey={refreshKey} onEditActual={editActual} onDuplicateActual={duplicateActual} onChanged={()=>setRefreshKey(x=>x+1)} readOnly={!editPlan} jumpRequest={jumpRequest}/>
    </div>:(editImport?<ActualPlanImportPanel user={user}/>:<div className="panel"><div className="alert">Mode Hanya Lihat: Update / Import Excel dinonaktifkan.</div></div>)}
  </section>
}
