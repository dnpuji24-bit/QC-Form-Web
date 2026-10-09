from pathlib import Path

root = Path(__file__).resolve().parents[1]
ai = (root/'src'/'fertilizerAiScan.ts').read_text(encoding='utf-8')
scanner = (root/'src'/'FertilizerReportScanner.tsx').read_text(encoding='utf-8')
feedback = (root/'src'/'fertilizerScanFeedback.ts').read_text(encoding='utf-8')

for token in [
    "getTemplateGenerativeModel",
    "fertilizer-scan-v1-3-8",
    "templateInputs",
    "mimeType:file.type||'image/jpeg'",
    "imageData:image.inlineData.data",
    "defaultsJson:JSON.stringify(defaults)",
    "masterContextJson:JSON.stringify(masterContext)",
    "learningExamplesJson",
    "via:templateId?'template':'direct'",
    "sourceTemplateId",
]:
    assert token in ai, f'Missing Firebase Server Prompt Template integration token: {token}'

for token in [
    "sourceTemplateId",
    "Template",
    "attempt.via==='template'",
]:
    assert token in scanner, f'Missing Server Prompt Template scanner UI token: {token}'

for token in [
    "templateId:text(attempt.templateId)",
    "via:text(attempt.via)",
]:
    assert token in feedback, f'Missing Server Prompt Template telemetry token: {token}'

for token in [
    "'gemini-3.8-flash':'fertilizer-scan-v1-3-8'",
    "'gemini-3.7-flash':'fertilizer-scan-v1-3-7'",
    "'gemini-3.6-flash':'fertilizer-scan-v1-3-6'",
    "'gemini-3.5-flash':'fertilizer-scan-v1-3-5'",
    "return['gemini-3.8-flash',...adaptive]",
    "errorDetail",
    "m=s.match(/^(\\d{2})-(\\d{2})-(20\\d{2})$/)",
]:
    assert token in ai, f'Missing multi-template/date token: {token}'

print('Firebase Server Prompt Template check passed: all four Gemini models use locked server templates and DD-MM-YYYY is normalized for the form.')
