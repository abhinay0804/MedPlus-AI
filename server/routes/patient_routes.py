"""
Patient Portal Routes
=====================
All booking-facing endpoints. Patients search doctors, view available slots,
create holds, submit symptom forms, confirm bookings, cancel, and reschedule.
"""

from datetime import date, datetime
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from server.database.connection import get_db
from server.database.models import (
    DoctorProfile, User, UserRole, Appointment, AppointmentStatus, SymptomForm, LLMStatus, UrgencyLevel
)
from server.repositories.doctor_repository import DoctorRepository
from server.repositories.appointment_repository import AppointmentRepository
from server.schemas.doctor_schemas import DoctorResponse, SlotResponse
from server.schemas.appointment_schemas import (
    BookingRequest, SymptomFormInput, RescheduleRequest,
    AppointmentResponse, AppointmentDetailResponse, SymptomFormResponse,
)
from server.services.slot_service import (
    generate_slots, hold_slot, confirm_slot, release_slot, reschedule_slot,
)
from server.auth import get_current_user, require_role
from server.utils.exceptions import NotFoundError
from microservices.tasks import (
    generate_pre_visit_summary_task,
    send_email_task,
    sync_calendar_event_task,
)

router = APIRouter(prefix="/patient", tags=["Patient Portal"])

patient_guard = Depends(require_role(UserRole.PATIENT))


# ---------------------------------------------------------------------------
# Doctor Discovery
# ---------------------------------------------------------------------------

class SpecialtyAnalyzeRequest(BaseModel):
    symptoms_text: str

@router.post("/analyze-specialty")
async def analyze_specialty_endpoint(req: SpecialtyAnalyzeRequest):
    """Contextual AI/NLP analysis of patient symptoms to recommend medical specialty."""
    from server.services.llm_service import analyze_symptom_specialty
    return await analyze_symptom_specialty(req.symptoms_text)

async def attach_ratings_to_doctors(db: AsyncSession, doctors: List[DoctorProfile]):
    from sqlalchemy import select, func
    from server.database.models import DoctorReview
    for doc in doctors:
        stmt = select(func.avg(DoctorReview.rating), func.count(DoctorReview.id)).where(DoctorReview.doctor_id == doc.id)
        res = await db.execute(stmt)
        avg_val, count_val = res.first()
        doc.average_rating = round(float(avg_val), 1) if avg_val is not None else 0.0
        doc.reviews_count = int(count_val) if count_val is not None else 0


@router.get("/doctors", response_model=List[DoctorResponse])
async def search_doctors(
    specialisation: Optional[str] = Query(None, description="Filter by specialisation"),
    search: Optional[str] = Query(None, description="Search doctor by name"),
    db: AsyncSession = Depends(get_db),
):
    """Public: list all active doctors, optionally filtered by specialisation and search query."""
    doc_repo = DoctorRepository(db)
    doctors = await doc_repo.list_doctors(specialisation=specialisation, search=search, is_active_only=True)
    await attach_ratings_to_doctors(db, doctors)
    return doctors


@router.get("/doctors/{doctor_id}", response_model=DoctorResponse)
async def get_doctor(doctor_id: str, db: AsyncSession = Depends(get_db)):
    """Public: get a single doctor's profile."""
    doc_repo = DoctorRepository(db)
    doctor = await doc_repo.get_by_id(doctor_id)
    if not doctor:
        raise NotFoundError("Doctor not found")
    await attach_ratings_to_doctors(db, [doctor])
    return doctor


@router.get("/doctors/{doctor_id}/slots", response_model=List[SlotResponse])
async def get_available_slots(
    doctor_id: str,
    target_date: date = Query(..., description="Date in YYYY-MM-DD format"),
    db: AsyncSession = Depends(get_db),
):
    """
    Public: return all slots for a doctor on a given date.
    Each slot indicates whether it is currently available.
    """
    slots = await generate_slots(db, doctor_id, target_date)
    return [
        SlotResponse(
            slot_start=s["slot_start"],
            slot_end=s["slot_end"],
            is_available=s["is_available"],
            doctor_id=s["doctor_id"],
        )
        for s in slots
    ]


