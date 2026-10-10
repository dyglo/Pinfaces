# License notes

Pinfaces uses OpenCV's `haarcascade_frontalface_default.xml` for face detection, not a face recognition model. OpenCV 4.13 is Apache-2.0. The bundled cascade retains the Intel Open Source Computer Vision Library license header permitting use/redistribution in source/binary form, including commercially, subject to retaining its copyright, license conditions, disclaimers and non-endorsement condition.

- OpenCV license: https://github.com/opencv/opencv/blob/4.13.0/LICENSE
- Cascade and its original license notice: https://github.com/opencv/opencv/blob/4.13.0/data/haarcascades/haarcascade_frontalface_default.xml
- Python `opencv-python` packaging license: https://github.com/opencv/opencv-python/blob/master/LICENSE.txt
- Face test photograph attribution: [fixture documentation](../tests/fixtures/README.md)

No InsightFace/ArcFace identity model, identity dataset, biometric vectors or third-party recognition API is included. Original Pinfaces wordmark and upload illustration are rendered in code. Lucide icons are ISC licensed; Next.js, React, Tailwind, idb and FastAPI use permissive licenses. Preserve upstream dependency notices when distributing.
