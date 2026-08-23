from typing import Optional, List
from datetime import date
from sqlalchemy import select, func
from sqlalchemy.orm import selectinload
from sqlalchemy.ext.asyncio import AsyncSession
from server.database.models import DoctorProfile, DoctorLeave, User, Appointment, AppointmentStatus

class DoctorRepository:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_by_id(self, doctor_id: str) -> Optional[DoctorProfile]:
        """Fetch doctor profile by doctor_id with joined user."""
        stmt = (
            select(DoctorProfile)
            .options(selectinload(DoctorProfile.user))
            .where(DoctorProfile.id == doctor_id)
        )
        result = await self.db.execute(stmt)
        return result.scalar_one_or_none()

    async def get_by_user_id(self, user_id: str) -> Optional[DoctorProfile]:
        """Fetch doctor profile by user_id with joined user."""
        stmt = (
            select(DoctorProfile)
            .options(selectinload(DoctorProfile.user))
            .where(DoctorProfile.user_id == user_id)
        )
        result = await self.db.execute(stmt)
        return result.scalar_one_or_none()

    async def create_doctor(
        self,
        user_id: str,
        specialisation: str,
        working_hours: dict,
        slot_duration_minutes: int = 30
    ) -> DoctorProfile:
        """Create and persist a new DoctorProfile record."""
        profile = DoctorProfile(
            user_id=user_id,
            specialisation=specialisation.strip(),
            working_hours=working_hours,
            slot_duration_minutes=slot_duration_minutes
        )
        self.db.add(profile)
        await self.db.flush()
        await self.db.refresh(profile)
        return await self.get_by_id(profile.id)

    async def update_doctor(
        self,
        doctor_id: str,
        specialisation: Optional[str] = None,
        working_hours: Optional[dict] = None,
        slot_duration_minutes: Optional[int] = None,
        intake_questions: Optional[List[str]] = None,
        is_active: Optional[bool] = None
    ) -> Optional[DoctorProfile]:
        """Update doctor profile attributes."""
        profile = await self.get_by_id(doctor_id)
        if not profile:
            return None
            
        if specialisation is not None:
            profile.specialisation = specialisation.strip()
        if working_hours is not None:
            profile.working_hours = working_hours
        if slot_duration_minutes is not None:
            profile.slot_duration_minutes = slot_duration_minutes
        if intake_questions is not None:
            profile.intake_questions = intake_questions
        if is_active is not None:
            profile.is_active = is_active
            
        await self.db.flush()
        await self.db.refresh(profile)
        return profile

    async def list_doctors(
        self,
        specialisation: Optional[str] = None,
        search: Optional[str] = None,
        is_active_only: bool = True,
        skip: int = 0,
        limit: int = 100
    ) -> List[DoctorProfile]:
        """List doctors with optional filtering."""
        stmt = select(DoctorProfile).join(DoctorProfile.user).options(selectinload(DoctorProfile.user))
        if is_active_only:
            stmt = stmt.where(DoctorProfile.is_active == True)
        if specialisation:
            stmt = stmt.where(DoctorProfile.specialisation.ilike(f"%{specialisation.strip()}%"))
        if search:
            stmt = stmt.where(User.full_name.ilike(f"%{search.strip()}%"))
            
        stmt = stmt.offset(skip).limit(limit)
        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    # --- Leave Management ---

    async def add_leave(self, doctor_id: str, leave_date: date, reason: Optional[str] = None) -> DoctorLeave:
        """Add a leave day for a doctor."""
        leave = DoctorLeave(
            doctor_id=doctor_id,
            leave_date=leave_date,
            reason=reason.strip() if reason else None
        )
        self.db.add(leave)
        await self.db.flush()
        await self.db.refresh(leave)
        return leave

    async def remove_leave(self, doctor_id: str, leave_id: str) -> bool:
        """Remove a leave entry by ID."""
        stmt = select(DoctorLeave).where(
            DoctorLeave.id == leave_id,
            DoctorLeave.doctor_id == doctor_id
        )
        result = await self.db.execute(stmt)
        leave = result.scalar_one_or_none()
        if leave:
            await self.db.delete(leave)
            await self.db.flush()
            return True
        return False

    async def get_leaves(self, doctor_id: str, from_date: Optional[date] = None) -> List[DoctorLeave]:
        """List leave days for a doctor."""
        stmt = select(DoctorLeave).where(DoctorLeave.doctor_id == doctor_id)
        if from_date:
            stmt = stmt.where(DoctorLeave.leave_date >= from_date)
        stmt = stmt.order_by(DoctorLeave.leave_date.asc())
        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    async def is_doctor_on_leave(self, doctor_id: str, target_date: date) -> bool:
        """Check if doctor is on leave on target_date."""
        stmt = select(DoctorLeave).where(
            DoctorLeave.doctor_id == doctor_id,
            DoctorLeave.leave_date == target_date
        )
        result = await self.db.execute(stmt)
        return result.scalar_one_or_none() is not None
