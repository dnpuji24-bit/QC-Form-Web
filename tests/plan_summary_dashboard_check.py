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
    "SUMMARY PLAN",
    "Dashboard Planning & Pencapaian",
    "TRACKING BY PADDOCK",
    "Dashboard Paddock",
    "Riwayat Pekerjaan Paddock",
    "collection(firestoreDb,'monthly_plans')",
    "collection(firestoreDb,'daily_plans')",
    "collection(firestoreDb,'daily_reports')",
    "where('monthKey','==',month)",
    "Tracking Paddock / PID",
    "Pencapaian per Activity",
    "Grafik Pencapaian Kumulatif",
    "manualActualAreaHa",
    "Target Efektif",
    "ADHOC / SUPPORT DAILY",
]:
    assert token in summary, f'Missing Plan Summary dashboard token: {token}'

for token in [
    ".plan-summary-dashboard",
    ".summary-filter-grid",
    ".summary-line-chart",
    ".summary-activity-bars",
    ".summary-paddock-panel",
    ".summary-timeline-panel",
]:
    assert token in css, f'Missing Plan Summary style token: {token}'

assert "getDocs(collection(firestoreDb,'monthly_plans'))" not in summary, 'Summary should stay month-scoped instead of loading all Monthly data.'
assert "getDocs(collection(firestoreDb,'daily_plans'))" not in summary, 'Summary should stay month-scoped instead of loading all Daily data.'
assert "getDocs(collection(firestoreDb,'daily_reports'))" not in summary, 'Summary should stay month-scoped instead of loading all Actual data.'
print('Plan Summary dashboard check passed: Summary submenu, month-scoped KPI/chart queries, activity progress, and paddock tracking are wired.')
