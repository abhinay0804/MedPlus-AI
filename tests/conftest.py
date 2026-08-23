"""
Pytest Configuration & Database Fixtures
=========================================
Ensures database tables exist and are clean before every test.
"""

import pytest
import pytest_asyncio
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy import delete
from server.database.connection import engine, Base, AsyncSessionLocal
from server.database.models import (
    User, DoctorProfile, DoctorLeave, Appointment, SymptomForm, PostVisitNote, MedicationReminder, CalendarEvent, DoctorReview, AuditLog
)
from server.routes.auth_routes import get_db

TEST_DATABASE_URL = "sqlite+aiosqlite:///./test_healthcare.db"
test_engine = create_async_engine(TEST_DATABASE_URL, echo=False)
TestSessionLocal = async_sessionmaker(test_engine, class_=AsyncSession, expire_on_commit=False)


@pytest_asyncio.fixture(autouse=True)
async def prepare_and_clear_db():
    """Ensure all tables exist and clear data safely between tests."""
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
        await conn.run_sync(Base.metadata.create_all)
    
    async with AsyncSessionLocal() as session:
        try:
            await session.execute(delete(MedicationReminder))
            await session.execute(delete(CalendarEvent))
            await session.execute(delete(DoctorReview))
            await session.execute(delete(AuditLog))
            await session.execute(delete(PostVisitNote))
            await session.execute(delete(SymptomForm))
            await session.execute(delete(Appointment))
            await session.execute(delete(DoctorLeave))
            await session.execute(delete(DoctorProfile))
            await session.execute(delete(User))
            await session.commit()
        except Exception:
            await session.rollback()
    yield
    # Restore demo accounts after tests finish so dev environment stays populated
    try:
        from scripts.seed_db import seed
        await seed()
    except Exception:
        pass


@pytest_asyncio.fixture
async def db_session():
    """Async DB session fixture for unit & repository tests."""
    async with AsyncSessionLocal() as session:
        yield session
