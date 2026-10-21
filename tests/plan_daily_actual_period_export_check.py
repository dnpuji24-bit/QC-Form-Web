from pathlib import Path
root=Path(__file__).resolve().parents[1]
exporter=(root/'src'/'planPeriodExcelExport.ts').read_text(encoding='utf-8')
dialog=(root/'src'/'PlanPeriodExcelExport.tsx').read_text(encoding='utf-8')
daily=(root/'src'/'DailyPlanWorkspace.tsx').read_text(encoding='utf-8')
actual=(root/'src'/'ActualPlanWorkspace.tsx').read_text(encoding='utf-8')
css=(root/'src'/'field-ui.css').read_text(encoding='utf-8')
for label,content in [('Daily Plan',daily),('Actual Plan',actual)]:
    kind='daily' if label.startswith('Daily') else 'actual'
    assert "import PlanPeriodExcelExport from './PlanPeriodExcelExport'" in content
    assert f'<PlanPeriodExcelExport kind="{kind}" />' in content
    assert content.index(f'<PlanPeriodExcelExport kind="{kind}" />') < content.index("{view==='plan'?<div className="), f'{label} export must appear in both Plan and Import tabs'
    assert 'canPlan||canImport' in content, 'View-only users need export access'

for token in [
    "daily:'daily_plans',actual:'daily_reports'",
    'export function boundsForMonthRange',
    'export function validateExportBounds',
    'export async function fetchPlanExportRows',
    "where('date','>=',bounds.start)",
    "where('date','<=',bounds.end)",
    "orderBy('date','asc')",
    'orderBy(documentId()',
    'startAfter(cursor)',
    'limit(250)',
    'if(snap.size<250)break',
    'rows.length>=100000',
    "'Bahan '+(index+1)",
    "'Dosis/Ha '+(index+1)",
    'sourceOrigin',
    'monthlyPlanLineId',
    'dailyPlanId',
    'qcRecordId',
    "XLSX.writeFile(workbook,filename,{compression:true})",
    "'Data Lengkap'",
    "No record", # intentionally NOT required; ensure helpful Indonesian error instead below
]:
    if token=="No record": continue
    assert token in exporter, f'Period exporter regression: {token}'
assert "Tidak ada '+PRETTY[input.kind]" in exporter
assert "Tidak ada data pada halaman" not in exporter
assert 'new Date(Date.UTC(year,month,0))' in exporter
for token in [
    "createPortal(",'document.body',
    "document.body.style.overflow='hidden'",
    "event.key==='Escape'",
    "type=\"date\"","type=\"month\"",
    'Pilih rentang tanggal atau bulan/tahun',
    "exportPlanRangeExcel({db:firestoreDb,kind,bounds,onProgress:setStatus})",
    'disabled={busy}',
]:
    assert token in dialog, f'Missing export dialog behavior: {token}'
for token in ['Daily / Actual period Excel export modal','.plan-period-export-backdrop','.plan-period-export-dialog','@media(max-width:640px)']:
    assert token in css, f'Period export style missing: {token}'

print('Daily and Actual export all-data period range regression checks: OK')
