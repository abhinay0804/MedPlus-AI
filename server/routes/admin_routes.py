import logging
from datetime import datetime
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func

from server.database.connection import get_db
from server.repositories.user_repository import UserRepository
from server.repositories.doctor_repository import DoctorRepository
from server.schemas.doctor_schemas import (
    DoctorCreate, DoctorUpdate, DoctorResponse,
    LeaveCreate, LeaveResponse, AdminDashboardStats,
    AdminNoteCreate, AdminNoteResponse
)
from server.schemas.auth_schemas import UserResponse
from server.auth import require_role
from server.database.models import (
    User, UserRole, DoctorProfile, Appointment, AppointmentStatus,
    DoctorLeave, AuditLog, EmailOTP, AdminNote, InAppNotification
)
from microservices.tasks import handle_doctor_leave_task

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/admin", tags=["Admin Portal"])

# All routes in this router require ADMIN role
admin_guard = Depends(require_role(UserRole.ADMIN))

@router.post("/doctors", response_model=DoctorResponse, status_code=status.HTTP_201_CREATED, dependencies=[admin_guard])
async def create_doctor(data: DoctorCreate, db: AsyncSession = Depends(get_db)):
    """Admin creates a new doctor user account and profile."""
    user_repo = UserRepository(db)
    doc_repo = DoctorRepository(db)
    
    # Check if email exists
    existing = await user_repo.get_by_email(data.email)
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="An account with this email address already exists"
        )
        
    # Create doctor user account
    user = await user_repo.create_user(
        email=data.email,
        password=data.password,
        full_name=data.full_name,
        phone=data.phone,
        role=UserRole.DOCTOR
    )
    
    # Convert working_hours model dict
    working_hours_dict = {
        day: hours.model_dump() for day, hours in data.working_hours.items()
    }
    
    profile = await doc_repo.create_doctor(
        user_id=user.id,
        specialisation=data.specialisation,
        working_hours=working_hours_dict,
        slot_duration_minutes=data.slot_duration_minutes
    )
    
    return profile

@router.get("/doctors", response_model=List[DoctorResponse], dependencies=[admin_guard])
async def list_all_doctors(
    specialisation: Optional[str] = None,
    is_active_only: bool = False,
    skip: int = 0,
    limit: int = 100,
    db: AsyncSession = Depends(get_db)
):
    """Admin lists all doctor profiles (active and inactive)."""
    doc_repo = DoctorRepository(db)
    doctors = await doc_repo.list_doctors(
        specialisation=specialisation,
        is_active_only=is_active_only,
        skip=skip,
        limit=limit
    )
    return doctors

@router.get("/doctors/{id}", response_model=DoctorResponse, dependencies=[admin_guard])
async def get_doctor_detail(id: str, db: AsyncSession = Depends(get_db)):
    """Admin gets details of a single doctor profile."""
    doc_repo = DoctorRepository(db)
    profile = await doc_repo.get_by_id(id)
    if not profile:
        raise HTTPException(status_code=404, detail="Doctor profile not found")
    return profile

@router.put("/doctors/{id}", response_model=DoctorResponse)
async def update_doctor_profile(
    id: str,
    data: DoctorUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.ADMIN))
):
    """Admin updates doctor specialisation, working hours, slot duration, or status."""
    doc_repo = DoctorRepository(db)
    profile = await doc_repo.get_by_id(id)
    if not profile:
        raise HTTPException(status_code=404, detail="Doctor profile not found")
        
    working_hours_dict = None
    if data.working_hours is not None:
        working_hours_dict = {
            day: hours.model_dump() for day, hours in data.working_hours.items()
        }
        
    updated = await doc_repo.update_doctor(
        doctor_id=id,
        specialisation=data.specialisation,
        working_hours=working_hours_dict,
        slot_duration_minutes=data.slot_duration_minutes,
        is_active=data.is_active
    )
    
    # Audit log and email dispatch if schedule changed
    if data.working_hours is not None or data.slot_duration_minutes is not None:
        audit = AuditLog(
            action="ADMIN_OVERRIDE_SCHEDULE",
            target_type="DoctorProfile",
            target_id=id,
            user_id=current_user.id,
            details={
                "doctor_id": id,
                "doctor_name": profile.user.full_name,
                "working_hours": working_hours_dict,
                "slot_duration_minutes": data.slot_duration_minutes
            }
        )
        db.add(audit)
        
        from microservices.tasks import send_email_task
        from server.routes.patient_routes import safe_dispatch
        safe_dispatch(
            send_email_task,
            profile.user.email,
            "Your Clinical Schedule has been updated by Administration",
            "generic_notification",
            {
                "title": "Clinical Schedule Updated",
                "message": f"Hello Dr. {profile.user.full_name},\n\nPlease note that your clinical working hours and/or slot duration has been updated directly by the hospital administration.\n\nKindly review your updated availability in the Doctor Portal.\n\nBest regards,\nMedPulse AI Administration"
            }
        )

    # Update associated user fields if provided
    if data.full_name or data.phone:
        user_repo = UserRepository(db)
        user = await user_repo.get_by_id(profile.user_id)
        if user:
            if data.full_name:
                user.full_name = data.full_name.strip()
            if data.phone is not None:
                user.phone = data.phone.strip() if data.phone else None
            await db.flush()
            
    return await doc_repo.get_by_id(id)

@router.delete("/doctors/{id}", status_code=status.HTTP_200_OK, dependencies=[admin_guard])
async def deactivate_doctor(id: str, db: AsyncSession = Depends(get_db)):
    """Admin deactivates a doctor profile (soft delete)."""
    doc_repo = DoctorRepository(db)
    profile = await doc_repo.get_by_id(id)
    if not profile:
        raise HTTPException(status_code=404, detail="Doctor profile not found")
        
    await doc_repo.update_doctor(id, is_active=False)
    return {"status": "success", "message": f"Doctor profile '{profile.user.full_name}' deactivated"}

# --- Doctor Leave Management ---

@router.post("/doctors/{id}/leave", response_model=LeaveResponse, status_code=status.HTTP_201_CREATED, dependencies=[admin_guard])
async def mark_doctor_leave(id: str, data: LeaveCreate, db: AsyncSession = Depends(get_db)):
    """
    Admin marks a doctor on leave for a specific date.
    Finds and cancels any existing CONFIRMED appointments for that doctor on that date.
    """
    doc_repo = DoctorRepository(db)
    profile = await doc_repo.get_by_id(id)
    if not profile:
        raise HTTPException(status_code=404, detail="Doctor profile not found")
        
    # Check if leave already marked
    existing_leave = await doc_repo.is_doctor_on_leave(id, data.leave_date)
    if existing_leave:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Doctor is already marked on leave for date {data.leave_date}"
        )
        
    leave = await doc_repo.add_leave(id, data.leave_date, data.reason)
    
    # Query affected CONFIRMED / HELD appointments on leave_date
    stmt = select(Appointment).where(
        Appointment.doctor_id == id,
        func.date(Appointment.slot_start) == data.leave_date,
        Appointment.status.in_([AppointmentStatus.CONFIRMED, AppointmentStatus.HELD])
    )
    result = await db.execute(stmt)
    affected_appointments = list(result.scalars().all())
    
    # Dispatch Celery task to handle auto-rescheduling or fallback cancellation
    if affected_appointments:
        handle_doctor_leave_task.delay(id, str(data.leave_date))
        logger.info(
            f"[AdminLeave] Queued leave processing for {len(affected_appointments)} "
            f"affected appointments on {data.leave_date}"
        )
    
    return leave

