"""Stateless face localization only. No embeddings, identity inference, or storage."""
import io
import os
import secrets
import warnings

import cv2
import numpy as np
from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import JSONResponse
from PIL import Image, ImageOps, UnidentifiedImageError

MAX_BYTES = 4_000_000
MAX_PIXELS = 16_000_000
Image.MAX_IMAGE_PIXELS = MAX_PIXELS
cv2.setNumThreads(1)
DETECTOR = cv2.CascadeClassifier(cv2.data.haarcascades + 'haarcascade_frontalface_default.xml')
if DETECTOR.empty():
    raise RuntimeError('Face detector could not be loaded')

app = FastAPI(title='Pinfaces face detection', docs_url=None, redoc_url=None, openapi_url=None)

@app.middleware('http')
async def privacy_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers['Cache-Control'] = 'no-store'
    response.headers['X-Content-Type-Options'] = 'nosniff'
    return response

@app.get('/health')
def health():
    return {'status': 'ok', 'model': 'OpenCV frontal-face Haar cascade', 'identity_matching': False, 'retains_images': False}

@app.post('/detect')
async def detect(request: Request):
    key = os.environ.get('DETECTION_API_KEY', '')
    if key and not secrets.compare_digest(request.headers.get('x-api-key', ''), key):
        raise HTTPException(401, 'Unauthorized detection request.')
    if request.headers.get('content-type', '').split(';')[0] not in {'image/jpeg', 'image/png', 'image/webp'}:
        raise HTTPException(415, 'Use a JPEG, PNG, or WebP image.')
    data = bytearray()
    async for chunk in request.stream():
        data.extend(chunk)
        if len(data) > MAX_BYTES:
            raise HTTPException(413, 'Image exceeds the 4 MB limit.')
    if not data:
        raise HTTPException(400, 'The image is empty.')
    try:
        with warnings.catch_warnings():
            warnings.simplefilter('error', Image.DecompressionBombWarning)
            with Image.open(io.BytesIO(data)) as original:
                if original.format not in {'JPEG', 'PNG', 'WEBP'}:
                    raise HTTPException(415, 'Unsupported image encoding.')
                if original.width * original.height > MAX_PIXELS:
                    raise HTTPException(413, 'Image exceeds the 16 megapixel limit.')
                if getattr(original, 'n_frames', 1) > 1:
                    raise HTTPException(415, 'Animated images are not supported.')
                image = ImageOps.exif_transpose(original).convert('RGB')
                width, height = image.size
                image.thumbnail((1400, 1400))
                gray = cv2.cvtColor(np.asarray(image), cv2.COLOR_RGB2GRAY)
    except (UnidentifiedImageError, OSError, ValueError):
        raise HTTPException(400, 'This file is not a valid image.') from None
    except (Image.DecompressionBombError, Image.DecompressionBombWarning):
        raise HTTPException(413, 'Image dimensions exceed the safe limit.') from None
    # Classic trained detector; outputs boxes, never identity vectors or scores.
    boxes = DETECTOR.detectMultiScale(gray, scaleFactor=1.1, minNeighbors=7, minSize=(40, 40))
    faces = [{'x': round(float(x) / image.width, 6), 'y': round(float(y) / image.height, 6),
              'width': round(float(w) / image.width, 6), 'height': round(float(h) / image.height, 6)}
             for x, y, w, h in boxes]
    return JSONResponse({'faces': faces, 'width': width, 'height': height, 'model': 'opencv-haar-frontalface', 'retained': False})
