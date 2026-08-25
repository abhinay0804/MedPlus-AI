from pydantic import BaseModel, EmailStr, Field, ConfigDict, field_validator
from typing import Optional
from datetime import datetime
import re
from server.database.models import UserRole

def validate_phone_number(phone: Optional[str]) -> Optional[str]:
    if not phone or not phone.strip():
        return None
    cleaned = re.sub(r"[^\d+]", "", phone.strip())
    if cleaned.startswith("+"):
        cleaned = "+" + re.sub(r"\+", "", cleaned[1:])
    else:
        cleaned = re.sub(r"\+", "", cleaned)
    
    digits = re.sub(r"\D", "", cleaned)
    if len(digits) < 10 or len(digits) > 15:
        raise ValueError("Phone number must contain between 10 and 15 digits.")
    if len(set(digits)) == 1:
        raise ValueError("Phone number cannot consist of repeated fake digits (e.g. 0000000000).")
    if digits in "0123456789012345" or digits in "9876543210987654":
        raise ValueError("Phone number cannot be a simple sequential number.")
    if cleaned.startswith("+0") or cleaned.startswith("000"):
        raise ValueError("Invalid phone country prefix.")
    return cleaned

def validate_strong_password(password: str) -> str:
    if len(password) < 8:
        raise ValueError("Password must be at least 8 characters long.")
    if not re.search(r"[A-Z]", password):
        raise ValueError("Password must contain at least one uppercase letter (A-Z).")
    if not re.search(r"[a-z]", password):
        raise ValueError("Password must contain at least one lowercase letter (a-z).")
    if not re.search(r"\d", password):
        raise ValueError("Password must contain at least one digit (0-9).")
    if not re.search(r"[!@#$%^&*()_+\-=\[\]{};':\"\\|,.<>/?]", password):
        raise ValueError("Password must contain at least one special character (e.g. @, $, !, %).")
    return password

class RegisterRequest(BaseModel):
    email: EmailStr
    password: str = Field(..., min_length=8, description="Password must be at least 8 characters long")
    full_name: str = Field(..., min_length=2, description="Full name of user")
    phone: Optional[str] = None
    country: Optional[str] = "India"
    otp_code: Optional[str] = Field(None, description="6-digit email OTP code")
    role: Optional[UserRole] = UserRole.PATIENT

    @field_validator("phone")
    @classmethod
    def check_phone(cls, v: Optional[str]) -> Optional[str]:
        return validate_phone_number(v)

    @field_validator("password")
    @classmethod
    def check_password(cls, v: str) -> str:
        return validate_strong_password(v)

class SendOTPRequest(BaseModel):
    email: EmailStr
    full_name: Optional[str] = "User"
    purpose: Optional[str] = "Registration"

class VerifyOTPRequest(BaseModel):
    email: EmailStr
    otp_code: str = Field(..., min_length=6, max_length=6)
    purpose: Optional[str] = "Registration"

class ForgotPasswordRequest(BaseModel):
    email: EmailStr

class ResetPasswordRequest(BaseModel):
    email: EmailStr
    otp_code: str = Field(..., min_length=6, max_length=6)
    new_password: str = Field(..., min_length=8)

    @field_validator("new_password")
    @classmethod
    def check_password(cls, v: str) -> str:
        return validate_strong_password(v)

class ProfileUpdateRequest(BaseModel):
    full_name: Optional[str] = None
    phone: Optional[str] = None
    country: Optional[str] = None

    @field_validator("phone")
    @classmethod
    def check_phone(cls, v: Optional[str]) -> Optional[str]:
        return validate_phone_number(v)

class LoginRequest(BaseModel):
    email: EmailStr
    password: str

class RefreshRequest(BaseModel):
    refresh_token: str

class UserResponse(BaseModel):
    id: str
    email: str
    full_name: str
    phone: Optional[str] = None
    country: Optional[str] = "India"
    role: UserRole
    has_google_calendar: bool = False
    unattended_count: int = 0
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)

class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    user: UserResponse
