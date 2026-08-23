"""
Celery Task Definitions
========================
All background tasks for the Healthcare Appointment Manager.

Async Bridge Pattern
--------------------
Celery workers run in a synchronous context but our DB layer is async.
We use `run_async()` to bridge them:

    def run_async(coro):
        loop = asyncio.new_event_loop()
        try:
            return loop.run_until_complete(coro)
        finally:
            loop.close()

Every task that needs DB access must use this pattern with AsyncSessionLocal.

Task Categories
---------------
  1. Slot hold management   — release_expired_holds_task
  2. LLM summaries          — pre_visit, post_visit, retry
  3. Email notifications     — confirmation, reminder, cancellation, medication
  4. Calendar sync          — create, update, delete (stubs for Phase 5)
  5. Beat-scheduled tasks   — reminder sweeps, retry sweeps
"""

from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timedelta, date, time
from typing import Optional

from microservices.celery_app import celery_app
from server.database.connection import AsyncSessionLocal

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Async bridge
# ---------------------------------------------------------------------------

def run_async(coro):
    """Run an async coroutine from a synchronous Celery task context."""
    loop = asyncio.new_event_loop()
    try:
        return loop.run_until_complete(coro)
    finally:
        loop.close()


# ===========================================================================
# 1. Slot Hold Management
# ===========================================================================

@celery_app.task(name="microservices.tasks.release_expired_holds_task", bind=True, max_retries=3)
def release_expired_holds_task(self):
    """Beat-triggered every 60s: cancel all HELD slots whose window has expired."""
    async def _run():
        async with AsyncSessionLocal() as db:
            from server.services.slot_service import release_expired_holds
            count = await release_expired_holds(db)
            await db.commit()
            if count:
                logger.info(f"[HoldExpiry] Released {count} expired slot holds")
            return count

    try:
        return run_async(_run())
    except Exception as exc:
        logger.error(f"[HoldExpiry] Failed: {exc}")
        raise self.retry(exc=exc, countdown=30)


@celery_app.task(name="microservices.tasks.auto_approve_stale_requests_task", bind=True, max_retries=3)
def auto_approve_stale_requests_task(self):
    """Beat-triggered every 5m: automatically approve any PENDING_APPROVAL slots whose window is <24 hours."""
    async def _run():
        async with AsyncSessionLocal() as db:
            from server.services.slot_service import auto_approve_stale_requests
            count = await auto_approve_stale_requests(db)
            if count:
                logger.info(f"[AutoApproval] Approved {count} stale pending requests")
            return count

    try:
        return run_async(_run())
    except Exception as exc:
        logger.error(f"[AutoApproval] Failed: {exc}")
        raise self.retry(exc=exc, countdown=30)


# ===========================================================================
# 2. LLM Summary Tasks (Phase 4)
# ===========================================================================

