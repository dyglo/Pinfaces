# Verified adult recognition — 2026-10-10

Implemented actual YuNet/SFace/FAISS inference, live-only Stripe document/selfie verification gates, revocable database-backed sessions, dual subject/source-owner authorization, encrypted vectors/thumbnails, expiration and deletion. No production live enrollment or same-person recognition test has occurred: live credentials, a durable host and authorized adult photographs are missing.

Local Python: 30 tests passed, including actual model checksum/load, real no-face Earth rejection and SFace forward-pass shape. Authorization/FAISS tests use synthetic vectors and unit-only provider records; they do not establish biometric accuracy. Existing face-localization fixtures remain detection-only and are not indexed or embedded. Adult DOB/live-selfie gates, cross-account denial, photo approval, unsafe source URLs, encrypted persistence, deletion/expiry, signed test-mode webhook rejection, CSRF/gateway checks and actual register/login/logout revocation passed. Starlette/httpx emits a deprecation warning.

Frontend lint, typecheck, production build and 5 unit tests passed. Browser validation: 14 scenarios initially passed; 2 registration scenarios exposed an origin-check issue, now fixed and both passed on rerun. Two paid Lens tests were intentionally skipped. No successful recognition response is mocked in the browser. Physical-device testing and a full live provider-backed recognition journey are outstanding.

Recognition cosine thresholds (0.60 for verified reference acceptance, 0.55 result threshold) are provisional, uncalibrated and not identity probabilities. Same-person cross-photo accuracy, different-person rejection, multi-face behavior on a consented collection, source-page accuracy, and held-out false-positive rates have not been measured. Do not claim perfect matches. Owner confirmation is required for source/photo correspondence.

The Docker image builds and its actual non-root runtime (UID 10001) successfully loads checksum-pinned YuNet/SFace models and imports the fail-closed backend. Four additional desktop/mobile homepage and proxy-security browser checks passed after the origin fix. Production status and commit are recorded after deployment. GitHub-hosted validation remains blocked by the account billing lock.

---

# Historical Lens implementation and verification

The following notes describe the previous image-copy search, now retained separately at `/image-search`. They are not evidence of face recognition accuracy.

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

PR: https://github.com/dyglo/Pinfaces/pull/2. GitHub Actions cannot start its validate job: “The job was not started because your account is locked due to a billing issue.” Vercel frontend/backend build checks passed. The repository owner merged PR #2 despite the blocked GitHub validation job. Merged commit: `09bba714c476ce0bac3ba3de8f14c430b33beab2`. The owner subsequently requested direct commits/pushes instead of new PRs. Verification notes, source/thumbnail assertions and CSS polish are pushed directly to main.

## Reported browser failure follow-up

The user reported “Failed to fetch” on pinfaces.vercel.app. A repeat real Earth-image search on the deployed site passed and returned 60 source pages. The user's browser-specific failure has not been reproduced; “Failed to fetch” means the browser did not receive an HTTP response and does not establish a provider/API-key failure.

The follow-up snapshots file bytes before uploading (avoiding mutable file-backed browser uploads), checks a same-origin health endpoint after a network failure, and displays separate upload/network messages. Provider failures now log only a stage, fixed error category and random request reference; images, filenames, API keys and provider upload IDs are not logged. Quota/authentication responses have specific messages; Google's explicit successful no-results response becomes an empty state. These changes improve handling and diagnosis, not proof that the user's network issue is resolved.

Local lint, typecheck, build, 5 unit tests and 6 desktop/mobile browser tests passed; paid provider tests remain opt-in. The new browser tests deliberately abort an upload to verify failure handling; they do not mock successful searches. The existing second Vercel project, pinfaces-detection, remains the independent detector; web search needs only the pinfaces project. pinfaces.vercel.app and pinfaces-next-q.vercel.app are aliases for the same frontend.

Follow-up deployment `dpl_FxwAf94Ft3zWXW3aVhQB7bvi4nga` reached READY at commit `6ac0a8623b1459a60856795a2f1ed8e4a55bad8e`. Production mobile Chromium emulation passed all four scenarios, including an actual web search returning 60 source pages and explicit network-interruption handling. This is not a test on the user's physical Android Chrome device; their particular failure remains unconfirmed.

The user authorized removal of the unused detector deployment. The connected Vercel deletion tool returned `requires_user_action`, `mutationExecuted:false`, with a dashboard confirmation link; it cannot execute deletion directly. The detector project was configured to ignore new build steps (`exit 0`) and disable previews while awaiting dashboard deletion. The frontend remains independent of that detector.

## Native photo permission/read error

The subsequent user error (“The requested file could not be read…after a reference to a file was acquired”) occurs during local file reading, before an HTTP upload. The previous update still read the native File when Search was clicked. This update reads it immediately inside the selection handler with FileReader, retains only copied bytes and display metadata, and uses a memory-backed Blob for preview and the same bytes for upload. Search cannot run before capture completes. Read failures at selection time stop the flow with instructions to select a device-saved copy; input reset permits reselection. No OS permission bypass is attempted.

Regression browser tests make File.arrayBuffer throw NotReadableError and verify that search nevertheless posts the exact captured fixture bytes. Another test forces FileReader failure and verifies no preview/search is enabled and reselection is possible. These tests exercise failures explicitly, without mocking successful AI results. Local lint, typecheck, build and 5 unit tests passed; 10 desktop/mobile browser tests passed with 2 paid-provider tests skipped.

Production deployment `dpl_8hDo6Xq644voDLRgHdvDniUYiBvU` reached READY at app commit `74c4397a9aaafae40439a43338ad5c1c49d39f8f`. Five mobile-emulation security/upload/file-permission scenarios passed against production. The first real search completed with an empty result and failed the nonempty validation-image assertion; one repeat returned 60 source pages and passed thumbnail/source/clearing checks. No provider result is fabricated; this variation is evidence that provider coverage/results are not guaranteed. The live test now checks the actual search HTTP response and count before waiting for rendered results, so future empty results fail promptly rather than waiting 90 seconds. The user's physical-device resolution still requires retrying with the deployed app and a freshly selected photo.
