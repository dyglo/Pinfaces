# Public-web image search verification

The former IndexedDB collection has been removed. This version searches Google Lens through SerpApi's image upload and `exact_matches` endpoints. It does not perform face identity matching, recognition embeddings, biometric indexing, calibrated similarity scoring or same-person matching across photographs. No accuracy claim is made.

Local validation: ESLint, TypeScript, production build and four unit tests cover upload validation, URL safety, exact-match parsing/deduplication and failed provider responses. Desktop/mobile browser tests cover preview, mandatory permission attestation, clear session, invalid file errors, persistent theme, viewport overflow and server-side rejection of unconsented, disguised, unsupported and cross-site uploads. Live provider tests are explicitly opt-in and consume search credits.

Live verification and deployment outcomes are recorded after the actual deployment test. No seeded match list or successful-search mock is included.

The existing independent OpenCV detector remains unchanged. Its small prior fixture tests are localization checks, not a face recognition evaluation. It is not in the web search path.

Limitations: source-page indexing is incomplete; Google Lens image matches can be incorrect; no held-out identity evaluation is applicable. Permission is self-attested, not verified. Provider retention is outside Pinfaces control. No distributed rate limiter is supplied; configure platform rate limits and usage alerts before opening paid quota to broad traffic. SerpApi is an external service; the key must be present on the specific deployment environment. R2 and additional persistent storage are unnecessary.

## Measured production results — 2026-10-10

Production deployment `dpl_8GbvWmeBdMynFz1xK6hU3jn1Gzvt` reached READY at commit `46b59fd18dbfe81bf03e63e976344979ddbf43b0`. Public URL: https://pinfaces.vercel.app (also https://pinfaces-next-q.vercel.app).

The production SERPAPI_API_KEY was accepted. Actual browser→Next.js→SerpApi upload→Google Lens→results tests passed on desktop and mobile: both returned 60 sanitized source pages for the NASA Earth test image. A further desktop check confirmed the first source page responded below HTTP 400 and the first result thumbnail decoded with nonzero width. Returned domains included nasa.gov, nationalgeographic.com, posterstore.com, americanprogress.org and artphotolimited.com; ordering varied between searches. This verifies a working provider integration, not comprehensive source correctness or an accuracy rate. Three real search requests were made; actual billing depends on provider cache/quota rules.

All six browser scenarios passed against production, with the desktop preview check rerun after an initial attempt reached Vercel's still-building page. Local checks: 4 unit tests, 4 browser tests (2 paid-provider tests skipped by default), 13 Python tests, lint, typecheck and build passed. Production dependency audit: 0 vulnerabilities. The Python suite emitted a Starlette/httpx deprecation warning.

Backend health at https://pinfaces-detection-next-q.vercel.app/health returned OK, `identity_matching:false`, `retains_images:false`. Web search runs in the Next.js server function and does not depend on this detector.

PR: https://github.com/dyglo/Pinfaces/pull/2. GitHub Actions cannot start its validate job: “The job was not started because your account is locked due to a billing issue.” Vercel frontend/backend build checks passed. PR remains unmerged because the requested successful GitHub checks are blocked by account billing; no merged commit exists for this change.
