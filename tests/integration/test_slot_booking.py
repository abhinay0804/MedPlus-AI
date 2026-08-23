"""
Tests for Phase 2.2 — Slot Engine & Phase 2.3/2.4 Booking Lifecycle
====================================================================

Covers:
  - generate_slots returns correct windows
  - HELD slot is excluded from available slots
  - Conflict detection prevents double-booking (serial)
  - Full patient booking lifecycle: hold → symptoms → confirm
  - Doctor: view appointments, submit notes, mark complete
  - Patient: cancel, reschedule
  - Leave conflict: booking on a leave day is rejected
  - Expired hold is released (via release_expired_holds)
"""

import pytest
from datetime import datetime, timedelta, date as date_type
from unittest.mock import patch, MagicMock
from httpx import AsyncClient, ASGITransport

from server.app import app
from server.database.connection import engine, Base, AsyncSessionLocal
from server.services.slot_service import (
    generate_slots, hold_slot, confirm_slot, release_slot,
    release_expired_holds, HOLD_DURATION_MINUTES,
)
from server.database.models import (
    UserRole, DoctorProfile, Appointment, AppointmentStatus, DoctorLeave,
)
from server.repositories.user_repository import UserRepository
from server.utils.exceptions import SlotConflictError, NotFoundError

# ─── Fixtures ─────────────────────────────────────────────────────────────────

@pytest.fixture(autouse=True)
async def setup_db():
    yield


async def _make_doctor(db, email="doc@test.com") -> tuple:
    """Create a doctor user + profile; return (user, profile)."""
    user_repo = UserRepository(db)
    user = await user_repo.create_user(
        email=email,
        password="Password123!",
        full_name="Dr. Test",
        role=UserRole.DOCTOR,
    )
    profile = DoctorProfile(
        user_id=user.id,
        specialisation="General Medicine",
        working_hours={
            "mon": {"start": "09:00", "end": "12:00"},  # 6 × 30-min slots
        },
        slot_duration_minutes=30,
    )
    db.add(profile)
    await db.flush()
    await db.refresh(profile)
    return user, profile


async def _make_patient(db, email="patient@test.com"):
    user_repo = UserRepository(db)
    return await user_repo.create_user(
        email=email,
        password="Password123!",
        full_name="Test Patient",
        role=UserRole.PATIENT,
    )


def _next_monday() -> date_type:
    today = datetime.utcnow().date()
    days_ahead = ((7 - today.weekday()) % 7 or 7) + 7  # 0 = Monday, shifted by 7 to guarantee >24h
    return today + timedelta(days=days_ahead)


# ─── Unit-level slot engine tests ─────────────────────────────────────────────

@pytest.mark.asyncio
async def test_generate_slots_returns_correct_count():
    """09:00–12:00 with 30-min slots on a Monday = 6 slots."""
    async with AsyncSessionLocal() as db:
        _, profile = await _make_doctor(db)
        await db.commit()

        monday = _next_monday()
        slots = await generate_slots(db, profile.id, monday)

    assert len(slots) == 6
    assert all(s["is_available"] for s in slots)


@pytest.mark.asyncio
async def test_generate_slots_no_working_day():
    """Doctor doesn't work Saturday — returns empty list."""
    async with AsyncSessionLocal() as db:
        _, profile = await _make_doctor(db)
        await db.commit()

        # Find next Saturday
        today = datetime.utcnow().date()
        days_ahead = (5 - today.weekday()) % 7 or 7  # 5 = Saturday
        saturday = today + timedelta(days=days_ahead)

        slots = await generate_slots(db, profile.id, saturday)

    assert slots == []


@pytest.mark.asyncio
async def test_generate_slots_excludes_held():
    """A HELD (non-expired) slot must not appear as available."""
    async with AsyncSessionLocal() as db:
        _, profile = await _make_doctor(db)
        patient = await _make_patient(db)
        await db.commit()

        monday = _next_monday()
        first_slot_start = datetime(monday.year, monday.month, monday.day, 9, 0)

        # Hold first slot
        await hold_slot(db, profile.id, first_slot_start, patient.id)
        await db.commit()

        slots = await generate_slots(db, profile.id, monday)

    taken = [s for s in slots if s["slot_start"] == first_slot_start]
    assert len(taken) == 1
    assert taken[0]["is_available"] is False


