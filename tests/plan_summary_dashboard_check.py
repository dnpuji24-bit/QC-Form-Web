from pathlib import Path

root=Path(__file__).resolve().parents[1]
workspace=(root/'src'/'PlanWorkspace.tsx').read_text(encoding='utf-8')
summary=(root/'src'/'PlanSummaryDashboard.tsx').read_text(encoding='utf-8')
css=(root/'src'/'field-ui.css').read_text(encoding='utf-8')

for token in [
    "PlanSummaryDashboard",
    "type Tab='summary'|'monthly'|'daily'|'actual'|'reconciliation'",
    "setTab('summary')",
    ">Summary</button>",
]:
    assert token in workspace, f'Missing Plan Summary navigation token: {token}'

for token in [
    "Dashboard Daily Plan & Aktual",
    "Produktivitas Harian",
    "Progress Monthly Plan",
    "DailyProductivityChart",
    "MonthlyProgressDonut",
    "selectedYear",
    "selectedMonth",
    "selectedWeek",
    "Semua Shift",
    "Semua Mandor",
    "where('monthKey','==',monthKey)",
    "manualActualAreaHa",
]:
    assert token in summary, f'Missing refocused Summary dashboard token: {token}'

for removed in [
    "TRACKING BY PADDOCK",
    "Dashboard Paddock",
    "Riwayat Pekerjaan Paddock",
    "Grafik Pencapaian Kumulatif",
    "MONTHLY TARGET",
    "TARGET EFEKTIF",
    "ADHOC / SUPPORT DAILY",
]:
    assert removed not in summary, f'Legacy Summary section should be removed: {removed}'

for token in [
    ".summary-productivity-chart",
    ".summary-productivity-plan",
    ".summary-productivity-actual",
    ".summary-donut-chart",
    ".summary-pie-stats",
]:
    assert token in css, f'Missing refocused Summary style token: {token}'

assert "getDocs(collection(firestoreDb,'monthly_plans'))" not in summary
assert "getDocs(collection(firestoreDb,'daily_plans'))" not in summary
assert "getDocs(collection(firestoreDb,'daily_reports'))" not in summary

for token in [
    "premium-filter-panel",
    "premium-filter-head",
    "premium-filter-field",
    "premium-filter-reset",
    "premium-filter-chips",
    "FILTER DASHBOARD",
]:
    assert token in summary, f'Missing premium Summary filter token: {token}'

for token in [
    "Premium Summary filters",
    ".premium-filter-panel",
    ".premium-filter-field:hover",
    ".premium-filter-field:focus-within",
    ".premium-filter-reset:hover",
    ".premium-filter-chips",
]:
    assert token in css, f'Missing premium Summary filter style: {token}'
print('Plan Summary dashboard check passed: premium responsive filters, Daily-vs-Actual productivity, and Monthly progress are wired.')
