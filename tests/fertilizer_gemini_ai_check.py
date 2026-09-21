from pathlib import Path

root = Path(__file__).resolve().parents[1]
ai = (root/'src'/'fertilizerAiScan.ts').read_text(encoding='utf-8')
scanner = (root/'src'/'FertilizerReportScanner.tsx').read_text(encoding='utf-8')
firebase = (root/'src'/'firebase.ts').read_text(encoding='utf-8')
env = (root/'.env.example').read_text(encoding='utf-8')

for token in [
    "getAI",
    "getGenerativeModel",
    "GoogleAIBackend",
    "Schema.object",
    "responseMimeType:'application/json'",
    "scanFertilizerReportWithGemini",
    "gemini-3.8-flash",
    "Master valid aplikasi",
]:
    assert token in ai, f'Missing Gemini AI extraction token: {token}'

for token in [
    "scanFertilizerReportWithGemini",
    "Scan dengan AI",
    "OCR Lokal",
    "Gemini AI tidak tersedia",
    "engine==='gemini'",
]:
    assert token in scanner, f'Missing Gemini-first scanner UI token: {token}'

assert "initializeAppCheck" in firebase and "ReCaptchaEnterpriseProvider" in firebase
assert "VITE_GEMINI_SCAN_MODEL=gemini-3.8-flash" in env

print('Fertilizer Gemini scan check passed: Firebase AI Logic structured image extraction is primary with local OCR fallback and App Check wiring.')
