"""
Pytest Configuration & Database Fixtures
=========================================
Ensures database tables exist and are clean before every test.
"""

import os
# Force settings to use the test database before server modules are imported
os.environ["DATABASE_URL"] = "sqlite+aiosqlite:///./test_healthcare.db"

import pytest
import pytest_asyncio
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import delete
from server.database.connection import engine, Base, AsyncSessionLocal
from server.database.models import (
    User, DoctorProfile, DoctorLeave, Appointment, SymptomForm, PostVisitNote, MedicationReminder, CalendarEvent, DoctorReview, AuditLog
)

@pytest_asyncio.fixture(autouse=True)
async def prepare_and_clear_db():
    """Ensure all tables exist and clear data safely on the test database between tests."""
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


@pytest_asyncio.fixture
async def db_session():
    """Async DB session fixture for unit & repository tests pointing to test database."""
    async with AsyncSessionLocal() as session:
        yield session
