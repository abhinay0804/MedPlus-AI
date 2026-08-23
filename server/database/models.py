import uuid
from datetime import datetime, date, time
import enum
from sqlalchemy import (
    Column, String, Text, Integer, Boolean, DateTime, Date, Time, Enum,
    ForeignKey, Index, UniqueConstraint, JSON
)
from sqlalchemy.orm import relationship, Mapped, mapped_column
from server.database.connection import Base

# --- Enums ---

class UserRole(str, enum.Enum):
    PATIENT = "PATIENT"
    DOCTOR = "DOCTOR"
    ADMIN = "ADMIN"

class AppointmentStatus(str, enum.Enum):
    HELD = "HELD"
    CONFIRMED = "CONFIRMED"
    CANCELLED = "CANCELLED"
    COMPLETED = "COMPLETED"
    RESCHEDULED = "RESCHEDULED"
    PENDING_APPROVAL = "PENDING_APPROVAL"

class UrgencyLevel(str, enum.Enum):
    LOW = "LOW"
    MEDIUM = "MEDIUM"
    HIGH = "HIGH"

class LLMStatus(str, enum.Enum):
    PENDING = "PENDING"
    PROCESSING = "PROCESSING"
    SUCCESS = "SUCCESS"
    FAILED = "FAILED"

# --- Models ---

class User(Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False, index=True)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    full_name: Mapped[str] = mapped_column(String(255), nullable=False)
    phone: Mapped[str] = mapped_column(String(50), nullable=True)
    country: Mapped[str] = mapped_column(String(100), nullable=True, default="India")
    role: Mapped[UserRole] = mapped_column(Enum(UserRole), nullable=False, default=UserRole.PATIENT)
    
    # Google OAuth Tokens
    google_access_token: Mapped[str] = mapped_column(Text, nullable=True)
    google_refresh_token: Mapped[str] = mapped_column(Text, nullable=True)
    
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    # Relationships
    doctor_profile: Mapped["DoctorProfile"] = relationship("DoctorProfile", back_populates="user", uselist=False, cascade="all, delete-orphan")
    patient_appointments: Mapped[list["Appointment"]] = relationship("Appointment", back_populates="patient", foreign_keys="Appointment.patient_id")
    reminders: Mapped[list["MedicationReminder"]] = relationship("MedicationReminder", back_populates="patient")

class DoctorProfile(Base):
    __tablename__ = "doctor_profiles"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id", ondelete="CASCADE"), unique=True, nullable=False)
    specialisation: Mapped[str] = mapped_column(String(100), nullable=False, index=True)
    working_hours: Mapped[dict] = mapped_column(JSON, nullable=False)
    slot_duration_minutes: Mapped[int] = mapped_column(Integer, default=30, nullable=False)
    intake_questions: Mapped[list[str]] = mapped_column(JSON, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)

    # Relationships
    user: Mapped["User"] = relationship("User", back_populates="doctor_profile")
    leaves: Mapped[list["DoctorLeave"]] = relationship("DoctorLeave", back_populates="doctor", cascade="all, delete-orphan")
    leave_requests: Mapped[list["DoctorLeaveRequest"]] = relationship("DoctorLeaveRequest", back_populates="doctor", cascade="all, delete-orphan")
    doctor_appointments: Mapped[list["Appointment"]] = relationship("Appointment", back_populates="doctor", foreign_keys="Appointment.doctor_id")
    reviews: Mapped[list["DoctorReview"]] = relationship("DoctorReview", back_populates="doctor")

class DoctorLeave(Base):
    __tablename__ = "doctor_leaves"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    doctor_id: Mapped[str] = mapped_column(String(36), ForeignKey("doctor_profiles.id", ondelete="CASCADE"), nullable=False, index=True)
    leave_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    reason: Mapped[str] = mapped_column(String(255), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)

    # Relationships
    doctor: Mapped["DoctorProfile"] = relationship("DoctorProfile", back_populates="leaves")

