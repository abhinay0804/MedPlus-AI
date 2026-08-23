"""
Unit Tests — Database Repositories
===================================
Tests for UserRepository, DoctorRepository, AppointmentRepository, and ReminderRepository.
"""

import pytest
from datetime import datetime, timedelta, date, time
from sqlalchemy.ext.asyncio import AsyncSession

from server.database.models import UserRole, AppointmentStatus, LLMStatus, Appointment
from server.repositories.user_repository import UserRepository
from server.repositories.doctor_repository import DoctorRepository
from server.repositories.appointment_repository import AppointmentRepository
from server.repositories.reminder_repository import ReminderRepository


# ─── UserRepository Tests ────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_user_repository_crud(db_session: AsyncSession):
    user_repo = UserRepository(db_session)

    # 1. Create User
    user = await user_repo.create_user(
        email="repo_user@test.com",
        password="Password123!",
        full_name="Repo User",
        role=UserRole.PATIENT,
    )
    assert user.id is not None
    assert user.email == "repo_user@test.com"

    # 2. Get by ID
    fetched = await user_repo.get_by_id(user.id)
    assert fetched is not None
    assert fetched.full_name == "Repo User"

    # 3. Get by Email
    fetched_email = await user_repo.get_by_email("repo_user@test.com")
    assert fetched_email is not None
    assert fetched_email.id == user.id


# ─── DoctorRepository Tests ──────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_doctor_repository_crud(db_session: AsyncSession):
    user_repo = UserRepository(db_session)
    doc_repo = DoctorRepository(db_session)

    # 1. Create doctor user & profile
    user = await user_repo.create_user(
        email="repo_doc@test.com",
        password="Password123!",
        full_name="Dr. Repo",
        role=UserRole.DOCTOR,
    )

    doc_profile = await doc_repo.create_doctor(
        user_id=user.id,
        specialisation="Orthopedics",
        working_hours={"mon": {"start": "09:00", "end": "17:00"}},
        slot_duration_minutes=30,
    )
    assert doc_profile.id is not None
    assert doc_profile.specialisation == "Orthopedics"

    # 2. List active doctors
    active_docs = await doc_repo.list_doctors()
    assert len(active_docs) >= 1

    # 3. Add doctor leave
    today = date.today()
    leave = await doc_repo.add_leave(
        doctor_id=doc_profile.id,
        leave_date=today,
        reason="Medical conference",
    )
    assert leave.id is not None

    # 4. Check is_doctor_on_leave
    on_leave = await doc_repo.is_doctor_on_leave(doc_profile.id, today)
    assert on_leave is True


# ─── AppointmentRepository Tests ─────────────────────────────────────────────

@pytest.mark.asyncio
async def test_appointment_repository_lifecycle(db_session: AsyncSession):
    user_repo = UserRepository(db_session)
    doc_repo = DoctorRepository(db_session)
    appt_repo = AppointmentRepository(db_session)

    patient = await user_repo.create_user(
        email="apt_patient@test.com",
        password="Password123!",
        full_name="Apt Patient",
        role=UserRole.PATIENT,
    )
    doc_user = await user_repo.create_user(
        email="apt_doc@test.com",
        password="Password123!",
        full_name="Dr. Apt",
        role=UserRole.DOCTOR,
    )
    doc_profile = await doc_repo.create_doctor(
        user_id=doc_user.id,
        specialisation="Neurology",
        working_hours={"mon": {"start": "09:00", "end": "17:00"}},
    )

    start = datetime.utcnow() + timedelta(days=1)
    end = start + timedelta(minutes=30)
    expires_at = datetime.utcnow() + timedelta(minutes=5)

    # 1. Create HELD appointment
    appt = Appointment(
        patient_id=patient.id,
        doctor_id=doc_profile.id,
        slot_start=start,
        slot_end=end,
        status=AppointmentStatus.HELD,
        hold_expires_at=expires_at,
    )
    db_session.add(appt)
    await db_session.flush()
    await db_session.refresh(appt)

    assert appt.id is not None
    assert appt.status == AppointmentStatus.HELD

    # 2. Confirm appointment
    confirmed = await appt_repo.update_status(appt.id, AppointmentStatus.CONFIRMED)
    assert confirmed.status == AppointmentStatus.CONFIRMED

    # 3. Create Symptom Form
    symptom_form = await appt_repo.create_symptom_form(
        appointment_id=appt.id,
        symptoms_text="Severe migraine and nausea for 2 days.",
    )
    assert symptom_form.id is not None
    assert symptom_form.llm_status == LLMStatus.PENDING

    # 4. Create Post Visit Note
    note = await appt_repo.create_post_visit_note(
        appointment_id=appt.id,
        doctor_notes="Patient has acute migraine.",
        prescription_text="Sumatriptan 50mg as needed.",
    )
    assert note.id is not None


# ─── ReminderRepository Tests ────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_reminder_repository_operations(db_session: AsyncSession):
    user_repo = UserRepository(db_session)
    doc_repo = DoctorRepository(db_session)
    appt_repo = AppointmentRepository(db_session)
    reminder_repo = ReminderRepository(db_session)

    patient = await user_repo.create_user(
        email="rem_patient@test.com",
        password="Password123!",
        full_name="Reminder Patient",
        role=UserRole.PATIENT,
    )
    doc_user = await user_repo.create_user(
        email="rem_doc@test.com",
        password="Password123!",
        full_name="Dr. Reminder",
        role=UserRole.DOCTOR,
    )
    doc_profile = await doc_repo.create_doctor(
        user_id=doc_user.id,
        specialisation="General Practice",
        working_hours={"mon": {"start": "09:00", "end": "17:00"}},
    )

    start = datetime.utcnow() + timedelta(days=1)
    end = start + timedelta(minutes=30)
    appt = Appointment(
        patient_id=patient.id,
        doctor_id=doc_profile.id,
        slot_start=start,
        slot_end=end,
        status=AppointmentStatus.CONFIRMED,
    )
    db_session.add(appt)
    await db_session.flush()

    note = await appt_repo.create_post_visit_note(
        appointment_id=appt.id,
        doctor_notes="Take medication daily.",
    )

    today = date.today()
    reminder = await reminder_repo.create_reminder(
        post_visit_note_id=note.id,
        patient_id=patient.id,
        medication_name="Amoxicillin",
        dosage="500mg",
        frequency="Every 8 hours",
        start_date=today,
        end_date=today + timedelta(days=7),
        reminder_time=time(9, 0),
    )
    assert reminder.id is not None
    assert reminder.is_active is True

    # Query due reminders
    due = await reminder_repo.get_due_reminders(time(9, 0), today)
    assert len(due) >= 1
