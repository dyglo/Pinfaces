import io
from pathlib import Path

import numpy as np
import pytest
from fastapi.testclient import TestClient
from PIL import Image
from backend.app import app, MAX_BYTES

client = TestClient(app)
FIXTURE = Path(__file__).resolve().parents[2] / 'tests/fixtures/astronaut.png'

def post(data, media='image/png'):
    return client.post('/detect', content=data, headers={'content-type': media})

def encoded(image, fmt='PNG'):
    output = io.BytesIO()
    image.save(output, format=fmt)
    return output.getvalue()

def test_real_frontal_face():
    response = post(FIXTURE.read_bytes())
    assert response.status_code == 200
    data = response.json()
    assert len(data['faces']) == 1
    face = data['faces'][0]
    assert 0.25 < face['x'] < 0.5 and 0.05 < face['y'] < 0.2
    assert data['retained'] is False
    assert response.headers['cache-control'] == 'no-store'
    assert 'embedding' not in data

def test_multiple_faces():
    photo = Image.open(FIXTURE)
    montage = Image.new('RGB', (photo.width * 2, photo.height))
    montage.paste(photo, (0, 0)); montage.paste(photo, (photo.width, 0))
    response = post(encoded(montage))
    assert response.status_code == 200
    assert len(response.json()['faces']) == 2

def test_no_face():
    response = post(encoded(Image.new('RGB', (512, 512), 'white')))
    assert response.status_code == 200
    assert response.json()['faces'] == []

@pytest.mark.parametrize('media', ['text/html', 'image/svg+xml', 'application/octet-stream'])
def test_unsupported(media):
    assert post(b'<svg/>', media).status_code == 415

def test_forged_image():
    assert post(b'<html>bad</html>').status_code == 400

def test_empty():
    assert post(b'').status_code == 400

def test_large_upload():
    assert post(b'x' * (MAX_BYTES + 1)).status_code == 413

def test_large_dimensions():
    assert post(encoded(Image.new('RGB', (4100, 4100), 'white'))).status_code == 413

def test_gif_masquerading_as_png():
    assert post(encoded(Image.new('RGB', (100, 100)), 'GIF')).status_code == 415

def test_shared_key(monkeypatch):
    monkeypatch.setenv('DETECTION_API_KEY', 'test-only-key')
    assert post(FIXTURE.read_bytes()).status_code == 401
    response = client.post('/detect', content=FIXTURE.read_bytes(), headers={'content-type': 'image/png', 'x-api-key': 'test-only-key'})
    assert response.status_code == 200

def test_nonface_noise_false_positives():
    rng = np.random.default_rng(42)
    count = 0
    for _ in range(10):
        image = Image.fromarray(rng.integers(0, 256, (512, 512, 3), dtype=np.uint8))
        count += len(post(encoded(image)).json()['faces'])
    assert count == 0
