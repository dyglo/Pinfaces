"""Authorization/unit fixtures only. No real-person biometric dataset is seeded."""
from datetime import date
from pathlib import Path
import sqlite3
import time
import numpy as np
import pytest
from cryptography.fernet import Fernet
from fastapi.testclient import TestClient
from backend.recognition_store import SQLiteRecognitionStorage, AuthorizationError, source_url, valid_host
from backend.identity_provider import verified_adult, VerificationError
from backend.recognition import create_app, Settings
from backend.face_engine import FaceEngine, PhotoError

@pytest.fixture
def store(tmp_path):
    return SQLiteRecognitionStorage(str(tmp_path / 'unit.sqlite'), Fernet.generate_key().decode())

@pytest.fixture
def vector():
    result = np.zeros(128, dtype='float32'); result[0] = 1
    return result

def verified_fixture(store, uid, vector):
    """Unit-only synthetic authorization record; never used by product or model validation."""
    store.begin_consent(uid); store.attach_session(uid, 'vs_unit_' + uid)
    store.verify(uid, 'vs_unit_' + uid, vector, 'unit-model')

def domain_fixture(store, owner='owner'):
    row = store.add_domain(owner, 'example.org')
    store.approve_domain(owner, row['host'], row['challenge'])

def test_verification_requires_live_adult_and_matching_selfie():
    session={'livemode':True,'status':'verified','client_reference_id':'adult'}
    report={'document':{'status':'verified','dob':{'year':2000,'month':1,'day':1}},'selfie':{'status':'verified','selfie':'file_test'}}
    assert verified_adult(session,report,'adult',date(2026,10,10))=='file_test'
    for changed in [{**session,'livemode':False},{**session,'status':'processing'},{**session,'client_reference_id':'other'}]:
        with pytest.raises(VerificationError): verified_adult(changed,report,'adult',date(2026,10,10))
    for dob in [{'year':2010,'month':1,'day':1},{'year':2008,'month':10,'day':11},{'year':2000,'month':2,'day':31},{}]:
        with pytest.raises(VerificationError): verified_adult(session,{**report,'document':{**report['document'],'dob':dob}},'adult',date(2026,10,10))
    with pytest.raises(VerificationError): verified_adult(session,{**report,'selfie':{'status':'unverified','selfie':'file_test'}},'adult')

def test_18th_birthday_boundary():
    session={'livemode':True,'status':'verified','client_reference_id':'adult'}
    report={'document':{'status':'verified','dob':{'year':2008,'month':10,'day':10}},'selfie':{'status':'verified','selfie':'file_test'}}
    assert verified_adult(session,report,'adult',date(2026,10,10))=='file_test'
    with pytest.raises(VerificationError): verified_adult(session,report,'adult',date(2026,10,9))

def test_unverified_consent_is_not_authorization(store,vector):
    store.begin_consent('unverified')
    with pytest.raises(AuthorizationError): store.require_verified('unverified')
    with pytest.raises(AuthorizationError): store.search('unverified',vector,0.55)

def test_dual_permissions_source_accuracy_and_faiss_search(store,vector):
    verified_fixture(store,'adult',vector)
    with pytest.raises(AuthorizationError): store.add_photo('adult','https://example.org/image','Title','sha',vector,b'thumbnail','unit-model')
    domain_fixture(store)
    pid=store.add_photo('adult','https://example.org/image','Title','sha',vector,b'thumbnail','unit-model')
    assert store.search('adult',vector,0.55)==[]
    with pytest.raises(AuthorizationError): store.approve_photo('stranger',pid)
    store.approve_photo('owner',pid)
    assert store.search('adult',vector,0.55)==[{'id':pid,'title':'Title','source_url':'https://example.org/image','similarity':1.0}]
    with sqlite3.connect(store.path) as db:
        encrypted,thumbnail=db.execute('SELECT vector,thumbnail FROM photos').fetchone()
        assert encrypted!=vector.tobytes() and thumbnail!=b'thumbnail'
    other=vector.copy();other[0]=0;other[1]=1
    with pytest.raises(AuthorizationError): store.search('adult',other,0.55)
    with pytest.raises(AuthorizationError): store.add_photo('adult','https://example.org/different','Other','sha2',other,b'thumbnail','unit-model')

def test_cross_account_and_domain_revocation(store,vector):
    verified_fixture(store,'alice',vector);verified_fixture(store,'bob',vector)
    domain_fixture(store)
    pid=store.add_photo('alice','https://example.org/a','A','sha',vector,b'thumb','unit-model');store.approve_photo('owner',pid)
    assert store.search('bob',vector,0.55)==[]
    store.delete_photo('bob',pid)
    assert len(store.search('alice',vector,0.55))==1
    store.delete_domain('owner','example.org')
    assert store.search('alice',vector,0.55)==[]
    assert store.photos(user_id='alice')==[]

