from pathlib import Path

root=Path(__file__).resolve().parents[1]
store=(root/'src'/'firestoreStore.ts').read_text(encoding='utf-8')
realtime=(root/'src'/'firestoreRealtime.ts').read_text(encoding='utf-8')
photo=(root/'src'/'reportPhoto.ts').read_text(encoding='utf-8')
field=(root/'src'/'field-ui.css').read_text(encoding='utf-8')
types=(root/'src'/'types.ts').read_text(encoding='utf-8')

for token in ['photoPreviewBase64','makeReportPhotoPreview','clean.photoBase64=\'\'']:
    assert token in store, f'Missing Firestore report preview token: {token}'
for token in ['hydrateReportPhotoPreviews','photoPreviewBase64']:
    assert token in photo, f'Missing report photo hydration token: {token}'
assert 'hydrateReportPhotoPreviews' in realtime
assert 'photoPreviewBase64?: string' in types
for token in ['width:820px!important','grid-template-columns:repeat(2,minmax(0,1fr))!important','flex-direction:row!important']:
    assert token in field, f'Missing fixed desktop report export layout: {token}'


app=(root/'src'/'App.tsx').read_text(encoding='utf-8')
assert "el.classList.add('report-export-capture')" in app
assert "el.classList.remove('report-export-capture')" in app
assert 'Cetak / PDF' in app
assert 'report-close-button' in app
assert 'report-toolbar-actions' in app
assert 'Mobile report preview: keep original two-column report geometry, only tune readability' in field
assert '.report-dialog .report-sheet:not(.report-export-capture)' in field
assert '.report-dialog .report-sheet.report-export-capture' in field
assert 'z-index:12000!important' in field
assert 'QC report desktop toolbar visibility guard' in field
assert '.report-backdrop{z-index:16000!important}' in field
assert 'position:sticky!important' in field
assert '.report-toolbar .report-close-button' in field
assert '.report-dialog .report-sheet:not(.report-export-capture) .report-grid' in field
assert 'grid-template-columns:repeat(2,minmax(0,1fr))!important' in field
assert 'table-layout:fixed!important' in field
assert 'max-height:none!important' in field

print('Report photo preview and desktop-consistent mobile export checks: OK')