@celery_app.task(name="microservices.tasks.generate_pre_visit_summary_task", bind=True, max_retries=5)
def generate_pre_visit_summary_task(self, symptom_form_id: str):
    """
    Generate AI pre-visit summary from patient symptoms.
    Called when patient submits symptom form.
    Updates SymptomForm.pre_visit_summary, urgency_level, llm_status.
    Publishes WebSocket update on completion.
    """
    async def _run():
        from sqlalchemy import select
        from server.database.models import SymptomForm, LLMStatus, UrgencyLevel
        from server.services.llm_service import generate_pre_visit_summary

        async with AsyncSessionLocal() as db:
            result = await db.execute(
                select(SymptomForm).where(SymptomForm.id == symptom_form_id)
            )
            form = result.scalar_one_or_none()
            if not form:
                logger.error(f"[LLM-PreVisit] SymptomForm {symptom_form_id} not found")
                return

            # Mark processing
            form.llm_status = LLMStatus.PROCESSING
            await db.flush()

            # Load doctor questions if customized
            from sqlalchemy.orm import selectinload
            from server.database.models import Appointment, DoctorProfile
            questions = None
            appt_result = await db.execute(
                select(Appointment)
                .options(selectinload(Appointment.doctor))
                .where(Appointment.id == form.appointment_id)
            )
            appt = appt_result.scalar_one_or_none()
            if appt and appt.doctor and appt.doctor.intake_questions:
                questions = appt.doctor.intake_questions

            # Call LLM
            summary = await generate_pre_visit_summary(form.symptoms_text, questions)

            # Preserve existing intake_answers (specifically patient edits) if present in the database
            if form.pre_visit_summary and isinstance(form.pre_visit_summary, dict) and "intake_answers" in form.pre_visit_summary:
                if "intake_answers" not in summary or not isinstance(summary["intake_answers"], dict):
                    summary["intake_answers"] = {}
                # Keep custom fields
                for k, v in form.pre_visit_summary["intake_answers"].items():
                    if v and v.strip() and v != "Not specified" and v != "None mentioned" and v != "Moderate":
                        summary["intake_answers"][k] = v

            # Store result
            form.pre_visit_summary = summary
            if summary.get("_llm_error"):
                form.llm_status = LLMStatus.FAILED
                form.retry_count += 1
            else:
                form.llm_status = LLMStatus.SUCCESS
                urgency_raw = summary.get("urgency_level", "MEDIUM").upper()
                try:
                    form.urgency_level = UrgencyLevel(urgency_raw)
                except ValueError:
                    form.urgency_level = UrgencyLevel.MEDIUM

            await db.commit()

            # Publish WebSocket notification
            await _publish_ws_update(
                channel=f"appointment:{form.appointment_id}",
                payload={
                    "event": "pre_visit_summary_ready",
                    "appointment_id": form.appointment_id,
                    "llm_status": form.llm_status.value,
                    "urgency_level": form.urgency_level.value if form.urgency_level else None,
                }
            )
            logger.info(
                f"[LLM-PreVisit] form={symptom_form_id} "
                f"status={form.llm_status.value}"
            )

    try:
        run_async(_run())
    except Exception as exc:
        logger.error(f"[LLM-PreVisit] Task failed: {exc}")
        raise self.retry(exc=exc, countdown=60)


@celery_app.task(name="microservices.tasks.generate_post_visit_summary_task", bind=True, max_retries=5)
def generate_post_visit_summary_task(self, post_visit_note_id: str):
    """
    Generate patient-friendly post-visit summary from doctor notes.
    Updates PostVisitNote.patient_summary, llm_status.
    Also extracts medications and creates MedicationReminder records.
    """
    async def _run():
        from sqlalchemy import select
        from server.database.models import PostVisitNote, Appointment, LLMStatus
        from server.services.llm_service import generate_post_visit_summary
        from server.repositories.reminder_repository import ReminderRepository
        import re
        from datetime import date as date_cls, timedelta as td

        async with AsyncSessionLocal() as db:
            result = await db.execute(
                select(PostVisitNote).where(PostVisitNote.id == post_visit_note_id)
            )
            note = result.scalar_one_or_none()
            if not note:
                logger.error(f"[LLM-PostVisit] PostVisitNote {post_visit_note_id} not found")
                return

            note.llm_status = LLMStatus.PROCESSING
            await db.flush()

            summary = await generate_post_visit_summary(
                note.doctor_notes,
                note.prescription_text or "",
            )

            if summary.get("_llm_error"):
                note.patient_summary = summary["patient_summary"]
                note.llm_status = LLMStatus.FAILED
                note.retry_count += 1
            else:
                import json as _json
                note.patient_summary = summary.get("patient_summary", "")
                note.llm_status = LLMStatus.SUCCESS

                # Extract and create medication reminders
                medications = summary.get("medications", [])
                if medications:
                    # Fetch appointment to get patient_id
                    apt_result = await db.execute(
                        select(Appointment).where(Appointment.id == note.appointment_id)
                    )
                    appt = apt_result.scalar_one_or_none()
                    if appt:
                        reminder_repo = ReminderRepository(db)
                        today = date_cls.today()
                        for med in medications:
                            med_name = med.get("name", "")
                            if not med_name:
                                continue
                            dosage = med.get("dosage", "As directed")
                            instructions = med.get("instructions", "As prescribed")
                            
                            duration_days = med.get("duration_days", 7)
                            if not isinstance(duration_days, int):
                                try:
                                    duration_days = int(duration_days)
                                except Exception:
                                    duration_days = 7

                            reminder_times = med.get("reminder_times", ["09:00"])
                            if not isinstance(reminder_times, list) or not reminder_times:
                                reminder_times = ["09:00"]

                            for time_str in reminder_times:
                                try:
                                    hh, mm = map(int, time_str.split(":"))
                                    rem_time = time(hh, mm)
                                except Exception:
                                    rem_time = time(9, 0)

                                await reminder_repo.create_reminder(
                                    post_visit_note_id=note.id,
                                    patient_id=appt.patient_id,
                                    medication_name=med_name,
                                    dosage=dosage,
                                    frequency=instructions,
                                    start_date=today,
                                    end_date=today + td(days=duration_days),
                                    reminder_time=rem_time,
                                )

            await db.commit()

            # Publish WebSocket notification
            await _publish_ws_update(
                channel=f"appointment:{note.appointment_id}",
                payload={
                    "event": "post_visit_summary_ready",
                    "appointment_id": note.appointment_id,
                    "llm_status": note.llm_status.value,
                }
            )
            logger.info(
                f"[LLM-PostVisit] note={post_visit_note_id} "
                f"status={note.llm_status.value}"
            )

    try:
        run_async(_run())
    except Exception as exc:
        logger.error(f"[LLM-PostVisit] Task failed: {exc}")
        raise self.retry(exc=exc, countdown=60)


