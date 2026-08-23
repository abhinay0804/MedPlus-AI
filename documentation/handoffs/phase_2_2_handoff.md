# Phase 2.2–2.5 Handoff — Slot Engine, Booking Lifecycle, Doctor Portal, Leave Conflict

**Completed by:** Claude Sonnet 4.6 (Thinking)
**Date:** 2026-08-20
**Status:** ✅ Complete — 14/14 tests passing

---

## What Was Built

### Slot Engine (`server/services/slot_service.py`)
- `generate_slots(db, doctor_id, target_date)` — pure read, returns all theoretical slots with `is_available` flag
- `hold_slot(db, doctor_id, slot_start, patient_id)` — dual-strategy concurrency safety:
  - **PostgreSQL**: `SELECT FOR UPDATE SKIP LOCKED` true pessimistic row locking
  - **SQLite**: serialised read check (safe for dev/test)
  - Creates `HELD` appointment with `hold_expires_at = now + 5 minutes`
- `confirm_slot(db, appointment_id, patient_id)` — `HELD → CONFIRMED`, clears `hold_expires_at`, validates expiry
- `release_slot(db, appointment_id, patient_id, admin=False)` — cancels any active appointment
- `reschedule_slot(db, appointment_id, patient_id, new_slot_start)` — atomically marks old as `RESCHEDULED`, holds new slot
- `release_expired_holds(db)` — Celery beat helper, returns count of cleaned-up holds
- All validations: future slot, leave day, working-day alignment, slot-boundary alignment

### Appointment Repository (`server/repositories/appointment_repository.py`)
- `get_by_id(id, load_relations=True)` — eager-loads doctor+user, patient, symptom_form, post_visit_note
- `list_by_patient(patient_id, status, skip, limit)` — with eager loading
- `list_by_doctor(doctor_id, status, from_date, skip, limit)` — with full eager loading (fixed lazy-load bug)
- `create_symptom_form`, `get_symptom_form`
- `create_post_visit_note`, `get_post_visit_note`

### Patient Routes (`server/routes/patient_routes.py`) — prefix `/api/patient`
- `GET /api/patient/doctors` — search active doctors (public, no auth)
- `GET /api/patient/doctors/{id}` — single doctor (public)
- `GET /api/patient/doctors/{id}/slots?target_date=YYYY-MM-DD` — slot availability (public)
- `POST /api/patient/appointments` — hold slot (patient-only)
- `POST /api/patient/appointments/{id}/symptoms` — submit symptom form
- `POST /api/patient/appointments/{id}/confirm` — confirm booking
- `PUT /api/patient/appointments/{id}/reschedule` — reschedule
- `DELETE /api/patient/appointments/{id}` — cancel
- `GET /api/patient/appointments` — list own
- `GET /api/patient/appointments/{id}` — full detail

### Doctor Routes (`server/routes/doctor_routes.py`) — prefix `/api/doctor`
- `GET /api/doctor/appointments` — list schedule (with pre-visit summaries, eager-loaded)
- `GET /api/doctor/appointments/{id}` — single appointment detail
- `POST /api/doctor/appointments/{id}/notes` — submit post-visit notes + prescription
- `PUT /api/doctor/appointments/{id}/complete` — mark COMPLETED

### Appointment Schemas (`server/schemas/appointment_schemas.py`)
- `BookingRequest`, `SymptomFormInput`, `PostVisitNotesInput`, `RescheduleRequest`
- `SymptomFormResponse`, `PostVisitNoteResponse`
- `AppointmentResponse` (lightweight), `AppointmentDetailResponse` (nested)

### Leave Conflict (integrated into `server/routes/admin_routes.py`)
- On `POST /api/admin/doctors/{id}/leave`: queries all HELD/CONFIRMED appointments on leave date → sets them CANCELLED in the same transaction

## Key Files Created / Modified

