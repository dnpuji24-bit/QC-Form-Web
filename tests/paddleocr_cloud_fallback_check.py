from pathlib import Path

root = Path(__file__).resolve().parents[1]
scanner = (root/'src'/'FertilizerReportScanner.tsx').read_text(encoding='utf-8')
client = (root/'src'/'paddleOcrClient.ts').read_text(encoding='utf-8')
service = (root/'services'/'paddleocr'/'app.py').read_text(encoding='utf-8')
docker = (root/'services'/'paddleocr'/'Dockerfile').read_text(encoding='utf-8')
env = (root/'.env.example').read_text(encoding='utf-8')

for token in [
    "scanWithPaddleOcr",
    "paddleOcrConfigured",
    "PaddleOCR membaca laporan",
    "beralih ke Gemini",
    "Scan Otomatis",
    "engine==='paddle'",
]:
    assert token in scanner, f'Missing PaddleOCR routing token: {token}'

for token in [
    "X-Firebase-AppCheck",
    "getToken(firebaseAppCheck,false)",
    "PADDLEOCR_TIMEOUT",
    "status===429",
    "status>=500",
]:
    assert token in client, f'Missing PaddleOCR fallback/client token: {token}'

for token in [
    "app_check.verify_token",
    "PADDLEOCR_ENABLED",
    "HTTPException(status_code=503",
    '@app.post("/ocr")',
    "PP-OCRv5",
]:
    assert token in service, f'Missing PaddleOCR Cloud Run service token: {token}'

assert "paddlepaddle==3.2.0" in docker
assert "paddleocr==3.5.0" in docker or "paddleocr==3.5.0" in (root/'services'/'paddleocr'/'requirements.txt').read_text(encoding='utf-8')
assert "VITE_PADDLEOCR_URL=" in env
assert "VITE_PADDLEOCR_TIMEOUT_MS=18000" in env

print('PaddleOCR Cloud fallback check passed: App Check protected OCR routes to Gemini on quota, timeout, 5xx or disabled service.')
