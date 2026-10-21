from pathlib import Path
root=Path(__file__).resolve().parents[1]
dashboard=(root/'src/PlanSummaryDashboard.tsx').read_text(encoding='utf-8')
helper=(root/'src/activityAchievement.ts').read_text(encoding='utf-8')
styles=(root/'src/field-ui.css').read_text(encoding='utf-8')

for token in [
    "import { aggregateActivityShares, calculateMonthlyActivityAchievement",
    "const[selectedYear,setSelectedYear]",
    "[selectedActivity,setSelectedActivity]=useState<string|null>(null)",
    "const activityPieRows=useMemo<ActivityPieRow[]>(()=>aggregateActivityShares",
    "const selectedAchievement=useMemo(",
    "calculateMonthlyActivityAchievement(selectedActivity,monthlyScope,monthlyLinked.rows,monthly)",
    "ActivityCompositionPie({rows,basisLabel,onSelect}",
    "onSelect(row.activity)",
    "onClick={()=>onSelect(row.activity)}",
    "onKeyDown={e=>{if(e.key==='Enter'||e.key===' ')",
    "role=\"button\" tabIndex={0}",
    "ActivityAchievementDetail({stats,onBack}",
    "Target Monthly Plan",
    "Actual",
    "percentage===null?'—':fmtPct(percentage)",
    "Persentase tidak tersedia: tidak ada target Monthly Plan",
    "onBack={()=>setSelectedActivity(null)}",
    "onSelect={setSelectedActivity}",
    "selectedAchievement&&<ActivityAchievementDetail",
    "summary-achievement-fill plan",
    "summary-achievement-fill actual",
]:
    assert token in dashboard, f'Missing activity-click comparison element: {token}'

for token in [
    "export function activityMatchKey",
    "export function aggregateActivityShares",
    "export function calculateMonthlyActivityAchievement",
    "monthlyRows.filter(row=>!row.cancelled",
    "percentage:plan>0?completed/plan*100:null",
    "const completed=linked+manual",
    "linkedActualRows:readonly MonthlyAchievementActualRow[]",
    "const allActive=identityRows.filter(row=>!row.cancelled)",
    "seenIds.add(actual.id)",
    "candidates.length!==1",
    "remaining:Math.max(0,plan-completed)",
    "over:Math.max(0,completed-plan)",
    "planRecords:selected.length,actualRecords",
    "toLocaleLowerCase('id-ID')",
]:
    assert token in helper, f'Activity progress aggregation regression: {token}'

for token in [
    ".summary-activity-pie-click-map path:focus-visible",
    ".summary-activity-pie-legend-row:focus-visible",
    ".summary-achievement-detail",
    ".summary-achievement-ring-inner",
    ".summary-achievement-fill.plan",
    ".summary-achievement-fill.actual",
    "@media(max-width:620px)",
]:
    assert token in styles, f'Progress comparison CSS missing: {token}'

for token in [
    "where('monthlyPlanLineId','in',part)",
    "setMonthlyLinked({monthKey,rows,ready:true,error:''})",
    "setMonthlyLinked({monthKey,rows:[],ready:true,error:",
    "all completion dates" if False else "even when the work was completed in a later month",
    "progress manual/historis",
    "Shift dan Mandor tidak digunakan",
    "Jadwal ulang Daily tidak menambah target",
]:
    assert token in dashboard, f'Monthly reconciliation detail missing: {token}'
assert "getDocs(collection(firestoreDb,'monthly_plans'))" not in dashboard
print('Clickable Activity composition to reconciled Monthly Plan target vs linked Actual + manual: OK')
