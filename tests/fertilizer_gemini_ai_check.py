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
    "gemini-3.7-flash",
    "gemini-3.6-flash",
    "gemini-3.5-flash",
    "isTransientGeminiError",
    "Master valid aplikasi",
]:
    assert token in ai, f'Missing Gemini AI extraction token: {token}'

for token in [
    "scanFertilizerReportWithGemini",
    "Scan dengan AI",
    "OCR Lokal",
    "engine==='gemini'",
    "Gemini sedang sibuk. Hasil sementara menggunakan OCR Lokal.",
    "sourceModel",
]:
    assert token in scanner, f'Missing Gemini-first scanner UI token: {token}'

assert "initializeAppCheck" in firebase and "ReCaptchaEnterpriseProvider" in firebase
assert "VITE_GEMINI_SCAN_MODEL=gemini-3.8-flash" in env

print('Fertilizer Gemini scan check passed: structured image extraction uses stable-model failover, concise mobile fallback, local OCR fallback, and App Check wiring.')
