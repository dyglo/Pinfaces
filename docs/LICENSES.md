# License notes

The legacy independent detector uses OpenCV's `haarcascade_frontalface_default.xml`. Hosted recognition uses YuNet detection and SFace embeddings. OpenCV 4.13 is Apache-2.0. The bundled cascade retains the Intel Open Source Computer Vision Library license header permitting use/redistribution in source/binary form, including commercially, subject to retaining its copyright, license conditions, disclaimers and non-endorsement condition.

- OpenCV license: https://github.com/opencv/opencv/blob/4.13.0/LICENSE
- Cascade and its original license notice: https://github.com/opencv/opencv/blob/4.13.0/data/haarcascades/haarcascade_frontalface_default.xml
- Python `opencv-python` packaging license: https://github.com/opencv/opencv-python/blob/master/LICENSE.txt
- Face test photograph attribution: [fixture documentation](../tests/fixtures/README.md)

YuNet weights are MIT licensed and SFace weights are Apache-2.0 licensed according to their OpenCV Zoo directory license files (including the models). The exact revision and SHA-256 checksums are pinned in `backend/download_models.py`; redistribution notices are included under `backend/licenses`. These licenses permit commercial use subject to their terms; they do not license arbitrary photographs or remove biometric privacy obligations. No InsightFace weights or unconsented identity dataset is included. Original Pinfaces wordmark and upload illustration are rendered in code. Lucide icons are ISC licensed; Next.js, React, Tailwind, Sharp and FastAPI use permissive licenses. Preserve upstream dependency notices when distributing.
