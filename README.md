# Pinfaces

Hosted cross-photo **self-search** for verified, consenting adults across individually authorized photographs from participating websites. Next.js/TypeScript/Tailwind frontend; FastAPI, real OpenCV YuNet detection/SFace embeddings, FAISS similarity search, and encrypted persistent SQLite storage. No public-web biometric crawler or stranger identification. No fake search results.

## Recognition flow

Register an account, explicitly consent to biometric processing, and complete Stripe Identity's live document plus matching live-selfie verification. The backend checks verified date of birth (18+) and extracts a reference embedding from the provider's verified selfie. A checkbox alone cannot activate enrollment. Raw identity documents/selfies are not stored by Pinfaces; Stripe holds provider data until redaction is completed under its policies.

Website owners authenticate and prove exact-domain control with a DNS TXT challenge. Enrolled adults submit their own matching photographs and HTTPS source-page URLs. The website owner must separately approve each immutable photo/source/digest record and confirm permission. Only then is it searchable. There is no automatic scraping. Source-page accuracy is an owner attestation, not an independently measured page-content guarantee.

Search detects exactly one face, extracts its embedding, checks it against the account's verified reference, and searches only that account's currently approved photos using FAISS. Query photographs are transient and not saved. Results include encrypted-storage thumbnails, original source URLs, and **uncalibrated cosine scores**, not identity probabilities. Thresholds are provisional; no recognition accuracy has been measured on consented real-person data yet.

Enrollment, domain authorization and indexed photos expire after 30 days. Deletion/revocation immediately removes live searchable records and queues provider redaction; failed provider calls retry. SQLite secure deletion is enabled. Operators must set matching encrypted backup expiry, protect encryption keys, and account for filesystem/SSD snapshots; deletion is not a promise of physical-media erasure. Database metadata includes source URLs/account email and is not wholly application-encrypted; biometric vectors/thumbnails are Fernet-encrypted.

## Deployment

Frontend: `npm ci`, set server-only variables from `.env.example`, then `npm run dev` or deploy to Vercel. Current public frontend: https://pinfaces.vercel.app. `/image-search` retains the separate SerpApi/Google Lens image-copy search and third-party consent flow; that is not cross-photo recognition.

Recognition needs a separate HTTPS CPU service with a **durable writable volume**. Do not run its SQLite store in ephemeral Vercel Functions. See [backend setup](docs/RECOGNITION_DEPLOYMENT.md). The Docker image bundles checksum-pinned models, runs as non-root, and never downloads weights during requests. No R2 is needed because encrypted thumbnails reside on the volume. SQLite supports a small single-service pilot, not an horizontally scaled deployment.

Without a configured backend the frontend explicitly says enrollment is unavailable and performs no recognition. Missing live verification credentials are not replaced with mock enrollment.

## Validation and costs

`npm run lint`, `npm run typecheck`, `npm test`, `npm run build`, `npm run test:e2e`; `.venv/bin/python -m backend.download_models` then `.venv/bin/python -m pytest backend/tests` after installing `backend/requirements.txt`.

See [actual verification results](docs/VERIFICATION.md) and [model licenses](docs/LICENSES.md). Unit fixtures validate authorization/vector mechanics; they are not recognition benchmarks. Before launch, obtain consenting verified adult participants with separate photographs and held-out identities, measure false positives/negatives, and calibrate thresholds. No perfect-match claim is made.

Stripe Identity charges per verification; backend hosting/durable storage and commercial Vercel usage incur provider charges. No new paid infrastructure has been provisioned, so there is no measured operating bill or quoted hosting price. Verify current Stripe/Vercel/hosting pricing. The legacy Lens feature consumes SerpApi credits independently. Account recovery/email delivery and stronger per-account enrollment abuse controls are not configured. Configure platform usage alerts and ingress rate limits before a public commercial launch.
