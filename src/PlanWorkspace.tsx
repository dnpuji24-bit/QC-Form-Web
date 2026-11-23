import { Segmented } from 'antd'
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

const planMenu = [
  { value: 'monthly', label: 'Monthly Plan', icon: 'M4 5h16v15H4z M8 3v4m8-4v4M4 10h16m-11 4h2m3 0h2' },
  { value: 'daily', label: 'Daily Plan', icon: 'M4 5h16v15H4z M8 3v4m8-4v4M4 10h16m-11 5 2 2 4-4' },
  { value: 'actual', label: 'Actual Plan', icon: 'M5 4v16h15 M9 16v-4m5 4V8m5 8v-6' },
  { value: 'reconciliation', label: 'Rekonsiliasi', icon: 'M4 8h15m-4-4 4 4-4 4M20 16H5m4-4-4 4 4 4' },
] as const

const PlanWorkspace=forwardRef<PlanWorkspaceHandle,Props>(function PlanWorkspace({user},ref){
  const[tab,setTab]=useState<Tab>('monthly'),[actualPrefill,setActualPrefill]=useState<string[]>([]),[dailyJump,setDailyJump]=useState<{date:string;monthlyPlanLineId:string;pid:string}|null>(null),[actualJump,setActualJump]=useState<{monthlyPlanLineId:string;actualReportIds:string[];label:string}|null>(null)
  const tabHistoryRef=useRef<Tab[]>([])
  const allowed=useMemo(()=>({
    monthly:canViewAccess(user,'data_plan_monthly')||canViewAccess(user,'data_plan_monthly_import'),
    daily:canViewAccess(user,'data_plan_daily')||canViewAccess(user,'data_plan_daily_import'),
    actual:canViewAccess(user,'data_plan_actual')||canViewAccess(user,'data_plan_actual_import'),
    reconciliation:canViewAccess(user,'data_plan_reconciliation'),
  }),[user])
  function navigateTab(next:Tab){
    if(next===tab||!allowed[next])return
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
  }),[tab,allowed])
  useEffect(()=>{
    if(allowed[tab])return
    tabHistoryRef.current=[]
    const first=planMenu.find(item=>allowed[item.value])
    if(first)setTab(first.value)
  },[tab,allowed])
  return <section className="plan-workspace-shell">
    <PlanOfflineBanner/>
    <Segmented<Tab> className="plan-antd-nav plan-section-menu" aria-label="Menu Plan" name="plan-section" tabIndex={-1} value={tab}
      options={planMenu.filter(item=>allowed[item.value]).map(({ value, label, icon })=>{
        const [name, suffix] = label.split(' ')
        return {
          value,
          title: label,
          label: <span className="plan-section-label">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={icon}/></svg>
            <span>{name}{suffix && <span className="plan-section-suffix"> {suffix}</span>}</span>
          </span>,
        }
      })}
      onChange={next => { if(next==='daily')setDailyJump(null); navigateTab(next) }} />
    <div key={tab} className="ui-view-transition plan-tab-transition">
      {allowed[tab] && (tab==='monthly'?<MonthlyPlanWorkspace user={user} onOpenDailyPlan={request=>{setDailyJump(request);navigateTab('daily')}} onOpenActualSource={request=>{setActualJump(request);setActualPrefill([]);navigateTab('actual')}}/>:tab==='daily'?<DailyPlanWorkspace user={user} jumpRequest={dailyJump} onCopyToActual={ids=>{setActualPrefill(ids);navigateTab('actual')}}/>:tab==='actual'?<ActualPlanWorkspace user={user} prefillDailyPlanIds={actualPrefill} jumpRequest={actualJump}/>:<PlanReconciliationPanel/>)}
    </div>
  </section>
})

export default PlanWorkspace
