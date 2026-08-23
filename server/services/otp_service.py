import random
import logging
from datetime import datetime, timedelta
from typing import Optional
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from fastapi import HTTPException, status

from server.config import settings
from server.database.models import EmailOTP
from server.services.email_service import send_email, is_smtp_configured

async def generate_and_send_otp(
    db: AsyncSession,
    email: str,
    full_name: str,
    purpose: str = "Email Verification"
) -> tuple[str, bool]:
    """Generate a 6-digit OTP, invalidate previous active codes, and dispatch via email_service."""
    clean_email = email.lower().strip()

    # 1. Fetch latest OTP code to ensure the newly generated code is strictly different
    stmt_prev = select(EmailOTP).where(
        EmailOTP.email == clean_email,
        EmailOTP.purpose == purpose
    ).order_by(EmailOTP.created_at.desc())
    res_prev = await db.execute(stmt_prev)
    prev_otps = res_prev.scalars().all()

    prev_code = prev_otps[0].otp_code if prev_otps else None

    # Invalidate all prior unverified OTPs for this email & purpose
    for old_otp in prev_otps:
        if not old_otp.is_used:
            old_otp.is_used = True

    # 2. Generate new distinct 6-digit code
    otp_code = f"{random.randint(100000, 999999)}"
    while prev_code and otp_code == prev_code:
        otp_code = f"{random.randint(100000, 999999)}"

    expires_at = datetime.utcnow() + timedelta(minutes=10)

    otp_entry = EmailOTP(
        email=clean_email,
        otp_code=otp_code,
        purpose=purpose,
        expires_at=expires_at,
        is_used=False
    )
    db.add(otp_entry)
    await db.flush()

    is_sim = not is_smtp_configured()

    # Send HTML OTP Email via Email Service
    sent = await send_email(
        to_email=clean_email,
        subject=f"MedPulse AI — {purpose} Security Verification OTP ({otp_code})",
        template_name="otp_email.html",
        context={
            "name": full_name,
            "otp_code": otp_code,
            "purpose": purpose
        }
    )
    if not sent:
        logger.warning(f"Failed to dispatch OTP email to {clean_email}, logged in simulation mode.")

    return otp_code, is_sim


async def verify_otp_code(
    db: AsyncSession,
    email: str,
    otp_code: str,
    purpose: str = "Email Verification"
) -> bool:
    """Validate 6-digit OTP code against database."""
    clean_email = email.lower().strip()
    clean_code = otp_code.strip()

    stmt = select(EmailOTP).where(
        EmailOTP.email == clean_email,
        EmailOTP.otp_code == clean_code,
        EmailOTP.purpose == purpose,
        EmailOTP.is_used == False,
        EmailOTP.expires_at > datetime.utcnow()
    ).order_by(EmailOTP.created_at.desc())

    result = await db.execute(stmt)
    otp_record = result.scalars().first()

    if not otp_record:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or expired OTP verification code. Please request a new code."
        )

    otp_record.is_used = True
    await db.flush()
    return True
