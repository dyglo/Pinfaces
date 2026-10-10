"""Hosted, self-search-only recognition for verified consenting adults and authorized sources."""
import asyncio
from contextlib import asynccontextmanager, suppress
from dataclasses import dataclass
import hashlib
import os
from pathlib import Path
import re
import secrets
import time
from urllib.parse import urlsplit, unquote
from uuid import UUID
import dns.resolver
from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.responses import Response
from pydantic import BaseModel, Field
import stripe
import httpx
from backend.face_engine import FaceEngine, PhotoError
from backend.identity_provider import StripeIdentity, VerificationError
from backend.recognition_auth import AccountAuth, UserRead, UserCreate
from backend.recognition_store import SQLiteRecognitionStorage, AuthorizationError, CONSENT_VERSION, valid_host

@dataclass
class Settings:
    data_dir: str
    encryption_key: str
    gateway_key: str
    stripe_key: str
    stripe_webhook_secret: str
    public_url: str
    model_dir: str
    threshold: float = 0.55

    @classmethod
    def environment(cls):
        fields = ['RECOGNITION_DATA_DIR', 'RECOGNITION_ENCRYPTION_KEY', 'RECOGNITION_GATEWAY_KEY', 'STRIPE_SECRET_KEY', 'STRIPE_IDENTITY_WEBHOOK_SECRET']
        if os.environ.get('VERCEL') or any(not os.environ.get(k) for k in fields):
            return None
        return cls(*(os.environ[k] for k in fields), os.environ.get('PINFACES_PUBLIC_URL', 'https://pinfaces.vercel.app'), os.environ.get('RECOGNITION_MODEL_DIR', str(Path(__file__).parent / 'models')))

class Consent(BaseModel):
    consent: bool
    version: str
class DomainRequest(BaseModel):
    host: str = Field(max_length=253)
    authorize: bool
class PhotoApproval(BaseModel):
    confirm_source_and_subject_permission: bool

async def bounded_body(request, limit=4_000_000):
    data = bytearray()
    async for chunk in request.stream():
        data.extend(chunk)
        if len(data) > limit:
            raise HTTPException(413, 'Upload exceeds the supported limit.')
    if not data:
        raise HTTPException(400, 'The request is empty.')
    return bytes(data)

async def photo_bytes(request):
    if request.headers.get('content-type', '').split(';')[0] not in {'image/jpeg', 'image/png', 'image/webp'}:
        raise HTTPException(415, 'Use a JPEG, PNG or WebP photograph.')
    return await bounded_body(request)

def public_photo(row):
    return {key: row[key] for key in ['id', 'title', 'source_url', 'digest', 'approved_at', 'expires_at']}

