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
    LeaveCreate, LeaveResponse, AdminDashboardStats
)
from server.schemas.auth_schemas import UserResponse
from server.auth import require_role
from server.database.models import User, UserRole, DoctorProfile, Appointment, AppointmentStatus, DoctorLeave
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

@router.put("/doctors/{id}", response_model=DoctorResponse, dependencies=[admin_guard])
async def update_doctor_profile(id: str, data: DoctorUpdate, db: AsyncSession = Depends(get_db)):
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
    
    # Cancel affected appointments
    for apt in affected_appointments:
        apt.status = AppointmentStatus.CANCELLED
    
    await db.flush()
    
    # Dispatch Celery task: notify patients and revoke calendar events for
    # all appointments that were just cancelled by the leave.
    if affected_appointments:
        handle_doctor_leave_task.delay(id, str(data.leave_date))
        logger.info(
            f"[AdminLeave] Queued leave notification for {len(affected_appointments)} "
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
        
        out.append({
            "id": req.id,
            "doctor_id": req.doctor_id,
            "doctor_name": req.doctor.user.full_name if req.doctor and req.doctor.user else "Unknown Doctor",
            "doctor_specialisation": req.doctor.specialisation if req.doctor else "Unknown",
            "leave_date": str(req.leave_date),
            "reason": req.reason,
            "status": req.status,
            "admin_reason": req.admin_reason,
            "created_at": req.created_at.isoformat(),
            "resolved_at": req.resolved_at.isoformat() if req.resolved_at else None,
            "leaves_taken_this_month": leaves_taken,
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
            
            for apt in affected_appointments:
                apt.status = AppointmentStatus.CANCELLED
                
            await db.flush()
            
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
