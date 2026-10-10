"""Persistent metadata abstraction. Biometric templates and thumbnails are encrypted."""
from contextlib import contextmanager
import json
import secrets
import sqlite3
import time
from typing import Protocol
from urllib.parse import urlsplit
from uuid import uuid4
from cryptography.fernet import Fernet
import faiss
import numpy as np

RETENTION = 30 * 86400
CONSENT_VERSION = 'recognition-v1'
class AuthorizationError(ValueError):
    pass
class RecognitionStorage(Protocol):
    def subject(self, user_id: str): ...
    def purge(self): ...
    def search(self, user_id: str, vector: np.ndarray, threshold: float): ...

def valid_host(value: str) -> str:
    import ipaddress
    host = value.strip().lower().encode('idna').decode()
    try:
        ipaddress.ip_address(host)
    except ValueError:
        pass
    else:
        raise ValueError('Use a public website domain, not an IP address.')
    if len(host) > 253 or '.' not in host or host.endswith(('.local', '.localhost', '.internal')) or any(not label or len(label) > 63 or not label.replace('-', '').isalnum() or label.startswith('-') or label.endswith('-') for label in host.split('.')):
        raise ValueError('Enter a valid public website domain.')
    return host

def source_url(value: str) -> tuple[str, str]:
    if len(value) > 2000:
        raise ValueError('Source URL is too long.')
    url = urlsplit(value)
    if url.scheme != 'https' or url.username or url.password or url.port not in (None, 443) or not url.hostname or url.fragment:
        raise ValueError('Use an HTTPS source page URL without credentials or a fragment.')
    return value, valid_host(url.hostname)

