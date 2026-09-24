from pathlib import Path
import re

root = Path(__file__).resolve().parents[1]
form = (root / 'src' / 'FertilizerForm.tsx').read_text(encoding='utf-8')
backend = (root / 'Code.gs').read_text(encoding='utf-8')
app = (root / 'src' / 'App.tsx').read_text(encoding='utf-8')
compact_app = ''.join(app.split())

required_form_tokens = [
    'FERTILIZER DAILY SESSION','sessionId','initialRecords','recordId','pengisianKe','jenisPupuk','statusHose','dosisAktual','pemerataanPupuk','downtimeList',
    "uploaded?'finalizeRecord':'syncRecord'",'num(f.jumlah)/num(f.hasilKerja)','averageActualDosage','weightedActualDosage','Rata-rata Dosis Aktual','Dosis Total/Ha','Simpan Koreksi Uploaded','PhotoPicker','unit-tab-rail','activeCardId','Tambah Unit','HOLD • ISSUE / DOWNTIME','Clear Input','clearInput(','Form input sudah dibersihkan','!editing&&<button type="button" className="danger" onClick={()=>removeCard(card)}>Hapus Unit</button>'
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
assert 'Rata-rata Dosis Aktual' in app and 'Dosis Total/Ha' in app, 'Fertilizer report dosage validation summary missing'

offline = (root / 'src' / 'offline.ts').read_text(encoding='utf-8')
upload_status = (root / 'src' / 'UploadStatus.tsx').read_text(encoding='utf-8')
for token in ["retryQueuedRecord(recordOrId:QcRecord|string", "enqueueInternal('finalizeRecord',source)"]:
    assert token in offline, f'Missing stale upload recovery token: {token}'
for token in ['Upload terhenti','90_000']:
    assert token in upload_status, f'Missing stale upload UI token: {token}'
assert 'retryQueuedRecord(record,token)' in app
assert "uploadInfo.state==='failed'||uploadInfo.state==='queued'" in app
print('Fertilizer quick-fix check: unit removal, clear-after-draft, and stale upload recovery OK')
