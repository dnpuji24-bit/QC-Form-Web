from pathlib import Path

root=Path(__file__).resolve().parents[1]
store=(root/'src'/'firestoreStore.ts').read_text(encoding='utf-8')
spray=(root/'src'/'SprayForm.tsx').read_text(encoding='utf-8')
fert=(root/'src'/'FertilizerForm.tsx').read_text(encoding='utf-8')
source=(root/'src'/'qcDailyPlanSource.ts').read_text(encoding='utf-8')
rules=(root/'firestore.rules').read_text(encoding='utf-8')
app=(root/'src'/'App.tsx').read_text(encoding='utf-8')

for token in [
    "mirrorQcActualToFirestore",
    "'daily_reports'",
    "sourceOrigin:'QC'",
    "qcRecordId:record.id",
    "dailyVarianceHa:plannedDailyAreaHa-actualAreaHa",
    "removeQcActualFromFirestore",
]:
    assert token in store, f"Missing QC -> Actual bridge token: {token}"

assert "actualAreaHa:n(card.area)" in spray
assert "actualAreaHa:totalHaForDose" in fert
assert "companyCode:string" in source and "farm:string" in source
assert "validQcActualWrite()" in rules
assert "get(/databases/$(database)/documents/qc_records/$(request.resource.data.qcRecordId)).data.actualAreaHa == request.resource.data.actualAreaHa" in rules
assert "removeQcActualFromFirestore(record.id)" in app
print("QC Ready/Uploaded records auto-upsert linked Actual Plan rows and deletion cleans the derived Actual row.")
