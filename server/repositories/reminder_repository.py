from typing import List, Optional
from datetime import date, time, datetime
from sqlalchemy import select, and_
from sqlalchemy.ext.asyncio import AsyncSession

from server.database.models import MedicationReminder


class ReminderRepository:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def create_reminder(
        self,
        post_visit_note_id: str,
        patient_id: str,
        medication_name: str,
        dosage: str,
        frequency: str,
        start_date: date,
        end_date: date,
        reminder_time: time,
    ) -> MedicationReminder:
        reminder = MedicationReminder(
            post_visit_note_id=post_visit_note_id,
            patient_id=patient_id,
            medication_name=medication_name,
            dosage=dosage,
            frequency=frequency,
            start_date=start_date,
            end_date=end_date,
            reminder_time=reminder_time,
            is_active=True,
        )
        self.db.add(reminder)
        await self.db.flush()
        await self.db.refresh(reminder)
        return reminder

    async def get_due_reminders(self, current_time: time, today: date) -> List[MedicationReminder]:
        """
        Return active reminders whose reminder_time falls within the current
        15-minute window and whose date range includes today.
        """
        result = await self.db.execute(
            select(MedicationReminder).where(
                MedicationReminder.is_active == True,
                MedicationReminder.start_date <= today,
                MedicationReminder.end_date >= today,
                MedicationReminder.reminder_time == current_time,
            )
        )
        return list(result.scalars().all())

    async def mark_sent(self, reminder_id: str) -> None:
        result = await self.db.execute(
            select(MedicationReminder).where(MedicationReminder.id == reminder_id)
        )
        reminder = result.scalar_one_or_none()
        if reminder:
            reminder.last_sent_at = datetime.utcnow()
            await self.db.flush()

    async def deactivate(self, reminder_id: str) -> None:
        result = await self.db.execute(
            select(MedicationReminder).where(MedicationReminder.id == reminder_id)
        )
        reminder = result.scalar_one_or_none()
        if reminder:
            reminder.is_active = False
            await self.db.flush()
