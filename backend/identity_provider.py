"""Live Stripe Identity checks. No self-attested or test-mode verification approvals."""
from datetime import date
from urllib.parse import urlsplit
import httpx
from stripe import StripeClient

class VerificationError(ValueError):
    pass

def verified_adult(session, report, user_id, today=None):
    if not session.get('livemode') or session.get('status') != 'verified' or session.get('client_reference_id') != user_id:
        raise VerificationError('Live identity verification has not completed for this account.')
    document, selfie = report.get('document', {}), report.get('selfie', {})
    if document.get('status') != 'verified' or selfie.get('status') != 'verified' or not selfie.get('selfie'):
        raise VerificationError('A verified document and matching live selfie are required.')
    raw = document.get('dob') or {}
    try:
        birth = date(raw['year'], raw['month'], raw['day'])
    except (KeyError, ValueError, TypeError):
        raise VerificationError('The verified date of birth is unavailable.') from None
    today = today or date.today()
    age = today.year - birth.year - ((today.month, today.day) < (birth.month, birth.day))
    if age < 18 or age > 120:
        raise VerificationError('Only verified adults aged 18 or older can enroll.')
    return selfie['selfie']

class StripeIdentity:
    def __init__(self, key, return_url):
        self.key = key
        self.client = StripeClient(key, max_network_retries=1)
        self.return_url = return_url

    def create(self, user_id, idempotency):
        session = self.client.v1.identity.verification_sessions.create({'type': 'document', 'client_reference_id': user_id, 'return_url': self.return_url, 'options': {'document': {'require_matching_selfie': True, 'require_live_capture': True}}}, options={'idempotency_key': idempotency})
        if not session.livemode or not session.url or urlsplit(session.url).hostname != 'verify.stripe.com':
            raise VerificationError('A live Stripe Identity account and hosted verification session are required.')
        return session.id, session.url

    def evidence(self, session_id, user_id):
        session = self.client.v1.identity.verification_sessions.retrieve(session_id)
        if not session.get('last_verification_report'):
            raise VerificationError('Identity verification is still pending.')
        report = self.client.v1.identity.verification_reports.retrieve(session.last_verification_report)
        file_id = verified_adult(session, report, user_id)
        file = self.client.v1.files.retrieve(file_id)
        url = urlsplit(file.url or '')
        if url.scheme != 'https' or url.hostname != 'files.stripe.com' or url.username or url.password or url.port not in (None, 443):
            raise VerificationError('The verified selfie cannot be retrieved safely.')
        data = bytearray()
        # File URL is authenticated and returned by Stripe, never supplied by a user.
        with httpx.stream('GET', file.url, headers={'Authorization': 'Bearer ' + self.key}, timeout=30, follow_redirects=False) as response:
            response.raise_for_status()
            for chunk in response.iter_bytes():
                data.extend(chunk)
                if len(data) > 4_000_000:
                    raise VerificationError('Verified selfie exceeds the supported image size.')
        return bytes(data)

    def redact(self, session_id):
        self.client.v1.identity.verification_sessions.redact(session_id)
