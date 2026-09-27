from pathlib import Path

root=Path(__file__).resolve().parents[1]
spray=(root/'src'/'SprayForm.tsx').read_text(encoding='utf-8')
fert=(root/'src'/'FertilizerForm.tsx').read_text(encoding='utf-8')
css=(root/'src'/'field-ui.css').read_text(encoding='utf-8')

assert 'qc-form-shell qc-spray-form' in spray
assert 'qc-form-shell qc-fertilizer-form' in fert
app=(root/'src'/'App.tsx').read_text(encoding='utf-8')
assert 'qc-topbar' in app
assert 'logout-icon-button' in app
assert 'qc-records-page' in app
assert 'data-label="Tanggal"' in app
for token in [
    'Premium compact mobile QC forms',
    '.qc-form-shell .session-bar',
    '.qc-form-shell .unit-tab',
    '.qc-form-shell .unit-card',
    '.qc-form-shell .subpanel',
    '.qc-form-shell .form-grid',
    '.qc-form-shell>.form-actions',
    '.qc-fertilizer-form .fertilizer-filling-row',
    '.qc-spray-form .material-card',
    'Compact QC header + Data QC mobile',
    '.qc-records-page .qc-record-filters',
    '.qc-records-page .table-wrap tbody tr',
    '.logout-icon-button',
]:
    assert token in css, f'Missing compact mobile QC style: {token}'

assert 'grid-template-columns:repeat(2,minmax(0,1fr))!important' in css
assert 'position:sticky' in css
assert 'visibleRecords=useMemo(()=>showAll?filtered:filtered.slice(0,100)' in app
assert "await import('xlsx')" in app
assert "Export Excel" in app
assert "Lihat Semua" in app
assert "record-list-toolbar" in app
assert "dashboard-hero compact-hero" in (root/'src'/'OperationalDashboard.tsx').read_text(encoding='utf-8')
assert "Dashboard + input overflow + Data QC toolbar follow-up" in css
assert ".dashboard-stats .stat" in css
assert ".qc-form-shell input" in css

assert "SPRAY_EXPORT_HEADERS" in app
assert "'Form QC Spray'" in app
assert "'Form QC Fertilizer'" in app
assert "'Pesticide 1','Dosage','Pesticide 2','Dosage'" in app
assert "'Tanggal','Shift','Name','Name of Assistan','Status','Start Time ','End Time'" in app
assert "buildFertilizerExportRows" in app
assert "recordSearchText" in app
assert "Pencarian/filter tetap memeriksa seluruh" in app
assert "Export Excel QC" in app
assert "QC final compactness + anti-clipping refinement" in css
assert ".qc-form-shell .session-bar{grid-template-columns:repeat(2,minmax(0,1fr))!important}" in css


assert "Mobile report preview only - export layout remains unchanged" in css
assert ".report-toolbar .row-actions" in css
assert ".report-sheet:not(.report-export-capture)" in css
assert ".report-sheet.report-export-capture" in css
assert "report-export-capture" in app

print('QC mobile compact UI check passed.')
