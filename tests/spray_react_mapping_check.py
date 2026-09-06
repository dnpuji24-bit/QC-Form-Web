from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
code = (ROOT / 'Code.gs').read_text(encoding='utf-8')
spray = (ROOT / 'src' / 'SprayForm.tsx').read_text(encoding='utf-8')

headers_marker = "SPRAY_HEADERS: ["
start = code.index(headers_marker) + len(headers_marker)
end = code.index("],\n  FERT_HEADERS", start)
headers = [x.strip().strip("'") for x in code[start:end].split(',')]
assert len(headers) == 52, f'Expected 52 Spray headers, found {len(headers)}'

required_keys = [
    'date','startTime','endTime','shift','status','name','nameOfAssistan','paddock','variety','area',
    'unit','noUnit','dropper','dropletSize','nozzle','height','rowSpacing','speed','type','activity','deskripsi',
    'pesticide1','dosage1','pesticide2','dosage2','pesticide3','dosage3','pesticide4','dosage4',
    'adjuvant','adjuvantDosage','estUsagePesticide1','estUsagePesticide2','estUsagePesticide3','estUsagePesticide4',
    'estUsageAdjuvant','actUsagePesticide1','actUsagePesticide2','actUsagePesticide3','actUsagePesticide4',
    'actUsageAdjuvant','waterRate','waterQuality','actualUsage','windSpeed','temperature','humidity','deltaT',
    'weatherCondition','noted','photoBase64','id'
]
assert len(required_keys) == 52

for key in required_keys:
    assert key in spray, f'Missing React Spray mapping key: {key}'

assert "n(item.dosage) * n(form.area)" in spray, 'Estimated pesticide formula missing'
assert "n(form.adjuvantDosage) * n(form.waterRate) * n(form.area)" in spray, 'Estimated adjuvant formula missing'
assert "area: ''" in spray, 'Actual area field should start blank/manual'
assert "p.area" not in spray and "luas_target" not in spray, 'Plan area must not populate actual area'
assert "sendOrQueue(token, 'syncRecord'" in spray, 'Offline sync path missing'
assert "photoBase64" in spray and "holdIntervals" in spray, 'Photo/HOLD payload missing'

print('Spray React mapping check passed: 52 columns, formulas, manual area, photo and offline paths verified.')
