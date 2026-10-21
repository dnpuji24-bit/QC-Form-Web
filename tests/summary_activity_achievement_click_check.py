from pathlib import Path
root=Path(__file__).resolve().parents[1]
dashboard=(root/'src/PlanSummaryDashboard.tsx').read_text(encoding='utf-8')
helper=(root/'src/activityAchievement.ts').read_text(encoding='utf-8')
styles=(root/'src/field-ui.css').read_text(encoding='utf-8')

for token in [
    "import { aggregateActivityShares, calculateActivityAchievement",
    "const[selectedYear,setSelectedYear]",
    "[selectedActivity,setSelectedActivity]=useState<string|null>(null)",
    "const activityPieRows=useMemo<ActivityPieRow[]>(()=>aggregateActivityShares",
    "const selectedAchievement=useMemo(",
    "calculateActivityAchievement(selectedActivity,dailyScope,actualScope)",
    "ActivityCompositionPie({rows,basisLabel,onSelect}",
    "onSelect(row.activity)",
    "onClick={()=>onSelect(row.activity)}",
    "onKeyDown={e=>{if(e.key==='Enter'||e.key===' ')",
    "role=\"button\" tabIndex={0}",
    "ActivityAchievementDetail({stats,onBack}",
    "Daily Plan",
    "Actual",
    "percentage===null?'—':fmtPct(percentage)",
    "persentase tidak tersedia" if False else "Persentase tidak tersedia: tidak ada luas Daily Plan",
    "onBack={()=>setSelectedActivity(null)}",
    "onSelect={setSelectedActivity}",
    "selectedAchievement?<ActivityAchievementDetail",
    "summary-achievement-fill plan",
    "summary-achievement-fill actual",
]:
    assert token in dashboard, f'Missing activity-click comparison element: {token}'

for token in [
    "export function activityMatchKey",
    "export function aggregateActivityShares",
    "export function calculateActivityAchievement",
    "activityMatchKey(row.activity||'Tanpa Activity')===activityKey",
    "percentage:plan>0?completed/plan*100:null",
    "remaining:Math.max(0,plan-completed)",
    "over:Math.max(0,completed-plan)",
    "planRecords:daily.length,actualRecords:actual.length",
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

assert "getDocs(collection(firestoreDb,'monthly_plans'))" not in dashboard
print('Clickable Activity composition to filtered Daily Plan vs Actual achievement: OK')
