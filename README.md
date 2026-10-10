# Pinfaces

A privacy-first photo tool with an original responsive Next.js interface, **real face localization** and **exact-file duplicate search** in a browser-local collection.

## Scope

This V1 does not identify people, compare identities across photographs, use face embeddings, scrape websites, or create a public face index. It only returns byte-identical files (SHA-256). Re-encoding, resizing or cropping a photograph produces a different file and will not match. No fabricated results or similarity percentages are shown.

## Run locally

Requires Node 24 and Python 3.12.

```sh
npm ci
python -m venv .venv
.venv/bin/pip install -r backend/requirements-dev.txt
cp .env.example .env.local
.venv/bin/uvicorn backend.app:app --host 127.0.0.1 --port 8000 --no-access-log
# In another terminal:
npm run dev
```

Open http://localhost:3000. In **My collection**, upload a clear adult photograph you have permission to use, enter an HTTPS source URL and confirm the adult/permission attestation. Then switch to **Photo search** and search using the same original file. A successful detection without an exact-file copy returns an empty state, never an invented result.

## Architecture and privacy

- Next.js 16, TypeScript, React 19, Tailwind CSS 4; original SVG/icon and CSS artwork.
- `POST /api/detect`: bounded Next.js proxy to FastAPI. Supported MIME types, 4 MB limit, no caching, timeout, cross-site browser upload rejection. No upload content or source URLs are logged by the application.
- FastAPI + OpenCV's trained frontal-face Haar cascade. This is face **detection**, not recognition. Outputs normalized bounding boxes. Validates actual encoding, dimensions (16 megapixels), animation and size. Images are processed in memory and never written to disk. Server-to-server API key is configured in production.
- `CollectionStorage` abstraction with IndexedDB implementation. Stores only a re-encoded JPEG thumbnail (no original EXIF), original-file hash, title, HTTPS source URL, timestamps and permission attestation. Maximum 100 records.
- Collection belongs to the current browser origin, not a signed-in account. No server metadata database or image bucket is needed. Cloudflare R2 is deliberately unused.
- Entries expire after 7 days. Purging occurs on load, focus, once per minute while active and before additions. Closed browsers do not run cleanup; data is deleted on the next active session. Delete-one and delete-all remove thumbnails and metadata. Clearing browser site data also removes the collection. Physical secure erasure of browser storage cannot be guaranteed.
- HTTPS source URLs are user-provided metadata. Their bytes survive storage and search; ownership, content and availability are not verified. The app never fetches/scrapes them.
- No identity/age/consent verification is claimed. The adult/permission checkbox is an attestation. There is no biometric search needing biometric authorization. Do not add minors; technical age enforcement is not provided. Anyone using the same browser profile can access the collection.

## Test commands

```sh
npm run lint
npm run typecheck
npm test
.venv/bin/python -m pytest backend/tests -q
npm run build
npx playwright install --with-deps chromium
npm run test:e2e
# Reuse the same real tests against production:
BASE_URL=https://pinfaces.vercel.app npm run test:e2e
```

Playwright starts the actual Next.js production server and Python backend for local tests. No detection calls or successful search responses are mocked. See [verification report](docs/VERIFICATION.md) for measured results and limitations. The NASA/scikit-image fixture is for face localization and exact-file tests only; it is not seeded into user collections and is not a consented identity-search dataset.

## Deployment

Two Vercel projects connected to this repository:

1. `pinfaces`: Next.js; repository root; production branch `main`.
2. `pinfaces-detection`: FastAPI; root directory `backend`; production branch `main`.

Configure `DETECTION_API_KEY` as a Secret/sensitive environment variable in both projects (matching values). In the frontend only, configure `DETECTION_API_URL` to the backend's HTTPS URL. Never use `NEXT_PUBLIC_` for credentials. Preview environments must also have a service key. `/health` intentionally reveals only service/model status; `/detect` requires the service key when configured. For an independent host, run Uvicorn behind an HTTPS reverse proxy and set the same key. No persistent backend volume is needed.

GitHub CI runs lint, typecheck, TypeScript tests, Python tests, production build and real desktop/mobile browser tests. Project Git integration supplies Vercel deployments separately from CI.

## Costs and operational limits

No paid database, image bucket, recognition API, GPU or always-on Python server. Two Vercel projects use the existing team's plan; bandwidth, function invocations, CPU and memory can incur usage-based charges above its included allowances. No fixed usage cost or free hosting guarantee is made. Browser storage uses the user's device and is subject to browser quotas/eviction. Cold starts and ordinary Vercel logs remain. Application-level distributed rate limiting is not implemented; configure Vercel Firewall rate limits and billing alerts before exposing the public proxy to heavy traffic.

OpenCV's detector is limited to clear frontal faces and can fail on profile, rotated, occluded, small or poorly lit faces, and can produce false positives. The fixture checks are not a population accuracy or demographic fairness evaluation. No identity matching accuracy, calibration or held-out-identity results exist.

## Model and dependency licensing

OpenCV 4 is Apache-2.0; the bundled legacy Haar cascade carries its own Intel/OpenCV redistribution notice. Both permit commercial use subject to their notices. The cascade is loaded from the installed OpenCV package, which preserves the notice; no separate recognition weights are downloaded. See [licenses](docs/LICENSES.md). Dependency licenses and notices must be preserved when distributing builds.
