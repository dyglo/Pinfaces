# Pinfaces V1 verification — 2026-10-10

## Implemented and measured scope

Face **localization** and byte-identical image duplicate search, as approved for the revised V1. There is no identity matching, public-web face search, recognition similarity scoring, FAISS index or scraped dataset.

## Local results

| Check                           | Result                     | Evidence                                                                                                                                              |
| ------------------------------- | -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| ESLint                          | Pass                       | `npm run lint`                                                                                                                                        |
| TypeScript                      | Pass                       | `npm run typecheck`                                                                                                                                   |
| Production build                | Pass                       | `npm run build`, static homepage + dynamic detection proxy                                                                                            |
| TypeScript unit/storage tests   | 11 pass                    | Hash equality/difference, exact-source preservation, supported formats, size limits, dangerous URLs, persistence, deletion, expiry and collection cap |
| Python detection/security tests | 13 pass                    | Actual OpenCV detector and FastAPI endpoints; no inference mocking                                                                                    |
| Browser integration             | 8 pass                     | Four real scenarios each on desktop Chromium and mobile Chromium at iPhone 13 dimensions                                                              |
| Production dependency audit     | 0 reported vulnerabilities | `npm audit --omit=dev --audit-level=high`                                                                                                             |

The browser test uses the actual Next.js production server → actual FastAPI detector → actual IndexedDB → rendered result. It adds a permitted detection-only NASA fixture locally for the test, finds an identical copy, verifies the source URL, rejects a JPEG re-encoding, reloads to verify persistence, deletes it and reloads to verify removal. No fixture is pre-seeded into a user's browser. It checks no-face/multiple-face UI states, rejected SVG uploads, forged image encoding, theme persistence and horizontal overflow on mobile. Screenshot evidence is produced locally in ignored `test-results/`.

## Detector observations

- One NASA/scikit-image frontal-face fixture: **1 detected face**. Bounding-box coordinates were checked against the expected region.
- Side-by-side montage of two copies of that same fixture: **2 detected faces**.
- Uniform blank 512×512 image: **0 detected faces**.
- Ten seeded random RGB noise images: **0 detected faces** total.
- Malformed encoded image: **400**; empty upload: **400**; unsupported MIME/encoding: **415**; >4 MB upload and >16 MP dimensions: **413**; missing shared service key when configured: **401**.

These are functional examples, not a representative detector benchmark. The montage is synthetic and the random-noise negative set is very limited. No held-out identities, recognition accuracy, calibrated similarity probabilities or demographic performance measurements exist. Re-encoded-copy rejection is about differing file bytes, not differing people. SHA-256 equality is not an identity score.

## Review and limits

Reviewed data flow, source-link rendering, bounded decoding, secret isolation, caching headers, deletion/retention behavior, dependency notices and original responsive design. The adult/permission attestation is not verified consent or age verification. No technical age enforcement or account authentication exists. Same-browser-profile users can access the collection. Expiration cleanup pauses while the browser is closed. Browser quotas/eviction can remove records. Source links are stored accurately but their external content, ownership and availability are not certified.

No application upload/metadata logging or image writes occur in the detection service. Application code inspection supports that claim; it is not a forensic certification of hosting-provider memory or logs. The backend is stateless and the browser stores re-encoded thumbnails rather than original files. Infrastructure rate limits and spend controls require configuration before high traffic.

## Production verification

Verified against **https://pinfaces-next-q.vercel.app** on 2026-10-10:

- Frontend: Vercel production deployment `dpl_Eq4Cn1qVv8ygvExS7VEcGF8UJBsZ`, **READY**; deployed application commit `772c042551aad28e644830ee611ba268dc8131e3`.
- Backend: **https://pinfaces-detection-next-q.vercel.app**, production deployment `dpl_BZiJCLePpHKWcYFz79vzMWd1Xu1g`, **READY**; `/health` returned status `ok`, no identity matching and no image retention.
- `BASE_URL=https://pinfaces-next-q.vercel.app npm run test:e2e`: **8 passed in 23.9 seconds**. Both desktop and mobile completed the actual upload → deployed Python detection → local collection → exact-file result → source link → reload → deletion flow. No mocked inference or search responses.
- API security checks passed on production: malformed image **400**, unsupported SVG **415**, explicit cross-site upload **403**. The backend requires the shared server credential.
- Runtime error/fatal log queries for both projects returned no matching entries in the inspected 10-minute windows. This limited observation is not continuous monitoring.
- Playwright external HTTP requests use the environment's inherited HTTPS proxy; no proxy is applied to local tests.

GitHub **PR #1** is reviewed and **open, not merged**: https://github.com/dyglo/Pinfaces/pull/1. GitHub's `validate` job did not start and reported: **“The job was not started because your account is locked due to a billing issue.”** Both Vercel build checks passed; all checks executed locally passed. No merged commit exists. Resolve the GitHub account billing issue, rerun the quality-check workflow, and merge only after it succeeds. The deployed application is from the feature branch; it is not represented as a merged release.

The connected NextQ team is currently on **Vercel Hobby**. No paid service or plan was provisioned; no R2 bucket, external database, GPU or always-on server was added. Included Hobby allowances apply; exact consumed usage/spend was not measured. Commercial operation needs a hosting plan consistent with Vercel's commercial-use terms. Application-level rate limiting is not implemented.
