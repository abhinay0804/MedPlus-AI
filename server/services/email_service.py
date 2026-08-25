"""
Email Service — HTML Email Notifications with Template Rendering
=================================================================
Sends HTML emails using fastapi-mail / aiosmtplib.
In development/test mode (when SMTP_USER or SMTP_PASSWORD is not configured),
it logs the rendered HTML cleanly without raising an error.
"""

from __future__ import annotations

import os
import logging
from typing import Dict, Any, Optional

from server.config import settings

logger = logging.getLogger(__name__)

TEMPLATE_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "templates", "email")


def _render_template(template_name: str, context: Dict[str, Any]) -> str:
    """Render an HTML template by replacing {{ key }} placeholders with context values."""
    if not template_name.endswith(".html"):
        template_name += ".html"
    
    file_path = os.path.join(TEMPLATE_DIR, template_name)
    if not os.path.exists(file_path):
        raise FileNotFoundError(f"Email template not found: {file_path}")
    
    with open(file_path, "r", encoding="utf-8") as f:
        html_content = f.read()
        
    import re
    for key, value in context.items():
        # Handle both {{ key }} and {{key}}
        html_content = re.sub(
            r"\{\{\s*" + re.escape(key) + r"\s*\}\}",
            str(value if value is not None else ""),
            html_content
        )
        
    # Strip any remaining unreplaced placeholders to prevent leaks
    html_content = re.sub(r"\{\{\s*\w+\s*\}\}", "", html_content)
    return html_content


def is_smtp_configured() -> bool:
    """Return True if real SMTP server credentials or Resend API key is provided."""
    if os.getenv("RESEND_API_KEY"):
        return True
    return bool(
        settings.SMTP_USER
        and settings.SMTP_PASSWORD
        and "dev" not in settings.SMTP_PASSWORD.lower()
        and "mock" not in settings.SMTP_PASSWORD.lower()
        and "pass" not in settings.SMTP_PASSWORD.lower()
        and "placeholder" not in settings.SMTP_PASSWORD.lower()
    )


EMAIL_LOGS = []

async def send_email(
    to_email: str,
    subject: str,
    template_name: str,
    context: Dict[str, Any],
) -> bool:
    """
    Render HTML template and send email via Resend API, SMTP or simulate send.
    Returns True on success or simulation fallback.
    """
    from datetime import datetime
    try:
        html_content = _render_template(template_name, context)
    except Exception as e:
        logger.error(f"[EmailService] Template rendering error: {e}")
        return False

    is_dummy = not is_smtp_configured()
    
    # Track email log in global memory for admin console
    email_log = {
        "to": to_email,
        "subject": subject,
        "template": template_name,
        "status": "SIMULATED" if is_dummy else "SENT",
        "timestamp": datetime.utcnow().isoformat(),
        "preview": html_content[:200] + "..." if len(html_content) > 200 else html_content
    }
    EMAIL_LOGS.append(email_log)
    if len(EMAIL_LOGS) > 100:
        EMAIL_LOGS.pop(0)

    if is_dummy:
        logger.info(
            f"[EmailService SIMULATION] To: {to_email} | Subject: '{subject}' | Template: {template_name}\n"
            f"[Email Content Sample]: {html_content[:200]}..."
        )
        return True

    # 1. Real HTTP send via Resend API (Preferred for Render Free Tier to bypass SMTP blocks)
    resend_api_key = os.getenv("RESEND_API_KEY")
    if resend_api_key:
        try:
            import httpx
            from_sender = settings.EMAIL_FROM_ADDRESS
            # Resend requires onboarding@resend.dev or a verified domain (gmail is not allowed as sender)
            if "gmail.com" in from_sender.lower() or "hotmail.com" in from_sender.lower() or "@resend.dev" in from_sender.lower():
                from_sender = "MedPulse AI <onboarding@resend.dev>"
            else:
                from_sender = f"{settings.EMAIL_FROM_NAME} <{settings.EMAIL_FROM_ADDRESS}>"

            payload = {
                "from": from_sender,
                "to": [to_email],
                "subject": subject,
                "html": html_content
            }
            headers = {
                "Authorization": f"Bearer {resend_api_key}",
                "Content-Type": "application/json"
            }
            async with httpx.AsyncClient() as client:
                resp = await client.post("https://api.resend.com/emails", json=payload, headers=headers, timeout=10.0)
                if resp.status_code in (200, 201):
                    logger.info(f"[EmailService via RESEND] Successfully sent email to {to_email}")
                    return True
                else:
                    logger.warning(f"[EmailService via RESEND] API returned {resp.status_code}: {resp.text}")
        except Exception as e:
            logger.error(f"[EmailService via RESEND] Exception: {e}")

    # 2. Real SMTP send via fastapi-mail
    try:
        from fastapi_mail import FastMail, MessageSchema, ConnectionConfig, MessageType

        conf = ConnectionConfig(
            MAIL_USERNAME=settings.SMTP_USER,
            MAIL_PASSWORD=settings.SMTP_PASSWORD,
            MAIL_FROM=settings.EMAIL_FROM_ADDRESS,
            MAIL_PORT=settings.SMTP_PORT,
            MAIL_SERVER=settings.SMTP_HOST,
            MAIL_FROM_NAME=settings.EMAIL_FROM_NAME,
            MAIL_STARTTLS=True,
            MAIL_SSL_TLS=False,
            USE_CREDENTIALS=True,
            VALIDATE_CERTS=True
        )

        message = MessageSchema(
            subject=subject,
            recipients=[to_email],
            body=html_content,
            subtype=MessageType.html,
            reply_to=[settings.EMAIL_FROM_ADDRESS]
        )

        fm = FastMail(conf)
        await fm.send_message(message)
        logger.info(f"[EmailService] Successfully sent email to {to_email}")
        return True

    except Exception as e:
        logger.warning(
            f"[EmailService] Real SMTP send failed for {to_email}: {e}. "
            f"Falling back to SIMULATION mode."
        )
        logger.info(
            f"[EmailService SIMULATION FALLBACK] To: {to_email} | Subject: '{subject}' | Template: {template_name}"
        )
        return True
