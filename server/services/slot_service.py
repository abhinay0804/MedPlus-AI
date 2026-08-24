"""
Slot Engine — Concurrency-Safe Appointment Slot Management
===========================================================

Design rationale:
  - SQLite uses file-level locking; `SELECT FOR UPDATE` is not supported.
  - PostgreSQL uses row-level `SELECT FOR UPDATE SKIP LOCKED` to prevent
    double-booking under concurrent load.
  - We detect the dialect at runtime and choose the appropriate strategy:
      • PostgreSQL → true pessimistic row lock (SKIP LOCKED)
      • SQLite     → serialized advisory check (acceptable for dev/test)
  - Hold lifecycle: HELD for 5 minutes (hold_expires_at). If patient does
    not confirm within the window the Celery beat task releases the hold.
  - Slot alignment is enforced: slot_start must be a multiple of
    slot_duration_minutes from the start of the doctor's working day.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone, date as date_type
from typing import List, Optional

from sqlalchemy import select, text, func, and_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from server.database.models import (
    Appointment, AppointmentStatus, DoctorProfile, DoctorLeave,
)
from server.utils.helpers import get_day_name, parse_time
from server.utils.exceptions import SlotConflictError, NotFoundError

# How long a HELD slot is reserved before automatic expiry
HOLD_DURATION_MINUTES = 5


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _slot_windows(
    working_start: str,
    working_end: str,
    slot_duration: int,
    target_date: date_type,
) -> List[tuple[datetime, datetime]]:
    """
    Enumerate all (slot_start, slot_end) pairs for a given working day.
    All datetimes are naive UTC (stored as UTC in the DB).
    """
    start_time = parse_time(working_start)
    end_time = parse_time(working_end)

    current = datetime(
        target_date.year, target_date.month, target_date.day,
        start_time.hour, start_time.minute, 0,
    )
    day_end = datetime(
        target_date.year, target_date.month, target_date.day,
        end_time.hour, end_time.minute, 0,
    )
    delta = timedelta(minutes=slot_duration)
    slots: List[tuple[datetime, datetime]] = []
    while current + delta <= day_end:
        slots.append((current, current + delta))
        current += delta
    return slots


async def _is_on_leave(db: AsyncSession, doctor_id: str, target_date: date_type) -> bool:
    """Return True if the doctor has a leave entry for target_date."""
    result = await db.execute(
        select(DoctorLeave).where(
            DoctorLeave.doctor_id == doctor_id,
            DoctorLeave.leave_date == target_date,
        )
    )
    return result.scalar_one_or_none() is not None


def _is_postgresql(db: AsyncSession) -> bool:
    """Detect if the underlying dialect is PostgreSQL."""
    dialect = db.bind.dialect.name if db.bind else ""
    return dialect == "postgresql"


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

async def generate_slots(
    db: AsyncSession,
    doctor_id: str,
    target_date: date_type,
) -> List[dict]:
    """
    Generate all theoretical slots for a doctor on a given date.
    Returns a list of dicts: {slot_start, slot_end, is_available}.
    No locking — pure read for display purposes.
    """
    # 1. Fetch doctor
    result = await db.execute(
        select(DoctorProfile).where(DoctorProfile.id == doctor_id)
    )
    doctor = result.scalar_one_or_none()
    if not doctor:
        raise NotFoundError("Doctor not found")

    # 2. Check working hours for this day-of-week
    day_key = get_day_name(target_date)
    day_hours = doctor.working_hours.get(day_key)
    if not day_hours:
        return []  # Doctor doesn't work this day

    # 3. Check leave
    if await _is_on_leave(db, doctor_id, target_date):
        return []

    # 4. Generate raw slots
    all_slots = _slot_windows(
        day_hours["start"], day_hours["end"],
        doctor.slot_duration_minutes, target_date,
    )

    # 5. Fetch occupied slots (HELD not expired OR CONFIRMED) for that day
    day_start = datetime(target_date.year, target_date.month, target_date.day)
    day_end = day_start + timedelta(days=1)
    now = datetime.utcnow()

    occupied_result = await db.execute(
        select(Appointment.slot_start).where(
            Appointment.doctor_id == doctor_id,
            Appointment.slot_start >= day_start,
            Appointment.slot_start < day_end,
            Appointment.status.in_([AppointmentStatus.CONFIRMED]),
        )
    )
    # Also include HELD that are still within window
    held_result = await db.execute(
        select(Appointment.slot_start).where(
            Appointment.doctor_id == doctor_id,
            Appointment.slot_start >= day_start,
            Appointment.slot_start < day_end,
            Appointment.status == AppointmentStatus.HELD,
            Appointment.hold_expires_at > now,
        )
    )

    occupied: set[datetime] = set()
    for row in occupied_result.scalars():
        if isinstance(row, str):
            try:
                row = datetime.fromisoformat(row)
            except ValueError:
                pass
        occupied.add(row)
    for row in held_result.scalars():
        if isinstance(row, str):
            try:
                row = datetime.fromisoformat(row)
            except ValueError:
                pass
        occupied.add(row)

    # 6. Build response, filtering past slots
    slots_out = []
    # Helper to check if a slot start datetime matches any occupied slot
    def is_slot_occupied(dt: datetime) -> bool:
        for occ in occupied:
            if isinstance(occ, datetime) and occ == dt:
                return True
            if isinstance(occ, str) and (str(dt) in occ or occ in str(dt)):
                return True
        return False

    for s_start, s_end in all_slots:
        is_future = s_start > now
        slots_out.append({
            "slot_start": s_start,
            "slot_end": s_end,
            "is_available": (not is_slot_occupied(s_start)) and is_future,
            "is_past": not is_future,
            "doctor_id": doctor_id,
        })

    return slots_out


async def hold_slot(
    db: AsyncSession,
    doctor_id: str,
    slot_start: datetime,
    patient_id: str,
) -> Appointment:
    """
    Attempt to reserve a slot for a patient using pessimistic locking.

    PostgreSQL path:
      SELECT FOR UPDATE SKIP LOCKED on any existing active appointment for
      (doctor_id, slot_start). If none exists the slot is free; we insert the
      HELD record inside the same transaction.

    SQLite path:
      Serialised check — read committed isolation is sufficient for dev/test.

    Raises SlotConflictError if the slot is already taken.
    """
    # --- Validation ---
    now = datetime.utcnow()
    if slot_start <= now:
        raise SlotConflictError("Cannot book a slot in the past")

    # Fetch doctor to compute slot_end and validate alignment
    doc_result = await db.execute(
        select(DoctorProfile).where(DoctorProfile.id == doctor_id)
    )
    doctor: Optional[DoctorProfile] = doc_result.scalar_one_or_none()
    if not doctor or not doctor.is_active:
        raise NotFoundError("Doctor not found or inactive")

    slot_end = slot_start + timedelta(minutes=doctor.slot_duration_minutes)
    target_date = slot_start.date()

    # Check working day
    day_key = get_day_name(target_date)
    day_hours = doctor.working_hours.get(day_key)
    if not day_hours:
        raise SlotConflictError("Doctor does not work on this day")

    # Check leave
    if await _is_on_leave(db, doctor_id, target_date):
        raise SlotConflictError("Doctor is on leave on this date")

    # Check slot alignment against valid windows
    valid_starts = {
        s for s, _ in _slot_windows(
            day_hours["start"], day_hours["end"],
            doctor.slot_duration_minutes, target_date,
        )
    }
    if slot_start not in valid_starts:
        raise SlotConflictError(
            "Requested slot does not align with doctor's schedule. "
            "Use GET /api/doctors/{id}/slots to see valid slots."
        )

    # Patient overlap check is deferred to confirmation step to allow holding slots during reschedule flows

    # --- Concurrency-safe Doctor conflict check ---
    if _is_postgresql(db):
        # True pessimistic lock: lock the row if it exists, skip if locked by
        # another transaction. If we get a row back the slot is taken.
        lock_result = await db.execute(
            select(Appointment)
            .where(
                Appointment.doctor_id == doctor_id,
                Appointment.slot_start == slot_start,
                Appointment.status.in_([
                    AppointmentStatus.HELD,
                    AppointmentStatus.CONFIRMED,
                ]),
            )
            .with_for_update(skip_locked=True)
        )
        existing = lock_result.scalar_one_or_none()
    else:
        # SQLite fallback: plain read (single-writer serialisation is enough)
        check_result = await db.execute(
            select(Appointment).where(
                Appointment.doctor_id == doctor_id,
                Appointment.slot_start == slot_start,
                Appointment.status.in_([
                    AppointmentStatus.HELD,
                    AppointmentStatus.CONFIRMED,
                ]),
                # Exclude expired holds
                (
                    (Appointment.status == AppointmentStatus.CONFIRMED)
                    | (Appointment.hold_expires_at > now)
                ),
            )
        )
        existing = check_result.scalar_one_or_none()

    if existing:
        raise SlotConflictError(
            "This slot is currently held or already confirmed by another patient"
        )

    # --- Create the HELD appointment ---
    appointment = Appointment(
        id=str(uuid.uuid4()),
        patient_id=patient_id,
        doctor_id=doctor_id,
        slot_start=slot_start,
        slot_end=slot_end,
        status=AppointmentStatus.HELD,
        hold_expires_at=now + timedelta(minutes=HOLD_DURATION_MINUTES),
    )
    db.add(appointment)
    await db.flush()
    await db.refresh(appointment)
    return appointment


async def confirm_slot(
    db: AsyncSession,
    appointment_id: str,
    patient_id: str,
) -> Appointment:
    """
    Transition a HELD appointment to CONFIRMED.
    Only the patient who created the hold may confirm it.
    Raises SlotConflictError if the hold has expired.
    """
    result = await db.execute(
        select(Appointment).where(Appointment.id == appointment_id)
    )
    appt: Optional[Appointment] = result.scalar_one_or_none()

    if not appt:
        raise NotFoundError("Appointment not found")
    if appt.patient_id != patient_id:
        from fastapi import HTTPException, status
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You can only confirm your own appointments",
        )
    if appt.status != AppointmentStatus.HELD:
        if appt.status in (AppointmentStatus.CONFIRMED, AppointmentStatus.PENDING_APPROVAL):
            return appt
        raise SlotConflictError(
            f"Appointment cannot be confirmed — current status is '{appt.status.value}'"
        )

    now = datetime.utcnow()
    if appt.hold_expires_at and appt.hold_expires_at < now:
        appt.status = AppointmentStatus.CANCELLED
        await db.flush()
        raise SlotConflictError(
            "Your 5-minute hold has expired. Please select a new slot."
        )

    # Check for patient overlap conflict on confirmation
    slot_start = appt.slot_start
    # Fetch doctor duration
    doc_result = await db.execute(
        select(DoctorProfile).where(DoctorProfile.id == appt.doctor_id)
    )
    doctor: Optional[DoctorProfile] = doc_result.scalar_one_or_none()
    if not doctor:
        raise NotFoundError("Doctor not found")
    slot_end = slot_start + timedelta(minutes=doctor.slot_duration_minutes)

    patient_conflict_result = await db.execute(
        select(Appointment).where(
            Appointment.patient_id == patient_id,
            Appointment.id != appointment_id,  # Exclude current held slot itself
            Appointment.status.in_([AppointmentStatus.CONFIRMED, AppointmentStatus.PENDING_APPROVAL]),
            # Overlap check
            Appointment.slot_start < slot_end,
            Appointment.slot_end > slot_start,
        )
    )
    patient_existing = patient_conflict_result.scalar_one_or_none()
    if patient_existing:
        start_str = patient_existing.slot_start.strftime("%I:%M %p")
        end_str = patient_existing.slot_end.strftime("%I:%M %p")
        raise SlotConflictError(
            f"You already have an appointment scheduled ({start_str} - {end_str}) that overlaps with this slot. "
            "Please reschedule or cancel the overlapping appointment before confirming."
        )

    # Classify immediate vs not-immediate:
    # Immediate: slot start is within 24 hours of booking time (now)
    is_immediate = (appt.slot_start - now) < timedelta(hours=24)
    if is_immediate:
        appt.status = AppointmentStatus.CONFIRMED
    else:
        appt.status = AppointmentStatus.PENDING_APPROVAL
    appt.hold_expires_at = None
    import random
    appt.start_otp = f"{random.randint(1000, 9999)}"

    # Automatically cancel/release any other active HELD appointments for this patient
    from sqlalchemy import update
    await db.execute(
        update(Appointment)
        .where(
            Appointment.patient_id == patient_id,
            Appointment.id != appointment_id,
            Appointment.status == AppointmentStatus.HELD,
        )
        .values(
            status=AppointmentStatus.CANCELLED,
            hold_expires_at=None,
            updated_at=now,
        )
    )

    await db.flush()
    await db.refresh(appt)
    return appt


async def release_slot(
    db: AsyncSession,
    appointment_id: str,
    patient_id: Optional[str] = None,
    admin: bool = False,
) -> Appointment:
    """
    Cancel/release an appointment.
    - Patient can cancel their own HELD or CONFIRMED appointment.
    - Admin can cancel any appointment.
    """
    result = await db.execute(
        select(Appointment).where(Appointment.id == appointment_id)
    )
    appt: Optional[Appointment] = result.scalar_one_or_none()
    if not appt:
        raise NotFoundError("Appointment not found")

    if not admin and appt.patient_id != patient_id:
        from fastapi import HTTPException, status
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You can only cancel your own appointments",
        )

    if appt.status in [AppointmentStatus.CANCELLED, AppointmentStatus.COMPLETED]:
        raise SlotConflictError(
            f"Appointment is already '{appt.status.value}' and cannot be cancelled"
        )

    was_held_only = appt.status == AppointmentStatus.HELD
    appt.status = AppointmentStatus.CANCELLED
    # Preserve hold_expires_at for HELD-only appointments so they are
    # filtered out of patient appointment lists (never-confirmed bookings).
    if not was_held_only:
        appt.hold_expires_at = None
    await db.flush()
    await db.refresh(appt)
    return appt


async def reschedule_slot(
    db: AsyncSession,
    appointment_id: str,
    patient_id: str,
    new_slot_start: datetime,
    new_doctor_id: Optional[str] = None,
) -> Appointment:
    """
    Atomically cancel the old CONFIRMED slot and hold the new one.
    Uses hold_slot internally for concurrency safety.
    """
    # Fetch existing
    result = await db.execute(
        select(Appointment)
        .options(selectinload(Appointment.symptom_form))
        .where(Appointment.id == appointment_id)
    )
    old_appt: Optional[Appointment] = result.scalar_one_or_none()
    if not old_appt:
        raise NotFoundError("Appointment not found")
    if old_appt.patient_id != patient_id:
        from fastapi import HTTPException, status
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You can only reschedule your own appointments",
        )
    if old_appt.status not in [AppointmentStatus.CONFIRMED, AppointmentStatus.HELD]:
        raise SlotConflictError(
            f"Only CONFIRMED or HELD appointments can be rescheduled"
        )

    # Mark old appointment RESCHEDULED
    old_appt.status = AppointmentStatus.RESCHEDULED
    old_appt.hold_expires_at = None
    await db.flush()

    target_doctor_id = new_doctor_id or old_appt.doctor_id

    # Hold the new slot (raises SlotConflictError if taken)
    new_appt = await hold_slot(
        db=db,
        doctor_id=target_doctor_id,
        slot_start=new_slot_start,
        patient_id=patient_id,
    )
    old_appt.rescheduled_to_id = new_appt.id
    await db.flush()

    # Transfer symptom form content to new appointment
    if old_appt.symptom_form:
        from server.database.models import SymptomForm
        old_sf = old_appt.symptom_form
        new_sf = SymptomForm(
            id=str(uuid.uuid4()),
            appointment_id=new_appt.id,
            symptoms_text=old_sf.symptoms_text,
            pre_visit_summary=old_sf.pre_visit_summary,
            urgency_level=old_sf.urgency_level,
            llm_status=old_sf.llm_status,
            retry_count=old_sf.retry_count,
        )
        db.add(new_sf)
        await db.flush()

    return new_appt


async def release_expired_holds(db: AsyncSession) -> int:
    """
    Celery beat helper: cancel all HELD appointments whose hold_expires_at
    has passed. Returns the number of released holds.
    Called from microservices/tasks.py via run_async().
    """
    now = datetime.utcnow()
    result = await db.execute(
        select(Appointment).where(
            Appointment.status == AppointmentStatus.HELD,
            Appointment.hold_expires_at < now,
        )
    )
    expired = result.scalars().all()
    count = 0
    for appt in expired:
        appt.status = AppointmentStatus.CANCELLED
        appt.hold_expires_at = None
        count += 1

    if count:
        await db.flush()
    return count


async def cancel_by_doctor(
    db: AsyncSession,
    appointment_id: str,
    doctor_id: str,
    reason: str = "",
) -> Appointment:
    """
    Cancel appointment by doctor.
    If the appointment is CONFIRMED, attempts to auto-reschedule to another doctor in the same specialty on the same day.
    Sorts available slots in ascending order of proximity to the original time.
    If no doctor/slot is available, marks as CANCELLED and notifies the patient.
    """
    from server.database.models import User, InAppNotification
    result = await db.execute(
        select(Appointment)
        .options(selectinload(Appointment.symptom_form))
        .where(Appointment.id == appointment_id)
    )
    appt: Optional[Appointment] = result.scalar_one_or_none()
    if not appt:
        raise NotFoundError("Appointment not found")
    if appt.doctor_id != doctor_id:
        from fastapi import HTTPException, status
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You can only cancel your own appointments",
        )
    if appt.reassigned_by_admin:
        from fastapi import HTTPException, status
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cancellation restricted. This appointment was reassigned by administration.",
        )
    if appt.status == AppointmentStatus.CANCELLED:
        raise SlotConflictError("Appointment is already CANCELLED")

    result_doc = await db.execute(
        select(DoctorProfile).options(selectinload(DoctorProfile.user)).where(DoctorProfile.id == doctor_id)
    )
    orig_doc = result_doc.scalar_one()

    # Calculate demerits for confirmed appointments
    if appt.status == AppointmentStatus.CONFIRMED:
        base_points = 1
        if appt.symptom_form and appt.symptom_form.pre_visit_summary:
            summary = appt.symptom_form.pre_visit_summary
            urgency = summary.get("urgency_level") if isinstance(summary, dict) else getattr(summary, "urgency_level", None)
            if urgency == "HIGH":
                base_points = 5
            elif urgency == "MEDIUM":
                base_points = 3
            elif urgency == "LOW":
                base_points = 1

        # Check if other doctors are available for this specific slot start/end
        slot_start = appt.slot_start
        slot_end = appt.slot_end
        day_name = slot_start.strftime("%a").lower()
        slot_start_str = slot_start.strftime("%H:%M")
        slot_end_str = slot_end.strftime("%H:%M")
        target_date = slot_start.date()

        from server.services.slot_service import _is_on_leave
        specialty = orig_doc.specialisation

        result_others = await db.execute(
            select(DoctorProfile)
            .where(
                DoctorProfile.specialisation == specialty,
                DoctorProfile.id != doctor_id,
                DoctorProfile.is_active == True,
                DoctorProfile.is_suspended == False,
            )
        )
        other_docs = result_others.scalars().all()

        avail_others_count = 0
        for doc in other_docs:
            w_hours = doc.working_hours or {}
            day_config = w_hours.get(day_name)
            if not day_config or not day_config.get("enabled"):
                continue
            if not (slot_start_str >= day_config.get("start", "09:00") and slot_end_str <= day_config.get("end", "17:00")):
                continue
            if await _is_on_leave(db, doc.id, target_date):
                continue
            # Check overlap
            overlap_query = select(Appointment).where(
                Appointment.doctor_id == doc.id,
                Appointment.status.in_([AppointmentStatus.CONFIRMED, AppointmentStatus.HELD]),
                Appointment.slot_start < slot_end,
                Appointment.slot_end > slot_start,
                Appointment.id != appointment_id
            )
            overlaps = (await db.execute(overlap_query)).scalars().all()
            active_overlap = False
            for o in overlaps:
                if o.status == AppointmentStatus.HELD:
                    if o.hold_expires_at and o.hold_expires_at > datetime.utcnow():
                        active_overlap = True
                        break
                else:
                    active_overlap = True
                    break
            if not active_overlap:
                avail_others_count += 1

        availability_penalty = 0 if avail_others_count > 0 else 3

        # Call Gemini to classify the reason context
        from server.services.llm_service import analyze_cancellation_reason
        reason_category = await analyze_cancellation_reason(reason)
        
        multiplier = 1.0
        if reason_category == "EMERGENCY":
            multiplier = 0.0
        elif reason_category == "CONVENIENCE":
            multiplier = 1.5
        elif reason_category == "UNJUSTIFIED":
            multiplier = 2.0

        demerits_earned = int((base_points + availability_penalty) * multiplier)

        # Add to Doctor demerits
        orig_doc.demerit_points += demerits_earned
        if orig_doc.demerit_points >= 10:
            orig_doc.is_suspended = True
            
            # In-app notification for suspension
            suspension_notif = InAppNotification(
                user_id=orig_doc.user_id,
                title="Profile Suspended due to Demerits",
                body=f"Your profile has been suspended after earning {demerits_earned} demerit points (total: {orig_doc.demerit_points}). Access locked.",
                type="admin_note",
                link="/doctor/dashboard"
            )
            db.add(suspension_notif)
            
            # Send suspension email
            from server.routes.patient_routes import safe_dispatch
            from microservices.tasks import send_email_task
            safe_dispatch(
                send_email_task,
                orig_doc.user.email,
                "Account Suspended — MedPulse AI",
                "generic_notification",
                {
                    "title": "Account Suspended",
                    "message": f"Hello Dr. {orig_doc.user.full_name},\n\nYour clinic access has been suspended because you have reached {orig_doc.demerit_points} demerit points.\n\nLatest Cancellation Penalty: {demerits_earned} points (Reason category: {reason_category}).\n\nPlease contact the clinic administrator to review your profile and lift the suspension.\n\nBest regards,\nMedPulse AI Administration"
                }
            )

    if appt.status != AppointmentStatus.CONFIRMED:
        appt.status = AppointmentStatus.CANCELLED
        appt.hold_expires_at = None
        await db.flush()
        return appt

    result_doc = await db.execute(
        select(DoctorProfile).where(DoctorProfile.id == doctor_id)
    )
    orig_doc = result_doc.scalar_one()
    specialty = orig_doc.specialisation
    orig_start = appt.slot_start

    result_others = await db.execute(
        select(DoctorProfile)
        .options(selectinload(DoctorProfile.user))
        .where(
            DoctorProfile.specialisation == specialty,
            DoctorProfile.id != doctor_id,
            DoctorProfile.is_active == True,
        )
    )
    other_docs = result_others.scalars().all()

    if not other_docs:
        appt.status = AppointmentStatus.CANCELLED
        appt.hold_expires_at = None
        await db.flush()
        
        # Notify patient
        from server.routes.patient_routes import safe_dispatch
        from microservices.tasks import send_email_task, sync_calendar_event_task
        result_pat = await db.execute(select(User).where(User.id == appt.patient_id))
        pat = result_pat.scalar_one()
        safe_dispatch(
            send_email_task,
            to_email=pat.email,
            subject="Appointment Cancelled — Doctor Unavailable",
            template_name="generic_notification",
            context={
                "title": "Appointment Cancelled",
                "message": f"Hello {pat.full_name},\n\nWe regret to inform you that your consultation with Dr. {orig_doc.user.full_name} scheduled for {orig_start.strftime('%Y-%m-%d %I:%M %p')} has been cancelled as the doctor is unavailable and no other specialists are free.\n\nPlease visit the portal to schedule another slot.\n\nBest regards,\nMedPulse AI Care Team"
            },
        )
        safe_dispatch(sync_calendar_event_task, appt.id, "delete")
        return appt

    slot_date = appt.slot_start.date()
    orig_start = appt.slot_start

    candidate_slots = []
    for doc in other_docs:
        slots = await generate_slots(db, doc.id, slot_date)
        for s in slots:
            if s.is_available:
                candidate_slots.append((doc, s))

    if not candidate_slots:
        appt.status = AppointmentStatus.CANCELLED
        appt.hold_expires_at = None
        await db.flush()
        
        # Notify patient
        from server.routes.patient_routes import safe_dispatch
        from microservices.tasks import send_email_task, sync_calendar_event_task
        result_pat = await db.execute(select(User).where(User.id == appt.patient_id))
        pat = result_pat.scalar_one()
        safe_dispatch(
            send_email_task,
            to_email=pat.email,
            subject="Appointment Cancelled — Doctor Unavailable",
            template_name="generic_notification",
            context={
                "title": "Appointment Cancelled",
                "message": f"Hello {pat.full_name},\n\nWe regret to inform you that your consultation with Dr. {orig_doc.user.full_name} scheduled for {orig_start.strftime('%Y-%m-%d %I:%M %p')} has been cancelled as the doctor is unavailable and no other specialists are free.\n\nPlease visit the portal to schedule another slot.\n\nBest regards,\nMedPulse AI Care Team"
            },
        )
        safe_dispatch(sync_calendar_event_task, appt.id, "delete")
        return appt

    candidate_slots.sort(key=lambda item: abs((item[1].slot_start - orig_start).total_seconds()))
    chosen_doc, chosen_slot = candidate_slots[0]

    old_slot_str = orig_start.strftime("%Y-%m-%d %I:%M %p")
    new_slot_str = chosen_slot.slot_start.strftime("%Y-%m-%d %I:%M %p")

    appt.doctor_id = chosen_doc.id
    appt.slot_start = chosen_slot.slot_start
    appt.slot_end = chosen_slot.slot_end

    from server.database.models import AuditLog
    audit = AuditLog(
        action="DOCTOR_AUTO_RESCHEDULE",
        target_type="Appointment",
        target_id=appt.id,
        details={
            "original_doctor_id": doctor_id,
            "new_doctor_id": chosen_doc.id,
            "original_slot": old_slot_str,
            "new_slot": new_slot_str,
        }
    )
    db.add(audit)
    await db.flush()

    from server.routes.patient_routes import safe_dispatch
    from microservices.tasks import send_email_task, sync_calendar_event_task
    result_pat = await db.execute(
        select(User).where(User.id == appt.patient_id)
    )
    pat = result_pat.scalar_one()

    safe_dispatch(
        send_email_task,
        to_email=pat.email,
        subject="Appointment Rescheduled due to Technical Issues",
        template_name="reschedule_notice",
        context={
            "patient_name": pat.full_name,
            "appointment_id": appt.id,
            "new_slot_start": new_slot_str,
            "doctor_name": chosen_doc.user.full_name,
            "specialisation": specialty,
            "extra_message": "your appointment has been rescheduled to new slot due to technical issues from doctor end. Sorry fr the inconvience caused and we wish you a happy service"
        },
    )

    safe_dispatch(sync_calendar_event_task, appt.id, "update")
    return appt


async def auto_approve_stale_requests(db: AsyncSession) -> int:
    """
    Auto-approve any PENDING_APPROVAL appointments whose slot_start is less than 24 hours away.
    Sends confirmation emails and dispatches Google Calendar sync.
    Returns the number of approved appointments.
    """
    now = datetime.utcnow()
    limit_time = now + timedelta(hours=24)

    stmt = (
        select(Appointment)
        .options(
            selectinload(Appointment.patient),
            selectinload(Appointment.doctor).selectinload(DoctorProfile.user),
        )
        .where(
            Appointment.status == AppointmentStatus.PENDING_APPROVAL,
            Appointment.slot_start <= limit_time,
        )
    )
    result = await db.execute(stmt)
    appts = result.scalars().all()

    approved_count = 0
    from server.routes.patient_routes import safe_dispatch
    from microservices.tasks import send_email_task, sync_calendar_event_task

    for appt in appts:
        appt.status = AppointmentStatus.CONFIRMED
        approved_count += 1

        from server.database.models import AuditLog
        audit = AuditLog(
            action="AUTO_APPROVE_STALE",
            target_type="Appointment",
            target_id=appt.id,
            details={
                "slot_start": appt.slot_start.strftime("%Y-%m-%d %H:%M"),
                "doctor_name": appt.doctor.user.full_name,
            }
        )
        db.add(audit)

        safe_dispatch(
            send_email_task,
            to_email=appt.patient.email,
            subject="Appointment Auto-Confirmed",
            template_name="booking_confirmation",
            context={
                "patient_name": appt.patient.full_name,
                "doctor_name": appt.doctor.user.full_name,
                "specialisation": appt.doctor.specialisation,
                "slot_start": appt.slot_start.strftime("%Y-%m-%d %I:%M %p"),
                "appointment_id": appt.id,
            },
        )
        safe_dispatch(
            send_email_task,
            to_email=appt.doctor.user.email,
            subject="Appointment Auto-Confirmed",
            template_name="booking_confirmation",
            context={
                "patient_name": appt.patient.full_name,
                "doctor_name": appt.doctor.user.full_name,
                "specialisation": appt.doctor.specialisation,
                "slot_start": appt.slot_start.strftime("%Y-%m-%d %I:%M %p"),
                "appointment_id": appt.id,
            },
        )
        safe_dispatch(sync_calendar_event_task, appt.id, "create")

    if approved_count > 0:
        await db.flush()

    return approved_count
