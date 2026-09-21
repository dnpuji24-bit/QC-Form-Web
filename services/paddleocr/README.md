# QC PaddleOCR Cloud Run service

Self-hosted PaddleOCR endpoint for QC Form Web. PaddleOCR itself needs no account
or API key. Production access is protected with Firebase App Check.

## Endpoints

- GET /health — service health, no image processing
- POST /ocr — multipart image field named file; requires X-Firebase-AppCheck

## Cloud Run profile

Start with request-based billing, min instances 0, max instances 1, 2 vCPU,
4 GiB memory, concurrency 1 and 60 second timeout. If the service becomes
unavailable, quota-limited or is paused by a Cloud Billing spend cap, the React
client automatically falls back to Gemini AI.

## Local development

The production /ocr endpoint requires a real Firebase App Check token. For a
full local integration test, use the web app's App Check debug provider rather
than disabling verification in production.


## Cost guard

Set MONTHLY_REQUEST_LIMIT to a conservative monthly request ceiling after the
benchmark. A value of 0 disables the application-level guard. When the ceiling
is reached the service returns HTTP 429 (PADDLEOCR_MONTHLY_GUARD), and the React
scanner automatically routes the same image to Gemini.

This guard complements Cloud Billing spend caps. It is intentionally not called
an exact Cloud Run free-tier meter because Cloud Run free usage is based on
compute/memory/request consumption, not only request count.