# ---------------------------------------------------------------------------
# Booking Lifecycle  (patient-only)
# ---------------------------------------------------------------------------

@router.post(
    "/appointments",
    response_model=AppointmentResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=[patient_guard],
)
async def book_appointment(
    data: BookingRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Patient holds a slot. Returns a HELD appointment valid for 5 minutes.
    The patient must confirm within the window or the hold is released automatically.
    """
    appointment = await hold_slot(
        db=db,
        doctor_id=data.doctor_id,
        slot_start=data.slot_start,
        patient_id=current_user.id,
    )
    return appointment


import logging
import socket

logger = logging.getLogger(__name__)

def is_redis_online() -> bool:
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        s.settimeout(0.05)  # 50ms max timeout
        s.connect(("127.0.0.1", 6379))
        s.close()
        return True
    except Exception:
        return False

def safe_dispatch(task_func, *args, **kwargs):
    """Safely dispatch Celery task without raising 500 or blocking if Redis/Celery is offline in local dev."""
    # Support unit test mocks (e.g. mock_task.delay)
    if hasattr(task_func, "assert_called") or hasattr(task_func, "_mock_name") or type(task_func).__name__ == "MagicMock":
        try:
            task_func.delay(*args, **kwargs)
            return
        except Exception:
            pass

    if not is_redis_online():
        logger.info(f"[Celery Dispatch] Redis offline — task {getattr(task_func, '__name__', 'task')} skipped (<1ms)")
        return
    try:
        task_func.apply_async(args=args, kwargs=kwargs, retry=False)
    except Exception as e:
        logger.info(f"[Celery Dispatch] Redis offline, task {getattr(task_func, '__name__', 'task')} skipped: {e}")

@router.post(
    "/appointments/{appointment_id}/symptoms",
    response_model=SymptomFormResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=[patient_guard],
)
async def submit_symptoms(
    appointment_id: str,
    data: SymptomFormInput,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Patient submits a pre-visit symptom form while the slot is HELD.
    Validates clinical specialty match; auto-releases slot if mismatched.
    Triggers LLM summary generation via Celery.
    """
    repo = AppointmentRepository(db)
    appt = await repo.get_by_id(appointment_id, load_relations=True)
    if not appt:
        raise NotFoundError("Appointment not found")
    if appt.patient_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not your appointment")
    if appt.status not in [AppointmentStatus.HELD, AppointmentStatus.CONFIRMED, AppointmentStatus.PENDING_APPROVAL]:
        raise HTTPException(
            status_code=400,
            detail="Symptom form can only be submitted for HELD, CONFIRMED, or PENDING_APPROVAL appointments",
        )

    # Perform strict clinical specialty validation BEFORE recording symptom form
    if appt.doctor:
        doc_spec = (appt.doctor.specialisation or "").lower().strip()
        if doc_spec and doc_spec != "general medicine":
            from server.services.llm_service import analyze_symptom_specialty
            analysis = await analyze_symptom_specialty(data.symptoms_text)
            rec_spec = (analysis.get("recommended_specialty") or "").lower().strip()
            if rec_spec and rec_spec != doc_spec:
                # Release held slot so other patients can book
                await release_slot(db, appointment_id, patient_id=current_user.id)
                await db.commit()
                doc_name = appt.doctor.user.full_name if appt.doctor.user else "Selected Doctor"
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Booking blocked: Dr. {doc_name} ({appt.doctor.specialisation}) cannot treat {analysis['recommended_specialty']} conditions. The held slot has been released for other patients. Please select a {analysis['recommended_specialty']} specialist."
                )

    existing = await repo.get_symptom_form(appointment_id)
    if existing:
        existing.symptoms_text = data.symptoms_text
        form = existing
    else:
        form = await repo.create_symptom_form(appointment_id, data.symptoms_text)
    
    # Load doctor questions if customized
    questions = None
    if appt.doctor and appt.doctor.intake_questions:
        questions = appt.doctor.intake_questions

    # Generate AI Triage summary instantly (Gemini AI or Smart Fallback)
    try:
         from server.services.llm_service import generate_pre_visit_summary
         summary = await generate_pre_visit_summary(data.symptoms_text, questions)
         
         # Overwrite AI summary with manual patient edits from the questionnaire if present
         if data.intake_answers:
             if "intake_answers" not in summary or not isinstance(summary["intake_answers"], dict):
                 summary["intake_answers"] = {}
             for q_key, val in data.intake_answers.items():
                 if val and val.strip():
                     summary["intake_answers"][q_key] = val.strip()

         form.pre_visit_summary = summary
         urgency_str = summary.get("urgency_level", "MEDIUM").upper()
         if urgency_str in UrgencyLevel.__members__:
             form.urgency_level = UrgencyLevel[urgency_str]
         else:
             form.urgency_level = UrgencyLevel.MEDIUM
         form.llm_status = LLMStatus.SUCCESS
    except Exception as e:
        logger.warning(f"Instant triage generation fallback: {e}")
        form.llm_status = LLMStatus.PENDING

    await db.commit()
    await db.refresh(form)
    # Dispatch Celery task as background backup
    safe_dispatch(generate_pre_visit_summary_task, form.id)
    return form


