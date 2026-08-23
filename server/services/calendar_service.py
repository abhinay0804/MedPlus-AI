"""
Google Calendar Service — OAuth 2.0 Integration & Event Sync
============================================================
Handles Google Calendar OAuth 2.0 flow and event CRUD operations.
Supports token refresh and graceful degradation if Google credentials
or user OAuth tokens are unavailable.
"""

from __future__ import annotations

import logging
import uuid
from datetime import datetime
from typing import Dict, Any, Optional

from server.config import settings

logger = logging.getLogger(__name__)


def generate_google_auth_url(redirect_uri: Optional[str] = None) -> Optional[str]:
    """Generate Google OAuth 2.0 authorization URL for calendar access."""
    if not settings.GOOGLE_CLIENT_ID:
        logger.warning("[CalendarService] GOOGLE_CLIENT_ID not configured.")
        return None

    try:
        from google_auth_oauthlib.flow import Flow
        flow = Flow.from_client_config(
            {
                "web": {
                    "client_id": settings.GOOGLE_CLIENT_ID,
                    "client_secret": settings.GOOGLE_CLIENT_SECRET,
                    "auth_uri": "https://accounts.google.com/o/oauth2/auth",
                    "token_uri": "https://oauth2.googleapis.com/token",
                }
            },
            scopes=["https://www.googleapis.com/auth/calendar.events"],
            redirect_uri=redirect_uri or settings.GOOGLE_REDIRECT_URI,
        )
        auth_url, _ = flow.authorization_url(prompt="consent", access_type="offline")
        return auth_url
    except Exception as e:
        logger.error(f"[CalendarService] Error generating OAuth URL: {e}")
        return None


def exchange_code_for_tokens(code: str, redirect_uri: Optional[str] = None) -> Optional[Dict[str, str]]:
    """Exchange authorization code for access and refresh tokens."""
    if not settings.GOOGLE_CLIENT_ID or not settings.GOOGLE_CLIENT_SECRET:
        logger.warning("[CalendarService] Google OAuth credentials not configured.")
        return None

    try:
        from google_auth_oauthlib.flow import Flow
        flow = Flow.from_client_config(
            {
                "web": {
                    "client_id": settings.GOOGLE_CLIENT_ID,
                    "client_secret": settings.GOOGLE_CLIENT_SECRET,
                    "auth_uri": "https://accounts.google.com/o/oauth2/auth",
                    "token_uri": "https://oauth2.googleapis.com/token",
                }
            },
            scopes=["https://www.googleapis.com/auth/calendar.events"],
            redirect_uri=redirect_uri or settings.GOOGLE_REDIRECT_URI,
        )
        flow.fetch_token(code=code)
        credentials = flow.credentials
        return {
            "access_token": credentials.token,
            "refresh_token": credentials.refresh_token,
        }
    except Exception as e:
        logger.error(f"[CalendarService] Error exchanging OAuth code: {e}")
        return None


def _get_calendar_client(access_token: str, refresh_token: Optional[str] = None):
    """Build a Google Calendar API resource instance."""
    from google.oauth2.credentials import Credentials
    from googleapiclient.discovery import build

    creds = Credentials(
        token=access_token,
        refresh_token=refresh_token,
        token_uri="https://oauth2.googleapis.com/token",
        client_id=settings.GOOGLE_CLIENT_ID,
        client_secret=settings.GOOGLE_CLIENT_SECRET,
    )
    return build("calendar", "v3", credentials=creds)


async def create_calendar_event(
    user_access_token: Optional[str],
    summary: str,
    description: str,
    start_time: datetime,
    end_time: datetime,
    refresh_token: Optional[str] = None,
) -> Optional[str]:
    """
    Create an event in Google Calendar.
    Returns the Google Calendar event_id (or simulated ID if unconfigured).
    """
    if not user_access_token or not settings.GOOGLE_CLIENT_ID:
        simulated_id = f"sim_event_{uuid.uuid4().hex[:8]}"
        logger.info(f"[CalendarService SIMULATION] Created event '{summary}' at {start_time}. ID: {simulated_id}")
        return simulated_id

    try:
        service = _get_calendar_client(user_access_token, refresh_token)
        event_body = {
            "summary": summary,
            "description": description,
            "start": {"dateTime": start_time.isoformat() + "Z", "timeZone": "UTC"},
            "end": {"dateTime": end_time.isoformat() + "Z", "timeZone": "UTC"},
        }
        event = service.events().insert(calendarId="primary", body=event_body).execute()
        event_id = event.get("id")
        logger.info(f"[CalendarService] Successfully created Google Calendar event: {event_id}")
        return event_id
    except Exception as e:
        logger.error(f"[CalendarService] Error creating event: {e}")
        return f"sim_event_{uuid.uuid4().hex[:8]}"


async def update_calendar_event(
    user_access_token: Optional[str],
    event_id: str,
    summary: str,
    description: str,
    start_time: datetime,
    end_time: datetime,
    refresh_token: Optional[str] = None,
) -> bool:
    """Update an existing Google Calendar event."""
    if not user_access_token or not settings.GOOGLE_CLIENT_ID or event_id.startswith("sim_event_"):
        logger.info(f"[CalendarService SIMULATION] Updated event {event_id} to {start_time}")
        return True

    try:
        service = _get_calendar_client(user_access_token, refresh_token)
        event_body = {
            "summary": summary,
            "description": description,
            "start": {"dateTime": start_time.isoformat() + "Z", "timeZone": "UTC"},
            "end": {"dateTime": end_time.isoformat() + "Z", "timeZone": "UTC"},
        }
        service.events().update(calendarId="primary", eventId=event_id, body=event_body).execute()
        logger.info(f"[CalendarService] Successfully updated Google Calendar event: {event_id}")
        return True
    except Exception as e:
        logger.error(f"[CalendarService] Error updating event {event_id}: {e}")
        return False


async def delete_calendar_event(
    user_access_token: Optional[str],
    event_id: str,
    refresh_token: Optional[str] = None,
) -> bool:
    """Delete an event from Google Calendar."""
    if not user_access_token or not settings.GOOGLE_CLIENT_ID or event_id.startswith("sim_event_"):
        logger.info(f"[CalendarService SIMULATION] Deleted event {event_id}")
        return True

    try:
        service = _get_calendar_client(user_access_token, refresh_token)
        service.events().delete(calendarId="primary", eventId=event_id).execute()
        logger.info(f"[CalendarService] Successfully deleted Google Calendar event: {event_id}")
        return True
    except Exception as e:
        logger.error(f"[CalendarService] Error deleting event {event_id}: {e}")
        return False