@router.get("/doctors/{id}/leave", response_model=List[LeaveResponse], dependencies=[admin_guard])
async def get_doctor_leaves(id: str, db: AsyncSession = Depends(get_db)):
    """List leave dates for a doctor."""
    doc_repo = DoctorRepository(db)
    profile = await doc_repo.get_by_id(id)
    if not profile:
        raise HTTPException(status_code=404, detail="Doctor profile not found")
        
    return await doc_repo.get_leaves(id)

@router.delete("/doctors/{id}/leave/{leave_id}", status_code=status.HTTP_200_OK, dependencies=[admin_guard])
async def remove_doctor_leave(id: str, leave_id: str, db: AsyncSession = Depends(get_db)):
    """Admin removes a doctor leave date."""
    doc_repo = DoctorRepository(db)
    removed = await doc_repo.remove_leave(id, leave_id)
    if not removed:
        raise HTTPException(status_code=404, detail="Leave entry not found")
    return {"status": "success", "message": "Leave date removed"}

# --- Admin Dashboard Metrics ---

@router.get("/dashboard", response_model=AdminDashboardStats, dependencies=[admin_guard])
async def get_admin_dashboard_stats(db: AsyncSession = Depends(get_db)):
    """Admin dashboard stats overview."""
    total_docs = await db.scalar(select(func.count(DoctorProfile.id)))
    active_docs = await db.scalar(select(func.count(DoctorProfile.id)).where(DoctorProfile.is_active == True))
    total_patients = await db.scalar(select(func.count(User.id)).where(User.role == UserRole.PATIENT))
    total_apts = await db.scalar(select(func.count(Appointment.id)))
    
    pending_apts = await db.scalar(select(func.count(Appointment.id)).where(Appointment.status.in_([AppointmentStatus.CONFIRMED, AppointmentStatus.HELD])))
    completed_apts = await db.scalar(select(func.count(Appointment.id)).where(Appointment.status == AppointmentStatus.COMPLETED))
    cancelled_apts = await db.scalar(select(func.count(Appointment.id)).where(Appointment.status == AppointmentStatus.CANCELLED))
    
    return AdminDashboardStats(
        total_doctors=total_docs or 0,
        active_doctors=active_docs or 0,
        total_patients=total_patients or 0,
        total_appointments=total_apts or 0,
        pending_appointments=pending_apts or 0,
        completed_appointments=completed_apts or 0,
        cancelled_appointments=cancelled_apts or 0
    )


from pydantic import BaseModel

class ResolveWorkingHoursInput(BaseModel):
    status: str
    admin_reason: Optional[str] = None

@router.get("/working-hours-requests", dependencies=[admin_guard])
async def list_pending_working_hours_requests(
    db: AsyncSession = Depends(get_db)
):
    from sqlalchemy import select
    from sqlalchemy.orm import selectinload
    from server.database.models import WorkingHoursRequest, DoctorProfile
    
    stmt = (
        select(WorkingHoursRequest)
        .options(
            selectinload(WorkingHoursRequest.doctor).selectinload(DoctorProfile.user)
        )
        .where(WorkingHoursRequest.status == "PENDING")
        .order_by(WorkingHoursRequest.created_at.desc())
    )
    res = await db.execute(stmt)
    requests = res.scalars().all()
    
    return [
        {
            "id": req.id,
            "doctor_id": req.doctor_id,
            "doctor_name": req.doctor.user.full_name if req.doctor and req.doctor.user else "Unknown Doctor",
            "proposed_working_hours": req.proposed_working_hours,
            "proposed_slot_duration": req.proposed_slot_duration,
            "status": req.status,
            "created_at": req.created_at.isoformat(),
            "current_working_hours": req.doctor.working_hours if req.doctor else None,
            "current_slot_duration": req.doctor.slot_duration_minutes if req.doctor else None,
        }
        for req in requests
    ]


@router.put("/working-hours-requests/{request_id}/resolve", dependencies=[admin_guard])
async def resolve_working_hours_request(
    request_id: str,
    data: ResolveWorkingHoursInput,
    db: AsyncSession = Depends(get_db)
):
    from server.database.models import WorkingHoursRequest, AuditLog
    from sqlalchemy.orm import selectinload
    
    stmt = (
        select(WorkingHoursRequest)
        .options(selectinload(WorkingHoursRequest.doctor).selectinload(DoctorProfile.user))
        .where(WorkingHoursRequest.id == request_id)
    )
    res = await db.execute(stmt)
    req = res.scalar_one_or_none()
    if not req:
        raise HTTPException(status_code=404, detail="Request not found")

    if req.status != "PENDING":
        raise HTTPException(status_code=400, detail="Request already resolved")

    if data.status not in ("APPROVED", "REJECTED"):
        raise HTTPException(status_code=400, detail="Invalid resolution status")

    req.status = data.status
    req.admin_reason = data.admin_reason
    req.resolved_at = datetime.utcnow()

    doctor = req.doctor
    if not doctor or not doctor.user:
        raise HTTPException(status_code=404, detail="Doctor profile or user not found")

    from microservices.tasks import send_email_task
    from server.routes.patient_routes import safe_dispatch

    if data.status == "APPROVED":
        doctor.working_hours = req.proposed_working_hours
        doctor.slot_duration_minutes = req.proposed_slot_duration
        
        audit = AuditLog(
            action="ADMIN_APPROVE_SCHEDULE",
            target_type="DoctorProfile",
            target_id=doctor.id,
            details=f"Admin approved schedule change request. Proposed slot duration: {req.proposed_slot_duration} min."
        )
        db.add(audit)
        
        safe_dispatch(
            send_email_task,
            doctor.user.email,
            "Your Working Hours Update Request has been Approved!",
            "generic_notification",
            {
                "title": "Working Hours Request Approved",
                "message": f"Hello Dr. {doctor.user.full_name},\n\nWe are pleased to inform you that your request to update your clinical schedule and working hours has been approved by the administration and is now active on MedPulse AI.\n\nBest regards,\nMedPulse AI Administration"
            }
        )
    else:
        audit = AuditLog(
            action="ADMIN_REJECT_SCHEDULE",
            target_type="DoctorProfile",
            target_id=doctor.id,
            details=f"Admin rejected schedule change request. Reason: {data.admin_reason or 'No reason provided'}"
        )
        db.add(audit)
        
        safe_dispatch(
            send_email_task,
            doctor.user.email,
            "Your Working Hours Update Request has been Declined",
            "generic_notification",
            {
                "title": "Working Hours Request Declined",
                "message": f"Hello Dr. {doctor.user.full_name},\n\nYour request to update your working hours has been reviewed and declined by the administration.\n\nReason: {data.admin_reason or 'No reason provided.'}\n\nIf you have any questions, please reach out to the medical operations team.\n\nBest regards,\nMedPulse AI Administration"
            }
        )

    await db.commit()
    return {"success": True, "message": f"Request successfully resolved as {data.status}."}