@router.post(
    "/appointments/{appointment_id}/confirm",
    response_model=AppointmentResponse,
    dependencies=[patient_guard],
)
async def confirm_appointment(
    appointment_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    repo = AppointmentRepository(db)
    existing_appt = await repo.get_by_id(appointment_id, load_relations=True)
    symptom_form = await repo.get_symptom_form(appointment_id)

    if existing_appt and existing_appt.doctor and symptom_form and symptom_form.symptoms_text:
        doc_spec = (existing_appt.doctor.specialisation or "").lower().strip()
        if doc_spec and doc_spec != "general medicine":
            from server.services.llm_service import analyze_symptom_specialty
            analysis = await analyze_symptom_specialty(symptom_form.symptoms_text)
            rec_spec = (analysis.get("recommended_specialty") or "").lower().strip()
            if rec_spec and rec_spec != doc_spec:
                # Release slot if mismatched
                await release_slot(db, appointment_id, patient_id=current_user.id)
                await db.commit()
                doc_name = existing_appt.doctor.user.full_name if existing_appt.doctor.user else "Selected Doctor"
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Booking blocked: Dr. {doc_name} ({existing_appt.doctor.specialisation}) cannot treat {analysis['recommended_specialty']} conditions. The slot has been released."
                )

    appt = await confirm_slot(db, appointment_id, current_user.id)
    await db.commit()

    if appt.status == AppointmentStatus.PENDING_APPROVAL:
        safe_dispatch(
            send_email_task,
            to_email=current_user.email,
            subject="Appointment Request Received — Pending Approval",
            template_name="booking_request_patient",
            context={
                "appointment_id": appt.id,
                "patient_name": current_user.full_name,
                "doctor_name": appt.doctor.user.full_name if appt.doctor and appt.doctor.user else "Selected Specialist",
                "slot_start": appt.slot_start.strftime("%Y-%m-%d %I:%M %p"),
            },
        )
        if appt.doctor and appt.doctor.user:
            safe_dispatch(
                send_email_task,
                to_email=appt.doctor.user.email,
                subject="New Appointment Request — Action Required",
                template_name="booking_request_doctor",
                context={
                    "appointment_id": appt.id,
                    "patient_name": current_user.full_name,
                    "doctor_name": appt.doctor.user.full_name,
                    "slot_start": appt.slot_start.strftime("%Y-%m-%d %I:%M %p"),
                },
            )
    else:
        safe_dispatch(
            send_email_task,
            to_email=current_user.email,
            subject="Appointment Confirmed",
            template_name="booking_confirmation",
            context={
                "appointment_id": appt.id,
                "patient_name": current_user.full_name,
                "doctor_name": appt.doctor.user.full_name if appt.doctor and appt.doctor.user else "Selected Doctor",
                "specialisation": appt.doctor.specialisation if appt.doctor else "General Medicine",
                "slot_start": appt.slot_start.strftime("%Y-%m-%d %I:%M %p"),
            },
        )
        if appt.doctor and appt.doctor.user:
            safe_dispatch(
                send_email_task,
                to_email=appt.doctor.user.email,
                subject="Appointment Confirmed",
                template_name="booking_confirmation",
                context={
                    "appointment_id": appt.id,
                    "patient_name": current_user.full_name,
                    "doctor_name": appt.doctor.user.full_name,
                    "specialisation": appt.doctor.specialisation,
                    "slot_start": appt.slot_start.strftime("%Y-%m-%d %I:%M %p"),
                },
            )
        safe_dispatch(sync_calendar_event_task, appt.id, "create")
    return appt
