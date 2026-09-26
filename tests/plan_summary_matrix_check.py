from pathlib import Path

root=Path(__file__).resolve().parents[1]
summary=(root/'src'/'PlanSummaryDashboard.tsx').read_text(encoding='utf-8')
css=(root/'src'/'field-ui.css').read_text(encoding='utf-8')

for token in [
    "PADDOCK × ACTIVITY",
    "Summary Paddock per Kegiatan",
    "Luas Paddock",
    "PaddockActivityMatrixRow",
    "master_paddocks",
    "areaPlantedHa",
    "matrixActivities",
    "cell.dates.map(shortDate)",
    "PLAN VS REPORT HARIAN",
    "Summary Activity per Tanggal",
    "Semua Shift",
    "Semua Mandor",
    "matrixShift",
    "matrixForeman",
    "dayMatrixDays",
    "<th>Plan</th>",
    "<th>Report</th>",
    "summary-report-good",
    "summary-report-low",
]:
    assert token in summary, f'Missing Summary matrix token: {token}'

for token in [
    ".summary-wide-table",
    ".summary-paddock-activity-table",
    ".summary-day-matrix-filters",
    ".summary-plan-report-table",
    ".summary-report-good",
    ".summary-report-low",
]:
    assert token in css, f'Missing Summary matrix style token: {token}'

assert "where('monthKey','==',month)" in summary
assert "matrixShift==='ALL'||row.shift===matrixShift" in summary
assert "matrixForeman==='ALL'||row.foreman===matrixForeman" in summary
assert "dayMatrixDaily.filter(x=>x.activity===activityName&&x.date===date)" in summary
assert "dayMatrixActual.filter(x=>x.activity===activityName&&x.date===date)" in summary
print('Plan Summary spreadsheet matrix check passed: paddock-by-activity Luas/Tanggal and date-by-date Plan/Report with Shift and Mandor filters are wired.')