class ResolveLeaveRequestInput(BaseModel):
    status: str
    admin_reason: Optional[str] = None

@router.get("/leave-requests", dependencies=[admin_guard])
async def list_admin_leave_requests(
    db: AsyncSession = Depends(get_db)
):
    from sqlalchemy import select, func
    from sqlalchemy.orm import selectinload
    from server.database.models import DoctorLeaveRequest, DoctorLeave, DoctorProfile
    from datetime import date
    
    stmt = (
        select(DoctorLeaveRequest)
        .options(selectinload(DoctorLeaveRequest.doctor).selectinload(DoctorProfile.user))
        .order_by(DoctorLeaveRequest.created_at.desc())
    )
    res = await db.execute(stmt)
    requests = res.scalars().all()
    
    today = date.today()
    month_start = date(today.year, today.month, 1)
    
    out = []
    for req in requests:
        # Calculate doctor leaves taken in the current month
        leaves_stmt = select(func.count(DoctorLeave.id)).where(
            DoctorLeave.doctor_id == req.doctor_id,
            DoctorLeave.leave_date >= month_start
        )
        leaves_res = await db.execute(leaves_stmt)
        leaves_taken = leaves_res.scalar_one() or 0
        
        # Calculate appointments for the leave_date
        from datetime import datetime, timedelta
        from server.database.models import Appointment, AppointmentStatus
        
        day_start = datetime(req.leave_date.year, req.leave_date.month, req.leave_date.day)
        day_end = day_start + timedelta(days=1)
        
        apts_stmt = (
            select(Appointment)
            .options(selectinload(Appointment.symptom_form))
            .where(
                Appointment.doctor_id == req.doctor_id,
                Appointment.slot_start >= day_start,
                Appointment.slot_start < day_end,
                Appointment.status.in_([
                    AppointmentStatus.CONFIRMED,
                    AppointmentStatus.HELD,
                    AppointmentStatus.PENDING_APPROVAL
                ])
            )
        )
        apts_res = await db.execute(apts_stmt)
        apts = apts_res.scalars().all()
        
        confirmed_count = sum(1 for a in apts if a.status == AppointmentStatus.CONFIRMED)
        pending_count = sum(1 for a in apts if a.status in [AppointmentStatus.HELD, AppointmentStatus.PENDING_APPROVAL])
        
        high_urgency = 0
        medium_urgency = 0
        low_urgency = 0
        for a in apts:
            if a.symptom_form and a.symptom_form.urgency_level:
                u_str = a.symptom_form.urgency_level.name.upper()
                if "HIGH" in u_str:
                    high_urgency += 1
                elif "MEDIUM" in u_str or "MID" in u_str:
                    medium_urgency += 1
                else:
                    low_urgency += 1
            else:
                low_urgency += 1
                
        # Get AI recommendation
        from server.services.llm_service import get_leave_recommendation
        doc_name = req.doctor.user.full_name if req.doctor and req.doctor.user else "Unknown Doctor"
        specialty = req.doctor.specialisation if req.doctor else "Unknown"
        
        ai_rec = await get_leave_recommendation(
            doctor_name=doc_name,
            specialty=specialty,
            reason=req.reason,
            leaves_taken_this_month=leaves_taken,
            confirmed_count=confirmed_count,
            pending_count=pending_count,
            high_urgency=high_urgency,
            medium_urgency=medium_urgency,
            low_urgency=low_urgency
        )
        
        out.append({
            "id": req.id,
            "doctor_id": req.doctor_id,
            "doctor_name": doc_name,
            "doctor_specialisation": specialty,
            "leave_date": str(req.leave_date),
            "reason": req.reason,
            "status": req.status,
            "admin_reason": req.admin_reason,
            "created_at": req.created_at.isoformat(),
            "resolved_at": req.resolved_at.isoformat() if req.resolved_at else None,
            "leaves_taken_this_month": leaves_taken,
            "confirmed_appointments": confirmed_count,
            "pending_appointments": pending_count,
            "high_urgency_count": high_urgency,
            "medium_urgency_count": medium_urgency,
            "low_urgency_count": low_urgency,
            "ai_suggestion": ai_rec.get("suggestion", "APPROVE"),
            "ai_reason": ai_rec.get("reason", ""),
        })
    return out


@router.put("/leave-requests/{request_id}/resolve", dependencies=[admin_guard])
async def resolve_doctor_leave_request(
    request_id: str,
    data: ResolveLeaveRequestInput,
    db: AsyncSession = Depends(get_db)
):
    from server.database.models import DoctorLeaveRequest, AuditLog
    from sqlalchemy.orm import selectinload
    from datetime import datetime
    
    stmt = (
        select(DoctorLeaveRequest)
        .options(selectinload(DoctorLeaveRequest.doctor).selectinload(DoctorProfile.user))
        .where(DoctorLeaveRequest.id == request_id)
    )
    res = await db.execute(stmt)
    req = res.scalar_one_or_none()
    if not req:
        raise HTTPException(status_code=404, detail="Leave request not found")
        
    if req.status != "PENDING":
        raise HTTPException(status_code=400, detail="Leave request already resolved")
        
    if data.status not in ("APPROVED", "REJECTED"):
        raise HTTPException(status_code=400, detail="Invalid resolution status")
        
    req.status = data.status
    req.admin_reason = data.admin_reason
    req.resolved_at = datetime.utcnow()
    
    doctor = req.doctor
    if not doctor or not doctor.user:
        raise HTTPException(status_code=404, detail="Doctor profile or user not found")
        
    from microservices.tasks import send_email_task, handle_doctor_leave_task
    from server.routes.patient_routes import safe_dispatch
    
    if data.status == "APPROVED":
        doc_repo = DoctorRepository(db)
        
        # Check if leave already marked
        already_leave = await doc_repo.is_doctor_on_leave(doctor.id, req.leave_date)
        if not already_leave:
            await doc_repo.add_leave(doctor.id, req.leave_date, req.reason)
            
            # Query affected CONFIRMED / HELD appointments on leave_date
            stmt_apts = select(Appointment).where(
                Appointment.doctor_id == doctor.id,
                func.date(Appointment.slot_start) == req.leave_date,
                Appointment.status.in_([AppointmentStatus.CONFIRMED, AppointmentStatus.HELD])
            )
            apts_res = await db.execute(stmt_apts)
            affected_appointments = list(apts_res.scalars().all())
            
            if affected_appointments:
                handle_doctor_leave_task.delay(doctor.id, str(req.leave_date))
                
        audit = AuditLog(
            action="ADMIN_APPROVE_LEAVE",
            target_type="DoctorProfile",
            target_id=doctor.id,
            details=f"Admin approved doctor leave request for date: {req.leave_date}."
        )
        db.add(audit)
        
        safe_dispatch(
            send_email_task,
            doctor.user.email,
            "Your Leave Request has been Approved!",
            "generic_notification",
            {
                "title": "Leave Request Approved",
                "message": f"Hello Dr. {doctor.user.full_name},\n\nWe are pleased to inform you that your leave request for {req.leave_date} has been approved by the administration.\n\nYour clinical calendar for this day has been cleared and affected bookings have been managed.\n\nBest regards,\nMedPulse AI Administration"
            }
        )
    else:
        audit = AuditLog(
            action="ADMIN_REJECT_LEAVE",
            target_type="DoctorProfile",
            target_id=doctor.id,
            details=f"Admin rejected doctor leave request for date: {req.leave_date}. Reason: {data.admin_reason or 'No reason provided'}"
        )
        db.add(audit)
        
        safe_dispatch(
            send_email_task,
            doctor.user.email,
            "Your Leave Request has been Declined",
            "generic_notification",
            {
                "title": "Leave Request Declined",
                "message": f"Hello Dr. {doctor.user.full_name},\n\nYour leave request for {req.leave_date} has been reviewed and declined by the administration.\n\nReason: {data.admin_reason or 'No reason provided.'}\n\nBest regards,\nMedPulse AI Administration"
            }
        )
        
    await db.commit()
    return {"success": True, "message": f"Leave request resolved successfully as {data.status}."}


