import { Button, Input, Segmented } from 'antd'
import { useEffect, useState } from 'react'
import DailyPlanImportPanel from './DailyPlanImportPanel'
import DailyPlanListPanel from './DailyPlanListPanel'
import DailyPlanWebEntryPanel from './DailyPlanWebEntryPanel'
import type { DailyComposerRequest } from './dailyPlanWorkspaceTypes'
import type { User } from './types'
import { canEditAccess, canViewAccess } from './accessControl'
import PlanPeriodExcelExport from './PlanPeriodExcelExportPanel'

type Props={user:User;onCopyToActual?:(dailyPlanIds:string[])=>void;jumpRequest?:{date:string;monthlyPlanLineId:string;pid:string}|null}
type View='plan'|'import'

export default function DailyPlanWorkspace({user,onCopyToActual,jumpRequest}:Props){
  const[requestedView,setView]=useState<View>('plan')
  // Mount on first use, then retain the draft when the form is collapsed.
  const[editorOpen,setEditorOpen]=useState<boolean|null>(null)
  const[selectedDate,setSelectedDate]=useState(jumpRequest?.date||new Date().toISOString().slice(0,10))
  const[refreshKey,setRefreshKey]=useState(0)
  const[composerRequest,setComposerRequest]=useState<DailyComposerRequest>(null)
  const[monthlyFocus,setMonthlyFocus]=useState(jumpRequest?.monthlyPlanLineId||'')
  useEffect(()=>{if(!jumpRequest)return;setView('plan');setSelectedDate(jumpRequest.date);setMonthlyFocus(jumpRequest.monthlyPlanLineId)},[jumpRequest?.date,jumpRequest?.monthlyPlanLineId,jumpRequest?.pid])
  function changed(){setRefreshKey(x=>x+1)}
  const canPlan=canViewAccess(user,'data_plan_daily'),editPlan=canEditAccess(user,'data_plan_daily'),canImport=canViewAccess(user,'data_plan_daily_import'),editImport=canEditAccess(user,'data_plan_daily_import')
  if (!canPlan && !canImport) return null
  const view = !canPlan ? 'import' : !canImport ? 'plan' : requestedView
  return <section className="plan-subworkspace">
    <Segmented<View> size="small" className="plan-antd-nav" aria-label="Menu Daily Plan" value={view}
      options={[
        ...(canPlan ? [{value: 'plan' as const, label: 'Daily per Tanggal'}] : []),
        ...(canImport ? [{value: 'import' as const, label: 'Update / Import Excel'}] : []),
      ]} onChange={setView} />
    {(canPlan||canImport)&&<div className="plan-period-export-row"><PlanPeriodExcelExport kind="daily" /></div>}
    {view==='plan'?<div className="period-workspace">
      <div className="plan-browse-controls">
        <label>Tanggal <Input type="date" value={selectedDate} onChange={event=>{if(event.target.value)setSelectedDate(event.target.value)}}/></label>
        {editPlan&&<Button type={editorOpen?'default':'primary'} aria-expanded={editorOpen===true}
          aria-controls="daily-plan-editor" onClick={()=>setEditorOpen(open=>!open)}>{editorOpen?'Tutup Form':'Buka Form Daily'}</Button>}
      </div>
      {editPlan&&<div id="daily-plan-editor" hidden={!editorOpen}>{editorOpen!==null&&<DailyPlanWebEntryPanel user={user} selectedDate={selectedDate} onDateChange={setSelectedDate} onSaved={changed} composerRequest={composerRequest} onComposerRequestHandled={()=>setComposerRequest(null)}/>}</div>}
      {!editPlan&&<div className="alert">Mode Hanya Lihat: input dan perubahan Daily Plan dinonaktifkan.</div>}
      <DailyPlanListPanel user={user} onCopyToActual={onCopyToActual} selectedDate={selectedDate} compact refreshKey={refreshKey} focusMonthlyPlanLineId={monthlyFocus} focusPid={jumpRequest?.pid||''} onClearMonthlyFocus={()=>setMonthlyFocus('')} onChanged={changed} onEditGroup={group=>{setEditorOpen(true);setComposerRequest({mode:'edit-saved',group})}} onDuplicateGroup={group=>{setEditorOpen(true);setComposerRequest({mode:'duplicate-saved',group})}} readOnly={!editPlan}/>
    </div>:(editImport?<DailyPlanImportPanel user={user}/>:<div className="panel"><div className="alert">Mode Hanya Lihat: Update / Import Excel dinonaktifkan.</div></div>)}
  </section>
}
