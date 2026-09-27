from pathlib import Path

root=Path(__file__).resolve().parents[1]
spray=(root/'src'/'SprayForm.tsx').read_text(encoding='utf-8')
fert=(root/'src'/'FertilizerForm.tsx').read_text(encoding='utf-8')
css=(root/'src'/'field-ui.css').read_text(encoding='utf-8')

assert 'qc-form-shell qc-spray-form' in spray
assert 'qc-form-shell qc-fertilizer-form' in fert
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
]:
    assert token in css, f'Missing compact mobile QC style: {token}'

assert 'grid-template-columns:repeat(2,minmax(0,1fr))!important' in css
assert 'position:sticky' in css
print('QC mobile compact UI check passed.')