@router.get("/audit-logs", dependencies=[admin_guard])
async def get_audit_logs(
    role: Optional[str] = None,
    action: Optional[str] = None,
    search: Optional[str] = None,
    db: AsyncSession = Depends(get_db)
):
    """Fetch HIPAA system audit logs from database."""
    from server.database.models import AuditLog
    from sqlalchemy import text
    
    stmt = (
        select(AuditLog, User)
        .outerjoin(User, AuditLog.user_id == User.id)
        .order_by(AuditLog.created_at.desc())
    )
    result = await db.execute(stmt)
    
    logs_out = []
    for audit, user in result:
        actor_role = "SYSTEM"
        user_email = "SYSTEM"
        if user:
            user_email = user.email
            actor_role = user.role.value if hasattr(user.role, 'value') else str(user.role)
        elif audit.action.startswith("SYSTEM_") or (audit.details and "AI" in str(audit.details)):
            actor_role = "SYSTEM"
        
        details_text = ""
        if isinstance(audit.details, dict):
            details_text = audit.details.get("message") or audit.details.get("reason") or audit.details.get("details") or str(audit.details)
        elif isinstance(audit.details, str):
            details_text = audit.details
            
        logs_out.append({
            "id": audit.id,
            "action": audit.action,
            "user": user_email,
            "actorRole": actor_role,
            "target": f"{audit.target_type} #{audit.target_id}" if audit.target_type else "System",
            "timestamp": audit.created_at.strftime("%Y-%m-%d %H:%M:%S"),
            "details": details_text or f"Action {audit.action} executed."
        })
        
    if role and role != "ALL":
        logs_out = [l for l in logs_out if l["actorRole"] == role]
    if search:
        s = search.lower()
        logs_out = [l for l in logs_out if s in l["action"].lower() or s in l["details"].lower() or s in l["user"].lower()]
        
    return logs_out


@router.post("/ai-insights", dependencies=[admin_guard])
async def get_ai_insights(db: AsyncSession = Depends(get_db)):
    """Analyze hospital statistics and invoke Gemini for staffing/operational insights."""
    from server.services.llm_service import generate_clinical_insights
    from server.database.models import SymptomForm, UrgencyLevel
    
    total_doctors = (await db.execute(select(func.count(DoctorProfile.id)))).scalar() or 0
    active_doctors = (await db.execute(select(func.count(DoctorProfile.id)).where(DoctorProfile.is_active == True))).scalar() or 0
    total_patients = (await db.execute(select(func.count(User.id)).where(User.role == UserRole.PATIENT))).scalar() or 0
    total_appointments = (await db.execute(select(func.count(Appointment.id)))).scalar() or 0
    
    completed_appointments = (await db.execute(select(func.count(Appointment.id)).where(Appointment.status == AppointmentStatus.COMPLETED))).scalar() or 0
    confirmed_appointments = (await db.execute(select(func.count(Appointment.id)).where(Appointment.status == AppointmentStatus.CONFIRMED))).scalar() or 0
    pending_appointments = (await db.execute(select(func.count(Appointment.id)).where(Appointment.status == AppointmentStatus.PENDING_APPROVAL))).scalar() or 0
    cancelled_appointments = (await db.execute(select(func.count(Appointment.id)).where(Appointment.status == AppointmentStatus.CANCELLED))).scalar() or 0
    
    critical_urgency = (await db.execute(select(func.count(SymptomForm.id)).where(SymptomForm.urgency_level == UrgencyLevel.HIGH))).scalar() or 0
    medium_urgency = (await db.execute(select(func.count(SymptomForm.id)).where(SymptomForm.urgency_level == UrgencyLevel.MEDIUM))).scalar() or 0
    low_urgency = (await db.execute(select(func.count(SymptomForm.id)).where(SymptomForm.urgency_level == UrgencyLevel.LOW))).scalar() or 0
    
    specialties_result = await db.execute(
        select(DoctorProfile.specialisation, func.count(Appointment.id))
        .join(Appointment, DoctorProfile.id == Appointment.doctor_id)
        .group_by(DoctorProfile.specialisation)
    )
    specialty_distribution = {row[0]: row[1] for row in specialties_result}
    
    metrics = {
        "total_doctors": total_doctors,
        "active_doctors": active_doctors,
        "total_patients": total_patients,
        "total_appointments": total_appointments,
        "completed_appointments": completed_appointments,
        "confirmed_appointments": confirmed_appointments,
        "pending_appointments": pending_appointments,
        "cancelled_appointments": cancelled_appointments,
        "critical_urgency": critical_urgency,
        "medium_urgency": medium_urgency,
        "low_urgency": low_urgency,
        "specialty_distribution": specialty_distribution
    }
    
    insights = await generate_clinical_insights(metrics)
    return insights