def create_app(settings=None, face_engine=None, identity=None):
    settings = settings or Settings.environment()
    if settings is None:
        unavailable = FastAPI(docs_url=None, redoc_url=None, openapi_url=None)
        @unavailable.get('/health')
        def unavailable_health():
            return {'status': 'unconfigured', 'recognition_ready': False}
        @unavailable.api_route('/{path:path}', methods=['GET','POST','DELETE','PATCH'])
        def unavailable_route(path: str):
            raise HTTPException(503, 'Verified enrollment service is not configured. No recognition has been performed.')
        return unavailable
    if len(settings.gateway_key) < 32 or not settings.stripe_key.startswith('sk_live_') or not settings.stripe_webhook_secret.startswith('whsec_') or not 0.4 <= settings.threshold <= 0.99:
        raise RuntimeError('Recognition requires strong gateway credentials and a live Stripe Identity configuration.')
    origin = urlsplit(settings.public_url)
    if origin.scheme != 'https' and origin.hostname not in {'localhost','127.0.0.1'}:
        raise RuntimeError('Production frontend requires HTTPS.')
    directory = Path(settings.data_dir).resolve()
    directory.mkdir(parents=True, exist_ok=True, mode=0o700)
    directory.chmod(0o700)
    storage = SQLiteRecognitionStorage(str(directory / 'recognition.sqlite'), settings.encryption_key)
    engine = face_engine or FaceEngine(Path(settings.model_dir))
    provider = identity or StripeIdentity(settings.stripe_key, settings.public_url + '/enroll?verification=returned')
    auth = AccountAuth(storage.path, secure=origin.scheme == 'https')

    async def activate(session_id):
        subject = storage.session_subject(session_id)
        if not subject or subject['expires_at'] <= time.time():
            raise VerificationError('Consent is missing or expired.')
        if subject['status'] == 'verified':
            return
        if subject['status'] != 'pending':
            raise VerificationError('This enrollment is not eligible for activation.')
        evidence = await asyncio.to_thread(provider.evidence, session_id, subject['user_id'])
        vector, _, _ = await asyncio.to_thread(engine.extract, evidence)
        storage.verify(subject['user_id'], session_id, vector, engine.model_id)

    async def cleanup():
        while True:
            storage.purge()
            for session_id in storage.redactions():
                try:
                    await asyncio.to_thread(provider.redact, session_id)
                    storage.redacted(session_id)
                except Exception:
                    # Fixed category only: no names, photos, DOB, IDs or provider payloads in logs.
                    print('Identity provider redaction remains queued', flush=True)
            await asyncio.sleep(60)

    @asynccontextmanager
    async def lifespan(app):
        await auth.initialize()
        storage.purge()
        task = asyncio.create_task(cleanup())
        yield
        task.cancel()
        with suppress(asyncio.CancelledError):
            await task
        await auth.engine.dispose()

    app = FastAPI(title='Pinfaces consented recognition', lifespan=lifespan, docs_url=None, redoc_url=None, openapi_url=None)
    app.state.storage, app.state.face_engine, app.state.auth = storage, engine, auth
    @app.middleware('http')
    async def protection(request, call_next):
        if request.url.path not in {'/health', '/verification/webhook'}:
            if not secrets.compare_digest(request.headers.get('x-recognition-gateway', ''), settings.gateway_key):
                return Response('Unauthorized service request', status_code=401)
            if request.method not in {'GET','HEAD'}:
                if request.headers.get('origin') not in {settings.public_url, None} or request.headers.get('sec-fetch-site') == 'cross-site':
                    return Response('Cross-site requests are forbidden', status_code=403)
            if request.url.path.startswith('/auth/'):
                scope = hashlib.sha256((settings.gateway_key + request.headers.get('x-client-address', 'unknown')).encode()).hexdigest()
                try:
                    storage.rate_limit('auth:' + scope, limit=50)
                except AuthorizationError:
                    return Response('Authentication request limit reached', status_code=429)
        response = await call_next(request)
        response.headers['Cache-Control'] = 'no-store'
        response.headers['X-Content-Type-Options'] = 'nosniff'
        return response

    app.include_router(auth.users.get_register_router(UserRead, UserCreate), prefix='/auth')
    app.include_router(auth.users.get_auth_router(auth.backend), prefix='/auth')
    current_user = auth.current_user

    @app.exception_handler(AuthorizationError)
    async def authorization_error(request, error):
        from fastapi.responses import JSONResponse
        return JSONResponse({'detail': str(error)}, status_code=403)
    @app.exception_handler(PhotoError)
    async def image_error(request, error):
        from fastapi.responses import JSONResponse
        return JSONResponse({'detail': str(error)}, status_code=422)

    @app.get('/health')
    def health():
        return {'status':'ok', 'recognition_ready':True, 'model':engine.model_id, 'verification_provider':'Stripe Identity live', 'consent_version':CONSENT_VERSION, 'retention_days':30, 'similarity_threshold':settings.threshold, 'threshold_calibrated':False}

    @app.get('/account')
    async def account(user=Depends(current_user)):
        subject = storage.subject(str(user.id))
        return {'email':user.email, 'enrollment': {'status':subject['status'], 'expires_at':subject['expires_at']} if subject and subject['expires_at'] > time.time() else None}

    @app.post('/enrollment')
    async def enrollment(body: Consent, user=Depends(current_user)):
        if body.consent is not True or body.version != CONSENT_VERSION:
            raise HTTPException(403, 'Explicit current biometric consent is required.')
        storage.rate_limit('verification:' + str(user.id), limit=3)
        subject = storage.begin_consent(str(user.id))
        if subject['status'] != 'pending':
            raise HTTPException(409, 'This enrollment is already verified or was rejected. Withdraw it before restarting.')
        try:
            session_id, url = await asyncio.to_thread(provider.create, str(user.id), 'enroll-' + str(user.id) + '-' + str(subject['consent_at']))
            storage.attach_session(str(user.id), session_id)
            return {'verification_url':url, 'status':'pending'}
        except (VerificationError, stripe.StripeError):
            raise HTTPException(503, 'Live verification could not start. Check the Stripe Identity account configuration.') from None

    @app.post('/enrollment/refresh')
    async def refresh(user=Depends(current_user)):
        storage.rate_limit('verification-refresh:' + str(user.id), limit=15)
        subject = storage.subject(str(user.id))
        if not subject or not subject['verification_id']:
            raise HTTPException(403, 'Start your enrollment before checking verification.')
        try:
            await activate(subject['verification_id'])
        except VerificationError:
            raise HTTPException(409, 'Verified adult document and matching selfie evidence are not available yet. Complete the live provider session.') from None
        except (stripe.StripeError, httpx.HTTPError):
            raise HTTPException(503, 'The identity provider is temporarily unavailable.') from None
        return {'status':'verified'}

    @app.post('/verification/webhook')
    async def webhook(request: Request):
        raw = await bounded_body(request, 200_000)
        try:
            event = stripe.Webhook.construct_event(raw, request.headers.get('stripe-signature',''), settings.stripe_webhook_secret)
        except (ValueError, stripe.SignatureVerificationError):
            raise HTTPException(400, 'Invalid verification signature.') from None
        if event['livemode'] is not True:
            raise HTTPException(403, 'Test-mode verification cannot activate recognition.')
        if event['type'] == 'identity.verification_session.verified':
            session_id = event['data']['object']['id']
            # Deleted or expired consents are ignored, never recreated by a replay.
            if storage.session_subject(session_id):
                try:
                    await activate(session_id)
                except VerificationError:
                    subject = storage.session_subject(session_id)
                    if subject:
                        storage.reject(subject['user_id'], session_id)
                except (stripe.StripeError, httpx.HTTPError, PhotoError):
                    raise HTTPException(503, 'Verification evidence could not be processed. Provider retry is required.') from None
        return {'received':True}

    @app.delete('/enrollment')
    def revoke(user=Depends(current_user)):
        storage.revoke(str(user.id))
        return {'deleted':True, 'provider_redaction':'queued'}

    @app.delete('/account')
    async def delete_account(user=Depends(current_user), manager=Depends(auth.get_manager)):
        storage.revoke(str(user.id))
        await manager.delete(user)
        return {'deleted':True, 'provider_redaction':'queued'}

    @app.get('/domains')
    def domains(user=Depends(current_user)):
        return {'domains':storage.domain_list()}

    @app.get('/domains/mine')
    def own_domains(user=Depends(current_user)):
        return {'domains':storage.domain_list(str(user.id))}

    @app.post('/domains')
    def add_domain(body: DomainRequest, user=Depends(current_user)):
        if body.authorize is not True:
            raise HTTPException(403, 'Website-owner authorization is required.')
        try:
            row = storage.add_domain(str(user.id), body.host)
        except ValueError as error:
            raise HTTPException(422, str(error)) from None
        return {'host':row['host'], 'dns_name':'_pinfaces.' + row['host'], 'dns_value':'pinfaces-source=' + row['challenge'], 'approved_at':row['approved_at']}

    @app.post('/domains/{host}/verify')
    async def verify_domain(host: str, user=Depends(current_user)):
        host = valid_host(host)
        row = storage.domain(host)
        if not row or row['owner_id'] != str(user.id):
            raise HTTPException(403, 'This account does not control the registered website.')
        storage.rate_limit('domain-verification:' + str(user.id), limit=15)
        try:
            answer = await asyncio.to_thread(dns.resolver.resolve, '_pinfaces.' + host, 'TXT', lifetime=5)
            values = [b''.join(record.strings).decode('utf8') for record in answer]
        except (dns.exception.DNSException, UnicodeError):
            raise HTTPException(409, 'DNS authorization record was not found. Allow DNS propagation and retry.') from None
        if 'pinfaces-source=' + row['challenge'] not in values:
            raise HTTPException(403, 'DNS record does not match this account authorization challenge.')
        storage.approve_domain(str(user.id), host, row['challenge'])
        return {'authorized':True}

    @app.delete('/domains/{host}')
    def remove_domain(host: str, user=Depends(current_user)):
        storage.delete_domain(str(user.id), valid_host(host))
        return {'revoked':True}

    @app.get('/photos')
    def photos(user=Depends(current_user)):
        return {'photos':[public_photo(row) for row in storage.photos(user_id=str(user.id))]}

    @app.get('/partner/photos')
    def partner_photos(user=Depends(current_user)):
        return {'photos':[public_photo(row) for row in storage.photos(owner_id=str(user.id)) if not row['approved_at']]}

    @app.post('/partner/photos/{photo_id}/approve')
    def approve(photo_id: UUID, body: PhotoApproval, user=Depends(current_user)):
        if body.confirm_source_and_subject_permission is not True:
            raise HTTPException(403, 'Confirm that this image appears at its source URL and indexing has explicit subject and website permission.')
        storage.approve_photo(str(user.id), str(photo_id))
        return {'approved':True}

    @app.post('/photos')
    async def add_photo(request: Request, user=Depends(current_user)):
        uid = str(user.id)
        subject = storage.require_verified(uid)
        storage.rate_limit('photo-add:' + uid, limit=20)
        if request.headers.get('x-photo-consent') != CONSENT_VERSION:
            raise HTTPException(403, 'Each indexed photograph needs your explicit consent.')
        data = await photo_bytes(request)
        vector, box, thumbnail = await asyncio.to_thread(engine.extract, data)
        if subject['model'] != engine.model_id or float(vector @ storage.decode(subject['reference'])) < 0.60:
            raise HTTPException(403, 'The image does not sufficiently match your verified identity. It cannot be indexed.')
        try:
            photo_id = storage.add_photo(uid, request.headers.get('x-source-url',''), unquote(request.headers.get('x-photo-title','Authorized photo')), hashlib.sha256(data).hexdigest(), vector, thumbnail, engine.model_id)
        except ValueError as error:
            if isinstance(error, AuthorizationError):
                raise
            raise HTTPException(422, str(error)) from None
        return {'id':photo_id, 'status':'pending_source_owner_approval', 'face':box}

    @app.delete('/photos/{photo_id}')
    def delete_photo(photo_id: UUID, user=Depends(current_user)):
        storage.delete_photo(str(user.id), str(photo_id))
        return {'deleted':True}

    @app.get('/photos/{photo_id}/thumbnail')
    def thumbnail(photo_id: UUID, user=Depends(current_user)):
        rows = storage.photos(user_id=str(user.id)) + storage.photos(owner_id=str(user.id))
        row = next((r for r in rows if r['id'] == str(photo_id)), None)
        if not row:
            raise HTTPException(404, 'Photograph unavailable.')
        return Response(storage.crypto.decrypt(row['thumbnail']), media_type='image/jpeg')

    @app.post('/search')
    async def search(request: Request, user=Depends(current_user)):
        uid = str(user.id)
        subject = storage.require_verified(uid)
        if subject['model'] != engine.model_id:
            raise HTTPException(403, 'This enrollment uses a different model. Re-enrollment is required.')
        storage.rate_limit('recognition-search:' + uid, limit=30)
        data = await photo_bytes(request)
        vector, box, _ = await asyncio.to_thread(engine.extract, data)
        results = await asyncio.to_thread(storage.search, uid, vector, settings.threshold)
        return {'matches':results, 'face':box, 'model':engine.model_id, 'score_type':'cosine_similarity', 'threshold':settings.threshold, 'calibrated':False, 'query_retained':False}
    return app


app = create_app()
