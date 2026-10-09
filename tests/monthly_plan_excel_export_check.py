from pathlib import Path

root=Path(__file__).resolve().parents[1]
listing=(root/'src'/'MonthlyPlanListPanel.tsx').read_text(encoding='utf-8')
css=(root/'src'/'field-ui.css').read_text(encoding='utf-8')

for token in [
    "EXPORT_WEEKS=['W1','W2','W3','W4']",
    "function ExcelIcon()",
    "openExportDialog",
    "exportMonthlyExcel",
    'type="month" value={exportFrom}',
    'type="month" value={exportTo}',
    "where('monthKey','>=',exportFrom)",
    "where('monthKey','<=',exportTo)",
    "monthlyPlanLineId','in',part",
    "Actual Total (Ha)",
    "Balance (Ha)",
    "Progress (%)",
    "XLSX.writeFile",
    "monthly-excel-trigger",
]:
    assert token in listing, f"Missing Monthly Plan Excel export token: {token}"

for token in [
    "Monthly Plan Excel range export",
    ".monthly-excel-trigger",
    ".monthly-export-backdrop",
    ".monthly-export-dialog",
    ".monthly-export-weeks",
]:
    assert token in css, f"Missing Monthly Plan Excel export CSS token: {token}"

print("Monthly Plan month/week Excel export checks: OK")