@pytest.mark.asyncio
async def test_hold_slot_conflict():
    """Attempting to hold the same slot twice raises SlotConflictError."""
    async with AsyncSessionLocal() as db:
        _, profile = await _make_doctor(db)
        patient1 = await _make_patient(db, "p1@test.com")
        patient2 = await _make_patient(db, "p2@test.com")
        await db.commit()

        monday = _next_monday()
        slot_start = datetime(monday.year, monday.month, monday.day, 9, 0)

        await hold_slot(db, profile.id, slot_start, patient1.id)
        await db.commit()

        with pytest.raises(SlotConflictError):
            await hold_slot(db, profile.id, slot_start, patient2.id)


@pytest.mark.asyncio
async def test_hold_slot_on_leave_day():
    """Holding a slot when doctor is on leave raises SlotConflictError."""
    async with AsyncSessionLocal() as db:
        _, profile = await _make_doctor(db)
        patient = await _make_patient(db)
        monday = _next_monday()

        leave = DoctorLeave(
            doctor_id=profile.id,
            leave_date=monday,
            reason="Conference",
        )
        db.add(leave)
        await db.commit()

        slot_start = datetime(monday.year, monday.month, monday.day, 9, 0)
        with pytest.raises(SlotConflictError):
            await hold_slot(db, profile.id, slot_start, patient.id)


@pytest.mark.asyncio
async def test_confirm_slot_transitions_status():
    """Confirming a HELD slot moves it to CONFIRMED."""
    async with AsyncSessionLocal() as db:
        _, profile = await _make_doctor(db)
        patient = await _make_patient(db)
        await db.commit()

        monday = _next_monday()
        slot_start = datetime(monday.year, monday.month, monday.day, 9, 0)

        held = await hold_slot(db, profile.id, slot_start, patient.id)
        await db.commit()

        confirmed = await confirm_slot(db, held.id, patient.id)
        await db.commit()

    assert confirmed.status == AppointmentStatus.PENDING_APPROVAL
    assert confirmed.hold_expires_at is None


@pytest.mark.asyncio
async def test_expired_hold_is_released_by_beat():
    """release_expired_holds cancels appointments whose hold_expires_at has passed."""
    async with AsyncSessionLocal() as db:
        _, profile = await _make_doctor(db)
        patient = await _make_patient(db)
        await db.commit()

        monday = _next_monday()
        slot_start = datetime(monday.year, monday.month, monday.day, 9, 0)

        held = await hold_slot(db, profile.id, slot_start, patient.id)
        # Backdate the expiry to simulate elapsed time
        held.hold_expires_at = datetime.utcnow() - timedelta(minutes=1)
        await db.flush()
        await db.commit()

        count = await release_expired_holds(db)
        await db.commit()

    assert count == 1


@pytest.mark.asyncio
async def test_cancel_slot():
    """Patient can cancel a CONFIRMED appointment."""
    async with AsyncSessionLocal() as db:
        _, profile = await _make_doctor(db)
        patient = await _make_patient(db)
        await db.commit()

        monday = _next_monday()
        slot_start = datetime(monday.year, monday.month, monday.day, 9, 0)

        held = await hold_slot(db, profile.id, slot_start, patient.id)
        await db.flush()
        confirmed = await confirm_slot(db, held.id, patient.id)
        await db.flush()
        cancelled = await release_slot(db, confirmed.id, patient_id=patient.id)
        await db.commit()

    assert cancelled.status == AppointmentStatus.CANCELLED


# ─── HTTP Integration Tests ────────────────────────────────────────────────────

async def _register_login(ac: AsyncClient, email: str, role: str) -> str:
    """Helper: register and return access token."""
    await ac.post("/api/auth/register", json={
        "email": email, "password": "Password123!", "full_name": "Test User", "role": role,
    })
    res = await ac.post("/api/auth/login", json={"email": email, "password": "Password123!"})
    return res.json()["access_token"]


