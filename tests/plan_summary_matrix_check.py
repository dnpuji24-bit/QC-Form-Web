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
    "PLAN VS AKTUAL HARIAN",
    "Summary Activity per Tanggal",
    "<th>Plan</th>",
    "<th>Aktual</th>",
    "summary-actual-good",
    "summary-actual-low",
    "selectedDays",
    "dayMatrixRows",
]:
    assert token in summary, f'Missing Summary matrix token: {token}'

for token in [
    ".summary-wide-table",
    ".summary-paddock-activity-table",
    ".summary-plan-report-table",
    ".summary-actual-good",
    ".summary-actual-low",
]:
    assert token in css, f'Missing Summary matrix style token: {token}'

for removed in [
    "<th>Report</th>",
    "PLAN VS REPORT HARIAN",
    "Report ≥ Plan",
    "Report < Plan",
]:
    assert removed not in summary, f'Legacy Report wording must be replaced with Aktual: {removed}'

assert "selectedWeek==='ALL'||weekFromDate(row.date)===selectedWeek" in summary
assert "shift==='ALL'||row.shift===shift" in summary
assert "foreman==='ALL'||row.foreman===foreman" in summary
assert "dailyScope.filter(x=>x.activity===activityName&&x.date===date)" in summary

for token in [
    "paddockFilter",
    "filteredPaddockActivityMatrix",
    "Filter Paddock / PID",
    "summary-paddock-filter-options",
    "Reset Paddock",
]:
    assert token in summary, f'Missing Summary Paddock filter token: {token}'

assert ".summary-paddock-filter" in css, 'Missing Summary Paddock filter style.'
assert "Mobile paddock sticky header alignment" in css, 'Missing mobile paddock sticky-header fix.'
assert ".summary-paddock-activity-table .summary-sticky-col.second{position:sticky!important" in css, 'Luas Paddock must remain sticky on mobile so the Paddock header does not float alone.'
assert "--summary-paddock-first-col:135px" in css, 'Mobile paddock sticky columns need a fixed shared offset.'
assert "row.pid.includes(needle)" in summary, 'Paddock filter must support partial PID such as A-007.'
assert "actualScope.filter(x=>x.activity===activityName&&x.date===date)" in summary
print('Plan Summary spreadsheet matrix check passed: paddock filtering works and mobile Paddock/Luas Paddock sticky headers stay aligned.')
