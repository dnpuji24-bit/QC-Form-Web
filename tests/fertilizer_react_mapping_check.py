from pathlib import Path
import re

root = Path(__file__).resolve().parents[1]
form = (root / 'src' / 'FertilizerForm.tsx').read_text(encoding='utf-8')
backend = (root / 'Code.gs').read_text(encoding='utf-8')
app = (root / 'src' / 'App.tsx').read_text(encoding='utf-8')
compact_app = ''.join(app.split())

required_form_tokens = [
    'FERTILIZER DAILY SESSION','sessionId','initialRecords','recordId','pengisianKe','jenisPupuk','statusHose','dosisAktual','pemerataanPupuk','downtimeList',
    "uploaded?'finalizeRecord':'syncRecord'",'num(f.jumlah)/num(f.hasilKerja)','Simpan Koreksi Uploaded','PhotoPicker','unit-tab-rail','activeCardId','Tambah Unit','HOLD • ISSUE / DOWNTIME'
]
for token in required_form_tokens:
    assert token in form, f'Missing Fertilizer form token: {token}'

for token in ["typeView='dashboard'|'spray'|'fertilizer'",'mandor_fertilizer','<FertilizerForm','sameFertilizerSession','editingFertilizerRecords','Edit Session','pendingSessionSize','Koreksi','RecordReport']:
    assert token in compact_app if token.startswith('typeView') else token in app, f'Missing Fertilizer session UI token: {token}'

match = re.search(r"FERT_HEADERS:\s*\[(.*?)\],\n\s*USER_HEADERS", backend, re.S)
assert match, 'FERT_HEADERS not found'
headers = re.findall(r"'([^']*)'", match.group(1))
assert len(headers) == 23, f'Expected 23 fertilizer columns, got {len(headers)}'
for token in ["p.jenisPupuk||rec.jenisPupuk","num_(p.dosis||rec.dosis)","p.statusHose||rec.statusHose","p.pengisianKe||rec.pengisianKe||i+1","num_(p.pemerataanPupuk||rec.pemerataanPupuk)","deleteById_(getSheet_(QC.SHEETS.FERT),rec.id,23,2)"]:
    assert token in backend, f'Missing backend per-filling/correction mapping: {token}'
print('Fertilizer unit-tabs/session/uploaded-correction check: OK')
