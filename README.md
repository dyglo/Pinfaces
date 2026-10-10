# Pinfaces

A responsive Next.js image search app that finds source pages containing copies of an uploaded photograph using SerpApi's Google Lens **exact_matches** endpoint. It searches the web, not a local collection. It does not identify people across different photographs, build biometric indexes or report facial similarity scores.

## Setup

Node 24; `npm ci`. Set server-only `SERPAPI_API_KEY` in `.env.local`, then `npm run dev`. In Vercel, set this key on the frontend project for each desired environment and redeploy. Never prefix it with `NEXT_PUBLIC_`. No image bucket or database is needed.

Search flow: a user selects a JPEG/PNG/WebP under 4 MB, previews it and explicitly agrees to third-party processing. The Next.js route validates actual encoding, rejects animations and images over 16 megapixels, strips metadata and resizes to SerpApi's 500 KB upload limit. It uploads directly to SerpApi's image endpoint and queries Google Lens with `type=exact_matches`. Only actual returned source links appear. Failed requests produce errors, never mock matches. Successful searches may return zero pages. Source links are sanitized and deduplicated. Search results are not evidence of a person's identity.

## Privacy and operation

Pinfaces stores neither uploads nor search history in persistent storage. Session clear removes browser state, not provider-held data. SerpApi upload IDs expire after ten minutes; this does not guarantee provider erasure. SerpApi and Google policies apply to forwarded images. External result thumbnails disclose a browser request to their hosts. Do not upload private images without permission. The checkbox is an authorization attestation, not verified identity or consent; this app is not suitable for biometric searches.

Cross-site requests are rejected, request bodies are bounded, unsafe link schemes are removed, responses are uncached, and keys stay server-side. Public API abuse can consume credits: production operators should configure Vercel Firewall rate limits and usage alerts; no distributed account authentication/rate limiter is supplied. Provider availability, web coverage and account quota affect searches. Vercel Hobby is for personal/noncommercial use; a commercial launch needs an appropriate plan. SerpApi pricing currently includes a 250-search monthly free tier; paid plans start at $25/month for 1,000 searches. Verify current provider pricing before launch.

The retained FastAPI OpenCV service provides face-region detection at `/detect`, but is independent of web search and is not required for it. No FAISS or recognition embeddings are used.

## Verification

`npm run lint`, `npm run typecheck`, `npm test`, `npm run build`, `npm run test:e2e`. Browser tests check consent, clearing, responsive layout, themes and upload security on desktop and mobile. Normal tests do not call paid providers or fabricate UI results. A real provider test is opt-in:

```
BASE_URL=https://pinfaces-next-q.vercel.app LIVE_SEARCH_TESTS=1 npm run test:e2e
```

It searches a public NASA Earth photograph and requires actual returned source pages. It consumes provider credits. The Earth fixture is for testing, not seeded results. See `docs/VERIFICATION.md` for measured outcomes and limitations.
