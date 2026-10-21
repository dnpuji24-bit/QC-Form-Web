import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react'
import MonthlyPlanWorkspace from './MonthlyPlanWorkspace'
import DailyPlanWorkspace from './DailyPlanWorkspace'
import ActualPlanWorkspace from './ActualPlanWorkspace'
import PlanReconciliationPanel from './PlanReconciliationPanel'
import PlanOfflineBanner from './PlanOfflineBanner'
import type { User } from './types'
import { canViewAccess } from './accessControl'

type Props={user:User}
type Tab='monthly'|'daily'|'actual'|'reconciliation'
export type PlanWorkspaceHandle={goBack:()=>boolean}

const PlanWorkspace=forwardRef<PlanWorkspaceHandle,Props>(function PlanWorkspace({user},ref){
  const[tab,setTab]=useState<Tab>('monthly'),[actualPrefill,setActualPrefill]=useState<string[]>([]),[dailyJump,setDailyJump]=useState<{date:string;monthlyPlanLineId:string;pid:string}|null>(null),[actualJump,setActualJump]=useState<{monthlyPlanLineId:string;actualReportIds:string[];label:string}|null>(null)
  const tabHistoryRef=useRef<Tab[]>([])
  function navigateTab(next:Tab){
    if(next===tab)return
    tabHistoryRef.current.push(tab)
    setTab(next)
  }
  useImperativeHandle(ref,()=>({
    goBack(){
      while(tabHistoryRef.current.length){
        const previous=tabHistoryRef.current.pop()!
        if(previous!==tab&&allowed[previous]){setTab(previous);return true}
      }
      return false
    },
  }),[tab])
  const allowed=useMemo(()=>({
    monthly:canViewAccess(user,'data_plan_monthly')||canViewAccess(user,'data_plan_monthly_import'),
    daily:canViewAccess(user,'data_plan_daily')||canViewAccess(user,'data_plan_daily_import'),
    actual:canViewAccess(user,'data_plan_actual')||canViewAccess(user,'data_plan_actual_import'),
    reconciliation:canViewAccess(user,'data_plan_reconciliation'),
  }),[user])
  useEffect(()=>{if(allowed[tab])return;const first=(['monthly','daily','actual','reconciliation'] as Tab[]).find(key=>allowed[key]);if(first){tabHistoryRef.current=[];setTab(first)}},[tab,allowed])
  return <section className="plan-workspace-shell">
    <PlanOfflineBanner/>
    <div className="segmented plan-primary-nav" aria-label="Menu Plan">
      {allowed.monthly&&<button type="button" className={tab==='monthly'?'active':''} onClick={()=>navigateTab('monthly')}>Monthly Plan</button>}
      {allowed.daily&&<button type="button" className={tab==='daily'?'active':''} onClick={()=>{setDailyJump(null);navigateTab('daily')}}>Daily Plan</button>}
      {allowed.actual&&<button type="button" className={tab==='actual'?'active':''} onClick={()=>navigateTab('actual')}>Actual Plan</button>}
      {allowed.reconciliation&&<button type="button" className={tab==='reconciliation'?'active':''} onClick={()=>navigateTab('reconciliation')}>Rekonsiliasi</button>}
    </div>
    <div key={tab} className="ui-view-transition plan-tab-transition">
      {tab==='monthly'?<MonthlyPlanWorkspace user={user} onOpenDailyPlan={request=>{setDailyJump(request);navigateTab('daily')}} onOpenActualSource={request=>{setActualJump(request);setActualPrefill([]);navigateTab('actual')}}/>:tab==='daily'?<DailyPlanWorkspace user={user} jumpRequest={dailyJump} onCopyToActual={ids=>{setActualPrefill(ids);navigateTab('actual')}}/>:tab==='actual'?<ActualPlanWorkspace user={user} prefillDailyPlanIds={actualPrefill} jumpRequest={actualJump}/>:<PlanReconciliationPanel/>}
    </div>
  </section>
})

export default PlanWorkspace
