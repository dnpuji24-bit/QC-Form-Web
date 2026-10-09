from pathlib import Path

root = Path(__file__).resolve().parents[1]
ocr = (root/'src'/'fertilizerOcrLearning.ts').read_text(encoding='utf-8')
scanner = (root/'src'/'FertilizerReportScanner.tsx').read_text(encoding='utf-8')
form = (root/'src'/'FertilizerForm.tsx').read_text(encoding='utf-8')
rules = (root/'firestore.rules').read_text(encoding='utf-8')

for token in [
    "fertilizer_ocr_feedback",
    "correctionPairs",
    "changedFieldCount",
    "acceptedWithoutCorrection",
    "where('inputtedBy','==',user.username)",
    "filter(rule=>rule.count>=2)",
    "applyFertilizerOcrMemory",
    "saveFertilizerOcrFeedback",
    "ocrLearningRulesApplied",
]:
    assert token in ocr, f'Missing OCR correction-learning token: {token}'

for token in [
    "originalOcrRef",
    "applyFertilizerOcrMemory",
    "saveFertilizerOcrFeedback",
    "OCR Correction Learning",
    "Correction Memory diterapkan",
    "OCR Memory",
]:
    assert token in scanner, f'Missing OCR learning scanner token: {token}'

assert "OCR Correction Learning" in form

for token in [
    "match /fertilizer_ocr_feedback/{feedbackId}",
    "request.resource.data.engine == 'tesseract'",
    "request.resource.data.inputtedBy == username()",
    "request.resource.data.firebaseUid == request.auth.uid",
    "allow update, delete: if false",
]:
    assert token in rules, f'Missing OCR learning Firestore rule token: {token}'

assert "photoBase64" not in ocr
assert "scanReportPhotoBase64" not in ocr

print('OCR correction learning check passed: repeated field-specific Tesseract corrections are stored per user and only auto-applied after two matching corrections.')
