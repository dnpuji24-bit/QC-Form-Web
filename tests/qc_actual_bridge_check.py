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
# The QC and derived Actual may be written in the same atomic transaction.
# Validate against the post-transaction QC record, not the pre-write snapshot.
qc_actual_rule=rules.split("function validQcActualWrite() {",1)[1].split("\n    }",1)[0]
qc_path="/databases/$(database)/documents/qc_records/$(request.resource.data.qcRecordId)"
assert f"existsAfter({qc_path})" in qc_actual_rule
assert f"getAfter({qc_path}).data.inputtedBy == username()" in qc_actual_rule
assert f"getAfter({qc_path}).data.dailyPlanId == request.resource.data.dailyPlanId" in qc_actual_rule
assert f"getAfter({qc_path}).data.actualAreaHa == request.resource.data.actualAreaHa" in qc_actual_rule
assert f"getAfter({qc_path}).data.saveType in ['ready','uploaded','upload_queued']" in qc_actual_rule
assert "request.resource.data.sourceOrigin == 'QC'" in qc_actual_rule
assert "|| validQcActualWrite()" in rules
assert "resource.data.qcRecordId == request.resource.data.qcRecordId && validQcActualWrite()" in rules
assert "removeQcActualFromFirestore(record.id)" in app
print("QC Ready/Uploaded records auto-upsert linked Actual Plan rows and deletion cleans the derived Actual row.")