@router.get("/telemetry", dependencies=[admin_guard])
async def get_telemetry(db: AsyncSession = Depends(get_db)):
    """Return system health metrics (simulated gauges)."""
    import random
    from server.database.models import AuditLog
    
    total_users = (await db.execute(select(func.count(User.id)))).scalar() or 0
    total_appointments = (await db.execute(select(func.count(Appointment.id)))).scalar() or 0
    total_audit_logs = (await db.execute(select(func.count(AuditLog.id)))).scalar() or 0
    
    redis_status = "HEALTHY"
    try:
        import redis
        from server.config import settings
        r = redis.from_url(settings.REDIS_URL)
        r.ping()
    except Exception:
        redis_status = "UNAVAILABLE"
        
    return {
        "cpu_usage": random.randint(15, 35),
        "memory_usage": random.randint(40, 55),
        "db_rows": total_users + total_appointments + total_audit_logs,
        "redis_status": redis_status,
        "celery_status": "HEALTHY" if redis_status == "HEALTHY" else "STALLED",
        "api_response_time_ms": random.randint(10, 45)
    }


@router.get("/smtp-logs", dependencies=[admin_guard])
async def get_smtp_logs():
    """Return the recent simulated SMTP email notifications dispatch log."""
    from server.services.email_service import EMAIL_LOGS
    return list(reversed(EMAIL_LOGS))


@router.post("/reset-db", dependencies=[admin_guard])
async def reset_database(db: AsyncSession = Depends(get_db)):
    """Reset the SQLite database tables and re-seed the default data."""
    from sqlalchemy import text
    try:
        # Delete all records
        await db.execute(text("DELETE FROM in_app_notifications"))
        await db.execute(text("DELETE FROM admin_notes"))
        await db.execute(text("DELETE FROM email_otps"))
        await db.execute(text("DELETE FROM audit_logs"))
        await db.execute(text("DELETE FROM doctor_reviews"))
        await db.execute(text("DELETE FROM post_visit_notes"))
        await db.execute(text("DELETE FROM symptom_forms"))
        await db.execute(text("DELETE FROM appointments"))
        await db.execute(text("DELETE FROM doctor_leaves"))
        await db.execute(text("DELETE FROM doctor_profiles"))
        await db.execute(text("DELETE FROM users"))
        await db.commit()
        
        # Re-seed
        from scripts.seed_db import seed
        await seed()
        
        return {"success": True, "message": "Database reset and re-seeded successfully!"}
    except Exception as e:
        logger.error(f"Failed to reset database: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to reset database: {str(e)}"
        )

# --- Admin to Doctor Notes & Directives ---

@router.post("/doctors/{id}/notes", response_model=AdminNoteResponse)
async def create_admin_note(
    id: str,
    data: AdminNoteCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.ADMIN))
):
    """Admin sends a priority note/directive to a doctor."""
    doc_repo = DoctorRepository(db)
    doctor = await doc_repo.get_by_id(id)
    if not doctor:
        raise HTTPException(status_code=404, detail="Doctor profile not found")

    note = AdminNote(
        doctor_id=id,
        subject=data.subject,
        body=data.body,
        priority=data.priority,
        is_read=False
    )
    db.add(note)

    audit = AuditLog(
        action="ADMIN_SEND_NOTE",
        target_type="DoctorProfile",
        target_id=id,
        user_id=current_user.id,
        details={
            "doctor_name": doctor.user.full_name,
            "subject": data.subject,
            "priority": data.priority
        }
    )
    db.add(audit)

    notif = InAppNotification(
        user_id=doctor.user_id,
        title=f"New Directive from Administration ({data.priority})",
        body=f"Subject: {data.subject}",
        type="admin_note",
        link="/doctor/dashboard"
    )
    db.add(notif)

    # Dispatch email notification to doctor
    from microservices.tasks import send_email_task
    from server.routes.patient_routes import safe_dispatch
    if doctor.user and doctor.user.email:
        safe_dispatch(
            send_email_task,
            to_email=doctor.user.email,
            subject=f"New Administrative Directive ({data.priority})",
            template_name="system_notice",
            context={
                "message": f"Hello Dr. {doctor.user.full_name},\n\nYou have received a new administrative note/directive from the clinic administration.\n\nPriority: {data.priority}\nSubject: {data.subject}\n\nContent:\n{data.body}\n\nPlease check your Doctor Portal dashboard under Directives to mark it as read.\n\nBest regards,\nMedPulse AI Administration"
            }
        )

    await db.commit()
    await db.refresh(note)
    return note

@router.get("/doctors/{id}/notes", response_model=List[AdminNoteResponse], dependencies=[admin_guard])
async def get_admin_notes(id: str, db: AsyncSession = Depends(get_db)):
    """Retrieve all admin notes sent to a specific doctor."""
    query = select(AdminNote).where(AdminNote.doctor_id == id).order_by(AdminNote.created_at.desc())
    notes = (await db.execute(query)).scalars().all()
    return notes