class DoctorLeaveRequest(Base):
    __tablename__ = "doctor_leave_requests"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    doctor_id: Mapped[str] = mapped_column(String(36), ForeignKey("doctor_profiles.id", ondelete="CASCADE"), nullable=False, index=True)
    leave_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    reason: Mapped[str] = mapped_column(String(255), nullable=True)
    status: Mapped[str] = mapped_column(String(20), default="PENDING", nullable=False) # PENDING, APPROVED, REJECTED
    admin_reason: Mapped[str] = mapped_column(String(255), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    resolved_at: Mapped[datetime] = mapped_column(DateTime, nullable=True)

    # Relationships
    doctor: Mapped["DoctorProfile"] = relationship("DoctorProfile", back_populates="leave_requests")

class Appointment(Base):
    __tablename__ = "appointments"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    patient_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    doctor_id: Mapped[str] = mapped_column(String(36), ForeignKey("doctor_profiles.id", ondelete="CASCADE"), nullable=False, index=True)
    slot_start: Mapped[datetime] = mapped_column(DateTime, nullable=False, index=True)
    slot_end: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    status: Mapped[AppointmentStatus] = mapped_column(Enum(AppointmentStatus), nullable=False, default=AppointmentStatus.HELD, index=True)
    hold_expires_at: Mapped[datetime] = mapped_column(DateTime, nullable=True, index=True)
    # Deduplication flag: set to True after the 24-hour reminder email is sent
    # so Celery Beat does not send duplicate reminders within the 2-hour query window.
    reminder_sent: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    rescheduled_to_id: Mapped[str] = mapped_column(String(36), nullable=True)
    start_otp: Mapped[str] = mapped_column(String(4), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    # Indexes
    __table_args__ = (
        Index("idx_doc_slot_status", "doctor_id", "slot_start", "status"),
        Index("idx_status_hold", "status", "hold_expires_at"),
        Index("idx_reminder_sent", "status", "reminder_sent"),
    )

    # Relationships
    patient: Mapped["User"] = relationship("User", back_populates="patient_appointments", foreign_keys=[patient_id])
    doctor: Mapped["DoctorProfile"] = relationship("DoctorProfile", back_populates="doctor_appointments", foreign_keys=[doctor_id])
    symptom_form: Mapped["SymptomForm"] = relationship("SymptomForm", back_populates="appointment", uselist=False, cascade="all, delete-orphan")
    post_visit_note: Mapped["PostVisitNote"] = relationship("PostVisitNote", back_populates="appointment", uselist=False, cascade="all, delete-orphan")
    calendar_event: Mapped["CalendarEvent"] = relationship("CalendarEvent", back_populates="appointment", uselist=False, cascade="all, delete-orphan")
    review: Mapped["DoctorReview"] = relationship("DoctorReview", back_populates="appointment", uselist=False)

class SymptomForm(Base):
    __tablename__ = "symptom_forms"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    appointment_id: Mapped[str] = mapped_column(String(36), ForeignKey("appointments.id", ondelete="CASCADE"), unique=True, nullable=False)
    symptoms_text: Mapped[str] = mapped_column(Text, nullable=False)
    pre_visit_summary: Mapped[dict] = mapped_column(JSON, nullable=True)
    urgency_level: Mapped[UrgencyLevel] = mapped_column(Enum(UrgencyLevel), nullable=True)
    llm_status: Mapped[LLMStatus] = mapped_column(Enum(LLMStatus), default=LLMStatus.PENDING, nullable=False, index=True)
    retry_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)

    # Relationships
    appointment: Mapped["Appointment"] = relationship("Appointment", back_populates="symptom_form")

class PostVisitNote(Base):
    __tablename__ = "post_visit_notes"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    appointment_id: Mapped[str] = mapped_column(String(36), ForeignKey("appointments.id", ondelete="CASCADE"), unique=True, nullable=False)
    doctor_notes: Mapped[str] = mapped_column(Text, nullable=False)
    prescription_text: Mapped[str] = mapped_column(Text, nullable=True)
    patient_summary: Mapped[str] = mapped_column(Text, nullable=True)
    llm_status: Mapped[LLMStatus] = mapped_column(Enum(LLMStatus), default=LLMStatus.PENDING, nullable=False, index=True)
    retry_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)

    # Relationships
    appointment: Mapped["Appointment"] = relationship("Appointment", back_populates="post_visit_note")
    reminders: Mapped[list["MedicationReminder"]] = relationship("MedicationReminder", back_populates="post_visit_note", cascade="all, delete-orphan")

