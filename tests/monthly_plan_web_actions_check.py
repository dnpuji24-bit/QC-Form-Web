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
    "systemBalanceHa=closed?0",
    "progressPct=cancelled?100",
    "Progress Manual / Historis (Ha)",
    "Actual dari Actual Plan",
    "Plan ID, PID, dan Activity tetap dikunci",
    "Simpan Update Progress",
    "Buka kembali plan",
]:
    assert token in monthly, f'Missing Monthly edit/cancel/progress token: {token}'

for token in [
    "manualActualAreaHa:number",
    "function actualForMonthly(row:Monthly)",
    "(actualForMonthly(row)+row.manualActualAreaHa)<row.targetAreaHa-0.0001",
    "const actual=selected?linkedActual+selected.manualActualAreaHa:0",
    "const remaining=selected?selected.targetAreaHa-actual:0",
    "Progress manual",
]:
    assert token in daily, f'Missing Daily manual-progress capacity token: {token}'

assert "sourceStatus:'CANCELLED',status:'DONE'" in monthly
assert "manualActualAreaHa:manual" in monthly
assert "lastModifiedSource:'WEB'" in monthly
print('Monthly web actions check passed: details edit, DONE-on-cancel, finish/reopen, additive historical progress, and identity-aware Daily capacity are wired.')