@router.get("/doctors/{id}/performance", dependencies=[admin_guard])
async def get_doctor_performance(
    id: str,
    period: str = "total",  # day, month, 3months, 6months, 1year, total
    date_str: Optional[str] = None,  # date query like YYYY-MM-DD or YYYY-MM
    db: AsyncSession = Depends(get_db)
):
    """Retrieve comprehensive time-filtered performance metrics for a doctor."""
    from datetime import datetime, date, timedelta
    from sqlalchemy import select, func
    from sqlalchemy.orm import selectinload
    from server.database.models import DoctorProfile, Appointment, AppointmentStatus, DoctorLeave, DoctorReview, User
    
    doc_repo = DoctorRepository(db)
    doctor = await doc_repo.get_by_id(id)
    if not doctor:
        raise HTTPException(status_code=404, detail="Doctor profile not found")
        
    now = datetime.now() # Use local system time for query relative metrics
    
    # 1. Determine date filter range
    start_dt = None
    end_dt = None
    
    if period == "day":
        if date_str:
            try:
                d = datetime.strptime(date_str, "%Y-%m-%d").date()
            except ValueError:
                d = now.date()
        else:
            d = now.date()
        start_dt = datetime(d.year, d.month, d.day, 0, 0, 0)
        end_dt = start_dt + timedelta(days=1)
        
    elif period == "month":
        if date_str:
            try:
                # Expect YYYY-MM
                parts = date_str.split("-")
                year = int(parts[0])
                month = int(parts[1])
                d = date(year, month, 1)
            except (ValueError, IndexError):
                d = date(now.year, now.month, 1)
        else:
            d = date(now.year, now.month, 1)
        start_dt = datetime(d.year, d.month, 1, 0, 0, 0)
        if d.month == 12:
            end_dt = datetime(d.year + 1, 1, 1, 0, 0, 0)
        else:
            end_dt = datetime(d.year, d.month + 1, 1, 0, 0, 0)
            
    elif period == "3months":
        end_dt = now
        start_dt = now - timedelta(days=90)
        
    elif period == "6months":
        end_dt = now
        start_dt = now - timedelta(days=180)
        
    elif period == "1year":
        end_dt = now
        start_dt = now - timedelta(days=365)
        
    else:  # total
        end_dt = now
        start_dt = datetime(2020, 1, 1, 0, 0, 0)
        
    # 2. Query Leaves taken in period
    leave_query = select(DoctorLeave).where(DoctorLeave.doctor_id == id)
    if period == "day":
        leave_query = leave_query.where(DoctorLeave.leave_date == start_dt.date())
    elif period == "month":
        leave_query = leave_query.where(DoctorLeave.leave_date >= start_dt.date(), DoctorLeave.leave_date < end_dt.date())
    elif period in ["3months", "6months", "1year"]:
        leave_query = leave_query.where(DoctorLeave.leave_date >= start_dt.date(), DoctorLeave.leave_date <= end_dt.date())
    # for total, no date bounds
    
    leaves_res = await db.execute(leave_query)
    leaves_list = leaves_res.scalars().all()
    leaves_count = len(leaves_list)
    
    # 3. Query Appointments in period
    appt_query = select(Appointment).options(selectinload(Appointment.symptom_form)).where(Appointment.doctor_id == id)
    if start_dt and end_dt:
        appt_query = appt_query.where(Appointment.slot_start >= start_dt, Appointment.slot_start < end_dt)
        
    appt_res = await db.execute(appt_query)
    appts = appt_res.scalars().all()
    
    cases_completed = 0
    cases_cancelled = 0
    cases_confirmed = 0
    cases_high = 0
    cases_medium = 0
    cases_low = 0
    total_working_minutes = 0
    unique_working_days = set()
    
    for appt in appts:
        if appt.status == AppointmentStatus.COMPLETED:
            cases_completed += 1
            duration = (appt.slot_end - appt.slot_start).total_seconds() / 60
            total_working_minutes += duration
            unique_working_days.add(appt.slot_start.date())
            
            # Check urgency
            if appt.symptom_form and appt.symptom_form.urgency_level:
                u_str = appt.symptom_form.urgency_level.name.upper()
                if "HIGH" in u_str:
                    cases_high += 1
                elif "MEDIUM" in u_str or "MID" in u_str:
                    cases_medium += 1
                else:
                    cases_low += 1
            else:
                cases_low += 1
                
        elif appt.status == AppointmentStatus.CANCELLED:
            cases_cancelled += 1
        elif appt.status == AppointmentStatus.CONFIRMED:
            cases_confirmed += 1
            
    total_working_hours = round(total_working_minutes / 60.0, 1)
    days_worked = len(unique_working_days)
    avg_working_hours_per_day = round(total_working_hours / days_worked, 1) if days_worked > 0 else 0.0
    
    # 4. Query Reviews in period
    review_query = select(DoctorReview).options(selectinload(DoctorReview.appointment)).where(DoctorReview.doctor_id == id)
    if start_dt and end_dt:
        review_query = review_query.where(DoctorReview.created_at >= start_dt, DoctorReview.created_at < end_dt)
        
    reviews_res = await db.execute(review_query)
    reviews_list = reviews_res.scalars().all()
    
    ratings = [r.rating for r in reviews_list if r.rating is not None]
    rating_avg = round(sum(ratings) / len(ratings), 1) if ratings else 0.0
    rating_count = len(ratings)
    
    # Retrieve details for reviews
    reviews_out = []
    for r in reviews_list:
        patient_stmt = select(User).where(User.id == r.patient_id)
        p_res = await db.execute(patient_stmt)
        p = p_res.scalar_one_or_none()
        patient_name = p.full_name if p else "Anonymous"
        reviews_out.append({
            "id": r.id,
            "rating": r.rating,
            "comment": r.comment,
            "patient_name": patient_name,
            "created_at": r.created_at.strftime("%Y-%m-%d %I:%M %p")
        })
        
    # 5. Generate AI analysis of reviews and statistics
    gemini_analysis = {
        "summary": "This doctor has solid performance across the clinic.",
        "strengths": ["Strong clinical presence", "Good patient compliance"],
        "areas_for_improvement": ["Review and reduce appointment cancellations"],
        "suggestions": "Ensure slot availability aligns with leaves to prevent manual rescheduling overhead."
    }
    
    comments = [r.comment for r in reviews_list if r.comment]
    comments_summary = " | ".join(comments) if comments else "No text reviews available."
    
    import os
    if os.getenv("GOOGLE_GENAI_API_KEY"):
        try:
            from server.services.llm_service import call_gemini_json
            prompt = f"""
            You are an expert clinical practice administrator. Analyze the performance statistics and patient feedback comments for Dr. {doctor.user.full_name} ({doctor.specialisation}) over the period '{period}':
            
            Clinic Metrics:
            - Completed Cases: {cases_completed}
            - Cancelled Cases: {cases_cancelled}
            - High Urgency Cases Managed: {cases_high}
            - Medium Urgency Cases Managed: {cases_medium}
            - Low Urgency Cases Managed: {cases_low}
            - Total Consultation Hours: {total_working_hours} hrs
            - Average Work Hours/Day: {avg_working_hours_per_day} hrs
            - Average Patient Rating: {rating_avg}/5
            - Total Patient Reviews: {rating_count}
            
            Patient Review Comments:
            "{comments_summary}"
            
            Generate a performance appraisal in JSON format. Do not include markdown wraps or block ticks.
            Return a JSON object matching this schema:
            {{
              "summary": "Concise summary of their clinical and scheduling performance (max 3 sentences)",
              "strengths": ["List 2-3 specific clinical/interpersonal strengths based on data or comments"],
              "areas_for_improvement": ["List 1-2 constructive areas for improvement (e.g. promptness, communication, scheduling)"],
              "suggestions": "Actionable, concrete suggestions for the doctor to improve their practice."
            }}
            """
            analysis_json = await call_gemini_json(prompt)
            if isinstance(analysis_json, dict):
                gemini_analysis = analysis_json
        except Exception:
            pass
            
    return {
        "leaves_taken": leaves_count,
        "leaves_list": [{"id": l.id, "leave_date": str(l.leave_date), "reason": l.reason} for l in leaves_list],
        "cases_completed": cases_completed,
        "cases_cancelled": cases_cancelled,
        "cases_confirmed": cases_confirmed,
        "cases_high": cases_high,
        "cases_medium": cases_medium,
        "cases_low": cases_low,
        "total_working_hours": total_working_hours,
        "avg_working_hours_per_day": avg_working_hours_per_day,
        "rating_avg": rating_avg,
        "rating_count": rating_count,
        "reviews": reviews_out,
        "gemini_analysis": gemini_analysis
    }

# --- Admin Patient Directory ---