class WorkingHoursRequest(Base):
    __tablename__ = "working_hours_requests"
    
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    doctor_id: Mapped[str] = mapped_column(ForeignKey("doctor_profiles.id"))
    proposed_working_hours: Mapped[dict] = mapped_column(JSON, nullable=False)
    proposed_slot_duration: Mapped[int] = mapped_column(Integer, nullable=False)
    status: Mapped[str] = mapped_column(String(20), default="PENDING") # PENDING, APPROVED, REJECTED
    admin_reason: Mapped[str] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    resolved_at: Mapped[datetime] = mapped_column(DateTime, nullable=True)

    doctor: Mapped["DoctorProfile"] = relationship("DoctorProfile")

class MedicationReminder(Base):
    __tablename__ = "medication_reminders"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    post_visit_note_id: Mapped[str] = mapped_column(String(36), ForeignKey("post_visit_notes.id", ondelete="CASCADE"), nullable=False)
    patient_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    medication_name: Mapped[str] = mapped_column(String(255), nullable=False)
    dosage: Mapped[str] = mapped_column(String(100), nullable=True)
    frequency: Mapped[str] = mapped_column(String(100), nullable=False)
    start_date: Mapped[date] = mapped_column(Date, nullable=False)
    end_date: Mapped[date] = mapped_column(Date, nullable=False)
    reminder_time: Mapped[time] = mapped_column(Time, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    last_sent_at: Mapped[datetime] = mapped_column(DateTime, nullable=True)

    __table_args__ = (
        Index("idx_active_reminder", "is_active", "reminder_time"),
    )

    # Relationships
    post_visit_note: Mapped["PostVisitNote"] = relationship("PostVisitNote", back_populates="reminders")
    patient: Mapped["User"] = relationship("User", back_populates="reminders")

class CalendarEvent(Base):
    __tablename__ = "calendar_events"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    appointment_id: Mapped[str] = mapped_column(String(36), ForeignKey("appointments.id", ondelete="CASCADE"), unique=True, nullable=False)
    patient_event_id: Mapped[str] = mapped_column(String(255), nullable=True)
    doctor_event_id: Mapped[str] = mapped_column(String(255), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)

    # Relationships
    appointment: Mapped["Appointment"] = relationship("Appointment", back_populates="calendar_event")

class DoctorReview(Base):
    __tablename__ = "doctor_reviews"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    appointment_id: Mapped[str] = mapped_column(String(36), ForeignKey("appointments.id", ondelete="CASCADE"), unique=True, nullable=False)
    patient_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    doctor_id: Mapped[str] = mapped_column(String(36), ForeignKey("doctor_profiles.id", ondelete="CASCADE"), nullable=False, index=True)
    rating: Mapped[int] = mapped_column(Integer, nullable=False)
    comment: Mapped[str] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)

    # Relationships
    appointment: Mapped["Appointment"] = relationship("Appointment", back_populates="review")
    doctor: Mapped["DoctorProfile"] = relationship("DoctorProfile", back_populates="reviews")

class AuditLog(Base):
    __tablename__ = "audit_logs"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    action: Mapped[str] = mapped_column(String(100), nullable=False, index=True)
    target_type: Mapped[str] = mapped_column(String(50), nullable=True)
    target_id: Mapped[str] = mapped_column(String(36), nullable=True)
    details: Mapped[dict] = mapped_column(JSON, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)

class EmailOTP(Base):
    __tablename__ = "email_otps"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    email: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    otp_code: Mapped[str] = mapped_column(String(10), nullable=False)
    purpose: Mapped[str] = mapped_column(String(50), nullable=False, default="REGISTER")
    expires_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    is_used: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