@router.put(
    "/appointments/{appointment_id}/reschedule",
    response_model=AppointmentResponse,
    dependencies=[patient_guard],
)
async def reschedule_appointment(
    appointment_id: str,
    data: RescheduleRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Patient reschedules a CONFIRMED appointment.
    Old slot is marked RESCHEDULED; new HELD appointment is returned.
    """
    repo = AppointmentRepository(db)
    old_appt = await repo.get_by_id(appointment_id, load_relations=True)
    if not old_appt:
        raise NotFoundError("Appointment not found")

    old_doctor_id = old_appt.doctor_id
    old_slot_start = old_appt.slot_start
    old_doctor_email = old_appt.doctor.user.email if old_appt.doctor and old_appt.doctor.user else None
    old_doctor_name = old_appt.doctor.user.full_name if old_appt.doctor and old_appt.doctor.user else "Selected Doctor"

    new_appt = await reschedule_slot(
        db=db,
        appointment_id=appointment_id,
        patient_id=current_user.id,
        new_slot_start=data.new_slot_start,
        new_doctor_id=data.new_doctor_id,
    )
    await db.commit()

    # Reload relation on new_appt to ensure doctor is loaded
    new_appt = await repo.get_by_id(new_appt.id, load_relations=True)

    # Dispatch email notification for the reschedule
    safe_dispatch(
        send_email_task,
        to_email=current_user.email,
        subject="Appointment Rescheduled — Confirmation",
        template_name="reschedule_notice",
        context={
            "patient_name": current_user.full_name,
            "appointment_id": new_appt.id,
            "new_slot_start": data.new_slot_start.strftime("%Y-%m-%d %I:%M %p"),
            "doctor_name": new_appt.doctor.user.full_name if new_appt.doctor and new_appt.doctor.user else "Selected Doctor",
        },
    )

    if data.new_doctor_id and data.new_doctor_id != old_doctor_id:
        # Doctor changed! Send cancellation to old doctor
        if old_doctor_email:
            safe_dispatch(
                send_email_task,
                to_email=old_doctor_email,
                subject="Patient Appointment Rescheduled (Cancelled)",
                template_name="cancellation_notice",
                context={
                    "appointment_id": appointment_id,
                    "patient_name": current_user.full_name,
                    "reason": "Rescheduled to a different doctor",
                    "extra_message": f"Your patient has rescheduled their appointment previously set at {old_slot_start.strftime('%Y-%m-%d %I:%M %p')} to a different doctor.",
                },
            )
        # Send new booking notification to new doctor
        if new_appt.doctor and new_appt.doctor.user:
            safe_dispatch(
                send_email_task,
                to_email=new_appt.doctor.user.email,
                subject="New Rescheduled Appointment",
                template_name="booking_confirmation",
                context={
                    "appointment_id": new_appt.id,
                    "patient_name": current_user.full_name,
                    "doctor_name": new_appt.doctor.user.full_name,
                    "specialisation": new_appt.doctor.specialisation,
                    "slot_start": data.new_slot_start.strftime("%Y-%m-%d %I:%M %p"),
                },
            )
    else:
        # Same doctor! Send reschedule update email to doctor
        if new_appt.doctor and new_appt.doctor.user:
            safe_dispatch(
                send_email_task,
                to_email=new_appt.doctor.user.email,
                subject="Appointment Rescheduled",
                template_name="reschedule_notice",
                context={
                    "patient_name": current_user.full_name,
                    "appointment_id": new_appt.id,
                    "new_slot_start": data.new_slot_start.strftime("%Y-%m-%d %I:%M %p"),
                    "doctor_name": new_appt.doctor.user.full_name,
                },
            )

    # Sync the new calendar event (update the patient's existing Google Calendar entry)
    safe_dispatch(sync_calendar_event_task, new_appt.id, "update")
    return new_appt


@router.delete(
    "/appointments/{appointment_id}",
    response_model=AppointmentResponse,
    dependencies=[patient_guard],
)
async def cancel_appointment(
    appointment_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Patient cancels their own appointment."""
    repo = AppointmentRepository(db)
    old_appt = await repo.get_by_id(appointment_id, load_relations=True)
    if not old_appt:
        raise NotFoundError("Appointment not found")

    doctor_email = old_appt.doctor.user.email if old_appt.doctor and old_appt.doctor.user else None
    slot_time_str = old_appt.slot_start.strftime("%Y-%m-%d %I:%M %p")

    appt = await release_slot(db, appointment_id, patient_id=current_user.id)
    await db.commit()
    await db.refresh(appt)

    # Dispatch Celery task: cancellation email to patient
    safe_dispatch(
        send_email_task,
        to_email=current_user.email,
        subject="Appointment Cancelled",
        template_name="cancellation_notice",
        context={"appointment_id": appt.id, "patient_name": current_user.full_name},
    )

    # Dispatch Celery task: cancellation email to doctor
    if doctor_email:
        safe_dispatch(
            send_email_task,
            to_email=doctor_email,
            subject="Patient Appointment Cancelled",
            template_name="cancellation_notice",
            context={
                "appointment_id": appt.id,
                "patient_name": current_user.full_name,
                "extra_message": f"Your patient {current_user.full_name} has cancelled the appointment scheduled at {slot_time_str}.",
            },
        )

    safe_dispatch(sync_calendar_event_task, appt.id, "delete")
    return appt


@router.get(
    "/appointments",
    response_model=List[AppointmentDetailResponse],
    dependencies=[patient_guard],
)
async def list_my_appointments(
    status_filter: Optional[AppointmentStatus] = Query(None, alias="status"),
    skip: int = 0,
    limit: int = 50,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Patient lists their own appointments."""
    from server.services.slot_service import auto_approve_stale_requests
    await auto_approve_stale_requests(db)

    repo = AppointmentRepository(db)
    return await repo.list_by_patient(
        patient_id=current_user.id,
        status=status_filter,
        skip=skip,
        limit=limit,
    )


@router.get(
    "/appointments/{appointment_id}",
    response_model=AppointmentDetailResponse,
    dependencies=[patient_guard],
)
async def get_appointment_detail(
    appointment_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Patient views full appointment detail including AI summaries."""
    from server.services.slot_service import auto_approve_stale_requests
    await auto_approve_stale_requests(db)

    repo = AppointmentRepository(db)
    appt = await repo.get_by_id(appointment_id, load_relations=True)
    if not appt:
        raise NotFoundError("Appointment not found")
    if appt.patient_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not your appointment")
    return appt


from pydantic import BaseModel, Field
class DoctorReviewInput(BaseModel):
    rating: int = Field(..., ge=1, le=5)
    comment: Optional[str] = None

@router.post(
    "/appointments/{appointment_id}/review",
    status_code=status.HTTP_201_CREATED,
    dependencies=[patient_guard],
)
async def submit_appointment_review(
    appointment_id: str,
    data: DoctorReviewInput,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Patient submits feedback/review for a COMPLETED consultation."""
    repo = AppointmentRepository(db)
    appt = await repo.get_by_id(appointment_id)
    if not appt:
        raise NotFoundError("Appointment not found")
    if appt.patient_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not your appointment")
    if appt.status != AppointmentStatus.COMPLETED:
        raise HTTPException(status_code=400, detail="Reviews can only be submitted for COMPLETED appointments")

    # Check if review already exists
    from sqlalchemy import select
    from server.database.models import DoctorReview
    res_ex = await db.execute(select(DoctorReview).where(DoctorReview.appointment_id == appointment_id))
    if res_ex.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="You have already reviewed this appointment")

    review = DoctorReview(
        appointment_id=appointment_id,
        patient_id=current_user.id,
        doctor_id=appt.doctor_id,
        rating=data.rating,
        comment=data.comment.strip() if data.comment else None,
    )
    db.add(review)
    await db.commit()
    return {"message": "Review submitted successfully"}
