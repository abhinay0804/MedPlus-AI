from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.orm import DeclarativeBase
from typing import AsyncGenerator
from server.config import settings
import ssl as _ssl

# Render provides postgres:// but SQLAlchemy async needs postgresql+asyncpg://
db_url = settings.DATABASE_URL
if db_url.startswith("postgres://"):
    db_url = db_url.replace("postgres://", "postgresql+asyncpg://", 1)
elif db_url.startswith("postgresql://") and "+asyncpg" not in db_url:
    db_url = db_url.replace("postgresql://", "postgresql+asyncpg://", 1)

# Build engine kwargs — add SSL for production PostgreSQL (Render requires it)
engine_kwargs = {
    "echo": (settings.ENVIRONMENT == "development"),
    "future": True,
}

is_postgres = "asyncpg" in db_url
if is_postgres:
    # Render PostgreSQL needs SSL; asyncpg accepts ssl=True or an SSLContext
    ssl_ctx = _ssl.create_default_context()
    ssl_ctx.check_hostname = False
    ssl_ctx.verify_mode = _ssl.CERT_NONE
    engine_kwargs["connect_args"] = {"ssl": ssl_ctx}
    engine_kwargs["pool_size"] = 5
    engine_kwargs["max_overflow"] = 5
    engine_kwargs["pool_recycle"] = 300
    engine_kwargs["pool_pre_ping"] = True

# Create async engine
engine = create_async_engine(db_url, **engine_kwargs)

# Async session factory
AsyncSessionLocal = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autocommit=False,
    autoflush=False,
)

# Base class for ORM models
class Base(DeclarativeBase):
    pass

# Dependency for FastAPI route handlers
async def get_db() -> AsyncGenerator[AsyncSession, None]:
    async with AsyncSessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()
