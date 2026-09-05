import base64
import binascii
import io
import os
import re
import threading
import time
from typing import Dict, List, Optional, Tuple

import cv2
import exifread
import numpy as np
from fastapi import FastAPI, Header, HTTPException
from pydantic import BaseModel, Field
from ultralytics import YOLO


APP_NAME = 'tipper-vision-classifier'
APP_VERSION = '1.0.0'

MODEL_PATH = os.getenv('VISION_YOLO_MODEL', 'yolov8n.pt')
CLASSIFIER_TOKEN = os.getenv('VISION_CLASSIFIER_TOKEN', '').strip()
MAX_IMAGE_BYTES = int(os.getenv('VISION_MAX_IMAGE_BYTES', str(12 * 1024 * 1024)))
CLAHE_CLIP_LIMIT = float(os.getenv('VISION_CLAHE_CLIP_LIMIT', '3.0'))
CLAHE_TILE_GRID = int(os.getenv('VISION_CLAHE_TILE_GRID', '8'))
RETURN_CLEANED_DEFAULT = os.getenv('VISION_RETURN_CLEANED', 'false').strip().lower() in {'1', 'true', 'yes'}

ALLOWED_MIME_PREFIX = 'image/'
DATA_URL_PATTERN = re.compile(r'^data:([^;]+);base64,(.+)$', re.IGNORECASE | re.DOTALL)

CATEGORY_PRESSURE = 'Pressure_Gauge'
CATEGORY_DASHBOARD = 'Dashboard_Cluster'
CATEGORY_TREAD = 'Tread_Depth_Gauge'
CATEGORY_CABIN = 'Cabin_Number'
CATEGORY_MISC = 'Miscellaneous'

PRESSURE_LABELS = {'clock', 'stop sign', 'gauge', 'speedometer', 'meter'}
DASHBOARD_LABELS = {'tv', 'laptop', 'cell phone', 'screen', 'monitor', 'keyboard'}
CABIN_LABELS = {'truck', 'car', 'bus', 'vehicle'}
TREAD_LABELS = {'ruler', 'wheel', 'tire'}


class ClassifyRequest(BaseModel):
    form_type: Optional[str] = Field(default='')
    step_id: Optional[str] = Field(default='')
    image: str
    return_cleaned: bool = False


class ClassifyResponse(BaseModel):
    photo_category: str
    category_confidence: float
    classifier_labels: List[str]
    classifier: str
    model: str
    exif_datetime_original: Optional[str] = None
    preprocess: Dict[str, object]
    timings_ms: Dict[str, int]
    cleaned_image: Optional[str] = None


class AppState:
    def __init__(self):
        self.model = None
        self.model_name = MODEL_PATH
        self.model_lock = threading.Lock()


state = AppState()
app = FastAPI(title=APP_NAME, version=APP_VERSION)


def _require_token(auth_header: Optional[str]) -> None:
    if not CLASSIFIER_TOKEN:
        return

    expected = f'Bearer {CLASSIFIER_TOKEN}'
    provided = (auth_header or '').strip()
    if provided != expected:
        raise HTTPException(status_code=401, detail='Unauthorized')


def _parse_data_url(data_url: str) -> Tuple[str, bytes]:
    raw = (data_url or '').strip()
    if not raw:
        raise HTTPException(status_code=400, detail='image is required')

    mime_type = 'image/jpeg'
    payload = raw

    match = DATA_URL_PATTERN.match(raw)
    if match:
        mime_type = (match.group(1) or '').strip().lower()
        payload = match.group(2) or ''

    if not mime_type.startswith(ALLOWED_MIME_PREFIX):
        raise HTTPException(status_code=400, detail='Only image payloads are supported')

    try:
        image_bytes = base64.b64decode(payload, validate=True)
    except (binascii.Error, ValueError):
        raise HTTPException(status_code=400, detail='Invalid base64 image payload')

    if not image_bytes:
        raise HTTPException(status_code=400, detail='Decoded image is empty')

    if len(image_bytes) > MAX_IMAGE_BYTES:
        raise HTTPException(
            status_code=413,
            detail=f'Image too large. Max bytes: {MAX_IMAGE_BYTES}'
        )

    return mime_type, image_bytes


