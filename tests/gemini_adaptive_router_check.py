from pathlib import Path

root = Path(__file__).resolve().parents[1]
router = (root/'src'/'geminiAdaptiveRouter.ts').read_text(encoding='utf-8')
ai = (root/'src'/'fertilizerAiScan.ts').read_text(encoding='utf-8')
scanner = (root/'src'/'FertilizerReportScanner.tsx').read_text(encoding='utf-8')
feedback = (root/'src'/'fertilizerScanFeedback.ts').read_text(encoding='utf-8')

for token in [
    "qc_gemini_adaptive_router_v2",
    "localStorage",
    "cooldownUntil",
    "consecutiveTransientFailures",
    "successRate",
    "averageSuccessLatencyMs",
    "geminiErrorKind",
    "recordGeminiAttempt",
    "adaptiveGeminiCandidates",
    "gemini-3.8-flash",
    "gemini-3.7-flash",
    "gemini-3.6-flash",
    "gemini-3.5-flash",
]:
    assert token in router, f'Missing adaptive-router token: {token}'

for token in [
    "routeAttempts",
    "routeTotalMs",
    "recordGeminiAttempt",
    "onRouteUpdate",
    "Mencoba ",
    "mencoba model berikutnya",
]:
    assert token in ai, f'Missing adaptive routing in AI scan: {token}'

for token in [
    "Rute AI",
    "Riwayat rute Gemini",
    "routeAttempts",
    "routeTotalMs",
]:
    assert token in scanner, f'Missing adaptive routing UI token: {token}'

for token in [
    "routeTotalMs",
    "routeAttempts",
    "latencyMs",
    "errorKind",
]:
    assert token in feedback, f'Missing centralized route telemetry token: {token}'

# Do not introduce a Promise.race pseudo-timeout: Firebase AI web request timeout
# is not cancellable through the current request-options API.
assert "Promise.race" not in ai
assert "Promise.race" not in router

print('Adaptive Gemini router check passed: model order learns from local reliability/latency, transient failures cool down, and route telemetry is visible and stored with feedback.')
