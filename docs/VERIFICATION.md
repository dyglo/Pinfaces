# Public-web image search verification

The former IndexedDB collection has been removed. This version searches Google Lens through SerpApi's image upload and `exact_matches` endpoints. It does not perform face identity matching, recognition embeddings, biometric indexing, calibrated similarity scoring or same-person matching across photographs. No accuracy claim is made.

Local validation: ESLint, TypeScript, production build and four unit tests cover upload validation, URL safety, exact-match parsing/deduplication and failed provider responses. Desktop/mobile browser tests cover preview, mandatory permission attestation, clear session, invalid file errors, persistent theme, viewport overflow and server-side rejection of unconsented, disguised, unsupported and cross-site uploads. Live provider tests are explicitly opt-in and consume search credits.

Live verification and deployment outcomes are recorded after the actual deployment test. No seeded match list or successful-search mock is included.

The existing independent OpenCV detector remains unchanged. Its small prior fixture tests are localization checks, not a face recognition evaluation. It is not in the web search path.

Limitations: source-page indexing is incomplete; Google Lens image matches can be incorrect; no held-out identity evaluation is applicable. Permission is self-attested, not verified. Provider retention is outside Pinfaces control. No distributed rate limiter is supplied; configure platform rate limits and usage alerts before opening paid quota to broad traffic. SerpApi is an external service; the key must be present on the specific deployment environment. R2 and additional persistent storage are unnecessary.