def _decode_image(image_bytes: bytes) -> np.ndarray:
    array = np.frombuffer(image_bytes, dtype=np.uint8)
    image = cv2.imdecode(array, cv2.IMREAD_COLOR)
    if image is None:
        raise HTTPException(status_code=400, detail='Unable to decode image bytes')
    return image


def _extract_exif_datetime_original(image_bytes: bytes) -> Optional[str]:
    try:
        tags = exifread.process_file(io.BytesIO(image_bytes), stop_tag='EXIF DateTimeOriginal', details=False)
        value = tags.get('EXIF DateTimeOriginal')
        return str(value).strip() if value else None
    except Exception:
        return None


def _apply_clahe(image: np.ndarray) -> np.ndarray:
    lab = cv2.cvtColor(image, cv2.COLOR_BGR2LAB)
    l_channel, a_channel, b_channel = cv2.split(lab)

    tile = max(2, min(16, int(CLAHE_TILE_GRID)))
    clahe = cv2.createCLAHE(clipLimit=max(1.0, float(CLAHE_CLIP_LIMIT)), tileGridSize=(tile, tile))
    enhanced_l = clahe.apply(l_channel)

    merged = cv2.merge((enhanced_l, a_channel, b_channel))
    return cv2.cvtColor(merged, cv2.COLOR_LAB2BGR)


def _safe_float(value, default: float = 0.0) -> float:
    try:
        return float(value)
    except Exception:
        return default


def _normalize_text(text: str) -> str:
    return str(text or '').strip().lower()


def _step_bonus(form_type: str, step_id: str) -> Dict[str, float]:
    form = _normalize_text(form_type)
    step = _normalize_text(step_id)
    bonus = {
        CATEGORY_PRESSURE: 0.0,
        CATEGORY_DASHBOARD: 0.0,
        CATEGORY_TREAD: 0.0,
        CATEGORY_CABIN: 0.0,
        CATEGORY_MISC: 0.0
    }

    if form == 'pressure_check':
        bonus[CATEGORY_PRESSURE] += 0.9

    if any(key in step for key in ['pressure', 'psi', 'gauge']):
        bonus[CATEGORY_PRESSURE] += 0.55

    if any(key in step for key in ['odometer', 'dashboard', 'cluster']):
        bonus[CATEGORY_DASHBOARD] += 0.55

    if any(key in step for key in ['tread', 'rtd', 'depth']):
        bonus[CATEGORY_TREAD] += 0.55

    if any(key in step for key in ['truck', 'cabin', 'vehicle', 'position']):
        bonus[CATEGORY_CABIN] += 0.55

    return bonus


def _label_category_score(label: str, confidence: float) -> Dict[str, float]:
    normalized = _normalize_text(label)
    score = {
        CATEGORY_PRESSURE: 0.0,
        CATEGORY_DASHBOARD: 0.0,
        CATEGORY_TREAD: 0.0,
        CATEGORY_CABIN: 0.0,
        CATEGORY_MISC: 0.0
    }

    if normalized in PRESSURE_LABELS:
        score[CATEGORY_PRESSURE] += 0.6 + 0.4 * confidence
    if normalized in DASHBOARD_LABELS:
        score[CATEGORY_DASHBOARD] += 0.6 + 0.4 * confidence
    if normalized in TREAD_LABELS:
        score[CATEGORY_TREAD] += 0.6 + 0.4 * confidence
    if normalized in CABIN_LABELS:
        score[CATEGORY_CABIN] += 0.6 + 0.4 * confidence

    return score


def _merge_scores(base: Dict[str, float], incoming: Dict[str, float]) -> None:
    for key, value in incoming.items():
        base[key] = base.get(key, 0.0) + float(value)


def _confidence_from_score(score: float) -> float:
    if score <= 0:
        return 0.55
    conf = score / (score + 1.2)
    return max(0.55, min(0.99, round(conf, 4)))


def _classify_category(form_type: str, step_id: str, detections: List[Tuple[str, float]]) -> Tuple[str, float]:
    scores = {
        CATEGORY_PRESSURE: 0.0,
        CATEGORY_DASHBOARD: 0.0,
        CATEGORY_TREAD: 0.0,
        CATEGORY_CABIN: 0.0,
        CATEGORY_MISC: 0.1
    }

    _merge_scores(scores, _step_bonus(form_type, step_id))

    for label, confidence in detections:
        _merge_scores(scores, _label_category_score(label, confidence))

    best_category = max(scores.items(), key=lambda item: item[1])[0]
    best_score = scores[best_category]
    confidence = _confidence_from_score(best_score)

    if not detections and best_category == CATEGORY_MISC:
        confidence = 0.55

    return best_category, confidence


