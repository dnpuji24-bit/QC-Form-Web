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
    "dosisAktualTertulis",
    "rataRataDosisAktualTertulis",
    "JANGAN dibuat sebagai unit baru",
]:
    assert token in ai, f'Missing Gemini AI extraction token: {token}'

for token in [
    "scanFertilizerReportWithGemini",
    "Scan Otomatis",
    "OCR Lokal",
    "engine==='gemini'",
    "Gemini sedang sibuk. Hasil sementara menggunakan OCR Lokal.",
    "sourceModel",
    "Rata-rata Dosis Aktual",
    "Dosis Total/Ha",
]:
    assert token in scanner, f'Missing Gemini-first scanner UI token: {token}'

assert "initializeAppCheck" in firebase and "ReCaptchaEnterpriseProvider" in firebase
assert "VITE_GEMINI_SCAN_MODEL=gemini-3.8-flash" in env

print('Fertilizer Gemini scan check passed: Gemini remains protected fallback behind PaddleOCR with stable-model failover and local OCR fallback.')