@celery_app.task(name="microservices.tasks.retry_failed_llm_task")
def retry_failed_llm_task():
    """
    Beat-triggered every 15 minutes.
    Re-queues FAILED LLM summaries that haven't exceeded max retries.
    """
    async def _run():
        from sqlalchemy import select
        from server.database.models import SymptomForm, PostVisitNote, LLMStatus

        MAX_RETRIES = 5
        requeued = 0

        async with AsyncSessionLocal() as db:
            # Retry failed pre-visit summaries
            sf_result = await db.execute(
                select(SymptomForm).where(
                    SymptomForm.llm_status == LLMStatus.FAILED,
                    SymptomForm.retry_count < MAX_RETRIES,
                )
            )
            for form in sf_result.scalars().all():
                generate_pre_visit_summary_task.delay(form.id)
                requeued += 1

            # Retry failed post-visit notes
            pv_result = await db.execute(
                select(PostVisitNote).where(
                    PostVisitNote.llm_status == LLMStatus.FAILED,
                    PostVisitNote.retry_count < MAX_RETRIES,
                )
            )
            for note in pv_result.scalars().all():
                generate_post_visit_summary_task.delay(note.id)
                requeued += 1

        if requeued:
            logger.info(f"[LLM-Retry] Re-queued {requeued} failed LLM tasks")

    run_async(_run())


# ===========================================================================
# 3. Email & Notification Tasks
# ===========================================================================

@celery_app.task(name="microservices.tasks.send_email_task", bind=True, max_retries=3)
def send_email_task(self, to_email: str, subject: str, template_name: str, context: dict):
    """
    Generic email sender task using EmailService.
    """
    async def _run():
        from server.services.email_service import send_email
        success = await send_email(to_email, subject, template_name, context)
        if not success:
            logger.warning(f"[EmailTask] Failed to send email to {to_email}")
        return success

    try:
        return run_async(_run())
    except Exception as exc:
        logger.error(f"[EmailTask] Exception sending email: {exc}")
        raise self.retry(exc=exc, countdown=30)


@celery_app.task(name="microservices.tasks.send_appointment_reminders_task")
def send_appointment_reminders_task():
    """
    Beat-triggered every 15 minutes.
    Sends reminder emails for appointments within the next 24 hours.
    """
    async def _run():
        from sqlalchemy import select
        from sqlalchemy.orm import selectinload
        from server.database.models import Appointment, AppointmentStatus, DoctorProfile

        now = datetime.utcnow()
        window_start = now + timedelta(hours=23)
        window_end = now + timedelta(hours=25)

        async with AsyncSessionLocal() as db:
            result = await db.execute(
                select(Appointment)
                .options(
                    selectinload(Appointment.patient),
                    selectinload(Appointment.doctor).selectinload(DoctorProfile.user),
                )
                .where(
                    Appointment.status == AppointmentStatus.CONFIRMED,
                    Appointment.slot_start >= window_start,
                    Appointment.slot_start <= window_end,
                    # Only send if reminder has NOT already been dispatched this cycle
                    Appointment.reminder_sent == False,
                )
            )
            appointments = result.scalars().all()
            queued = 0
            for appt in appointments:
                send_email_task.delay(
                    to_email=appt.patient.email,
                    subject="Appointment Reminder — Tomorrow",
                    template_name="appointment_reminder.html",
                    context={
                        "patient_name": appt.patient.full_name,
                        "doctor_name": appt.doctor.user.full_name,
                        "specialisation": appt.doctor.specialisation,
                        "slot_start": appt.slot_start.strftime("%Y-%m-%d %H:%M UTC"),
                        "appointment_id": appt.id,
                    }
                )
                # Mark as sent so this Beat cycle cannot re-queue the same appointment
                appt.reminder_sent = True
                queued += 1

            if queued:
                await db.commit()
                logger.info(f"[Reminders] Queued {queued} appointment reminder emails")

    run_async(_run())


