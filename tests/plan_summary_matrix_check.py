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
assert "actualScope.filter(x=>x.activity===activityName&&x.date===date)" in summary
print('Plan Summary spreadsheet matrix check passed: all activities remain visible, Report is renamed Aktual, and the shared filters drive the date matrix.')
