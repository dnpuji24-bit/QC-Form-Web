import io
import os
import threading
from typing import Any

import firebase_admin
import numpy as np
from fastapi import FastAPI, File, Header, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from firebase_admin import app_check, firestore
from PIL import Image, ImageOps
from paddleocr import PaddleOCR

SERVICE_VERSION = "1.0.0"
MAX_IMAGE_BYTES = int(os.getenv("MAX_IMAGE_BYTES", "12000000"))
OCR_ENABLED = os.getenv("PADDLEOCR_ENABLED", "true").lower() == "true"
OCR_LANG = os.getenv("PADDLEOCR_LANG", "en")
OCR_VERSION = os.getenv("PADDLEOCR_VERSION", "PP-OCRv5")
MONTHLY_REQUEST_LIMIT = int(os.getenv("MONTHLY_REQUEST_LIMIT", "0"))

try:
    firebase_admin.get_app()
except ValueError:
    firebase_admin.initialize_app()

app = FastAPI(title="QC PaddleOCR", version=SERVICE_VERSION)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "https://form-qc-unm.web.app",
        "https://form-qc-unm.firebaseapp.com",
    ],
    allow_origin_regex=r"https://form-qc-unm--react-test-[a-z0-9-]+\.web\.app",
    allow_credentials=False,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Content-Type", "X-Firebase-AppCheck"],
)

_ocr: PaddleOCR | None = None
_ocr_lock = threading.Lock()


def get_ocr() -> PaddleOCR:
    global _ocr
    if _ocr is None:
        with _ocr_lock:
            if _ocr is None:
                _ocr = PaddleOCR(
                    lang=OCR_LANG,
                    ocr_version=OCR_VERSION,
                    use_doc_orientation_classify=False,
                    use_doc_unwarping=False,
                    use_textline_orientation=False,
                )
    return _ocr


def verify_app_check(token: str | None) -> None:
    if not token:
        raise HTTPException(status_code=401, detail="APP_CHECK_REQUIRED")
    try:
        app_check.verify_token(token)
    except Exception as exc:
        raise HTTPException(status_code=401, detail="APP_CHECK_INVALID") from exc


def consume_monthly_quota() -> None:
    if MONTHLY_REQUEST_LIMIT <= 0:
        return

    from datetime import datetime, timezone

    month = datetime.now(timezone.utc).strftime("%Y-%m")
    db = firestore.client()
    ref = db.collection("system_usage").document("paddleocr_" + month)
    transaction = db.transaction()

    @firestore.transactional
    def increment(txn):
        snapshot = ref.get(transaction=txn)
        current = int(snapshot.get("count") or 0) if snapshot.exists else 0
        if current >= MONTHLY_REQUEST_LIMIT:
            return False
        txn.set(
            ref,
            {
                "count": current + 1,
                "limit": MONTHLY_REQUEST_LIMIT,
                "month": month,
                "updatedAt": firestore.SERVER_TIMESTAMP,
            },
            merge=True,
        )
        return True

    if not increment(transaction):
        raise HTTPException(status_code=429, detail="PADDLEOCR_MONTHLY_GUARD")


def result_payload(result: Any) -> dict[str, Any]:
    value = getattr(result, "json", None)
    if callable(value):
        value = value()
    if isinstance(value, dict):
        return value.get("res", value)
    return {}


@app.get("/health")
def health() -> dict[str, Any]:
    return {
        "ok": True,
        "service": "qc-paddleocr",
        "version": SERVICE_VERSION,
        "enabled": OCR_ENABLED,
        "modelLoaded": _ocr is not None,
        "ocrVersion": OCR_VERSION,
        "monthlyRequestLimit": MONTHLY_REQUEST_LIMIT,
    }


@app.post("/ocr")
async def ocr_image(
    file: UploadFile = File(...),
    x_firebase_appcheck: str | None = Header(default=None, alias="X-Firebase-AppCheck"),
) -> dict[str, Any]:
    if not OCR_ENABLED:
        raise HTTPException(status_code=503, detail="PADDLEOCR_DISABLED")
    verify_app_check(x_firebase_appcheck)
    consume_monthly_quota()

    raw = await file.read()
    if not raw:
        raise HTTPException(status_code=400, detail="EMPTY_IMAGE")
    if len(raw) > MAX_IMAGE_BYTES:
        raise HTTPException(status_code=413, detail="IMAGE_TOO_LARGE")
    if file.content_type and not file.content_type.startswith("image/"):
        raise HTTPException(status_code=415, detail="IMAGE_REQUIRED")

    try:
        image = Image.open(io.BytesIO(raw))
        image = ImageOps.exif_transpose(image).convert("RGB")
        image.thumbnail((2400, 2400))
        image_array = np.asarray(image)
    except Exception as exc:
        raise HTTPException(status_code=400, detail="IMAGE_DECODE_FAILED") from exc

    try:
        predictions = get_ocr().predict(image_array)
    except Exception as exc:
        raise HTTPException(status_code=503, detail="PADDLEOCR_INFERENCE_FAILED") from exc

    lines: list[dict[str, Any]] = []
    for prediction in predictions:
        payload = result_payload(prediction)
        texts = list(payload.get("rec_texts") or [])
        scores = list(payload.get("rec_scores") or [])
        boxes = payload.get("rec_boxes")
        for index, value in enumerate(texts):
            text = str(value or "").strip()
            if not text:
                continue
            score = float(scores[index]) if index < len(scores) else 0.0
            box = None
            if boxes is not None and index < len(boxes):
                try:
                    box = [int(v) for v in list(boxes[index])]
                except Exception:
                    box = None
            lines.append({"text": text, "score": round(score, 4), "box": box})

    if not lines:
        raise HTTPException(status_code=422, detail="NO_TEXT_DETECTED")

    plain_text = "\n".join(item["text"] for item in lines)
    confidence = round(sum(item["score"] for item in lines) / len(lines) * 100, 1)

    return {
        "ok": True,
        "engine": "paddleocr",
        "version": SERVICE_VERSION,
        "ocrVersion": OCR_VERSION,
        "confidence": confidence,
        "text": plain_text,
        "lines": lines,
    }