@celery_app.task(name="microservices.tasks.send_medication_reminders_task")
def send_medication_reminders_task():
    """
    Beat-triggered every 30 minutes.
    Sends medication reminder emails for active reminders due now.
    """
    async def _run():
        from sqlalchemy import select
        from sqlalchemy.orm import selectinload
        from server.database.models import MedicationReminder

        now = datetime.utcnow()
        today = now.date()
        current_time_str = now.strftime("%H:%M")

        async with AsyncSessionLocal() as db:
            result = await db.execute(
                select(MedicationReminder)
                .options(selectinload(MedicationReminder.patient))
                .where(
                    MedicationReminder.is_active == True,
                    MedicationReminder.start_date <= today,
                    MedicationReminder.end_date >= today,
                )
            )
            due = result.scalars().all()
            sent = 0
            for reminder in due:
                reminder_hhmm = reminder.reminder_time.strftime("%H:%M")
                if reminder_hhmm != current_time_str:
                    continue
                send_email_task.delay(
                    to_email=reminder.patient.email,
                    subject=f"Medication Reminder: {reminder.medication_name}",
                    template_name="medication_reminder.html",
                    context={
                        "patient_name": reminder.patient.full_name,
                        "medication_name": reminder.medication_name,
                        "dosage": reminder.dosage or "As directed",
                        "frequency": reminder.frequency,
                    }
                )
                reminder.last_sent_at = datetime.utcnow()
                sent += 1

            if sent:
                await db.commit()
                logger.info(f"[MedReminders] Queued {sent} medication reminder emails")

    run_async(_run())


@celery_app.task(name="microservices.tasks.retry_failed_emails_task")
def retry_failed_emails_task():
    """
    Beat-triggered every 5 minutes.
    Detects CONFIRMED appointments that are missing a CalendarEvent record —
    indicating the confirmation email + calendar sync chain may have failed —
    and re-queues both tasks.
    """
    async def _run():
        from sqlalchemy import select, outerjoin
        from sqlalchemy.orm import selectinload
        from server.database.models import Appointment, AppointmentStatus, CalendarEvent

        async with AsyncSessionLocal() as db:
            # Find CONFIRMED appointments with no CalendarEvent (sync chain likely failed)
            result = await db.execute(
                select(Appointment)
                .outerjoin(Appointment.calendar_event)
                .options(
                    selectinload(Appointment.patient),
                )
                .where(
                    Appointment.status == AppointmentStatus.CONFIRMED,
                    CalendarEvent.id == None,  # noqa: E711 — SQLAlchemy IS NULL check
                )
            )
            orphaned = result.scalars().all()
            requeued = 0
            for appt in orphaned:
                # Re-dispatch confirmation email
                send_email_task.delay(
                    to_email=appt.patient.email,
                    subject="Appointment Confirmed",
                    template_name="booking_confirmation",
                    context={
                        "appointment_id": appt.id,
                        "patient_name": appt.patient.full_name,
                    },
                )
                # Re-dispatch calendar sync
                sync_calendar_event_task.delay(appt.id, "create")
                requeued += 1

            if requeued:
                logger.info(
                    f"[EmailRetry] Re-queued email+calendar sync for "
                    f"{requeued} appointments missing CalendarEvent records"
                )

    run_async(_run())


