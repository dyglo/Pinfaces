"""Real YuNet detection, landmark alignment and SFace embeddings for consented enrollments."""
import hashlib
import io
import threading
from pathlib import Path
import warnings
import cv2
import numpy as np
from PIL import Image, ImageOps
from backend.download_models import MODELS

class PhotoError(ValueError):
    pass

def decode_photo(data: bytes):
    if not data or len(data) > 4_000_000:
        raise PhotoError('Use a nonempty image under 4 MB.')
    try:
        with warnings.catch_warnings():
            warnings.simplefilter('error', Image.DecompressionBombWarning)
            with Image.open(io.BytesIO(data)) as source:
                if source.format not in {'JPEG', 'PNG', 'WEBP'} or getattr(source, 'n_frames', 1) != 1:
                    raise PhotoError('Use a still JPEG, PNG or WebP image.')
                if source.width * source.height > 16_000_000:
                    raise PhotoError('Use an image under 16 megapixels.')
                image = ImageOps.exif_transpose(source).convert('RGB')
                image.thumbnail((1600, 1600))
                return cv2.cvtColor(np.asarray(image), cv2.COLOR_RGB2BGR)
    except PhotoError:
        raise
    except (OSError, ValueError, Image.DecompressionBombError, Image.DecompressionBombWarning):
        raise PhotoError('The photograph could not be decoded safely.') from None

class FaceEngine:
    dimension = 128
    model_id = 'opencv-sface-2021dec-yunet-2023mar'
    def __init__(self, directory: Path):
        for name, (_, expected) in MODELS.items():
            path = directory / name
            if not path.is_file() or hashlib.sha256(path.read_bytes()).hexdigest() != expected:
                raise RuntimeError('Recognition model files are missing or do not match the pinned checksums.')
        cv2.setNumThreads(1)
        self.detector = cv2.FaceDetectorYN.create(str(directory / 'yunet.onnx'), '', (320, 320), 0.9, 0.3, 5000)
        self.recognizer = cv2.FaceRecognizerSF.create(str(directory / 'sface.onnx'), '')
        self.lock = threading.Lock()

    def extract(self, data: bytes):
        image = decode_photo(data)
        height, width = image.shape[:2]
        with self.lock:
            self.detector.setInputSize((width, height))
            _, faces = self.detector.detect(image)
            if faces is None or len(faces) == 0:
                raise PhotoError('No face detected. Choose a clear, front-facing adult portrait.')
            if len(faces) != 1:
                raise PhotoError('Multiple faces detected. Use a photograph containing only your face.')
            face = faces[0]
            if min(face[2], face[3]) < 60:
                raise PhotoError('The face is too small. Choose a closer portrait.')
            aligned = self.recognizer.alignCrop(image, face)
            vector = self.recognizer.feature(aligned).reshape(-1).astype('float32')
        norm = np.linalg.norm(vector)
        if len(vector) != self.dimension or not np.isfinite(vector).all() or norm < 1e-8:
            raise PhotoError('A reliable embedding could not be extracted.')
        vector /= norm
        box = {'x': float(face[0] / width), 'y': float(face[1] / height), 'width': float(face[2] / width), 'height': float(face[3] / height)}
        thumb = cv2.resize(image, (max(1, int(width * min(1, 600 / max(width, height)))), max(1, int(height * min(1, 600 / max(width, height))))))
        ok, encoded = cv2.imencode('.jpg', thumb, [cv2.IMWRITE_JPEG_QUALITY, 80])
        if not ok:
            raise PhotoError('The thumbnail could not be encoded.')
        return vector, box, encoded.tobytes()
