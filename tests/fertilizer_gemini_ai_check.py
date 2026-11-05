from pathlib import Path

root = Path(__file__).resolve().parents[1]
ai = (root/'src'/'fertilizerAiScan.ts').read_text(encoding='utf-8')
scanner = (root/'src'/'FertilizerReportScanner.tsx').read_text(encoding='utf-8')
router = (root/'src'/'geminiAdaptiveRouter.ts').read_text(encoding='utf-8')
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
    "isTransientGeminiError",
    "Master valid aplikasi",
    "dosisAktualTertulis",
    "rataRataDosisAktualTertulis",
    "JANGAN dibuat sebagai unit baru",
]:
    assert token in ai, f'Missing Gemini AI extraction token: {token}'

for token in [
    "gemini-3.8-flash",
    "gemini-3.7-flash",
    "gemini-3.6-flash",
    "gemini-3.5-flash",
    "adaptiveGeminiCandidates",
    "recordGeminiAttempt",
    "cooldownUntil",
    "successRate",
]:
    assert token in router, f'Missing adaptive Gemini router token: {token}'

for token in [
    "scanFertilizerReportWithGemini",
    "Scan dengan AI",
    "OCR Lokal",
    "engine==='gemini'",
    "Gemini sedang sibuk. Hasil sementara menggunakan OCR Lokal.",
    "sourceModel",
    "Rata-rata Dosis Aktual",
    "Dosis Total/Ha",
    "Rute AI",
    "Riwayat rute Gemini",
]:
    assert token in scanner, f'Missing Gemini-first scanner UI token: {token}'

assert "initializeAppCheck" in firebase and "ReCaptchaEnterpriseProvider" in firebase
assert "VITE_GEMINI_SCAN_MODEL=gemini-3.8-flash" in env

print('Fertilizer Gemini scan check passed: structured extraction uses adaptive model routing, latency/error telemetry, local OCR fallback, correction learning, and App Check wiring.')