@router.get("/patients", dependencies=[admin_guard])
async def get_patient_directory(
    search: Optional[str] = None,
    skip: int = 0,
    limit: int = 100,
    db: AsyncSession = Depends(get_db)
):
    """Admin retrieves registered patient list with total consultation counts and last visit dates."""
    query = select(User).where(User.role == UserRole.PATIENT)
    if search:
        query = query.where(
            (User.full_name.ilike(f"%{search}%")) |
            (User.email.ilike(f"%{search}%")) |
            (User.phone.ilike(f"%{search}%"))
        )
    query = query.order_by(User.created_at.desc()).offset(skip).limit(limit)
    patients = (await db.execute(query)).scalars().all()

    results = []
    for p in patients:
        appt_query = select(Appointment.status, func.count(Appointment.id)).where(Appointment.patient_id == p.id).group_by(Appointment.status)
        appt_stats = (await db.execute(appt_query)).all()
        stats_dict = {status.value if hasattr(status, 'value') else str(status): count for status, count in appt_stats}

        last_visit_query = select(Appointment.slot_start).where(
            Appointment.patient_id == p.id,
            Appointment.status == AppointmentStatus.COMPLETED
        ).order_by(Appointment.slot_start.desc()).limit(1)
        last_visit = (await db.execute(last_visit_query)).scalar_one_or_none()

        results.append({
            "id": p.id,
            "full_name": p.full_name,
            "email": p.email,
            "phone": p.phone,
            "country": p.country,
            "created_at": p.created_at,
            "stats": stats_dict,
            "last_visit": last_visit
        })
    return results

# --- Admin Appointment Command Center ---

from pydantic import BaseModel
class AdminReassignInput(BaseModel):
    new_doctor_id: str
    new_slot_start: Optional[datetime] = None

class AvailableDoctorResponse(BaseModel):
    id: str
    full_name: str
    specialisation: str

@router.get("/appointments/{id}/available-doctors", response_model=List[AvailableDoctorResponse])
async def get_available_doctors_for_reassign(
    id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.ADMIN))
):
    """List all available active/non-suspended doctors of the same specialty for this appointment's slot."""
    from sqlalchemy.orm import selectinload
    
    # 1. Get original appointment
    appt_query = select(Appointment).options(
        selectinload(Appointment.doctor)
    ).where(Appointment.id == id)
    appt = (await db.execute(appt_query)).scalar_one_or_none()
    if not appt:
        raise HTTPException(status_code=404, detail="Appointment not found")
        
    specialty = appt.doctor.specialisation
    slot_start = appt.slot_start
    slot_end = appt.slot_end
    
    # Day name in lowercase (e.g. "mon", "tue")
    day_name = slot_start.strftime("%a").lower()
    slot_start_str = slot_start.strftime("%H:%M")
    slot_end_str = slot_end.strftime("%H:%M")
    target_date = slot_start.date()
    
    # 2. Get all other doctors in same specialty
    docs_query = select(DoctorProfile).options(
        selectinload(DoctorProfile.user)
    ).where(
        DoctorProfile.specialisation == specialty,
        DoctorProfile.is_active == True,
        DoctorProfile.is_suspended == False
    )
    all_docs = (await db.execute(docs_query)).scalars().all()
    
    available_docs = []
    
    from server.services.slot_service import _is_on_leave
    
    for doc in all_docs:
        # Check working hours
        w_hours = doc.working_hours or {}
        day_config = w_hours.get(day_name)
        if not day_config or not day_config.get("enabled"):
            continue
            
        start_work = day_config.get("start", "09:00")
        end_work = day_config.get("end", "17:00")
        if not (slot_start_str >= start_work and slot_end_str <= end_work):
            continue
            
        # Check leave
        if await _is_on_leave(db, doc.id, target_date):
            continue
            
        # Check overlap appointments
        overlap_query = select(Appointment).where(
            Appointment.doctor_id == doc.id,
            Appointment.status.in_([AppointmentStatus.CONFIRMED, AppointmentStatus.HELD]),
            Appointment.slot_start < slot_end,
            Appointment.slot_end > slot_start,
            Appointment.id != id
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
                
        if active_overlap:
            continue
            
        available_docs.append(
            AvailableDoctorResponse(
                id=doc.id,
                full_name=doc.user.full_name,
                specialisation=doc.specialisation
            )
        )
        
    return available_docs

@router.post("/doctors/{doctor_id}/reactivate")
async def reactivate_doctor(
    doctor_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.ADMIN))
):
    """Reactivate a suspended doctor profile and clear all demerit points."""
    from sqlalchemy.orm import selectinload
    doc_query = select(DoctorProfile).options(selectinload(DoctorProfile.user)).where(DoctorProfile.id == doctor_id)
    doc = (await db.execute(doc_query)).scalar_one_or_none()
    if not doc:
        raise HTTPException(status_code=404, detail="Doctor profile not found")
        
    doc.demerit_points = 0
    doc.is_suspended = False
    
    # Audit log
    audit = AuditLog(
        action="ADMIN_REACTIVATE_DOCTOR",
        target_type="DoctorProfile",
        target_id=doctor_id,
        user_id=current_user.id,
        details=f"Admin reactivated Doctor {doc.user.full_name} and cleared demerits."
    )
    db.add(audit)
    
    # In-app notification
    notif = InAppNotification(
        user_id=doc.user_id,
        title="Account Reactivated",
        body="Your account has been reactivated by the administration. All demerit points have been cleared.",
        type="system",
        link="/doctor/dashboard"
    )
    db.add(notif)
    
    await db.commit()
    
    # Send email notification
    from microservices.tasks import send_email_task
    from server.routes.patient_routes import safe_dispatch
    safe_dispatch(
        send_email_task,
        doc.user.email,
        "Account Reactivated — MedPulse AI",
        "generic_notification",
        {
            "title": "Account Reactivated",
            "message": f"Hello Dr. {doc.user.full_name},\n\nYour suspended profile has been successfully reactivated by the clinic administration. Your demerit points have been reset to 0.\n\nYou can now log in, set working hours, and begin consultations again.\n\nBest regards,\nMedPulse AI Administration"
        }
    )
    
    return {"success": True, "message": "Doctor reactivated successfully"}

@router.get("/appointments")
async def get_all_appointments(
    status: Optional[AppointmentStatus] = None,
    doctor_id: Optional[str] = None,
    patient_id: Optional[str] = None,
    specialisation: Optional[str] = None,
    search: Optional[str] = None,
    skip: int = 0,
    limit: int = 100,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.ADMIN))
):
    """Admin retrieves all appointments with comprehensive patient, doctor, and triage details."""
    from sqlalchemy.orm import selectinload
    
    query = select(Appointment).join(User, Appointment.patient_id == User.id).join(DoctorProfile, Appointment.doctor_id == DoctorProfile.id)
    
    if status:
        query = query.where(Appointment.status == status)
    if doctor_id:
        query = query.where(Appointment.doctor_id == doctor_id)
    if patient_id:
        query = query.where(Appointment.patient_id == patient_id)
    if specialisation:
        query = query.where(DoctorProfile.specialisation == specialisation)
    if search:
        from sqlalchemy.orm import aliased
        DocUser = aliased(User)
        query = query.join(DocUser, DoctorProfile.user_id == DocUser.id).where(
            (User.full_name.ilike(f"%{search}%")) |
            (User.email.ilike(f"%{search}%")) |
            (DocUser.full_name.ilike(f"%{search}%"))
        )
        
    query = query.order_by(Appointment.slot_start.desc()).offset(skip).limit(limit)
    query = query.options(
        selectinload(Appointment.doctor).selectinload(DoctorProfile.user),
        selectinload(Appointment.patient),
        selectinload(Appointment.symptom_form),
        selectinload(Appointment.post_visit_note)
    )
    
    appts = (await db.execute(query)).scalars().all()
    return appts

