from pydantic import BaseModel, Field, ConfigDict
from typing import Optional, List
from datetime import datetime

class TicketCreate(BaseModel):
    subject: str = Field(..., max_length=255)
    category: str = Field(..., max_length=50)  # APPOINTMENT_QUERY, BILLING_ISSUE, COMPLAINT, TECHNICAL_SUPPORT, OTHER
    message: str
    appointment_id: Optional[str] = None

class TicketResponse(BaseModel):
    id: str
    patient_id: str
    appointment_id: Optional[str] = None
    subject: str
    category: str
    message: str
    status: str
    admin_response: Optional[str] = None
    rating: Optional[int] = None
    rating_comment: Optional[str] = None
    created_at: datetime
    resolved_at: Optional[datetime] = None
    
    # Optional flat metadata for client views
    patient_name: Optional[str] = None
    patient_email: Optional[str] = None
    appointment_time: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)

class TicketRespondInput(BaseModel):
    admin_response: str
    keep_open: bool = False

class TicketRateInput(BaseModel):
    rating: int = Field(..., ge=1, le=5)
    rating_comment: Optional[str] = None

class SupportChatInput(BaseModel):
    message: str
    history: Optional[List[dict]] = None
