from pathlib import Path
import json
import re

root = Path(__file__).resolve().parents[1]
def read(path):
    return (root / path).read_text(encoding='utf-8')

retired = ['FertilizerReportScanner', 'fertilizerAiScan', 'fertilizerOcrLearning', 'fertilizerScanFeedback', 'geminiAdaptiveRouter']
for name in retired:
    assert not any((root/'src').glob(name+'.*')), name
for path in (root/'src').rglob('*'):
    if path.suffix in {'.ts','.tsx','.mjs','.js'}:
        source = path.read_text(encoding='utf-8')
        for name in retired + ['tesseract.js']:
            assert not re.search(r"""['"][^'"\n]*"""+re.escape(name)+r"""(?:\.[\w]+)?['"]""",source), (path,name)
pkg=json.loads(read('package.json'))
assert 'tesseract.js' not in pkg['dependencies']
form=read('src/FertilizerForm.tsx')
for token in ['scannerOpen','applyScan','Scan Laporan']:
    assert token not in form, token
for token in ['scanReportFile','scanReportDriveUrl','scanReportPhotoBase64','scanConfidence','scanRawText','scanSourceFileName','scanAppliedAt','legacyScanPhotoBase64','queueFormSession(operationalItems)','qcShiftOneCarryoverCandidates']:
    assert token in form, token
assert 'scanAppliedAt:text(record.scanAppliedAt)' in form
assert 'scanReportFile:undefined,scanReportDriveUrl:undefined' in form
assert 'scanReportPhotoBase64:card.scanReportFile?' in form
assert 'scanReportDriveUrl' in read('src/types.ts')
assert 'scanReportDriveUrl' in read('src/api.ts')
assert 'privatePhotos.photos.scan' in read('src/App.tsx')
assert 'FERT_SCAN_REPORT' in read('Code.gs')
assert "add('scan',record.scanReportPhotoBase64,removeScan)" in read('src/qcFormSaveIntent.mjs')
assert not (root/'scripts/test-qc-uat-fertilizer-scanner.mjs').exists()
assert 'VITE_GEMINI_SCAN_MODEL' not in read('.env.example')
assert 'initializeAppCheck' in read('src/firebase.ts')
print('SUCCESS: active Fertilizer scanner retired; historical scan and manual form source guards passed')
