"""
Notification Orchestrator Service
===================================
Central coordinator for multi-channel notifications (Email, Google Calendar, WebSocket).
Triggers specific workflows for booking confirmation, cancellation, rescheduling,
doctor leave, and AI summary completion.
"""

from __future__ import annotations

import logging
from typing import List, Optional, Any
from datetime import datetime

from server.services.email_service import send_email
from server.services.calendar_service import (
    create_calendar_event,
    update_calendar_event,
    delete_calendar_event,
)

logger = logging.getLogger(__name__)


class NotificationService:
    """Orchestrates notifications across Email, Google Calendar, and WebSockets."""

    @staticmethod
    async def on_booking_confirmed(
        patient_email: str,
        patient_name: str,
        doctor_name: str,
        specialisation: str,
        slot_start: datetime,
        slot_end: datetime,
        appointment_id: str,
        patient_tokens: Optional[dict] = None,
    ) -> dict:
        """Handle booking confirmation notification & calendar sync."""
        results = {}

        # 1. Send HTML confirmation email
        email_sent = await send_email(
            to_email=patient_email,
            subject="Appointment Confirmed - HealthCare",
            template_name="booking_confirmation.html",
            context={
                "patient_name": patient_name,
                "doctor_name": doctor_name,
                "specialisation": specialisation,
                "slot_start": slot_start.strftime("%Y-%m-%d %H:%M UTC"),
                "appointment_id": appointment_id,
            },
        )
        results["email_sent"] = email_sent

        # 2. Sync Google Calendar
        event_summary = f"Medical Consultation with {doctor_name}"
        event_desc = f"Appointment ID: {appointment_id}\nSpecialisation: {specialisation}"
        access_token = patient_tokens.get("access_token") if patient_tokens else None
        refresh_token = patient_tokens.get("refresh_token") if patient_tokens else None

        cal_event_id = await create_calendar_event(
            user_access_token=access_token,
            summary=event_summary,
            description=event_desc,
            start_time=slot_start,
            end_time=slot_end,
            refresh_token=refresh_token,
        )
        results["calendar_event_id"] = cal_event_id
        return results

    @staticmethod
    async def on_booking_cancelled(
        patient_email: str,
        patient_name: str,
        appointment_id: str,
        reason: str = "Requested by patient",
        calendar_event_id: Optional[str] = None,
        patient_tokens: Optional[dict] = None,
    ) -> dict:
        """Handle appointment cancellation notification & calendar removal."""
        results = {}

        # 1. Send cancellation email
        email_sent = await send_email(
            to_email=patient_email,
            subject="Appointment Cancelled - HealthCare",
            template_name="cancellation_notice.html",
            context={
                "patient_name": patient_name,
                "appointment_id": appointment_id,
                "reason": reason,
            },
        )
        results["email_sent"] = email_sent

        # 2. Delete Google Calendar event if ID exists
        if calendar_event_id:
            access_token = patient_tokens.get("access_token") if patient_tokens else None
            refresh_token = patient_tokens.get("refresh_token") if patient_tokens else None
            cal_deleted = await delete_calendar_event(
                user_access_token=access_token,
                event_id=calendar_event_id,
                refresh_token=refresh_token,
            )
            results["calendar_deleted"] = cal_deleted

        return results

    @staticmethod
    async def on_booking_rescheduled(
        patient_email: str,
        patient_name: str,
        doctor_name: str,
        old_slot_start: datetime,
        new_slot_start: datetime,
        new_slot_end: datetime,
        appointment_id: str,
        calendar_event_id: Optional[str] = None,
        patient_tokens: Optional[dict] = None,
    ) -> dict:
        """Handle appointment rescheduling notification & calendar update."""
        results = {}

        # 1. Send reschedule email
        email_sent = await send_email(
            to_email=patient_email,
            subject="Appointment Rescheduled - HealthCare",
            template_name="reschedule_notice.html",
            context={
                "patient_name": patient_name,
                "doctor_name": doctor_name,
                "old_slot_start": old_slot_start.strftime("%Y-%m-%d %H:%M UTC"),
                "new_slot_start": new_slot_start.strftime("%Y-%m-%d %H:%M UTC"),
                "appointment_id": appointment_id,
            },
        )
        results["email_sent"] = email_sent

        # 2. Update Google Calendar event
        if calendar_event_id:
            access_token = patient_tokens.get("access_token") if patient_tokens else None
            refresh_token = patient_tokens.get("refresh_token") if patient_tokens else None
            cal_updated = await update_calendar_event(
                user_access_token=access_token,
                event_id=calendar_event_id,
                summary=f"Rescheduled Medical Consultation with {doctor_name}",
                description=f"Appointment ID: {appointment_id}",
                start_time=new_slot_start,
                end_time=new_slot_end,
                refresh_token=refresh_token,
            )
            results["calendar_updated"] = cal_updated

        return results

    @staticmethod
    async def on_doctor_leave(
        patient_email: str,
        patient_name: str,
        doctor_name: str,
        leave_date: str,
        appointment_id: str,
    ) -> dict:
        """Notify patient that doctor is on leave and their appointment is cancelled."""
        email_sent = await send_email(
            to_email=patient_email,
            subject="Doctor Unavailable - Appointment Cancelled",
            template_name="doctor_leave_cancellation.html",
            context={
                "patient_name": patient_name,
                "doctor_name": doctor_name,
                "leave_date": leave_date,
                "appointment_id": appointment_id,
            },
        )
        return {"email_sent": email_sent}

    @staticmethod
    async def on_summary_ready(
        patient_email: str,
        patient_name: str,
        appointment_id: str,
        summary_type: str,  # "Pre-Visit" or "Post-Visit"
    ) -> dict:
        """Notify patient that their AI medical summary is ready."""
        email_sent = await send_email(
            to_email=patient_email,
            subject=f"AI {summary_type} Medical Summary Ready",
            template_name="summary_ready.html",
            context={
                "patient_name": patient_name,
                "appointment_id": appointment_id,
                "summary_type": summary_type,
            },
        )
        return {"email_sent": email_sent}

    @staticmethod
    async def on_appointment_completed(
        patient_email: str,
        patient_name: str,
        doctor_name: str,
        appointment_id: str,
    ) -> dict:
        """Notify patient that their consultation is completed, sending doctor notes and rating link."""
        detail_url = f"http://localhost:5173/patient/appointments/{appointment_id}"
        email_sent = await send_email(
            to_email=patient_email,
            subject="Your Consultation is Completed — MedPlus AI",
            template_name="appointment_completed.html",
            context={
                "patient_name": patient_name,
                "doctor_name": doctor_name,
                "appointment_id": appointment_id,
                "detail_url": detail_url,
            },
        )
        return {"email_sent": email_sent}