@pytest.mark.asyncio
async def test_full_booking_lifecycle_http():
    """
    End-to-end HTTP flow with Celery tasks mocked (no Redis required in tests).
    """
    # Patch all Celery .delay() calls so they don't try to connect to Redis
    mock_task = MagicMock()
    mock_task.delay = MagicMock(return_value=MagicMock(id="mock-task-id"))
    patches = [
        patch("server.routes.patient_routes.generate_pre_visit_summary_task", mock_task),
        patch("server.routes.patient_routes.send_email_task", mock_task),
        patch("server.routes.patient_routes.sync_calendar_event_task", mock_task),
        patch("server.routes.doctor_routes.generate_post_visit_summary_task", mock_task),
    ]

    with patches[0], patches[1], patches[2], patches[3]:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            # ── Setup roles ──────────────────────────────────────
            admin_token = await _register_login(ac, "admin@test.com", "ADMIN")
            patient_token = await _register_login(ac, "patient@test.com", "PATIENT")
            admin_h = {"Authorization": f"Bearer {admin_token}"}
            patient_h = {"Authorization": f"Bearer {patient_token}"}

            # ── Admin creates doctor ─────────────────────────────
            monday = _next_monday()
            doc_payload = {
                "email": "doctor@test.com",
                "password": "Password123!",
                "full_name": "Dr. Integration",
                "specialisation": "Cardiology",
                "working_hours": {"mon": {"start": "09:00", "end": "12:00"}},
                "slot_duration_minutes": 30,
            }
            res = await ac.post("/api/admin/doctors", json=doc_payload, headers=admin_h)
            assert res.status_code == 201, res.text
            doctor_id = res.json()["id"]

            # ── Patient searches doctors ─────────────────────────
            res = await ac.get("/api/patient/doctors?specialisation=Cardiology")
            assert res.status_code == 200
            assert len(res.json()) >= 1

            # ── Patient views slots ──────────────────────────────
            res = await ac.get(
                f"/api/patient/doctors/{doctor_id}/slots",
                params={"target_date": monday.isoformat()},
            )
            assert res.status_code == 200
            slots = res.json()
            available_slots = [s for s in slots if s["is_available"]]
            assert len(available_slots) == 6

            # ── Patient holds first slot ─────────────────────────
            first_slot = available_slots[0]["slot_start"]
            res = await ac.post(
                "/api/patient/appointments",
                json={"doctor_id": doctor_id, "slot_start": first_slot},
                headers=patient_h,
            )
            assert res.status_code == 201, res.text
            appt = res.json()
            assert appt["status"] == "HELD"
            appointment_id = appt["id"]

            # ── Slot now appears as unavailable ─────────────────
            res = await ac.get(
                f"/api/patient/doctors/{doctor_id}/slots",
                params={"target_date": monday.isoformat()},
            )
            available_after = [s for s in res.json() if s["is_available"]]
            assert len(available_after) == 5

            # ── Patient submits symptoms ─────────────────────────
            res = await ac.post(
                f"/api/patient/appointments/{appointment_id}/symptoms",
                json={"symptoms_text": "I have been experiencing chest pain and shortness of breath."},
                headers=patient_h,
            )
            assert res.json()["llm_status"] in ("PENDING", "SUCCESS")
            # Verify Celery task was dispatched
            mock_task.delay.assert_called()

            # ── Patient confirms booking ─────────────────────────
            res = await ac.post(
                f"/api/patient/appointments/{appointment_id}/confirm",
                headers=patient_h,
            )
            assert res.status_code == 200, res.text
            assert res.json()["status"] == "PENDING_APPROVAL"

            # ── Doctor logs in ───────────────────────────────────
            res = await ac.post("/api/auth/login", json={"email": "doctor@test.com", "password": "Password123!"})
            doctor_token = res.json()["access_token"]
            doctor_h = {"Authorization": f"Bearer {doctor_token}"}

            # ── Doctor approves appointment request ──────────────
            res = await ac.put(
                f"/api/doctor/appointments/{appointment_id}/approve",
                headers=doctor_h,
            )
            assert res.status_code == 200
            assert res.json()["status"] == "CONFIRMED"

            # ── Doctor views appointments ────────────────────────
            res = await ac.get("/api/doctor/appointments", headers=doctor_h)
            assert res.status_code == 200
            doctor_appointments = res.json()
            assert len(doctor_appointments) == 1
            assert doctor_appointments[0]["id"] == appointment_id

            # ── Doctor submits post-visit notes ──────────────────
            res = await ac.post(
                f"/api/doctor/appointments/{appointment_id}/notes",
                json={
                    "doctor_notes": "Patient showed signs of mild angina. ECG results normal.",
                    "prescription_text": "Aspirin 75mg once daily. Follow up in 4 weeks.",
                },
                headers=doctor_h,
            )
            assert res.status_code == 201, res.text
            assert res.json()["llm_status"] == "PENDING"

            # ── Doctor marks appointment complete ─────────────────
            res = await ac.put(
                f"/api/doctor/appointments/{appointment_id}/complete",
                headers=doctor_h,
            )
            assert res.status_code == 200, res.text
            assert res.json()["status"] == "COMPLETED"

            # ── Patient views appointment detail ─────────────────
            res = await ac.get(
                f"/api/patient/appointments/{appointment_id}",
                headers=patient_h,
            )
            assert res.status_code == 200
            detail = res.json()
            assert detail["status"] == "COMPLETED"
            assert detail["symptom_form"] is not None
            assert detail["post_visit_note"] is not None
