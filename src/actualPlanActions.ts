import {dailyPlansToWhatsApp,type DailyPlanTransfer} from './dailyPlanActions'
import type {SavedActualRow} from './actualPlanWorkspaceTypes'

/** Reuse the proven Daily WhatsApp layout, changing only Actual terminology and
 * areas. WO/CoA/Operation, planned vs actual shifts and two-column resources
 * follow the exact same rules as the Daily Plan message.
 */
export function actualPlansToWhatsApp(rows:SavedActualRow[]):string{
  const transfers:DailyPlanTransfer[]=rows.map(row=>({
    dailyPlanId:row.dailyPlanId,
    workGroupId:row.workGroupId||row.actualReportId,
    planningOrder:row.planningOrder,
    date:row.date,shift:row.shift,
    sourceType:row.sourceType,monthlyPlanLineId:row.monthlyPlanLineId,
    woNumber:row.woNumber,plannedShift:row.plannedShift,
    coaCode:row.coaCode,operationCode:row.operationCode,department:row.department,
    companyCode:row.companyCode,farm:row.farm,pid:row.pid,
    activity:row.activity,description:row.activity,
    areaHa:row.actualAreaHa,manpower:row.manpower,unitName:row.unitName,
    unitReady:row.unitReady,unitStandby:row.unitStandby,
    unitBreakdown:row.unitBreakdown,foreman:row.foreman,notes:row.notes,
    materials:row.materials,
  }))
  return dailyPlansToWhatsApp(transfers)
    .replace('*DAILY PLAN*','*ACTUAL PLAN*')
    .replaceAll('Total Rencana:','Total Actual:')
    .replaceAll('Luas Rencana','Luas Actual')
    .replace('*RINGKASAN DAILY PLAN*','*RINGKASAN ACTUAL PLAN*')
}
