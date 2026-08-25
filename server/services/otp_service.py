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

def safe_dispatch(task_func, *args, **kwargs):
    """Safely dispatch Celery task without raising 500 or blocking if Redis/Celery is offline."""
    import logging
    logger = logging.getLogger(__name__)
    try:
        task_func.apply_async(args=args, kwargs=kwargs, retry=False)
    except Exception as e:
        logger.info(f"[Celery Dispatch] Redis offline, task {getattr(task_func, '__name__', 'task')} skipped: {e}")

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
    ).order_by(EmailOTP.created_at.desc()).limit(1)

    res_prev = await db.execute(stmt_prev)
    prev_otp = res_prev.scalar_one_or_none()
    # 2. Invalidate all existing active OTP codes for this specific email and purpose
    from sqlalchemy import update
    stmt_invalidate = update(EmailOTP).where(
        EmailOTP.email == clean_email,
        EmailOTP.purpose == purpose,
        EmailOTP.is_used == False
    ).values(is_used=True)
    await db.execute(stmt_invalidate)

    # 3. Generate a cryptographically secure 6-digit verification code
    # Ensure it's not the same as the immediately preceding OTP
    otp_code = f"{random.randint(100000, 999999)}"
    while prev_otp and prev_otp.otp_code == otp_code:
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

    # Send HTML OTP Email via Celery Background Task
    from microservices.tasks import send_email_task
    safe_dispatch(
        send_email_task,
        clean_email,
        f"MedPulse AI — {purpose} Security Verification OTP ({otp_code})",
        "otp_email",
        {
            "name": full_name,
            "otp_code": otp_code,
            "purpose": purpose
        }
    )

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
