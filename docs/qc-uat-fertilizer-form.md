# 11C.2B.1 — actual FertilizerForm mapping and carryover candidate

Operator screenshot at 33cf87e confirms all 12 Spray preview/export browser checks passed, seven local JS/CSS files, no external network/WebSocket/CSP violations. PDF page visual review and actual signed URL HTTP hook remain pending.

FertilizerForm uses strict own date/shift/foreman and explicit same-date Shift 1 sources for Shift 2, unique source ID, no automatic relink on scan/draft restore. Source changes reseed planned product and dose, preserve entered quantity/area for review. Existing product helper and filling totals unchanged. Session changes invalidate link; ready and server draft require valid source, local draft retained. Uploaded correction may not silently change source/date/shift/foreman. Over-actual allowed; no verified balance filter. Scanned rows require manual linking; OCR/scanner disabled in lab. Mixed-material same-area filling aggregation needs separate review. Seven isolated browser scenarios authored, not executed. No production writes or deployment. Full DTO server, photo, finalization, scanner and report/export remain pending.

Run node scripts/test-qc-uat-fertilizer-form.mjs --self-test / --browser with QC_UAT_PLAYWRIGHT_DIR set.
