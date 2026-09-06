from pathlib import Path
import re

root = Path(__file__).resolve().parents[1]
form = (root / 'src' / 'FertilizerForm.tsx').read_text(encoding='utf-8')
backend = (root / 'Code.gs').read_text(encoding='utf-8')
app = (root / 'src' / 'App.tsx').read_text(encoding='utf-8')

required_form_tokens = [
    "FERTILIZER DAILY SESSION",
    "UNIT CARD",
    "sessionId",
    "initialRecords",
    "recordId",
    "pengisianKe",
    "jenisPupuk",
    "statusHose",
    "dosisAktual",
    "pemerataanPupuk",
    "downtimeList",
    "sendOrQueue(token, 'syncRecord'",
    "num(f.jumlah) / num(f.hasilKerja)",
]
for token in required_form_tokens:
    assert token in form, f'Missing Fertilizer form token: {token}'

required_app_tokens = [
    "type View = 'dashboard' | 'spray' | 'fertilizer'",
    "mandor_fertilizer",
    "<FertilizerForm",
    "sameFertilizerSession",
    "editingFertilizerRecords",
    "Edit Session",
    "Upload ${size} Unit",
]
for token in required_app_tokens:
    assert token in app, f'Missing Fertilizer session UI token: {token}'

match = re.search(r"FERT_HEADERS:\s*\[(.*?)\],\n\s*USER_HEADERS", backend, re.S)
assert match, 'FERT_HEADERS not found'
headers = re.findall(r"'([^']*)'", match.group(1))
assert len(headers) == 23, f'Expected 23 fertilizer columns, got {len(headers)}'

required_backend_tokens = [
    "p.jenisPupuk||rec.jenisPupuk",
    "num_(p.dosis||rec.dosis)",
    "p.statusHose||rec.statusHose",
    "p.pengisianKe||rec.pengisianKe||i+1",
    "num_(p.pemerataanPupuk||rec.pemerataanPupuk)",
]
for token in required_backend_tokens:
    assert token in backend, f'Missing backend per-filling mapping: {token}'

print('Fertilizer React mapping/session check: OK')
