"""
WebSocket Manager — Real-Time Appointment Updates
==================================================

Architecture:
  - ConnectionManager: in-process registry of active WebSocket connections.
  - Redis Pub/Sub subscriber: listens for messages published by Celery tasks
    and fans them out to connected browser clients.
  - Route: /ws/appointments/{appointment_id}

Message format (JSON):
  {
    "event": "pre_visit_summary_ready" | "post_visit_summary_ready" | ...,
    "appointment_id": "...",
    "payload": { ... }
  }

Lifecycle:
  - Client connects to /ws/appointments/{appointment_id}
  - ConnectionManager registers the socket under that appointment_id
  - When a Celery task completes, it publishes to Redis channel
    "appointment:{appointment_id}"
  - The Redis subscriber receives and fans out to all WebSocket clients
    subscribed to that appointment_id
  - On disconnect, the manager cleans up the entry
"""

from __future__ import annotations

import asyncio
import json
import logging
from typing import Dict, List, Optional

from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Depends, Query
from fastapi import status as http_status

from server.auth import get_current_user

logger = logging.getLogger(__name__)

ws_router = APIRouter(tags=["WebSocket"])


# ---------------------------------------------------------------------------
# Connection Manager
# ---------------------------------------------------------------------------

class ConnectionManager:
    """Thread-safe per-appointment WebSocket connection registry."""

    def __init__(self):
        # appointment_id → list of active WebSocket connections
        self._connections: Dict[str, List[WebSocket]] = {}
        self._lock = asyncio.Lock()

    async def connect(self, appointment_id: str, websocket: WebSocket) -> None:
        await websocket.accept()
        async with self._lock:
            if appointment_id not in self._connections:
                self._connections[appointment_id] = []
            self._connections[appointment_id].append(websocket)
        logger.info(f"[WS] Client connected to appointment {appointment_id}")

    async def disconnect(self, appointment_id: str, websocket: WebSocket) -> None:
        async with self._lock:
            if appointment_id in self._connections:
                try:
                    self._connections[appointment_id].remove(websocket)
                except ValueError:
                    pass
                if not self._connections[appointment_id]:
                    del self._connections[appointment_id]
        logger.info(f"[WS] Client disconnected from appointment {appointment_id}")

    async def broadcast_to_appointment(self, appointment_id: str, message: dict) -> None:
        """Send a message to all WebSocket clients watching this appointment."""
        async with self._lock:
            sockets = list(self._connections.get(appointment_id, []))

        disconnected = []
        for ws in sockets:
            try:
                await ws.send_json(message)
            except Exception:
                disconnected.append(ws)

        # Clean up dead connections
        if disconnected:
            async with self._lock:
                for ws in disconnected:
                    try:
                        self._connections.get(appointment_id, []).remove(ws)
                    except ValueError:
                        pass

    async def send_personal_message(self, websocket: WebSocket, message: dict) -> None:
        try:
            await websocket.send_json(message)
        except Exception as e:
            logger.warning(f"[WS] Failed to send personal message: {e}")

    @property
    def active_count(self) -> int:
        return sum(len(v) for v in self._connections.values())


# Global singleton
manager = ConnectionManager()


# ---------------------------------------------------------------------------
# Redis Pub/Sub subscriber (background coroutine)
# ---------------------------------------------------------------------------

async def redis_subscriber():
    """
    Long-running coroutine started during app lifespan.
    Subscribes to all appointment channels and fans messages out to WebSocket clients.
    Falls back silently if Redis is unavailable.
    """
    try:
        import redis.asyncio as aioredis
        from server.config import settings

        r = await aioredis.from_url(settings.REDIS_URL)
        pubsub = r.pubsub()

        # Pattern subscribe: matches "appointment:*"
        await pubsub.psubscribe("appointment:*")
        logger.info("[WS] Redis Pub/Sub subscriber started — listening on 'appointment:*'")

        async for message in pubsub.listen():
            if message["type"] != "pmessage":
                continue
            try:
                channel = message["channel"]
                if isinstance(channel, bytes):
                    channel = channel.decode()
                # channel format: "appointment:{appointment_id}"
                appointment_id = channel.split(":", 1)[1]
                data = message.get("data", b"")
                if isinstance(data, bytes):
                    data = data.decode()
                payload = json.loads(data)
                await manager.broadcast_to_appointment(appointment_id, payload)
            except Exception as e:
                logger.warning(f"[WS] Error processing Pub/Sub message: {e}")

    except Exception as e:
        logger.warning(
            f"[WS] Redis Pub/Sub subscriber failed to start (non-fatal): {e}. "
            "Real-time updates will be unavailable."
        )


# ---------------------------------------------------------------------------
# WebSocket Route
# ---------------------------------------------------------------------------

@ws_router.websocket("/ws/appointments/{appointment_id}")
async def appointment_websocket(
    appointment_id: str,
    websocket: WebSocket,
    token: Optional[str] = Query(None, description="JWT access token"),
):
    """
    Real-time WebSocket endpoint for appointment status updates.

    Connect via:
      ws://localhost:8001/ws/appointments/{id}?token=<access_token>

    Events pushed from server:
      - pre_visit_summary_ready   (when AI summary generated)
      - post_visit_summary_ready  (when post-visit summary generated)
      - appointment_status_change (on confirm/cancel/complete)
    """
    # Basic auth check: require a valid JWT token in query param
    # (WebSocket browsers can't set custom headers easily)
    if not token:
        await websocket.close(code=http_status.WS_1008_POLICY_VIOLATION)
        return

    try:
        from server.auth import get_user_from_token
        _user = await get_user_from_token(token)
        if not _user:
            await websocket.close(code=http_status.WS_1008_POLICY_VIOLATION)
            return
    except Exception:
        await websocket.close(code=http_status.WS_1008_POLICY_VIOLATION)
        return

    await manager.connect(appointment_id, websocket)

    # Send connection confirmation
    await manager.send_personal_message(websocket, {
        "event": "connected",
        "appointment_id": appointment_id,
        "message": "Real-time updates active",
    })

    try:
        # Keep connection alive — wait for client ping/close
        while True:
            data = await websocket.receive_text()
            if data == "ping":
                await websocket.send_text("pong")
    except WebSocketDisconnect:
        pass
    finally:
        await manager.disconnect(appointment_id, websocket)


async def publish_ws_event(appointment_id: str, event_name: str, payload: dict = None):
    """
    Publish a real-time update to the WebSocket manager via Redis Pub/Sub.
    Also broadcasts locally to ensure instant delivery on the same node.
    """
    message = {
        "event": event_name,
        "appointment_id": appointment_id,
        "payload": payload or {}
    }
    # 1. Local broadcast
    await manager.broadcast_to_appointment(appointment_id, message)
    # 2. Redis publish for distributed scale
    try:
        import json
        import redis.asyncio as aioredis
        from server.config import settings
        r = await aioredis.from_url(settings.REDIS_URL)
        await r.publish(f"appointment:{appointment_id}", json.dumps(message))
        await r.aclose()
    except Exception as e:
        logger.warning(f"[WebSocket] Redis publish failed (non-fatal): {e}")
