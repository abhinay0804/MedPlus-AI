"""
Unit Tests — Email, Google Calendar, and Notification Services (Phase 5)
==========================================================================
Verifies:
  - Template rendering for all 7 HTML email templates
  - Email sending in simulation mode
  - Google Calendar OAuth URL & Event CRUD simulation
  - NotificationService orchestrator workflows
"""

import pytest
from datetime import datetime, timedelta
from unittest.mock import patch

from server.services.email_service import _render_template, send_email
from server.services.calendar_service import (
    generate_google_auth_url,
    create_calendar_event,
    update_calendar_event,
    delete_calendar_event,
)
from server.services.notification_service import NotificationService


# ─── Email Service Tests ──────────────────────────────────────────────────────

def test_email_template_rendering():
    """Verify all 7 email templates render without error."""
    templates = [
        ("booking_confirmation.html", {"patient_name": "John", "doctor_name": "Dr. Smith", "specialisation": "Cardiology", "slot_start": "2026-09-01 10:00 UTC", "appointment_id": "123"}),
        ("appointment_reminder.html", {"patient_name": "John", "doctor_name": "Dr. Smith", "specialisation": "Cardiology", "slot_start": "2026-09-01 10:00 UTC", "appointment_id": "123"}),
        ("cancellation_notice.html", {"patient_name": "John", "appointment_id": "123", "reason": "Patient request"}),
        ("reschedule_notice.html", {"patient_name": "John", "doctor_name": "Dr. Smith", "old_slot_start": "2026-09-01 10:00 UTC", "new_slot_start": "2026-09-02 10:00 UTC", "appointment_id": "123"}),
        ("doctor_leave_cancellation.html", {"patient_name": "John", "doctor_name": "Dr. Smith", "leave_date": "2026-09-01", "appointment_id": "123"}),
        ("medication_reminder.html", {"patient_name": "John", "medication_name": "Aspirin", "dosage": "100mg", "frequency": "Daily"}),
        ("summary_ready.html", {"patient_name": "John", "appointment_id": "123", "summary_type": "Pre-Visit"}),
    ]

    for template_name, context in templates:
        rendered = _render_template(template_name, context)
        assert len(rendered) > 100
        assert "John" in rendered


@pytest.mark.asyncio
async def test_send_email_simulation():
    """Verify send_email returns True when SMTP is unconfigured (simulation mode)."""
    result = await send_email(
        to_email="test@example.com",
        subject="Test Subject",
        template_name="booking_confirmation.html",
        context={"patient_name": "Test User", "doctor_name": "Dr. House", "specialisation": "Diagnostics", "slot_start": "2026-09-01", "appointment_id": "abc"},
    )
    assert result is True


# ─── Google Calendar Service Tests ───────────────────────────────────────────

def test_generate_google_auth_url_unconfigured():
    """When GOOGLE_CLIENT_ID is None, return None."""
    with patch("server.services.calendar_service.settings.GOOGLE_CLIENT_ID", None):
        url = generate_google_auth_url()
        assert url is None


@pytest.mark.asyncio
async def test_calendar_crud_simulation():
    """Verify Google Calendar CRUD in simulation mode."""
    start = datetime.utcnow()
    end = start + timedelta(minutes=30)

    # Create event
    event_id = await create_calendar_event(
        user_access_token=None,
        summary="Test Event",
        description="Test Desc",
        start_time=start,
        end_time=end,
    )
    assert event_id is not None
    assert event_id.startswith("sim_event_")

    # Update event
    updated = await update_calendar_event(
        user_access_token=None,
        event_id=event_id,
        summary="Updated Event",
        description="Updated Desc",
        start_time=start,
        end_time=end,
    )
    assert updated is True

    # Delete event
    deleted = await delete_calendar_event(
        user_access_token=None,
        event_id=event_id,
    )
    assert deleted is True


# ─── Notification Service Tests ──────────────────────────────────────────────

@pytest.mark.asyncio
async def test_notification_service_workflows():
    """Verify NotificationService workflows run smoothly."""
    start = datetime.utcnow()
    end = start + timedelta(minutes=30)

    # 1. On booking confirmed
    res_conf = await NotificationService.on_booking_confirmed(
        patient_email="patient@test.com",
        patient_name="Patient Zero",
        doctor_name="Dr. Strange",
        specialisation="Neurology",
        slot_start=start,
        slot_end=end,
        appointment_id="appt_101",
    )
    assert res_conf["email_sent"] is True
    assert res_conf["calendar_event_id"].startswith("sim_event_")

    # 2. On booking cancelled
    res_cancel = await NotificationService.on_booking_cancelled(
        patient_email="patient@test.com",
        patient_name="Patient Zero",
        appointment_id="appt_101",
        reason="Schedule conflict",
        calendar_event_id=res_conf["calendar_event_id"],
    )
    assert res_cancel["email_sent"] is True
    assert res_cancel["calendar_deleted"] is True

    # 3. On doctor leave
    res_leave = await NotificationService.on_doctor_leave(
        patient_email="patient@test.com",
        patient_name="Patient Zero",
        doctor_name="Dr. Strange",
        leave_date="2026-09-05",
        appointment_id="appt_101",
    )
    assert res_leave["email_sent"] is True

    # 4. On summary ready
    res_summary = await NotificationService.on_summary_ready(
        patient_email="patient@test.com",
        patient_name="Patient Zero",
        appointment_id="appt_101",
        summary_type="Pre-Visit",
    )
    assert res_summary["email_sent"] is True
