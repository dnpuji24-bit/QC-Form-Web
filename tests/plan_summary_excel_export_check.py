from pathlib import Path

root=Path(__file__).resolve().parents[1]
summary=(root/'src'/'PlanSummaryDashboard.tsx').read_text(encoding='utf-8')
exporter=(root/'src'/'planSummaryExcelExport.ts').read_text(encoding='utf-8')
css=(root/'src'/'field-ui.css').read_text(encoding='utf-8')

for token in [
    'exportAllPlanSummary',
    'Export Excel Semua Data',
    'Export Semua PID',
    "paddocks:masterPaddocks",
    "masterActivityNames:masterActivities.filter",
    "productivity:productivityRows",
    "activityDays:dayMatrixRows",
    "activityShares:activityPieRows",
    "onProgress:setExcelProgress",
    "excelBusy",
    "excelProgress",
]:
    assert token in summary, f'Missing Summary export UI token: {token}'

for token in [
    "export async function exportAllPlanSummary",
    "input.paddocks",
    "where('pid','in',part)",
    "const chunkSize=10,concurrentChunks=2",
    "loadedPids+=group.reduce",
    "paddocks.length",
    "XLSX.writeFile(workbook",
    "Summary_Plan_Seluruh_PID_",
    "'Ringkasan'",
    "'Summary Paddock'",
    "'Detail Paddock'",
    "'Produktivitas Harian'",
    "'Activity per Tanggal'",
    "'Komposisi Activity'",
    "manualActualAreaHa",
    "daily_reports",
    "monthly_plans",
    "await new Promise<void>",
]:
    assert token in exporter, f'Missing comprehensive Summary Excel token: {token}'

assert "where('monthKey','=='," not in exporter, 'All-history Paddock export must ignore month filters.'
assert "paddockPageSize" not in exporter, 'Export must not use the 25/50/100 on-screen pagination.'
assert "getDocs(collection(db,'daily_reports'))" not in exporter, 'Export must not load every Actual document in one query.'
assert "getDocs(collection(db,'monthly_plans'))" not in exporter, 'Export must not load every Monthly document in one query.'
assert "XLSX.writeFile(workbook" in exporter.split("for(let offset=")[1], 'Workbook must be downloaded after the history loop.'

for token in [
    'Summary complete Excel export actions',
    '.summary-excel-button',
    '.summary-excel-progress',
    '.summary-export-section-actions',
]:
    assert token in css, f'Missing Summary Excel style token: {token}'

print('Summary Excel export regression passed: full PID coverage, all-history activity cells, bounded loading and six sheets.')