@router.post("/appointments/{id}/reassign")
async def reassign_appointment(
    id: str,
    data: AdminReassignInput,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.ADMIN))
):
    """Admin manually reassigns an appointment to another physician (and optional slot start override)."""
    from datetime import timedelta
    from sqlalchemy.orm import selectinload
    
    query = select(Appointment).options(
        selectinload(Appointment.doctor).selectinload(DoctorProfile.user),
        selectinload(Appointment.patient)
    ).where(Appointment.id == id)
    appt = (await db.execute(query)).scalar_one_or_none()
    if not appt:
        raise HTTPException(status_code=404, detail="Appointment not found")
        
    if appt.status not in [AppointmentStatus.CONFIRMED, AppointmentStatus.PENDING_APPROVAL, AppointmentStatus.HELD]:
        raise HTTPException(status_code=400, detail="Only held, confirmed, or pending appointments can be reassigned")
        
    doc_repo = DoctorRepository(db)
    new_doc = await doc_repo.get_by_id(data.new_doctor_id)
    if not new_doc:
        raise HTTPException(status_code=404, detail="New doctor not found")
        
    old_doctor_name = appt.doctor.user.full_name
    old_doctor_email = appt.doctor.user.email
    old_slot_start = appt.slot_start
    
    slot_start = data.new_slot_start or appt.slot_start
    slot_end = slot_start + timedelta(minutes=new_doc.slot_duration_minutes)
    
    from server.services.slot_service import _is_on_leave
    target_date = slot_start.date()
    if await _is_on_leave(db, data.new_doctor_id, target_date):
        raise HTTPException(status_code=400, detail="The selected doctor is on leave on this date")
        
    overlap_query = select(Appointment).where(
        Appointment.doctor_id == data.new_doctor_id,
        Appointment.status == AppointmentStatus.CONFIRMED,
        Appointment.slot_start < slot_end,
        Appointment.slot_end > slot_start,
        Appointment.id != id
    )
    overlap = (await db.execute(overlap_query)).scalars().all()
    if overlap:
        raise HTTPException(status_code=400, detail="The selected doctor has an overlapping confirmed appointment at this slot")
        
    calendar_event_id = None
    from server.database.models import CalendarEvent
    cal_event_query = select(CalendarEvent).where(CalendarEvent.appointment_id == id)
    cal_event = (await db.execute(cal_event_query)).scalar_one_or_none()
    if cal_event:
        from microservices.tasks import sync_calendar_event_task
        from server.routes.patient_routes import safe_dispatch
        safe_dispatch(sync_calendar_event_task, id, "delete")
        
    appt.doctor_id = data.new_doctor_id
    appt.slot_start = slot_start
    appt.slot_end = slot_end
    appt.reassigned_by_admin = True
    
    import random
    appt.start_otp = f"{random.randint(1000, 9999)}"
    
    audit = AuditLog(
        action="ADMIN_REASSIGN_APPOINTMENT",
        target_type="Appointment",
        target_id=id,
        user_id=current_user.id,
        details={
            "appointment_id": id,
            "patient_name": appt.patient.full_name,
            "old_doctor": old_doctor_name,
            "new_doctor": new_doc.user.full_name,
            "slot_start": slot_start.isoformat()
        }
    )
    db.add(audit)
    
    notif_patient = InAppNotification(
        user_id=appt.patient_id,
        title="Appointment Reassigned by Administration",
        body=f"Your consultation has been reassigned to Dr. {new_doc.user.full_name} on {slot_start.strftime('%Y-%m-%d %H:%M UTC')}.",
        type="appointment",
        link="/patient/appointments"
    )
    db.add(notif_patient)
    
    notif_new_doc = InAppNotification(
        user_id=new_doc.user_id,
        title="New Reassigned Consultation",
        body=f"You have been assigned a consultation with patient {appt.patient.full_name} on {slot_start.strftime('%Y-%m-%d %H:%M UTC')}.",
        type="appointment",
        link="/doctor/dashboard"
    )
    db.add(notif_new_doc)
    
    notif_old_doc = InAppNotification(
        user_id=appt.doctor.user_id,
        title="Consultation Reassigned (Cancelled)",
        body=f"Your consultation on {old_slot_start.strftime('%Y-%m-%d %H:%M UTC')} has been reassigned to another physician.",
        type="appointment",
        link="/doctor/dashboard"
    )
    db.add(notif_old_doc)
    
    await db.commit()
    
    if cal_event:
        from microservices.tasks import sync_calendar_event_task
        from server.routes.patient_routes import safe_dispatch
        safe_dispatch(sync_calendar_event_task, id, "create")
        
    from microservices.tasks import send_email_task
    from server.routes.patient_routes import safe_dispatch
    
    safe_dispatch(
        send_email_task,
        appt.patient.email,
        "Appointment Reassigned - MedPulse AI",
        "reschedule_notice",
        {
            "patient_name": appt.patient.full_name,
            "doctor_name": new_doc.user.full_name,
            "old_slot_start": old_slot_start.strftime("%Y-%m-%d %H:%M UTC"),
            "new_slot_start": slot_start.strftime("%Y-%m-%d %H:%M UTC"),
            "appointment_id": id,
        }
    )
    
    safe_dispatch(
        send_email_task,
        new_doc.user.email,
        "New Consultation Assigned - MedPulse AI",
        "generic_notification",
        {
            "title": "New Appointment Assigned",
            "message": f"Hello Dr. {new_doc.user.full_name},\n\nYou have been assigned a new medical consultation by the administration.\n\nPatient Name: {appt.patient.full_name}\nTime: {slot_start.strftime('%Y-%m-%d %H:%M UTC')}\n\nPlease review your dashboard for details.\n\nBest regards,\nMedPulse AI Administration"
        }
    )
    
    safe_dispatch(
        send_email_task,
        old_doctor_email,
        "Consultation Reassigned Notice - MedPulse AI",
        "generic_notification",
        {
            "title": "Consultation Reassigned",
            "message": f"Hello Dr. {old_doctor_name},\n\nPlease note that your consultation scheduled for {old_slot_start.strftime('%Y-%m-%d %H:%M UTC')} has been reassigned to another doctor by the administration.\n\nThis slot is now open and available for booking.\n\nBest regards,\nMedPulse AI Administration"
        }
    )
    
    return {"status": "success", "message": "Appointment reassigned successfully"}
