"""Library-managed account authentication with revocable database sessions."""
import uuid
from fastapi import Depends
from fastapi_users import BaseUserManager, FastAPIUsers, UUIDIDMixin, schemas
from fastapi_users.exceptions import InvalidPasswordException
from fastapi_users.authentication import AuthenticationBackend, CookieTransport
from fastapi_users.authentication.strategy.db import DatabaseStrategy
from fastapi_users_db_sqlalchemy import SQLAlchemyBaseUserTableUUID, SQLAlchemyUserDatabase
from fastapi_users_db_sqlalchemy.access_token import SQLAlchemyBaseAccessTokenTableUUID, SQLAlchemyAccessTokenDatabase
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker
from sqlalchemy.orm import DeclarativeBase
from sqlalchemy import event

class Base(DeclarativeBase):
    pass
class User(SQLAlchemyBaseUserTableUUID, Base):
    pass
class AccessToken(SQLAlchemyBaseAccessTokenTableUUID, Base):
    pass
class UserRead(schemas.BaseUser[uuid.UUID]):
    pass
class UserCreate(schemas.BaseUserCreate):
    pass

class UserManager(UUIDIDMixin, BaseUserManager[User, uuid.UUID]):
    async def validate_password(self, password, user):
        if len(password) < 12 or len(password) > 128:
            raise InvalidPasswordException('Use a password between 12 and 128 characters.')

class AccountAuth:
    def __init__(self, path, secure):
        self.engine = create_async_engine('sqlite+aiosqlite:///' + path)
        @event.listens_for(self.engine.sync_engine, 'connect')
        def sqlite_protection(connection, record):
            cursor = connection.cursor()
            cursor.execute('PRAGMA foreign_keys=ON')
            cursor.execute('PRAGMA secure_delete=ON')
            cursor.close()
        factory = async_sessionmaker(self.engine, expire_on_commit=False)
        async def get_session():
            async with factory() as session:
                yield session
        async def get_user_db(session=Depends(get_session)):
            yield SQLAlchemyUserDatabase(session, User)
        async def get_manager(db=Depends(get_user_db)):
            yield UserManager(db)
        async def get_token_db(session=Depends(get_session)):
            yield SQLAlchemyAccessTokenDatabase(session, AccessToken)
        def get_strategy(db=Depends(get_token_db)):
            return DatabaseStrategy(db, lifetime_seconds=3600)
        self.get_manager = get_manager
        backend = AuthenticationBackend(name='cookie', transport=CookieTransport(cookie_name='pinfaces_session', cookie_max_age=3600, cookie_secure=secure, cookie_samesite='lax'), get_strategy=get_strategy)
        self.users = FastAPIUsers[User, uuid.UUID](get_manager, [backend])
        self.backend = backend
        self.current_user = self.users.current_user(active=True)

    async def initialize(self):
        async with self.engine.begin() as connection:
            await connection.run_sync(Base.metadata.create_all)