| File | Purpose |
|------|---------|
| `server/services/slot_service.py` | Core slot engine — generation, hold, confirm, release, reschedule, expiry cleanup |
| `server/repositories/appointment_repository.py` | Appointment, SymptomForm, PostVisitNote DB operations |
| `server/schemas/appointment_schemas.py` | Pydantic request/response models |
| `server/routes/patient_routes.py` | Patient portal REST API |
| `server/routes/doctor_routes.py` | Doctor portal REST API |
| `server/app.py` | patient_routes + doctor_routes registered |
| `server/schemas/doctor_schemas.py` | Fixed Pydantic V2 `json_schema_extra` deprecation |
| `tests/integration/test_slot_booking.py` | 9 slot engine + 1 full HTTP lifecycle test |

## Architecture Decisions Made

- **Dual-dialect locking strategy**: Runtime `dialect.name` check selects PostgreSQL path (true `SELECT FOR UPDATE SKIP LOCKED`) or SQLite path (read-check). No code change needed when switching DB.
- **`RESCHEDULED` as distinct status**: The old appointment is preserved with status `RESCHEDULED` so the patient's history is intact; a new `HELD` appointment is created for the new slot.
- **Eager loading discipline**: All routes that return `AppointmentDetailResponse` use `selectinload` chains. Missing selectinload = `MissingGreenlet` crash.
- **Celery stubs as TODO comments**: Phase 3/4/5 tasks are stubbed with `# TODO Phase X:` comments at exact dispatch points so Phase 3 knows exactly where to wire in `task.delay()` calls.

## How Things Connect

```
patient_routes.py / doctor_routes.py
    → slot_service.py          (hold/confirm/release logic)
    → appointment_repository.py (DB reads/writes)
    → DoctorRepository         (for doctor lookup by user_id in doctor_routes)
    → auth.py get_current_user / require_role
```

Celery dispatch points (not yet wired — Phase 3):
- `patient_routes.py:submit_symptoms` → `generate_pre_visit_summary.delay(form.id)`
- `patient_routes.py:confirm_appointment` → `send_confirmation_email.delay(appt.id)` + `sync_google_calendar.delay(appt.id)`
- `doctor_routes.py:submit_post_visit_notes` → `generate_post_visit_summary.delay(note.id)`

## Database State
- No new migrations needed — all models already in `cb7dc056b0df_initial_schema.py`
- `SymptomForm.llm_status` defaults to `PENDING` on create
- `PostVisitNote.llm_status` defaults to `PENDING` on create

## Environment / Config
- No new `.env` variables added in this phase
- No new `requirements.txt` dependencies

## Known Issues / Incomplete Items
- `reschedule_slot` creates a new HELD appointment but the old one is `RESCHEDULED`; the patient still needs to confirm the new hold (by design — same 5-min window applies)
- Email and calendar notifications are stubbed with `TODO` comments throughout patient/doctor routes

## What the Next Phase Needs to Know

**Phase 3 is `🧠 SONNET` — Celery Workers & Background Jobs**

Critical wiring points in existing code:
```python
# patient_routes.py line ~97 (submit_symptoms)
# TODO Phase 3: dispatch celery task generate_pre_visit_summary.delay(form.id)

# patient_routes.py line ~112 (confirm_appointment)  
# TODO Phase 3: dispatch celery task send_confirmation_email.delay(appt.id)
# TODO Phase 5: dispatch celery task sync_google_calendar.delay(appt.id)

# doctor_routes.py line ~80 (submit_post_visit_notes)
# TODO Phase 3: dispatch celery task generate_post_visit_summary.delay(note.id)
```

Celery async bridge pattern needed (Celery is sync, SQLAlchemy is async):
```python
import asyncio
from server.database.connection import AsyncSessionLocal

def run_async(coro):
    """Run async coroutine from Celery sync task."""
    loop = asyncio.get_event_loop()
    return loop.run_until_complete(coro)

@celery_app.task
def my_task(record_id: str):
    async def _inner():
        async with AsyncSessionLocal() as db:
            # do async DB work
            pass
    run_async(_inner())
```

## How to Verify This Phase Works
```bash
# All 14 tests should pass
PYTHONPATH=. ./venv/bin/pytest tests/ -v

# Manual API smoke test
./venv/bin/uvicorn server.app:app --port 8001 --reload
# Then open: http://localhost:8001/docs
```
