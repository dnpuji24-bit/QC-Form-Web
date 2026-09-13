from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
code = (ROOT / 'Code.gs').read_text(encoding='utf-8')
spray = (ROOT / 'src' / 'SprayForm.tsx').read_text(encoding='utf-8')

headers_marker = "SPRAY_HEADERS: ["
start = code.index(headers_marker) + len(headers_marker)
end = code.index("],\n  FERT_HEADERS", start)
headers = [x.strip().strip("'") for x in code[start:end].split(',')]
assert len(headers) == 52, f'Expected 52 Spray headers, found {len(headers)}'

required_static_keys = [
    'date','startTime','endTime','shift','status','name','nameOfAssistan','paddock','variety','area',
    'unit','noUnit','dropper','dropletSize','nozzle','height','rowSpacing','speed','type','activity','deskripsi',
    'adjuvant','adjuvantDosage','estUsageAdjuvant','actUsageAdjuvant','waterRate','waterQuality','actualUsage',
    'windSpeed','temperature','humidity','deltaT','weatherCondition','noted','photoBase64','id'
]
for key in required_static_keys:
    assert key in spray, f'Missing React Spray mapping key: {key}'

for token in [
    "record[`pesticide${i+1}`]",
    "record[`dosage${i+1}`]",
    "record[`estUsagePesticide${i+1}`]",
    "record[`actUsagePesticide${i+1}`]",
]:
    assert token in spray, f'Missing dynamic pesticide mapping: {token}'

assert "for(let i=0;i<4;i++)" in spray, 'Expected four pesticide slots'
assert "n(item.dosage)*n(form.area)" in spray, 'Estimated pesticide formula missing'
assert "n(form.adjuvantDosage)*n(form.waterRate)*n(form.area)" in spray, 'Estimated adjuvant formula missing'
assert "area:''" in spray, 'Actual area field should start blank/manual'
assert "p.area" not in spray and "luas_target" not in spray, 'Plan area must not populate actual area'
assert "editingUploaded?'finalizeRecord':'syncRecord'" in spray, 'Draft/uploaded correction action path missing'
assert "Simpan Koreksi Uploaded" in spray, 'Uploaded correction UI missing'
assert "PhotoPicker" in spray and "capture" not in spray, 'Shared camera/gallery photo picker integration missing'
assert "photoBase64" in spray and "holdIntervals" in spray, 'Photo/HOLD payload missing'
assert "deleteById_(spraySheet,rec.id,52" in code, 'Backend stale Spray/HOLD row replacement missing'

print('Spray React mapping check passed: 52 backend columns, pesticide formulas, manual area, photos, offline and uploaded correction paths verified.')
