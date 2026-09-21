from pathlib import Path

root = Path(__file__).resolve().parents[1]
feedback = (root/'src'/'fertilizerScanFeedback.ts').read_text(encoding='utf-8')
scanner = (root/'src'/'FertilizerReportScanner.tsx').read_text(encoding='utf-8')
ai = (root/'src'/'fertilizerAiScan.ts').read_text(encoding='utf-8')
form = (root/'src'/'FertilizerForm.tsx').read_text(encoding='utf-8')
rules = (root/'firestore.rules').read_text(encoding='utf-8')

for token in [
    "fertilizer_scan_feedback",
    "original",
    "corrected",
    "changedFields",
    "changedFieldCount",
    "acceptedWithoutCorrection",
    "originalRawText",
    "serverTimestamp()",
    "where('inputtedBy','==',user.username)",
    "slice(0,4)",
]:
    assert token in feedback, f'Missing correction-learning store token: {token}'

for token in [
    "originalAiRef",
    "cloneFertilizerScanResult",
    "saveFertilizerScanFeedback",
    "Menyimpan Gemini Correction Learning",
    "learningFeedbackSaved",
    "learningChangedFields",
    "Koreksi akan masuk Gemini Correction Learning",
]:
    assert token in scanner, f'Missing correction-learning scanner token: {token}'

for token in [
    "loadFertilizerScanLearningExamples",
    "Contoh Correction Learning",
    "JANGAN menyalin nilai contoh",
    "learningExamples.length",
]:
    assert token in ai, f'Missing correction-learning prompt token: {token}'

assert "user={user}" in form
assert "Correction Learning menyimpan" in form

for token in [
    "match /fertilizer_scan_feedback/{feedbackId}",
    "resource.data.inputtedBy == username()",
    "request.resource.data.inputtedBy == username()",
    "request.resource.data.firebaseUid == request.auth.uid",
    "allow update, delete: if false",
]:
    assert token in rules, f'Missing correction-learning Firestore rule token: {token}'

assert "scanReportPhotoBase64" not in feedback
assert "photoBase64" not in feedback

print('Fertilizer correction learning check passed: reviewed Gemini output is stored immutably per user and reused as bounded few-shot context without storing images.')
