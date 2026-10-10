# Hosted recognition setup

The implementation is ready to configure; a production backend and live verification are not yet provisioned. Stripe Identity was selected because it supports live document/selfie checks through a documented API. An open API does not mean free verification or anonymous API access.

1. Activate Stripe Identity in an eligible live Stripe account. Enable live document and matching live-selfie verification and access to verified selfie files. No test-mode session can activate Pinfaces enrollment. Set backend-only `STRIPE_SECRET_KEY` securely; never put it in browser variables, repository files or chat.
2. Deploy `backend/Dockerfile` on a HTTPS container host with a persistent volume mounted at `/data`, owned by UID 10001. Use one service instance for this SQLite pilot. Generate a Fernet key using `python -c 'from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())'` and a gateway secret using `python -c 'import secrets; print(secrets.token_urlsafe(48))'`. Save both in the host secret manager. Losing the encryption key makes stored templates unreadable.
3. Set these backend variables:

```
RECOGNITION_DATA_DIR=/data
RECOGNITION_ENCRYPTION_KEY=<generated Fernet key>
RECOGNITION_GATEWAY_KEY=<generated gateway secret>
STRIPE_SECRET_KEY=<live Stripe secret>
STRIPE_IDENTITY_WEBHOOK_SECRET=<live webhook signing secret>
PINFACES_PUBLIC_URL=https://pinfaces.vercel.app
```

4. Register the backend's `/verification/webhook` in Stripe for live Identity verification-session events (including `identity.verification_session.verified`). Install its signing secret above. The endpoint is HMAC/timestamp protected and intentionally not gateway-protected; other business routes require the gateway and user session. `/health` is public and must report `recognition_ready:true`.
5. Set Vercel production server-only `RECOGNITION_API_URL` to that backend HTTPS origin and the **same** `RECOGNITION_GATEWAY_KEY`. Set `PINFACES_PUBLIC_URL` to the frontend origin. Redeploy the existing frontend project, not a second project. Cookies travel through the same-origin Next.js proxy; no browser CORS permission or backend URL exposure is needed.
6. Run actual enrollment with a consenting adult, confirm provider redaction behavior, prove a participating domain's DNS challenge, submit different authorized photographs and have the domain owner approve each. Search and inspect actual source pages. Verify revoke/delete removes results, including expiry and backup retention. Record separate-person and held-out false-positive/negative measurements before tuning thresholds or claiming accuracy.

For local container operation, put the backend variables in ignored `.env.recognition` and run `docker compose up --build`; the service binds localhost:8001 and uses the named `recognition-data` volume. Use a real live verification account for real enrollment. Tests isolate authentication and authorization without manufacturing production verified users. Never expose dummy test credentials publicly.

Biometric processing requires appropriate legal review, consent records, privacy documentation, and jurisdiction/provider eligibility before a commercial release. The technical age gate uses verified document DOB; do not attempt to estimate age from appearance. Source owners must review permission and publication correspondence; Pinfaces does not fetch arbitrary URLs. Future automatic partner feeds require per-subject verified consent and per-image approval equivalents.

Known blockers: no live Stripe Identity credentials/webhook, no authorized persistent backend host, no consenting verified adult photo collection or participating-domain approvals supplied. The Vercel frontend alone cannot complete a real cross-photo search. GitHub Actions is additionally blocked by the repository owner's account billing lock; local checks must be reported separately.