class SQLiteRecognitionStorage:
    def __init__(self, path: str, encryption_key: str):
        self.path = path
        self.crypto = Fernet(encryption_key.encode())
        with self.connection() as db:
            db.executescript('''
            PRAGMA journal_mode=WAL;
            CREATE TABLE IF NOT EXISTS subjects (
              user_id TEXT PRIMARY KEY, consent_at REAL NOT NULL, expires_at REAL NOT NULL,
              status TEXT NOT NULL DEFAULT 'pending', verification_id TEXT UNIQUE,
              reference BLOB, model TEXT, verified_at REAL);
            CREATE TABLE IF NOT EXISTS domains (
              host TEXT PRIMARY KEY, owner_id TEXT NOT NULL, challenge TEXT NOT NULL,
              approved_at REAL, expires_at REAL NOT NULL);
            CREATE TABLE IF NOT EXISTS photos (
              id TEXT PRIMARY KEY, user_id TEXT NOT NULL, host TEXT NOT NULL, source_url TEXT NOT NULL,
              title TEXT NOT NULL, digest TEXT NOT NULL, vector BLOB NOT NULL, thumbnail BLOB NOT NULL,
              model TEXT NOT NULL, consent_at REAL NOT NULL, expires_at REAL NOT NULL,
              approved_at REAL, UNIQUE(user_id, source_url, digest));
            CREATE TABLE IF NOT EXISTS redactions (session_id TEXT PRIMARY KEY);
            CREATE TABLE IF NOT EXISTS audit (at REAL NOT NULL, user_id TEXT NOT NULL, event TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS rate_limits (scope TEXT PRIMARY KEY, window INTEGER NOT NULL, count INTEGER NOT NULL);
            ''')

    @contextmanager
    def connection(self):
        db = sqlite3.connect(self.path, timeout=15)
        db.row_factory = sqlite3.Row
        db.execute('PRAGMA secure_delete=ON')
        try:
            with db:
                yield db
        finally:
            db.close()

    def event(self, db, user_id, event):
        db.execute('INSERT INTO audit VALUES(?,?,?)', (time.time(), user_id, event))

    def subject(self, user_id):
        with self.connection() as db:
            row = db.execute('SELECT * FROM subjects WHERE user_id=?', (user_id,)).fetchone()
            return dict(row) if row else None

    def require_verified(self, user_id):
        subject = self.subject(user_id)
        if not subject or subject['status'] != 'verified' or not subject['reference'] or subject['expires_at'] <= time.time():
            raise AuthorizationError('Complete live adult identity verification and biometric consent before recognition.')
        return subject

    def begin_consent(self, user_id):
        now = time.time()
        with self.connection() as db:
            prior = db.execute('SELECT * FROM subjects WHERE user_id=?', (user_id,)).fetchone()
            if prior and prior['expires_at'] > now:
                return dict(prior)
            if prior and prior['verification_id']:
                db.execute('INSERT OR IGNORE INTO redactions VALUES(?)', (prior['verification_id'],))
            db.execute('DELETE FROM photos WHERE user_id=?', (user_id,))
            db.execute('INSERT OR REPLACE INTO subjects(user_id,consent_at,expires_at) VALUES(?,?,?)', (user_id, now, now + RETENTION))
            self.event(db, user_id, 'consent:' + CONSENT_VERSION)
        return self.subject(user_id)

    def attach_session(self, user_id, session_id):
        with self.connection() as db:
            row = db.execute('SELECT verification_id FROM subjects WHERE user_id=?', (user_id,)).fetchone()
            if not row:
                raise AuthorizationError('Consent has been withdrawn.')
            if row['verification_id'] and row['verification_id'] != session_id:
                db.execute('INSERT OR IGNORE INTO redactions VALUES(?)', (row['verification_id'],))
            db.execute('UPDATE subjects SET verification_id=?,status=\'pending\',reference=NULL WHERE user_id=? AND expires_at>?', (session_id, user_id, time.time()))

    def session_subject(self, session_id):
        with self.connection() as db:
            row = db.execute('SELECT * FROM subjects WHERE verification_id=?', (session_id,)).fetchone()
            return dict(row) if row else None

    def verify(self, user_id, session_id, vector, model):
        with self.connection() as db:
            cursor = db.execute('UPDATE subjects SET reference=?,model=?,verified_at=?,status=\'verified\' WHERE user_id=? AND verification_id=? AND expires_at>? AND status=\'pending\'', (self.encode(vector), model, time.time(), user_id, session_id, time.time()))
            if cursor.rowcount != 1:
                raise AuthorizationError('This consent/session is inactive or already processed.')
            self.event(db, user_id, 'adult_identity_verified')

    def reject(self, user_id, session_id):
        with self.connection() as db:
            db.execute('UPDATE subjects SET status=\'rejected\',reference=NULL WHERE user_id=? AND verification_id=?', (user_id, session_id))
            db.execute('DELETE FROM photos WHERE user_id=?', (user_id,))
            db.execute('INSERT OR IGNORE INTO redactions VALUES(?)', (session_id,))
            self.event(db, user_id, 'verification_rejected')

    def encode(self, vector):
        vector = np.asarray(vector, dtype='float32').reshape(-1)
        if vector.size != 128 or not np.isfinite(vector).all() or abs(float(np.linalg.norm(vector)) - 1) > 0.01:
            raise ValueError('Invalid normalized embedding.')
        return self.crypto.encrypt(vector.tobytes())

    def decode(self, vector):
        return np.frombuffer(self.crypto.decrypt(vector), dtype='float32').copy()

    def add_domain(self, owner_id, host):
        host = valid_host(host)
        challenge = secrets.token_urlsafe(32)
        with self.connection() as db:
            prior = db.execute('SELECT * FROM domains WHERE host=?', (host,)).fetchone()
            if prior and prior['owner_id'] != owner_id:
                raise AuthorizationError('This website is already registered by another account.')
            if prior and prior['expires_at'] > time.time():
                return dict(prior)
            db.execute('INSERT OR REPLACE INTO domains VALUES(?,?,?,NULL,?)', (host, owner_id, challenge, time.time() + RETENTION))
            self.event(db, owner_id, 'domain_authorization_requested')
        return self.domain(host)

    def domain(self, host):
        with self.connection() as db:
            row = db.execute('SELECT * FROM domains WHERE host=?', (host,)).fetchone()
            return dict(row) if row else None

    def approve_domain(self, owner_id, host, challenge):
        with self.connection() as db:
            cursor = db.execute('UPDATE domains SET approved_at=? WHERE owner_id=? AND host=? AND challenge=? AND expires_at>?', (time.time(), owner_id, host, challenge, time.time()))
            if cursor.rowcount != 1:
                raise AuthorizationError('Domain authorization is missing or expired.')
            self.event(db, owner_id, 'domain_ownership_verified')

    def domain_list(self, owner_id=None):
        with self.connection() as db:
            if owner_id:
                return [dict(r) for r in db.execute('SELECT * FROM domains WHERE owner_id=? AND expires_at>?', (owner_id, time.time()))]
            return [dict(r) for r in db.execute('SELECT host,expires_at FROM domains WHERE approved_at IS NOT NULL AND expires_at>?', (time.time(),))]

    def add_photo(self, user_id, url, title, digest, vector, thumbnail, model):
        subject = self.require_verified(user_id)
        if subject["model"] != model or float(vector @ self.decode(subject["reference"])) < 0.60:
            raise AuthorizationError("This photograph does not match the current verified enrollment.")
        url, host = source_url(url)
        domain = self.domain(host)
        if not domain or not domain['approved_at'] or domain['expires_at'] <= time.time():
            raise AuthorizationError('This website has not authorized participation.')
        photo_id = str(uuid4())
        with self.connection() as db:
            if db.execute('SELECT count(*) FROM photos WHERE user_id=?', (user_id,)).fetchone()[0] >= 200:
                raise ValueError('The pilot supports up to 200 authorized photos per enrollment.')
            if db.execute('SELECT 1 FROM photos WHERE user_id=? AND source_url=? AND digest=?', (user_id, url, digest)).fetchone():
                raise ValueError('This photograph and source have already been submitted.')
            db.execute('INSERT INTO photos(id,user_id,host,source_url,title,digest,vector,thumbnail,model,consent_at,expires_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)', (photo_id, user_id, host, url, title[:200], digest, self.encode(vector), self.crypto.encrypt(thumbnail), model, time.time(), time.time() + RETENTION))
            self.event(db, user_id, 'photo_consent_recorded')
        return photo_id

    def photos(self, user_id=None, owner_id=None):
        with self.connection() as db:
            rows = db.execute('''SELECT p.* FROM photos p JOIN subjects s ON s.user_id=p.user_id
              JOIN domains d ON d.host=p.host WHERE p.expires_at>? AND s.expires_at>? AND s.status='verified'
              AND d.approved_at IS NOT NULL AND d.expires_at>? AND (? IS NULL OR p.user_id=?)
              AND (? IS NULL OR d.owner_id=?) ORDER BY p.consent_at DESC''', (time.time(), time.time(), time.time(), user_id, user_id, owner_id, owner_id)).fetchall()
            return [dict(r) for r in rows]

    def approve_photo(self, owner_id, photo_id):
        with self.connection() as db:
            cursor = db.execute('''UPDATE photos SET approved_at=? WHERE id=? AND expires_at>?
              AND host IN (SELECT host FROM domains WHERE owner_id=? AND approved_at IS NOT NULL AND expires_at>?)
              AND user_id IN (SELECT user_id FROM subjects WHERE status='verified' AND expires_at>?)''', (time.time(), photo_id, time.time(), owner_id, time.time(), time.time()))
            if cursor.rowcount != 1:
                raise AuthorizationError('The photo is unavailable or this account does not control its source.')
            self.event(db, owner_id, 'source_photo_authorized')

    def search(self, user_id, vector, threshold):
        subject = self.require_verified(user_id)
        if float(vector @ self.decode(subject['reference'])) < max(threshold, 0.60):
            raise AuthorizationError('The query does not sufficiently match your verified enrollment. Use another photograph of yourself.')
        rows = [r for r in self.photos(user_id=user_id) if r['approved_at'] and r['model'] == subject['model']]
        if not rows:
            return []
        index = faiss.IndexFlatIP(128)
        index.add(np.stack([self.decode(r['vector']) for r in rows]))
        scores, positions = index.search(np.asarray(vector, dtype='float32').reshape(1, -1), min(24, len(rows)))
        # Recheck current authorization after the in-memory search; never persist indexes.
        current = self.require_verified(user_id)
        if current['verification_id'] != subject['verification_id']:
            raise AuthorizationError('Your enrollment changed during this search. Try again.')
        active = {r['id'] for r in self.photos(user_id=user_id) if r['approved_at']}
        return [{'id': rows[pos]['id'], 'title': rows[pos]['title'], 'source_url': rows[pos]['source_url'], 'similarity': round(float(score), 4)} for score, pos in zip(scores[0], positions[0]) if score >= threshold and rows[pos]['id'] in active]

    def delete_photo(self, user_id, photo_id):
        with self.connection() as db:
            db.execute('DELETE FROM photos WHERE id=? AND user_id=?', (photo_id, user_id))
            self.event(db, user_id, 'photo_deleted')

    def delete_domain(self, owner_id, host):
        with self.connection() as db:
            db.execute('DELETE FROM photos WHERE host IN (SELECT host FROM domains WHERE host=? AND owner_id=?)', (host, owner_id))
            db.execute('DELETE FROM domains WHERE host=? AND owner_id=?', (host, owner_id))
            self.event(db, owner_id, 'domain_authorization_revoked')

    def revoke(self, user_id):
        with self.connection() as db:
            db.execute('INSERT OR IGNORE INTO redactions SELECT verification_id FROM subjects WHERE user_id=? AND verification_id IS NOT NULL', (user_id,))
            db.execute('DELETE FROM photos WHERE user_id=? OR host IN (SELECT host FROM domains WHERE owner_id=?)', (user_id, user_id))
            db.execute('DELETE FROM domains WHERE owner_id=?', (user_id,))
            db.execute('DELETE FROM subjects WHERE user_id=?', (user_id,))
            self.event(db, user_id, 'consent_withdrawn')

    def purge(self):
        with self.connection() as db:
            now = time.time()
            db.execute('INSERT OR IGNORE INTO redactions SELECT verification_id FROM subjects WHERE expires_at<=? AND verification_id IS NOT NULL', (now,))
            db.execute('DELETE FROM photos WHERE expires_at<=? OR user_id IN (SELECT user_id FROM subjects WHERE expires_at<=?) OR host IN (SELECT host FROM domains WHERE expires_at<=?)', (now, now, now))
            db.execute('DELETE FROM subjects WHERE expires_at<=?', (now,))
            db.execute('DELETE FROM domains WHERE expires_at<=?', (now,))
            db.execute('DELETE FROM audit WHERE at<?', (now - RETENTION,))
            db.execute('DELETE FROM rate_limits WHERE window<?', (int(now // 3600) - 1,))

    def rate_limit(self, scope, limit=30):
        with self.connection() as db:
            window = int(time.time() // 3600)
            db.execute('INSERT INTO rate_limits VALUES(?,?,1) ON CONFLICT(scope) DO UPDATE SET count=CASE WHEN window=excluded.window THEN count+1 ELSE 1 END, window=excluded.window', (scope, window))
            count = db.execute('SELECT count FROM rate_limits WHERE scope=?', (scope,)).fetchone()[0]
            if count > limit:
                raise AuthorizationError('Hourly request limit reached. Try again later.')

    def redactions(self):
        with self.connection() as db:
            return [r[0] for r in db.execute('SELECT session_id FROM redactions LIMIT 10')]

    def redacted(self, session_id):
        with self.connection() as db:
            db.execute('DELETE FROM redactions WHERE session_id=?', (session_id,))
