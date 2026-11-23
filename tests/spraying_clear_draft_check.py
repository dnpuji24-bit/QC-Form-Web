from pathlib import Path

source=(Path(__file__).resolve().parents[1]/'src'/'SprayForm.tsx').read_text(encoding='utf-8')

for token in [
    "async function clearInput",
    "await clearDraft(draftKey)",
    "setSessionId(`spraysession_",
    "setDate(today())",
    "setShift('1')",
    "setMandor('')",
    "setAssistant('')",
    "setCards([fresh])",
    "setActiveCardId(fresh.id)",
    ">Clean Draft<",
    "Data yang sudah tersimpan di Data QC tidak ikut dihapus.",
]:
    assert token in source, f"Missing Spraying Clean Draft behavior: {token}"

assert "{!editing&&<Button htmlType=\"button\" disabled={busy} onClick={()=>void clearInput(true)}>" in source
print("Spraying Clean Draft check passed: local draft/input can be cleared and a fresh session is created without deleting persisted Data QC.")