def _run_yolo(cleaned_image: np.ndarray) -> List[Tuple[str, float]]:
    if state.model is None:
        raise HTTPException(status_code=503, detail='YOLO model not initialized')

    detections: List[Tuple[str, float]] = []
    with state.model_lock:
        results = state.model(cleaned_image, verbose=False)

    for result in results:
        names = result.names if hasattr(result, 'names') else {}
        boxes = getattr(result, 'boxes', None)
        if boxes is None:
            continue

        for box in boxes:
            cls_value = box.cls[0] if hasattr(box.cls, '__len__') else box.cls
            conf_value = box.conf[0] if hasattr(box.conf, '__len__') else box.conf
            cls_id = int(_safe_float(cls_value, 0.0))
            confidence = max(0.0, min(1.0, _safe_float(conf_value, 0.0)))

            if isinstance(names, dict):
                label = str(names.get(cls_id, cls_id))
            elif isinstance(names, list) and 0 <= cls_id < len(names):
                label = str(names[cls_id])
            else:
                label = str(cls_id)

            detections.append((label, confidence))

    return detections


def _encode_cleaned_data_url(image: np.ndarray) -> Optional[str]:
    ok, encoded = cv2.imencode('.jpg', image, [int(cv2.IMWRITE_JPEG_QUALITY), 92])
    if not ok:
        return None
    payload = base64.b64encode(encoded.tobytes()).decode('ascii')
    return f'data:image/jpeg;base64,{payload}'


@app.on_event('startup')
def startup_event() -> None:
    state.model = YOLO(MODEL_PATH)


@app.get('/health')
def health() -> Dict[str, object]:
    return {
        'ok': state.model is not None,
        'service': APP_NAME,
        'version': APP_VERSION,
        'model': state.model_name,
        'token_required': bool(CLASSIFIER_TOKEN)
    }


@app.post('/classify', response_model=ClassifyResponse)
def classify(request: ClassifyRequest, authorization: Optional[str] = Header(default=None)) -> ClassifyResponse:
    _require_token(authorization)

    t0 = time.perf_counter()
    mime_type, image_bytes = _parse_data_url(request.image)
    exif_time = _extract_exif_datetime_original(image_bytes)

    decode_start = time.perf_counter()
    image = _decode_image(image_bytes)
    cleaned = _apply_clahe(image)
    preprocess_ms = int((time.perf_counter() - decode_start) * 1000)

    classify_start = time.perf_counter()
    detections = _run_yolo(cleaned)
    classify_ms = int((time.perf_counter() - classify_start) * 1000)

    sorted_labels = sorted(detections, key=lambda item: item[1], reverse=True)
    category, confidence = _classify_category(
        form_type=request.form_type or '',
        step_id=request.step_id or '',
        detections=sorted_labels
    )

    labels = []
    seen = set()
    for label, _ in sorted_labels:
        key = _normalize_text(label)
        if key in seen:
            continue
        seen.add(key)
        labels.append(label)
        if len(labels) >= 8:
            break

    cleaned_image = None
    if request.return_cleaned or RETURN_CLEANED_DEFAULT:
        cleaned_image = _encode_cleaned_data_url(cleaned)

    total_ms = int((time.perf_counter() - t0) * 1000)

    return ClassifyResponse(
        photo_category=category,
        category_confidence=confidence,
        classifier_labels=labels,
        classifier='yolo_clahe_router_v1',
        model=state.model_name,
        exif_datetime_original=exif_time,
        preprocess={
            'mode': 'clahe_lab_l',
            'clip_limit': CLAHE_CLIP_LIMIT,
            'tile_grid': CLAHE_TILE_GRID,
            'input_mime_type': mime_type,
            'input_size_bytes': len(image_bytes),
            'output_width': int(cleaned.shape[1]),
            'output_height': int(cleaned.shape[0])
        },
        timings_ms={
            'preprocess': preprocess_ms,
            'classify': classify_ms,
            'total': total_ms
        },
        cleaned_image=cleaned_image
    )


if __name__ == '__main__':
    import uvicorn

    uvicorn.run('app:app', host='0.0.0.0', port=8080, reload=False)
