"""
Doctor Portal Routes
====================
Doctors view their schedule, access pre-visit AI summaries, submit
post-consultation notes + prescriptions, and mark appointments complete.
"""

from datetime import date
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from server.database.connection import get_db
from server.database.models import User, UserRole, AppointmentStatus
from server.repositories.appointment_repository import AppointmentRepository
from server.repositories.doctor_repository import DoctorRepository
from server.schemas.appointment_schemas import (
    AppointmentResponse, AppointmentDetailResponse,
    PostVisitNotesInput, PostVisitNoteResponse,
)
from server.auth import get_current_user, require_role
from server.utils.exceptions import NotFoundError
from microservices.tasks import generate_post_visit_summary_task
import logging
logger = logging.getLogger(__name__)

router = APIRouter(prefix="/doctor", tags=["Doctor Portal"])

doctor_guard = Depends(require_role(UserRole.DOCTOR))


@router.get(
    "/appointments",
    response_model=List[AppointmentDetailResponse],
    dependencies=[doctor_guard],
)
async def list_doctor_appointments(
    status_filter: Optional[AppointmentStatus] = Query(None, alias="status"),
    from_date: Optional[date] = Query(None, description="Filter from YYYY-MM-DD"),
    skip: int = 0,
    limit: int = 50,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Doctor lists their scheduled appointments (with pre-visit summaries)."""
    from server.services.slot_service import auto_approve_stale_requests
    await auto_approve_stale_requests(db)

    doc_repo = DoctorRepository(db)
    profile = await doc_repo.get_by_user_id(current_user.id)
    if not profile:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Doctor profile not found for this user account",
        )

    repo = AppointmentRepository(db)
    return await repo.list_by_doctor(
        doctor_id=profile.id,
        status=status_filter,
        from_date=from_date,
        skip=skip,
        limit=limit,
    )


@router.get(
    "/appointments/{appointment_id}",
    response_model=AppointmentDetailResponse,
    dependencies=[doctor_guard],
)
async def get_appointment_detail(
    appointment_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Doctor views a single appointment with pre-visit AI summary."""
    from server.services.slot_service import auto_approve_stale_requests
    await auto_approve_stale_requests(db)

    doc_repo = DoctorRepository(db)
    profile = await doc_repo.get_by_user_id(current_user.id)
    if not profile:
        raise NotFoundError("Doctor profile not found")

    repo = AppointmentRepository(db)
    appt = await repo.get_by_id(appointment_id, load_relations=True)
    if not appt:
        raise NotFoundError("Appointment not found")
    if appt.doctor_id != profile.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="This appointment belongs to a different doctor",
        )
    return appt


