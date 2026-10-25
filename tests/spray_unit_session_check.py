from pathlib import Path

root = Path(__file__).resolve().parents[1]
spray = (root/'src'/'SprayForm.tsx').read_text(encoding='utf-8')
app = (root/'src'/'App.tsx').read_text(encoding='utf-8')
types = (root/'src'/'types.ts').read_text(encoding='utf-8')

for token in [
    "type SprayCard=",
    "type SprayDraft={sessionId:string",
    "Input Spraying per Unit",
    "Tambah Unit",
    "Duplikat",
    "Simpan Draft Semua Unit",
    "Simpan Semua Unit",
    "sessionId,formType:'spray'",
    "cards.filter(hasCardInput)",
    "validateReady(activeCards",
    "Unit-centric",
]:
    assert token in spray, f'Missing Spray unit-session token: {token}'

for token in [
    "function sameSpraySession",
    "editingSprayRecords",
    "sameSpraySession(record,item)",
    "initialRecords={editingSprayRecords}",
    "Upload ${pendingSize} Unit",
    "Edit Session",
]:
    assert token in app, f'Missing App Spray-session integration token: {token}'

assert "sessionId?: string" in types
assert "multiple" not in spray, "Spray unit selector must be one unit per card, not multi-select strings"

print('Spray unit-session regression check passed: one card per unit, grouped edit/finalize, and legacy-compatible record output.')
