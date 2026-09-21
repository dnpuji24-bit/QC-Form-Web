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

# Only 3.8 is migrated initially; direct model fallback remains available for
# 3.7/3.6/3.5 until their templates are created and verified.
assert "'gemini-3.8-flash':'fertilizer-scan-v1-3-8'" in ai
assert "return['gemini-3.8-flash',...adaptive]" in ai
assert "errorDetail" in ai
assert "getGenerativeModel" in ai

print('Firebase Server Prompt Template check passed: Gemini 3.8 uses fertilizer-scan-v1-3-8 while lower models remain direct fallbacks.')
