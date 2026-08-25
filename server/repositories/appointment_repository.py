from typing import Optional, List
from datetime import datetime, date as date_type
from sqlalchemy import select, func
from sqlalchemy.orm import selectinload
from sqlalchemy.ext.asyncio import AsyncSession

from server.database.models import (
    Appointment, AppointmentStatus, SymptomForm, PostVisitNote,
    LLMStatus, DoctorProfile, User,
)


class AppointmentRepository:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_by_id(self, appointment_id: str, load_relations: bool = False) -> Optional[Appointment]:
        stmt = select(Appointment).where(Appointment.id == appointment_id)
        if load_relations:
            stmt = stmt.options(
                selectinload(Appointment.doctor).selectinload(DoctorProfile.user),
                selectinload(Appointment.patient),
                selectinload(Appointment.symptom_form),
                selectinload(Appointment.post_visit_note),
                selectinload(Appointment.review),
            )
        result = await self.db.execute(stmt)
        return result.scalar_one_or_none()

    async def list_by_patient(
        self,
        patient_id: str,
        status: Optional[AppointmentStatus] = None,
        skip: int = 0,
        limit: int = 50,
    ) -> List[Appointment]:
        stmt = (
            select(Appointment)
            .options(
                selectinload(Appointment.doctor).selectinload(DoctorProfile.user),
                selectinload(Appointment.symptom_form),
                selectinload(Appointment.post_visit_note),
                selectinload(Appointment.review),
            )
            .where(Appointment.patient_id == patient_id)
        )
        if status:
            stmt = stmt.where(Appointment.status == status)
        else:
            from sqlalchemy import and_, not_
            stmt = stmt.where(
                and_(
                    Appointment.status != AppointmentStatus.HELD,
                    not_(
                        and_(
                            Appointment.status == AppointmentStatus.CANCELLED,
                            Appointment.hold_expires_at.is_not(None)
                        )
                    )
                )
            )
        stmt = stmt.order_by(Appointment.slot_start.desc()).offset(skip).limit(limit)
        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    async def list_by_doctor(
        self,
        doctor_id: str,
        status: Optional[AppointmentStatus] = None,
        from_date: Optional[date_type] = None,
        skip: int = 0,
        limit: int = 50,
    ) -> List[Appointment]:
        stmt = (
            select(Appointment)
            .options(
                selectinload(Appointment.patient),
                selectinload(Appointment.symptom_form),
                selectinload(Appointment.post_visit_note),
                selectinload(Appointment.doctor).selectinload(DoctorProfile.user),
                selectinload(Appointment.review),
            )
            .where(Appointment.doctor_id == doctor_id)
        )
        if status:
            stmt = stmt.where(Appointment.status == status)
        else:
            from sqlalchemy import and_, not_
            stmt = stmt.where(
                and_(
                    Appointment.status != AppointmentStatus.HELD,
                    not_(
                        and_(
                            Appointment.status == AppointmentStatus.CANCELLED,
                            Appointment.hold_expires_at.is_not(None)
                        )
                    )
                )
            )
        if from_date:
            day_start = datetime(from_date.year, from_date.month, from_date.day)
            stmt = stmt.where(Appointment.slot_start >= day_start)
        stmt = stmt.order_by(Appointment.slot_start.asc()).offset(skip).limit(limit)
        result = await self.db.execute(stmt)
        return list(result.scalars().all())


    async def update_status(
        self, appointment_id: str, status: AppointmentStatus
    ) -> Optional[Appointment]:
        appt = await self.get_by_id(appointment_id)
        if appt:
            appt.status = status
            await self.db.flush()
            await self.db.refresh(appt)
        return appt

    # --- Symptom Form ---

    async def create_symptom_form(
        self,
        appointment_id: str,
        symptoms_text: str,
    ) -> SymptomForm:
        import uuid
        form = SymptomForm(
            id=str(uuid.uuid4()),
            appointment_id=appointment_id,
            symptoms_text=symptoms_text.strip(),
            llm_status=LLMStatus.PENDING,
        )
        self.db.add(form)
        await self.db.flush()
        await self.db.refresh(form)
        return form

    async def get_symptom_form(self, appointment_id: str) -> Optional[SymptomForm]:
        result = await self.db.execute(
            select(SymptomForm).where(SymptomForm.appointment_id == appointment_id)
        )
        return result.scalar_one_or_none()

    # --- Post-Visit Notes ---

    async def create_post_visit_note(
        self,
        appointment_id: str,
        doctor_notes: str,
        prescription_text: Optional[str] = None,
    ) -> PostVisitNote:
        import uuid
        note = PostVisitNote(
            id=str(uuid.uuid4()),
            appointment_id=appointment_id,
            doctor_notes=doctor_notes.strip(),
            prescription_text=prescription_text.strip() if prescription_text else None,
            llm_status=LLMStatus.PENDING,
        )
        self.db.add(note)
        await self.db.flush()
        await self.db.refresh(note)
        return note

    async def get_post_visit_note(self, appointment_id: str) -> Optional[PostVisitNote]:
        result = await self.db.execute(
            select(PostVisitNote).where(PostVisitNote.appointment_id == appointment_id)
        )
        return result.scalar_one_or_none()
