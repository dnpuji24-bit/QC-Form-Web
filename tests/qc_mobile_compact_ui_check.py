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
print('QC mobile compact UI check passed.')
