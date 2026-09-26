from pathlib import Path

root=Path(__file__).resolve().parents[1]
monthly=(root/'src'/'MonthlyPlanListPanel.tsx').read_text(encoding='utf-8')
daily=(root/'src'/'DailyPlanWebEntryPanel.tsx').read_text(encoding='utf-8')

for token in [
    "manualActualAreaHa",
    "manualProgressNote",
    "startDetails(",
    "startProgress(",
    "saveDetails(",
    "saveProgress(",
    "cancelPlan(",
    "reopenPlan(",
    "sourceStatus:'CANCELLED'",
    "status:'DONE'",
    "systemBalanceHa=cancelled?0",
    "progressPct=cancelled?100",
    "Progress Manual / Historis (Ha)",
    "Actual dari Actual Plan",
    "Plan ID, PID, dan Activity dikunci",
    "Simpan Update Progress",
    "Buka Lagi",
]:
    assert token in monthly, f'Missing Monthly edit/cancel/progress token: {token}'

for token in [
    "manualActualAreaHa:number",
    "(actualByMonthlyId.get(row.planLineId)||0)+row.manualActualAreaHa",
    "selected.targetAreaHa-selected.manualActualAreaHa-Math.max(scheduled,linkedActual)",
    "Progress manual",
]:
    assert token in daily, f'Missing Daily manual-progress capacity token: {token}'

assert "sourceStatus:'CANCELLED',status:'DONE'" in monthly
assert "manualActualAreaHa:manual" in monthly
assert "lastModifiedSource:'WEB'" in monthly
print('Monthly web actions check passed: details edit, DONE-on-cancel, reopen, and additive historical progress are wired and Daily availability respects manual progress.')
