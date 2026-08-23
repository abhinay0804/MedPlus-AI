# Phase 3 & 4 Handoff — Celery Workers, Background Jobs, LLM Integration

**Completed by:** Claude Sonnet 4.6 (Thinking)
**Date:** 2026-08-20
**Status:** ✅ Complete — 25/25 tests passing

---

## What Was Built

### Phase 3: Celery Workers & Background Jobs

#### Celery App (`microservices/celery_app.py`)
- Single `celery_app` instance with Redis broker + backend
- `task_serializer='json'`, `result_serializer='json'`, UTC timezone
- `task_ack_late=True`, `task_reject_on_worker_lost=True` for production safety
- **Beat schedule** configured:
  - `release_expired_holds_task` — every 60s
  - `send_appointment_reminders_task` — every 15 min
  - `send_medication_reminders_task` — every 30 min
  - `retry_failed_llm_task` — every 15 min
  - `retry_failed_emails_task` — every 5 min

#### Task Definitions (`microservices/tasks.py`)
- **`run_async(coro)`** — async bridge from Celery sync context to SQLAlchemy async
- **`release_expired_holds_task`** — cancels expired HELD appointments
- **`generate_pre_visit_summary_task`** — calls LLM, updates `SymptomForm.pre_visit_summary` + `urgency_level` + `llm_status`; publishes WS update
- **`generate_post_visit_summary_task`** — calls LLM, updates `PostVisitNote.patient_summary`; extracts medications → creates `MedicationReminder` records; publishes WS update
- **`retry_failed_llm_task`** — re-queues FAILED LLM records with `retry_count < 5`
- **`send_email_task`** — generic email stub (Phase 5 wires real email_service)
- **`send_appointment_reminders_task`** — queries appointments 23–25h out, dispatches emails
- **`send_medication_reminders_task`** — queries due reminders by time-match, dispatches emails
- **`retry_failed_emails_task`** — stub for Phase 5
- **`sync_calendar_event_task`** — stub for Phase 5 (create/update/delete)
- **`_publish_ws_update(channel, payload)`** — publishes to Redis Pub/Sub; non-fatal if Redis down

#### WebSocket Manager (`server/websocket.py`)
- `ConnectionManager` — in-process per-appointment WebSocket registry with async lock
- `redis_subscriber()` — background coroutine using `psubscribe("appointment:*")`, fans out to connected sockets
- `/ws/appointments/{id}?token=<jwt>` — WebSocket endpoint with JWT auth via query param
- Non-fatal Redis failure — if Redis isn't running, WebSocket feature degrades gracefully

#### Route Wiring
- `patient_routes.py` now imports + dispatches: `generate_pre_visit_summary_task`, `send_email_task`, `sync_calendar_event_task`
- `doctor_routes.py` now imports + dispatches: `generate_post_visit_summary_task`
- Tests use `unittest.mock.patch` to replace `.delay()` calls, preventing Redis dependency in test suite

#### Auth Helper (`server/auth.py`)
- Added `get_user_from_token(token: str) -> Optional[User]` — resolves JWT token to User without FastAPI Depends, for use in WebSocket route

#### Repositories
- `server/repositories/reminder_repository.py` — `create_reminder()`, `get_due_reminders()`, `mark_sent()`, `deactivate()`

### Phase 4: LLM Integration

#### LLM Service (`server/services/llm_service.py`)
- Lazy Gemini client init (fails gracefully if `GOOGLE_GENAI_API_KEY` not set)
- **`generate_pre_visit_summary(symptoms)`** → returns structured dict:
  ```json
  {
    "urgency_level": "LOW|MEDIUM|HIGH",
    "chief_complaint": "...",
    "key_symptoms": [...],
    "suggested_questions": [...],
    "red_flags": [...]
  }
  ```
- **`generate_post_visit_summary(notes, prescription)`** → returns:
  ```json
  {
    "patient_summary": "...",
    "medications": [{"name": "...", "dosage": "...", "instructions": "..."}],
    "follow_up": "...",
    "warning_signs": [...]
  }
  ```
- **3-retry exponential backoff**: `2s → 4s → 8s`
- **Markdown fence stripping** from Gemini responses (`_extract_json`)
- **Graceful fallback**: always returns `PRE_VISIT_FALLBACK` or `POST_VISIT_FALLBACK` on failure, never raises
- Urgency level normalised — invalid values default to `MEDIUM`

## Key Files Created / Modified

