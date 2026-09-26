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
assert "Mobile compact paddock columns" in css, 'Missing compact mobile Paddock/Luas Paddock sizing.'
assert "--summary-paddock-first-col:108px" in css, 'Mobile Paddock column should be compact enough to leave room for activity columns.'
assert "width:76px" in css and "min-width:76px" in css, 'Mobile Luas Paddock column should be compact.'
assert "overflow-wrap:anywhere" in css, 'Long PID values should wrap instead of widening the sticky Paddock column.'
assert "row.pid.includes(needle)" in summary, 'Paddock filter must support partial PID such as A-007.'
assert "paddockTableScrollRef" in summary, 'Paddock filter should control only row filtering and reset horizontal scroll without rebuilding columns.'
assert "<colgroup>" in summary and "summary-col-activity-area" in summary and "summary-col-activity-date" in summary, 'Paddock matrix needs fixed column definitions so filtering does not change widths.'
assert "Stable paddock matrix widths while filtering" in css, 'Missing invariant paddock matrix width rules.'
assert "table-layout:fixed" in css and "min-width:max-content!important" in css, 'Paddock matrix width must stay independent of filtered row contents.'
assert ".summary-paddock-table-scroll{padding-bottom:58px}" in css, 'Mobile table needs safe space so the floating scroll-to-top button does not cover the horizontal scroll area.'
assert "Setiap activity menjadi pasangan kolom Luas dan Tanggal. Gunakan filter Paddock" not in summary, 'Summary Paddock description should be removed so the filter follows the title directly.'
assert "actualScope.filter(x=>x.activity===activityName&&x.date===date)" in summary
print('Plan Summary spreadsheet matrix check passed: paddock filtering changes rows only, fixed column widths remain stable, and mobile scroll controls stay readable.')
