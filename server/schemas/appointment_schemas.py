from pydantic import BaseModel, Field, ConfigDict
from typing import Optional, List, Any
from datetime import datetime

from server.database.models import AppointmentStatus, LLMStatus, UrgencyLevel
from server.schemas.auth_schemas import UserResponse
from server.schemas.doctor_schemas import DoctorResponse


# --- Requests ---

class BookingRequest(BaseModel):
    doctor_id: str
    slot_start: datetime = Field(..., description="Naive UTC datetime for the slot start")

class SymptomFormInput(BaseModel):
    symptoms_text: str = Field(..., min_length=10, description="Patient's symptoms description")
    intake_answers: Optional[dict] = Field(None, description="Patient's custom answers to the intake questionnaire")

class PostVisitNotesInput(BaseModel):
    doctor_notes: str = Field(..., min_length=5)
    prescription_text: Optional[str] = None

class RescheduleRequest(BaseModel):
    new_slot_start: datetime = Field(..., description="New slot start in UTC")
    new_doctor_id: Optional[str] = Field(None, description="Optional new doctor profile ID")


# --- Nested Response Models ---

class SymptomFormResponse(BaseModel):
    id: str
    symptoms_text: str
    pre_visit_summary: Optional[Any] = None   # JSON dict from LLM
    urgency_level: Optional[UrgencyLevel] = None
    llm_status: LLMStatus
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class PostVisitNoteResponse(BaseModel):
    id: str
    doctor_notes: str
    prescription_text: Optional[str] = None
    patient_summary: Optional[str] = None
    llm_status: LLMStatus
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


# --- Core Appointment Responses ---

class AppointmentResponse(BaseModel):
    """Lightweight list view."""
    id: str
    patient_id: str
    doctor_id: str
    slot_start: datetime
    slot_end: datetime
    status: AppointmentStatus
    hold_expires_at: Optional[datetime] = None
    rescheduled_to_id: Optional[str] = None
    start_otp: Optional[str] = None
    is_started: bool
    start_reminder_sent: bool
    reassigned_by_admin: bool
    doctor_joined: bool
    patient_joined: bool
    unattended_by: Optional[str] = None
    cancel_reason: Optional[str] = None
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class DoctorReviewResponse(BaseModel):
    id: str
    appointment_id: str
    patient_id: str
    doctor_id: str
    rating: int
    comment: Optional[str] = None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class AppointmentDetailResponse(AppointmentResponse):
    """Full detail view with nested doctor, patient, summaries, and review."""
    doctor: Optional[DoctorResponse] = None
    patient: Optional[UserResponse] = None
    symptom_form: Optional[SymptomFormResponse] = None
    post_visit_note: Optional[PostVisitNoteResponse] = None
    review: Optional[DoctorReviewResponse] = None
