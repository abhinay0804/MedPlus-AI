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
    """Return True if real SMTP server credentials are provided."""
    return bool(
        settings.SMTP_USER
        and settings.SMTP_PASSWORD
        and "dev" not in settings.SMTP_PASSWORD.lower()
        and "mock" not in settings.SMTP_PASSWORD.lower()
        and "pass" not in settings.SMTP_PASSWORD.lower()
        and "placeholder" not in settings.SMTP_PASSWORD.lower()
    )


async def send_email(
    to_email: str,
    subject: str,
    template_name: str,
    context: Dict[str, Any],
) -> bool:
    """
    Render HTML template and send email via SMTP or simulate send if unconfigured / dev environment.
    Returns True on success or simulation fallback.
    """
    try:
        html_content = _render_template(template_name, context)
    except Exception as e:
        logger.error(f"[EmailService] Template rendering error: {e}")
        return False

    is_dummy = not is_smtp_configured()

    if is_dummy:
        logger.info(
            f"[EmailService SIMULATION] To: {to_email} | Subject: '{subject}' | Template: {template_name}\n"
            f"[Email Content Sample]: {html_content[:200]}..."
        )
        return True

    # Real SMTP send via fastapi-mail
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