| File | Purpose |
|------|---------|
| `microservices/celery_app.py` | Celery app instance + Beat schedule |
| `microservices/tasks.py` | All 10 Celery task definitions + async bridge |
| `server/services/llm_service.py` | Google Gemini integration with retry + fallback |
| `server/services/websocket.py` | WebSocket ConnectionManager + Redis Pub/Sub subscriber |
| `server/repositories/reminder_repository.py` | MedicationReminder DB operations |
| `server/auth.py` | Added `get_user_from_token()` for WebSocket auth |
| `server/app.py` | ws_router included, redis_subscriber started in lifespan |
| `server/routes/patient_routes.py` | Celery tasks wired into booking confirm/symptom/cancel routes |
| `server/routes/doctor_routes.py` | Celery task wired into post-visit notes route |
| `tests/unit/test_llm_service.py` | 11 unit tests for LLM service (all mocked, no real API calls) |
| `tests/integration/test_slot_booking.py` | HTTP test updated to mock Celery dispatches |

## Architecture Decisions Made

- **`run_async()` creates a NEW event loop per task** (not `get_event_loop()`). This is critical because Celery workers run in a thread pool and there may not be an existing event loop.
- **`task_always_eager` is NOT set** globally. Tests use `unittest.mock.patch` instead. This ensures tests are always testing real logic, not Celery internals.
- **WebSocket auth via query param** (`?token=...`) because browser WebSocket API cannot set custom headers. The JWT is validated server-side the same way HTTP requests are.
- **Non-fatal Redis** — both `redis_subscriber()` and `_publish_ws_update()` catch all exceptions and log a warning instead of crashing. The system works fully even without Redis (just without real-time updates).
- **Medication reminder default** — 7-day window, 9:00 AM reminder time, parsed from prescription text. Phase 5 can enhance extraction logic.

## How Things Connect

```
patient_routes.py (confirm)
    → send_email_task.delay()        → microservices/tasks.py → email_service (Phase 5)
    → sync_calendar_event_task.delay() → calendar_service (Phase 5)

patient_routes.py (symptoms)
    → generate_pre_visit_summary_task.delay(form.id)
        → llm_service.generate_pre_visit_summary()
        → db: SymptomForm.llm_status = SUCCESS
        → _publish_ws_update("appointment:{id}")
            → redis_subscriber() in websocket.py
            → manager.broadcast_to_appointment()
            → WebSocket client (browser)

doctor_routes.py (notes)
    → generate_post_visit_summary_task.delay(note.id)
        → llm_service.generate_post_visit_summary()
        → db: PostVisitNote.patient_summary = "..."
        → ReminderRepository.create_reminder() × N medications
        → _publish_ws_update("appointment:{id}")
```

## Environment / Config
- No new `.env` variables (all were pre-defined in Phase 1's config.py)
- `GOOGLE_GENAI_API_KEY` must be set in `.env` for LLM to work (graceful fallback if not set)
- `REDIS_URL` must be set for Celery + WebSocket (default: `redis://localhost:6379/0`)

## Celery Worker Commands
```bash
# Start worker (requires Redis running)
PYTHONPATH=. ./venv/bin/celery -A microservices.celery_app worker --loglevel=info

# Start beat scheduler
PYTHONPATH=. ./venv/bin/celery -A microservices.celery_app beat --loglevel=info

# Test a task manually
PYTHONPATH=. ./venv/bin/python -c "
from microservices.tasks import release_expired_holds_task
result = release_expired_holds_task.delay()
print('Released:', result.get(timeout=10))
"
```

## Known Issues / Incomplete Items
- Email templates are stubs — `send_email_task` logs intent but doesn't send (Phase 5)
- Calendar sync is a stub — `sync_calendar_event_task` logs intent but doesn't call Google Calendar (Phase 5)
- Medication reminder time is hardcoded to 9:00 AM — Phase 5 should parse dosing schedule from prescription text
- `retry_failed_emails_task` is a no-op stub pending Phase 5

## What the Next Phase Needs to Know

**Phase 5 is `⚡ FLASH` — Email & Google Calendar Integration.**

Replace stubs in `microservices/tasks.py`:
1. `send_email_task` → call `server/services/email_service.send_email()`
2. `sync_calendar_event_task` → call `server/services/calendar_service.sync_event()`

Key integration points:
- Email templates go in `server/templates/email/` (HTML Jinja2 templates)
- `fastapi-mail` is already in requirements.txt
- Google Calendar OAuth tokens stored in `User.google_access_token` + `User.google_refresh_token`
- `CalendarEvent` model stores `patient_event_id` + `doctor_event_id` (Google Calendar event IDs)

## How to Verify This Phase Works
```bash
# Full test suite — 25/25 should pass
PYTHONPATH=. ./venv/bin/pytest tests/ -v

# Verify Celery import works cleanly
PYTHONPATH=. ./venv/bin/python -c "from microservices.celery_app import celery_app; print('✅ Celery app loaded'); print(list(celery_app.conf.beat_schedule.keys()))"

# Verify LLM service fallback (no API key)
PYTHONPATH=. ./venv/bin/python -c "
import asyncio
from server.services.llm_service import generate_pre_visit_summary
result = asyncio.run(generate_pre_visit_summary('chest pain'))
print('Fallback works:', result.get('_llm_error') or 'LIVE (has API key)')
"
```