def test_withdrawal_blocks_replayed_provider_approvals(store,vector):
    verified_fixture(store,'adult',vector);domain_fixture(store)
    pid=store.add_photo('adult','https://example.org/a','A','sha',vector,b'thumb','unit-model');store.approve_photo('owner',pid)
    store.revoke('adult')
    assert store.subject('adult') is None
    assert store.session_subject('vs_unit_adult') is None
    assert store.photos(user_id='adult')==[]
    assert 'vs_unit_adult' in store.redactions()
    with pytest.raises(AuthorizationError): store.verify('adult','vs_unit_adult',vector,'unit-model')
    with pytest.raises(AuthorizationError): store.search('adult',vector,0.55)

def test_retention_expiry_and_rate_limit(store,vector):
    verified_fixture(store,'adult',vector);domain_fixture(store)
    pid=store.add_photo('adult','https://example.org/a','A','sha',vector,b'thumb','unit-model');store.approve_photo('owner',pid)
    with store.connection() as db: db.execute('UPDATE subjects SET expires_at=?',(time.time()-1,))
    with pytest.raises(AuthorizationError): store.search('adult',vector,0.55)
    store.purge()
    assert store.subject('adult') is None and store.photos(user_id='adult')==[]
    store.rate_limit('unit',limit=1)
    with pytest.raises(AuthorizationError): store.rate_limit('unit',limit=1)

@pytest.mark.parametrize('url',['http://example.org','https://user:pass@example.org','https://127.0.0.1/a','https://example.org:8000/a','javascript:alert(1)','https://foo.local/a'])
def test_sources_reject_unsafe_urls(url):
    with pytest.raises(ValueError): source_url(url)

def test_domains_and_sources_normalization():
    assert source_url('https://example.org/photo')==('https://example.org/photo','example.org')
    assert valid_host('EXAMPLE.ORG')=='example.org'

@pytest.fixture
def real_engine():
    directory=Path('backend/models')
    if not (directory/'sface.onnx').exists(): pytest.skip('Run python -m backend.download_models for real inference checks')
    return FaceEngine(directory)

def test_actual_model_loading_no_face_and_embedding_forward_pass(real_engine):
    # Earth contains no identity. The blank aligned tensor only checks model execution.
    with pytest.raises(PhotoError,match='No face detected'): real_engine.extract(Path('tests/fixtures/earth.jpg').read_bytes())
    assert real_engine.recognizer.feature(np.zeros((112,112,3),dtype='uint8')).shape==(1,128)
    with pytest.raises(PhotoError): real_engine.extract(b'<svg/>')

@pytest.fixture
def service(tmp_path,real_engine):
    settings=Settings(str(tmp_path),Fernet.generate_key().decode(),'test-gateway-key-with-more-than-32-characters','sk_live_unit_test_not_a_real_key','whsec_unit_test','http://127.0.0.1:3000','backend/models')
    app=create_app(settings,face_engine=real_engine)
    with TestClient(app) as client:
        yield client,settings,app

def test_account_session_revocation_and_unauthorized_search(service):
    client,settings,app=service
    gateway={'x-recognition-gateway':settings.gateway_key,'origin':settings.public_url}
    assert client.post('/auth/register',json={'email':'pilot@example.org','password':'test-strong-password'},headers=gateway).status_code==201
    login=client.post('/auth/login',data={'username':'pilot@example.org','password':'test-strong-password'},headers=gateway)
    assert login.status_code==204
    token=client.cookies.get('pinfaces_session')
    assert 'HttpOnly' in login.headers['set-cookie']
    assert client.get('/account',headers=gateway).status_code==200
    assert client.post('/search',content=b'not an image',headers={**gateway,'content-type':'image/png'}).status_code==403
    assert client.post('/enrollment',json={'consent':False,'version':'recognition-v1'},headers=gateway).status_code==403
    assert client.post('/auth/logout',headers=gateway).status_code==204
    assert client.get('/account',headers={**gateway,'cookie':'pinfaces_session='+token}).status_code==401

def test_gateway_csrf_testmode_webhook_and_missing_configuration(service):
    client,settings,app=service
    assert client.get('/account').status_code==401
    assert client.post('/auth/login',headers={'x-recognition-gateway':settings.gateway_key,'origin':'https://evil.example'}).status_code==403
    assert client.post('/verification/webhook',content=b'{}',headers={'stripe-signature':'bad'}).status_code==400
    import hashlib,hmac,json
    raw=json.dumps({'livemode':False,'type':'identity.verification_session.verified','data':{'object':{'id':'vs_fake'}}}).encode()
    stamp=int(time.time());signature=hmac.new(settings.stripe_webhook_secret.encode(),str(stamp).encode()+b'.'+raw,hashlib.sha256).hexdigest()
    assert client.post('/verification/webhook',content=raw,headers={'stripe-signature':f't={stamp},v1={signature}'}).status_code==403
    with TestClient(create_app()) as unavailable:
        assert unavailable.get('/health').json()['recognition_ready'] is False
        assert unavailable.post('/search').status_code==503
