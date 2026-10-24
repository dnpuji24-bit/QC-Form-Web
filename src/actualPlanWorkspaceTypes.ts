import type { PlanMaterialLine } from './planInputUtils'

export type SavedActualRow={
  id:string
  actualReportId:string
  workGroupId:string
  planningOrder:number
  date:string
  monthKey:string
  shift:string
  sourceType:string
  dailyLinkStatus:string
  monthlyLinkStatus:string
  dailyPlanId:string
  monthlyPlanLineId:string
  companyCode:string
  farm:string
  pid:string
  activity:string
  actualAreaHa:number
  plannedDailyAreaHa:number
  dailyVarianceHa:number
  manpower:number
  unitName:string
  unitReady:number
  unitStandby:number
  unitBreakdown:number
  foreman:string
  notes:string
  materials:PlanMaterialLine[]
}

export type ActualComposerRequest=
  |{mode:'edit-saved';row:SavedActualRow}
  |{mode:'duplicate-saved';row:SavedActualRow}
  |null