@router.post(
    "/appointments/{appointment_id}/notes",
    response_model=PostVisitNoteResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=[doctor_guard],
)
async def submit_post_visit_notes(
    appointment_id: str,
    data: PostVisitNotesInput,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Doctor submits post-consultation notes and optional prescription.
    Triggers LLM patient-friendly summary generation via Celery (Phase 3/4).
    """
    doc_repo = DoctorRepository(db)
    profile = await doc_repo.get_by_user_id(current_user.id)
    if not profile:
        raise NotFoundError("Doctor profile not found")

    repo = AppointmentRepository(db)
    appt = await repo.get_by_id(appointment_id)
    if not appt:
        raise NotFoundError("Appointment not found")
    if appt.doctor_id != profile.id:
        raise HTTPException(status_code=403, detail="Not your appointment")
    if appt.status != AppointmentStatus.CONFIRMED:
        raise HTTPException(
            status_code=400,
            detail="Notes can only be submitted for CONFIRMED appointments",
        )

    existing = await repo.get_post_visit_note(appointment_id)
    if existing:
        existing.doctor_notes = data.doctor_notes
        existing.prescription_text = data.prescription_text
        await db.commit()
        await db.refresh(existing)
        note = existing
    else:
        note = await repo.create_post_visit_note(
            appointment_id=appointment_id,
            doctor_notes=data.doctor_notes,
            prescription_text=data.prescription_text,
        )
        await db.commit()
        await db.refresh(note)
    # Dispatch Celery task: generate patient-friendly summary + extract medications
    try:
        generate_post_visit_summary_task.apply_async(args=[note.id], connect_timeout=0.1)
    except Exception as e:
        logger.warning(f"[Celery Dispatch Fallback] Task failed to queue: {e}")
    return note


@router.put(
    "/appointments/{appointment_id}/complete",
    response_model=AppointmentResponse,
    dependencies=[doctor_guard],
)
async def mark_appointment_complete(
    appointment_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Doctor marks an appointment as COMPLETED after the consultation."""
    doc_repo = DoctorRepository(db)
    profile = await doc_repo.get_by_user_id(current_user.id)
    if not profile:
        raise NotFoundError("Doctor profile not found")

    repo = AppointmentRepository(db)
    appt = await repo.get_by_id(appointment_id, load_relations=True)
    if not appt:
        raise NotFoundError("Appointment not found")
    if appt.doctor_id != profile.id:
        raise HTTPException(status_code=403, detail="Not your appointment")
    if appt.status != AppointmentStatus.CONFIRMED:
        raise HTTPException(
            status_code=400,
            detail="Only CONFIRMED appointments can be marked as completed",
        )

    updated = await repo.update_status(appointment_id, AppointmentStatus.COMPLETED)

    # Dispatch completed email notification to patient
    try:
        from server.services.notification_service import NotificationService
        if appt.patient and appt.doctor and appt.doctor.user:
            await NotificationService.on_appointment_completed(
                patient_email=appt.patient.email,
                patient_name=appt.patient.full_name,
                doctor_name=appt.doctor.user.full_name,
                appointment_id=appt.id,
            )
    except Exception as e:
        logger.warning(f"Failed to send appointment completed email: {e}")

    return updated


from pydantic import BaseModel, Field
from typing import Dict
from server.schemas.doctor_schemas import WorkingHoursDay, DoctorResponse
from server.services.slot_service import cancel_by_doctor, release_slot

class DoctorSettingsUpdate(BaseModel):
    specialisation: Optional[str] = None
    slot_duration_minutes: Optional[int] = Field(None, ge=15, le=60)
    working_hours: Optional[Dict[str, WorkingHoursDay]] = None
    intake_questions: Optional[List[str]] = None

class DoctorSettingsResponse(BaseModel):
    profile: DoctorResponse
    reviews: List[dict] = []


@router.get("/settings", response_model=DoctorSettingsResponse, dependencies=[doctor_guard])
async def get_doctor_settings(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Fetch clinical settings and patient reviews for the logged-in doctor."""
    doc_repo = DoctorRepository(db)
    profile = await doc_repo.get_by_user_id(current_user.id)
    if not profile:
        raise NotFoundError("Doctor profile not found")

    from sqlalchemy import select
    from server.database.models import DoctorReview
    reviews_stmt = (
        select(DoctorReview)
        .options(selectinload(DoctorReview.appointment))
        .where(DoctorReview.doctor_id == profile.id)
        .order_by(DoctorReview.created_at.desc())
    )
    reviews_res = await db.execute(reviews_stmt)
    reviews_list = []
    for r in reviews_res.scalars().all():
        reviews_list.append({
            "id": r.id,
            "rating": r.rating,
            "comment": r.comment,
            "created_at": r.created_at.isoformat(),
        })

    return {
        "profile": profile,
        "reviews": reviews_list
    }


@router.put("/settings", response_model=DoctorResponse, dependencies=[doctor_guard])
async def update_doctor_settings(
    data: DoctorSettingsUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Update clinical settings and questionnaire for the doctor."""
    doc_repo = DoctorRepository(db)
    profile = await doc_repo.get_by_user_id(current_user.id)
    if not profile:
        raise NotFoundError("Doctor profile not found")

    working_hours_dict = None
    if data.working_hours is not None:
        working_hours_dict = {
            day: hours.model_dump() for day, hours in data.working_hours.items()
        }

    updated = await doc_repo.update_doctor(
        doctor_id=profile.id,
        specialisation=data.specialisation,
        working_hours=working_hours_dict,
        slot_duration_minutes=data.slot_duration_minutes,
        intake_questions=data.intake_questions,
    )
    await db.commit()
    return updated


@router.put("/appointments/{appointment_id}/approve", response_model=AppointmentResponse, dependencies=[doctor_guard])
async def approve_appointment(
    appointment_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Doctor approves a pending request (transitions status to CONFIRMED)."""
    doc_repo = DoctorRepository(db)
    profile = await doc_repo.get_by_user_id(current_user.id)
    if not profile:
        raise NotFoundError("Doctor profile not found")

    repo = AppointmentRepository(db)
    appt = await repo.get_by_id(appointment_id, load_relations=True)
    if not appt:
        raise NotFoundError("Appointment not found")
    if appt.doctor_id != profile.id:
        raise HTTPException(status_code=403, detail="Not your appointment")
    if appt.status != AppointmentStatus.PENDING_APPROVAL:
        raise HTTPException(status_code=400, detail=f"Appointment cannot be approved from status: {appt.status.value}")

    appt.status = AppointmentStatus.CONFIRMED
    await db.flush()

    # Log to AuditLog
    from server.database.models import AuditLog
    audit = AuditLog(
        action="DOCTOR_APPROVE",
        target_type="Appointment",
        target_id=appt.id,
        details={
            "doctor_id": profile.id,
            "slot_start": appt.slot_start.strftime("%Y-%m-%d %H:%M"),
        }
    )
    db.add(audit)
    await db.flush()

    # Dispatch confirmation emails and calendar sync
    from server.routes.patient_routes import safe_dispatch
    from microservices.tasks import send_email_task, sync_calendar_event_task

    # Send success email to patient
    safe_dispatch(
        send_email_task,
        to_email=appt.patient.email,
        subject="Appointment Confirmed",
        template_name="booking_confirmation",
        context={
            "patient_name": appt.patient.full_name,
            "doctor_name": appt.doctor.user.full_name,
            "specialisation": appt.doctor.specialisation,
            "slot_start": appt.slot_start.strftime("%Y-%m-%d %I:%M %p"),
            "appointment_id": appt.id,
        },
    )

    # Send success email to doctor
    safe_dispatch(
        send_email_task,
        to_email=appt.doctor.user.email,
        subject="Appointment Confirmed",
        template_name="booking_confirmation",
        context={
            "patient_name": appt.patient.full_name,
            "doctor_name": appt.doctor.user.full_name,
            "specialisation": appt.doctor.specialisation,
            "slot_start": appt.slot_start.strftime("%Y-%m-%d %I:%M %p"),
            "appointment_id": appt.id,
        },
    )

    # Sync calendar
    safe_dispatch(sync_calendar_event_task, appt.id, "create")
    await db.commit()
    return appt


class StartConsultationInput(BaseModel):
    otp: str

@router.post(
    "/appointments/{appointment_id}/start-verify",
    response_model=dict,
    dependencies=[doctor_guard],
)
async def verify_start_otp(
    appointment_id: str,
    data: StartConsultationInput,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Verify the 4-digit OTP code provided by the patient to start the consultation.
    """
    doc_repo = DoctorRepository(db)
    profile = await doc_repo.get_by_user_id(current_user.id)
    if not profile:
        raise NotFoundError("Doctor profile not found")

    repo = AppointmentRepository(db)
    appt = await repo.get_by_id(appointment_id)
    if not appt:
        raise NotFoundError("Appointment not found")
    if appt.doctor_id != profile.id:
        raise HTTPException(status_code=403, detail="Not your appointment")
    if appt.status != AppointmentStatus.CONFIRMED:
        raise HTTPException(
            status_code=400,
            detail="OTP verification is only applicable to CONFIRMED appointments",
        )

    if appt.start_otp != data.otp.strip():
        raise HTTPException(
            status_code=400,
            detail="Invalid verification code. Please request the correct 4-digit OTP from the patient.",
        )

    # Log to AuditLog
    from server.database.models import AuditLog
    audit = AuditLog(
        action="DOCTOR_VERIFY_OTP_START",
        target_type="Appointment",
        target_id=appointment_id,
        user_id=current_user.id,
        details="Doctor verified patient OTP and started the consultation.",
    )
    db.add(audit)
    await db.commit()

    return {"success": True, "message": "OTP verified successfully. Consultation started."}


@router.put("/appointments/{appointment_id}/reject", response_model=AppointmentResponse, dependencies=[doctor_guard])
async def reject_appointment(
    appointment_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Doctor rejects a pending booking request (marks as CANCELLED)."""
    doc_repo = DoctorRepository(db)
    profile = await doc_repo.get_by_user_id(current_user.id)
    if not profile:
        raise NotFoundError("Doctor profile not found")

    repo = AppointmentRepository(db)
    appt = await repo.get_by_id(appointment_id)
    if not appt:
        raise NotFoundError("Appointment not found")
    if appt.doctor_id != profile.id:
        raise HTTPException(status_code=403, detail="Not your appointment")
    if appt.status != AppointmentStatus.PENDING_APPROVAL:
        raise HTTPException(status_code=400, detail="Only PENDING_APPROVAL appointments can be rejected")

    # Reject / release slot (sets status to CANCELLED)
    updated = await release_slot(db, appointment_id, admin=True)
    await db.commit()
    return updated


@router.post("/appointments/{appointment_id}/cancel", response_model=AppointmentResponse, dependencies=[doctor_guard])
async def cancel_appointment_by_doctor(
    appointment_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Doctor cancels an already accepted (CONFIRMED) booking. Triggers auto-reschedule or blocks."""
    doc_repo = DoctorRepository(db)
    profile = await doc_repo.get_by_user_id(current_user.id)
    if not profile:
        raise NotFoundError("Doctor profile not found")

    updated = await cancel_by_doctor(db, appointment_id, profile.id)
    await db.commit()
    return updated


class HourRangeInput(BaseModel):
    start: str
    end: str
    enabled: bool

class WorkingHoursChangeInput(BaseModel):
    working_hours: Dict[str, HourRangeInput]
    slot_duration_minutes: int

@router.post("/working-hours-request", dependencies=[doctor_guard])
async def create_working_hours_request(
    data: WorkingHoursChangeInput,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    doc_repo = DoctorRepository(db)
    profile = await doc_repo.get_by_user_id(current_user.id)
    if not profile:
        raise NotFoundError("Doctor profile not found")

    from sqlalchemy import select
    from server.database.models import WorkingHoursRequest
    
    stmt = (
        select(WorkingHoursRequest)
        .where(
            WorkingHoursRequest.doctor_id == profile.id,
            WorkingHoursRequest.status == "PENDING"
        )
    )
    res = await db.execute(stmt)
    existing = res.scalar_one_or_none()

    working_hours_dict = {
        day: hours.model_dump() for day, hours in data.working_hours.items()
    }

    if existing:
        existing.proposed_working_hours = working_hours_dict
        existing.proposed_slot_duration = data.slot_duration_minutes
        req = existing
    else:
        req = WorkingHoursRequest(
            doctor_id=profile.id,
            proposed_working_hours=working_hours_dict,
            proposed_slot_duration=data.slot_duration_minutes,
            status="PENDING",
        )
        db.add(req)
    
    await db.commit()
    return {"success": True, "message": "Schedule change request submitted for admin approval."}


@router.get("/working-hours-request/status", dependencies=[doctor_guard])
async def get_working_hours_request_status(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    doc_repo = DoctorRepository(db)
    profile = await doc_repo.get_by_user_id(current_user.id)
    if not profile:
        raise NotFoundError("Doctor profile not found")

    from sqlalchemy import select
    from server.database.models import WorkingHoursRequest
    
    stmt = (
        select(WorkingHoursRequest)
        .where(WorkingHoursRequest.doctor_id == profile.id)
        .order_by(WorkingHoursRequest.created_at.desc())
        .limit(1)
    )
    res = await db.execute(stmt)
    latest = res.scalar_one_or_none()

    if not latest:
        return {"status": "NONE", "request": None}
    
    return {
        "status": latest.status,
        "proposed_working_hours": latest.proposed_working_hours,
        "proposed_slot_duration": latest.proposed_slot_duration,
        "admin_reason": latest.admin_reason,
        "created_at": latest.created_at.isoformat(),
    }


from pydantic import BaseModel

class DoctorLeaveRequestInput(BaseModel):
    leave_date: date
    reason: Optional[str] = None

@router.post("/leave-request", dependencies=[doctor_guard])
async def create_doctor_leave_request(
    data: DoctorLeaveRequestInput,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    doc_repo = DoctorRepository(db)
    profile = await doc_repo.get_by_user_id(current_user.id)
    if not profile:
        raise NotFoundError("Doctor profile not found")

    from sqlalchemy import select
    from server.database.models import DoctorLeaveRequest, DoctorLeave
    
    # 1. Check if leave is already marked
    already_leave = await doc_repo.is_doctor_on_leave(profile.id, data.leave_date)
    if already_leave:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"You are already marked on leave for date {data.leave_date}"
        )

    # 2. Check if there is already a pending request for this date
    stmt = (
        select(DoctorLeaveRequest)
        .where(
            DoctorLeaveRequest.doctor_id == profile.id,
            DoctorLeaveRequest.leave_date == data.leave_date,
            DoctorLeaveRequest.status == "PENDING"
        )
    )
    res = await db.execute(stmt)
    existing = res.scalar_one_or_none()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"A pending leave request already exists for date {data.leave_date}"
        )

    req = DoctorLeaveRequest(
        doctor_id=profile.id,
        leave_date=data.leave_date,
        reason=data.reason,
        status="PENDING",
    )
    db.add(req)
    await db.commit()
    return {"success": True, "message": f"Leave request for {data.leave_date} submitted successfully."}


@router.get("/leave-requests", dependencies=[doctor_guard])
async def list_doctor_leave_requests(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    doc_repo = DoctorRepository(db)
    profile = await doc_repo.get_by_user_id(current_user.id)
    if not profile:
        raise NotFoundError("Doctor profile not found")

    from sqlalchemy import select
    from server.database.models import DoctorLeaveRequest
    
    stmt = (
        select(DoctorLeaveRequest)
        .where(DoctorLeaveRequest.doctor_id == profile.id)
        .order_by(DoctorLeaveRequest.created_at.desc())
    )
    res = await db.execute(stmt)
    requests = res.scalars().all()
    
    return [
        {
            "id": r.id,
            "leave_date": str(r.leave_date),
            "reason": r.reason,
            "status": r.status,
            "admin_reason": r.admin_reason,
            "created_at": r.created_at.isoformat(),
            "resolved_at": r.resolved_at.isoformat() if r.resolved_at else None,
        }
        for r in requests
    ]
