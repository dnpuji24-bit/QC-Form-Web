# 11C.2B.3b.1 — isolated real scanner UI and parser checkpoint

Operator screenshot at cf4644c confirms 13/13 actual Supabase UAT + Firebase emulator checks passed, scoped cleanup verified, exit 0. No change to production.

Actual FertilizerReportScanner.tsx and text parser mounted in isolated browser. Gemini response, Tesseract worker and correction feedback are explicit in-memory synthetic doubles. No live AI, OCR accuracy, Firebase, Supabase, learning persistence, production form integration or external network. Tests cover distinct NK/DAP quantities, decimal comma, review before explicit apply, correction and dose calculation, append/replace callback, OCR fallback, reparse, failure and cancellation, external request/CSP/DB isolation. Ten browser checks authored; execution pending.

Source review found two integration risks: FertilizerForm.applyScan sets session fields even when appending to existing cards; scan report file/raw text attached only to first unit. Scanner results may be incomplete and parser fuzzy matching/defaults can misidentify fields. Mixed material UI scalar summaries are not physical coverage. Existing production code unchanged; before operational wiring add form-level tests and guards for session changes, explicit DP/carryover, preserving user-reviewed materials, scan-photo association and failed reruns. Do not claim OCR accuracy or production readiness from this gate.

Run node scripts/test-qc-uat-fertilizer-scanner.mjs --self-test and --browser with existing isolated Playwright install. No emulator or secret key required.
