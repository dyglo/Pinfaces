"""Download pinned, checksum-verified models; never download at request time."""
import hashlib
from pathlib import Path
import urllib.request
REVISION = '47534e27c9851bb1128ccc0102f1145e27f23f98'
MODELS = {
    'yunet.onnx': ('face_detection_yunet/face_detection_yunet_2023mar.onnx', '8f2383e4dd3cfbb4553ea8718107fc0423210dc964f9f4280604804ed2552fa4'),
    'sface.onnx': ('face_recognition_sface/face_recognition_sface_2021dec.onnx', '0ba9fbfa01b5270c96627c4ef784da859931e02f04419c829e83484087c34e79'),
}
def download():
    destination = Path(__file__).parent / 'models'
    destination.mkdir(exist_ok=True)
    for name, (upstream, checksum) in MODELS.items():
        path = destination / name
        if path.exists() and hashlib.sha256(path.read_bytes()).hexdigest() == checksum:
            continue
        with urllib.request.urlopen(f'https://media.githubusercontent.com/media/opencv/opencv_zoo/{REVISION}/models/{upstream}', timeout=90) as response:
            data = response.read(50_000_000)
        if hashlib.sha256(data).hexdigest() != checksum:
            raise RuntimeError(f'Model checksum mismatch: {name}')
        path.write_bytes(data)
if __name__ == '__main__':
    download()