@celery_app.task(name="microservices.tasks.handle_doctor_leave_task")
def handle_doctor_leave_task(doctor_id: str, leave_date_str: str):
    """
    Process doctor leave: attempt to auto-reschedule affected patients on leave_date
    to another doctor of the same specialty. If none is available, fall back to cancellation.
    """
    async def _run():
        from sqlalchemy import select
        from sqlalchemy.orm import selectinload
        from server.database.models import Appointment, AppointmentStatus, DoctorProfile, AuditLog
        from server.services.slot_service import generate_slots

        async with AsyncSessionLocal() as db:
            doc_result = await db.execute(
                select(DoctorProfile)
                .options(selectinload(DoctorProfile.user))
                .where(DoctorProfile.id == doctor_id)
            )
            doctor = doc_result.scalar_one_or_none()
            if not doctor:
                logger.error(f"[DoctorLeave] Doctor ID {doctor_id} not found.")
                return
            doc_name = doctor.user.full_name if doctor.user else "your doctor"
            specialty = doctor.specialisation

            leave_d = datetime.strptime(leave_date_str, "%Y-%m-%d").date()
            day_start = datetime(leave_d.year, leave_d.month, leave_d.day)
            day_end = day_start + timedelta(days=1)

            # Query CONFIRMED, HELD, PENDING_APPROVAL appointments for this doctor on leave_date
            appts_result = await db.execute(
                select(Appointment)
                .options(selectinload(Appointment.patient))
                .where(
                    Appointment.doctor_id == doctor_id,
                    Appointment.slot_start >= day_start,
                    Appointment.slot_start < day_end,
                    Appointment.status.in_([
                        AppointmentStatus.CONFIRMED,
                        AppointmentStatus.HELD,
                        AppointmentStatus.PENDING_APPROVAL
                    ])
                )
            )
            affected = appts_result.scalars().all()
            if not affected:
                logger.info(f"[DoctorLeave] No active appointments found for Doctor {doctor_id} on {leave_date_str}")
                return

            # Find other active doctors in same specialty
            other_docs_result = await db.execute(
                select(DoctorProfile)
                .options(selectinload(DoctorProfile.user))
                .where(
                    DoctorProfile.specialisation == specialty,
                    DoctorProfile.id != doctor_id,
                    DoctorProfile.is_active == True,
                )
            )
            other_docs = other_docs_result.scalars().all()

            for appt in affected:
                rescheduled = False
                orig_start = appt.slot_start
                old_slot_str = orig_start.strftime("%Y-%m-%d %I:%M %p")

                if other_docs:
                    candidate_slots = []
                    for doc in other_docs:
                        slots = await generate_slots(db, doc.id, leave_d)
                        for s in slots:
                            if s.get("is_available"):
                                candidate_slots.append((doc, s))

                    if candidate_slots:
                        # Sort slots by proximity to original slot start time
                        candidate_slots.sort(key=lambda item: abs((item[1]["slot_start"] - orig_start).total_seconds()))
                        chosen_doc, chosen_slot = candidate_slots[0]
                        new_slot_str = chosen_slot["slot_start"].strftime("%Y-%m-%d %I:%M %p")

                        # Perform auto-reschedule
                        appt.doctor_id = chosen_doc.id
                        appt.slot_start = chosen_slot["slot_start"]
                        appt.slot_end = chosen_slot["slot_end"]

                        # Audit log
                        audit = AuditLog(
                            action="LEAVE_AUTO_RESCHEDULE",
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

                        # Email notice
                        send_email_task.delay(
                            to_email=appt.patient.email,
                            subject="Appointment Automatically Rescheduled",
                            template_name="reschedule_notice",
                            context={
                                "patient_name": appt.patient.full_name,
                                "appointment_id": appt.id,
                                "new_slot_start": new_slot_str,
                                "doctor_name": chosen_doc.user.full_name,
                                "specialisation": specialty,
                                "extra_message": f"your appointment has been automatically rescheduled to a new doctor because Dr. {doc_name} is on leave on this day. Sorry for the inconvenience caused."
                            }
                        )

                        # Update calendar sync
                        sync_calendar_event_task.delay(appt.id, "update")
                        rescheduled = True
                        logger.info(f"[DoctorLeave] Rescheduled appointment {appt.id} to Doctor {chosen_doc.id} ({new_slot_str})")

                if not rescheduled:
                    # Fallback to Cancellation
                    appt.status = AppointmentStatus.CANCELLED
                    appt.hold_expires_at = None

                    audit = AuditLog(
                        action="LEAVE_AUTO_CANCEL",
                        target_type="Appointment",
                        target_id=appt.id,
                        details={
                            "doctor_id": doctor_id,
                            "slot": old_slot_str,
                        }
                    )
                    db.add(audit)

                    send_email_task.delay(
                        to_email=appt.patient.email,
                        subject="Doctor Unavailable - Appointment Cancelled",
                        template_name="doctor_leave_cancellation.html",
                        context={
                            "patient_name": appt.patient.full_name,
                            "doctor_name": doc_name,
                            "leave_date": leave_date_str,
                            "appointment_id": appt.id,
                        }
                    )
                    sync_calendar_event_task.delay(appt.id, "delete")
                    logger.info(f"[DoctorLeave] Cancelled appointment {appt.id} (no replacement doctor/slot available)")

            await db.commit()

    run_async(_run())


# ===========================================================================
# 4. Google Calendar Sync Tasks
# ===========================================================================

@celery_app.task(name="microservices.tasks.sync_calendar_event_task")
def sync_calendar_event_task(appointment_id: str, action: str = "create"):
    """
    Sync appointment with Google Calendar using CalendarService.
    action: 'create' | 'update' | 'delete'
    """
    async def _run():
        from sqlalchemy import select
        from sqlalchemy.orm import selectinload
        from server.database.models import Appointment, CalendarEvent, DoctorProfile
        from server.services.calendar_service import (
            create_calendar_event, update_calendar_event, delete_calendar_event
        )

        async with AsyncSessionLocal() as db:
            stmt = (
                select(Appointment)
                .options(
                    selectinload(Appointment.patient),
                    selectinload(Appointment.doctor).selectinload(DoctorProfile.user),
                    selectinload(Appointment.calendar_event),
                )
                .where(Appointment.id == appointment_id)
            )
            result = await db.execute(stmt)
            appt = result.scalar_one_or_none()
            if not appt:
                logger.warning(f"[CalendarTask] Appointment {appointment_id} not found")
                return

            patient_tokens = {
                "access_token": appt.patient.google_access_token,
                "refresh_token": appt.patient.google_refresh_token,
            } if appt.patient.google_access_token else None

            summary = f"Medical Appointment with {appt.doctor.user.full_name}"
            description = f"Specialisation: {appt.doctor.specialisation}\nAppointment ID: {appt.id}"

            cal_record = appt.calendar_event

            if action == "create":
                event_id = await create_calendar_event(
                    user_access_token=patient_tokens.get("access_token") if patient_tokens else None,
                    summary=summary,
                    description=description,
                    start_time=appt.slot_start,
                    end_time=appt.slot_end,
                    refresh_token=patient_tokens.get("refresh_token") if patient_tokens else None,
                )
                if event_id:
                    if not cal_record:
                        cal_record = CalendarEvent(
                            appointment_id=appt.id,
                            patient_event_id=event_id,
                        )
                        db.add(cal_record)
                    else:
                        cal_record.patient_event_id = event_id
                    await db.commit()

            elif action == "update" and cal_record and cal_record.patient_event_id:
                await update_calendar_event(
                    user_access_token=patient_tokens.get("access_token") if patient_tokens else None,
                    event_id=cal_record.patient_event_id,
                    summary=f"Rescheduled: {summary}",
                    description=description,
                    start_time=appt.slot_start,
                    end_time=appt.slot_end,
                    refresh_token=patient_tokens.get("refresh_token") if patient_tokens else None,
                )

            elif action == "delete" and cal_record and cal_record.patient_event_id:
                await delete_calendar_event(
                    user_access_token=patient_tokens.get("access_token") if patient_tokens else None,
                    event_id=cal_record.patient_event_id,
                    refresh_token=patient_tokens.get("refresh_token") if patient_tokens else None,
                )
                await db.delete(cal_record)
                await db.commit()

    run_async(_run())


# ===========================================================================
# 5. WebSocket Pub/Sub Helper
# ===========================================================================

async def _publish_ws_update(channel: str, payload: dict):
    """
    Publish a real-time update to the WebSocket manager via Redis Pub/Sub.
    Falls back silently if Redis is unavailable.
    """
    try:
        import json
        import redis.asyncio as aioredis
        from server.config import settings

        r = await aioredis.from_url(settings.REDIS_URL)
        await r.publish(channel, json.dumps(payload))
        await r.aclose()
    except Exception as e:
        logger.warning(f"[WebSocket] Redis publish failed (non-fatal): {e}")
