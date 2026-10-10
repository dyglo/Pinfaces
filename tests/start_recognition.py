"""Local browser-test service. No verification is simulated or activated."""
import atexit
import shutil
import tempfile
from cryptography.fernet import Fernet
from backend.recognition import Settings, create_app
path = tempfile.mkdtemp(prefix='pinfaces-browser-tests-')
atexit.register(shutil.rmtree, path, ignore_errors=True)
app = create_app(Settings(path, Fernet.generate_key().decode(), 'browser-test-gateway-more-than-32-characters', 'sk_live_browser_fixture_not_a_real_key', 'whsec_browser_fixture', 'http://127.0.0.1:3000', 'backend/models'))
