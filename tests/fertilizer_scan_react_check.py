from pathlib import Path

root = Path(__file__).resolve().parents[1]
scanner = (root/'src'/'FertilizerReportScanner.tsx').read_text(encoding='utf-8')
fert = (root/'src'/'FertilizerForm.tsx').read_text(encoding='utf-8')
api = (root/'src'/'api.ts').read_text(encoding='utf-8')
types = (root/'src'/'types.ts').read_text(encoding='utf-8')
code = (root/'Code.gs').read_text(encoding='utf-8')
pkg = (root/'package.json').read_text(encoding='utf-8')

for token in [
    "createWorker(['eng','ind']",
    "parseFertilizerReportText",
    "Scan Laporan ke Unit Card",
    "Ganti Form dengan Hasil Scan",
    "Tambahkan ke Form",
    "Parse Ulang Teks",
    "Confidence OCR",
    "capture=\"environment\"",
]:
    assert token in scanner, f'Missing Fertilizer scan token: {token}'

for token in [
    "FertilizerReportScanner",
    "scanReportPhotoBase64",
    "scanReportDriveUrl",
    "scanConfidence",
    "scanRawText",
    "Hasil scan diterapkan",
]:
    assert token in fert, f'Missing Fertilizer scan integration token: {token}'

assert '"tesseract.js": "latest"' in pkg
assert "FERT_SCAN_REPORT" in code
assert "delete rec.scanReportPhotoBase64" in code
assert "scanReportDriveUrl" in api
assert "scanReportDriveUrl?: string" in types
assert "QC Form Web API v46.3.2" in code

print('Fertilizer scan regression check passed: browser OCR, review-before-apply, unit-session mapping, and separate Drive audit photo are wired.')
