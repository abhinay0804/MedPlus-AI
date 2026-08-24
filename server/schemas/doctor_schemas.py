from pydantic import BaseModel, EmailStr, Field, ConfigDict
from typing import Optional, Dict, List
from datetime import date, datetime
from server.schemas.auth_schemas import UserResponse

class WorkingHoursDay(BaseModel):
    start: str = Field(..., description="Start time HH:MM")
    end: str = Field(..., description="End time HH:MM")

    model_config = ConfigDict(
        json_schema_extra={"example": {"start": "09:00", "end": "17:00"}}
    )

class DoctorCreate(BaseModel):
    email: EmailStr
    password: str = Field(..., min_length=8)
    full_name: str = Field(..., min_length=2)
    phone: Optional[str] = None
    specialisation: str = Field(..., min_length=2)
    working_hours: Dict[str, WorkingHoursDay] = Field(
        ...,
        json_schema_extra={
            "example": {
                "mon": {"start": "09:00", "end": "17:00"},
                "tue": {"start": "09:00", "end": "17:00"},
                "fri": {"start": "09:00", "end": "15:00"}
            }
        }
    )
    slot_duration_minutes: int = Field(30, ge=15, le=60, description="Slot duration in minutes (15, 30, 45, 60)")

class DoctorUpdate(BaseModel):
    full_name: Optional[str] = None
    phone: Optional[str] = None
    specialisation: Optional[str] = None
    working_hours: Optional[Dict[str, WorkingHoursDay]] = None
    slot_duration_minutes: Optional[int] = Field(None, ge=15, le=60)
    is_active: Optional[bool] = None

class DoctorResponse(BaseModel):
    id: str
    user_id: str
    user: UserResponse
    specialisation: str
    working_hours: dict
    slot_duration_minutes: int
    intake_questions: Optional[List[str]] = None
    average_rating: Optional[float] = None
    reviews_count: Optional[int] = None
    is_active: bool
    demerit_points: int
    is_suspended: bool
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)

class LeaveCreate(BaseModel):
    leave_date: date
    reason: Optional[str] = None

class LeaveResponse(BaseModel):
    id: str
    doctor_id: str
    leave_date: date
    reason: Optional[str] = None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)

class SlotResponse(BaseModel):
    slot_start: datetime
    slot_end: datetime
    is_available: bool
    doctor_id: str

class AdminDashboardStats(BaseModel):
    total_doctors: int
    active_doctors: int
    total_patients: int
    total_appointments: int
    pending_appointments: int
    completed_appointments: int
    cancelled_appointments: int

class AdminNoteCreate(BaseModel):
    subject: str = Field(..., min_length=1)
    body: str = Field(..., min_length=1)
    priority: str = Field("ROUTINE", description="URGENT, IMPORTANT, ROUTINE")

class AdminNoteResponse(BaseModel):
    id: str
    doctor_id: str
    subject: str
    body: str
    priority: str
    is_read: bool
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)

class InAppNotificationResponse(BaseModel):
    id: str
    user_id: str
    title: str
    body: str
    type: str
    is_read: bool
    link: Optional[str] = None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)
