# Healthcare Appointment Manager — Task Checklist

> **Last Updated:** 2026-08-20
> **Status Legend:** `[ ]` To Do · `[/]` In Progress · `[x]` Completed

---

## 🤖 Model Assignment Guide

### Model Roster

| Model | Code | Strengths | Cost |
|:------|:----:|:----------|:----:|
| Gemini 3.6 Flash | `⚡ FLASH` | Fast, no rate limits, great for scaffolding/CRUD/UI/docs | 💲 |
| Claude Sonnet 4.6 (Thinking) | `🧠 SONNET` | Deep reasoning, good for complex logic/concurrency/integrations | 💲💲 |
| Claude Opus 4.6 (Thinking) | `🔮 OPUS` | Deepest reasoning, only for critical debugging/architecture | 💲💲💲💲 |

### Phase → Model Assignment

| Phase | Model | Rationale |
|:------|:-----:|:----------|
| Phase 1 — Foundation & Scaffolding | ⚡ FLASH | Boilerplate: project setup, config, basic auth, ORM models |
| Phase 2 — Core Backend (2.1, 2.3, 2.4) | ⚡ FLASH | Standard CRUD routes, schemas, repositories |
| Phase 2 — Slot Engine (2.2, 2.5) | 🧠 SONNET | Complex: pessimistic locking, `SELECT FOR UPDATE SKIP LOCKED`, hold logic |
| Phase 3 — Celery Workers | 🧠 SONNET | Complex: async bridge, Beat scheduling, Redis Pub/Sub, WebSocket |
| Phase 4 — LLM Integration | 🧠 SONNET | Complex: Gemini API, prompt engineering, retry/fallback, JSON parsing |
| Phase 5 — Email & Calendar | ⚡ FLASH | Integration: email templates, Google Calendar CRUD (well-documented APIs) |
| Phase 6 — Frontend: Auth & Patient | ⚡ FLASH | UI: React components, forms, routing, Tailwind styling |
| Phase 7 — Frontend: Doctor & Admin | ⚡ FLASH | UI: more React components, dashboards, forms |
| Phase 8 — Testing | ⚡ FLASH | Tests: pytest fixtures, test cases, assertions |
| Phase 9 — Documentation & Deployment | ⚡ FLASH | Docs: README, Dockerfiles, write-ups |
| Phase 10 — Differentiators & Polish | ⚡ FLASH | UI polish: animations, charts, landing page, PDF, QR |

### ⚠️ Model Handoff Protocol

> **INSTRUCTION TO ALL MODELS:** Before starting any phase or sub-section, check the Model Assignment table above. If the upcoming tasks are assigned to a **different model** than the currently active model, you **MUST**:
>
> 1. **STOP** working on new tasks
> 2. **INFORM** the user with this exact format:
>
> ```
> 🔄 MODEL SWITCH RECOMMENDED
> ━━━━━━━━━━━━━━━━━━━━━━━━━━
> ✅ Completed: [current phase/section]
> ➡️ Next up: [upcoming phase/section]
> 🤖 Switch to: [recommended model name]
> 📝 Reason: [why this model is better for the next tasks]
> ```
>
> 3. **WAIT** for the user to switch models before proceeding
>
> Conversely, if the upcoming tasks are assigned to the **same model** as the current model, continue without interruption.

### 📄 Phase Handoff Document Protocol

> **INSTRUCTION TO ALL MODELS:** After completing **every phase** (or when switching models mid-phase), you **MUST** create a handoff document at:
>
> ```
> documentation/handoffs/phase_X_handoff.md
> ```
>
> This document is the **incoming model's briefing file**. It ensures the next model can pick up exactly where the previous one left off without re-reading the entire codebase. The incoming model **MUST** read the latest handoff document before starting work.
>
> **Use this template:**
>
> ```markdown
> # Phase [X] Handoff — [Phase Title]
>
> **Completed by:** [Model name]
> **Date:** [YYYY-MM-DD]
> **Status:** ✅ Complete / 🔶 Partially Complete
>
> ---
>
> ## What Was Built
> - Bullet list of everything created/implemented in this phase
>
> ## Key Files Created / Modified
> | File | Purpose |
> |------|---------|
> | `path/to/file.py` | Brief description |
>
> ## Architecture Decisions Made
> - Any design choices, trade-offs, or deviations from the project plan
> - Why a particular approach was chosen over alternatives
>
> ## How Things Connect
> - How this phase's code integrates with previous phases
> - Entry points, imports, dependency chain
> - Example: "auth.py's `get_current_user` is used as a FastAPI Depends() in all route files"
>
> ## Database State
> - Current schema state (any migrations run?)
> - Seed data added?
>
> ## Environment / Config
> - Any new .env variables added?
> - Any new dependencies in requirements.txt or package.json?
>
> ## Known Issues / Incomplete Items
> - Anything left unfinished or marked as TODO
> - Any workarounds in place
>
> ## What the Next Phase Needs to Know
> - Critical context for the incoming model
> - Gotchas, non-obvious patterns, or conventions established
> - Example: "All repositories use async sessions — always use `async with get_db() as session`"
>
> ## How to Verify This Phase Works
> - Commands to run to confirm everything is working
> - Example: `uvicorn server.app:app --reload` then hit `/api/health`
> ```
>
> **Rules:**
> 1. Be **specific** — file paths, function names, class names, not vague descriptions
> 2. Be **honest** — if something is incomplete or hacky, say so
> 3. Include **code snippets** for non-obvious patterns the next model must follow
> 4. The incoming model **MUST read** `documentation/handoffs/phase_X_handoff.md` before starting any new work

---

## Phase 1 — Foundation & Scaffolding `⚡ FLASH`
**Goal:** Project skeleton, database, authentication system.
**Estimated Duration:** 2–3 days
**Assigned Model:** Gemini 3.6 Flash — boilerplate scaffolding, config files, ORM models, basic auth

### 1.1 Project Scaffolding
- [x] Initialize git repository (`main` branch)
- [x] Create root directory structure (server/, frontend/, microservices/, docs/, tests/, scripts/, documentation/, migrations/)
- [x] Create `.gitignore` (node_modules, __pycache__, .env, dist/, venv/, *.pyc, .idea/, .vscode/, __pycache__/)
- [x] Create `.dockerignore`
- [x] Create `requirements.txt` (fastapi, uvicorn, sqlalchemy, asyncpg, celery, redis, python-jose, bcrypt, google-genai, fastapi-mail, google-auth, google-api-python-client, pydantic-settings, python-multipart, websockets, alembic, aiosqlite)
- [x] Create `requirements-test.txt` (pytest, pytest-asyncio, httpx, fakeredis, Faker)
- [x] Create `pytest.ini`

### 1.2 Database Setup
- [x] Create `server/__init__.py` and all sub-package `__init__.py` files
- [x] Create `server/database/connection.py` — async engine, sessionmaker, `get_db()` dependency
- [x] Create `server/database/models.py` — User model
- [x] Create `server/database/models.py` — DoctorProfile model
- [x] Create `server/database/models.py` — DoctorLeave model
- [x] Create `server/database/models.py` — Appointment model (with status enum + hold_expires_at)
- [x] Create `server/database/models.py` — SymptomForm model (with llm_status + retry_count)
- [x] Create `server/database/models.py` — PostVisitNote model (with llm_status + retry_count)
- [x] Create `server/database/models.py` — MedicationReminder model
- [x] Create `server/database/models.py` — CalendarEvent model
- [x] Add partial unique index: `UNIQUE (doctor_id, slot_start) WHERE status NOT IN ('CANCELLED', 'RESCHEDULED')`
- [x] Add composite index: `(doctor_id, slot_start, status)` for slot queries
- [x] Add index: `(status, hold_expires_at)` for hold cleanup
- [x] Add index: `(is_active, reminder_time)` for medication reminders

### 1.3 Alembic Migrations
- [x] Initialize Alembic: `alembic init migrations`
- [x] Configure `alembic.ini` with async database URL
- [x] Configure `migrations/env.py` for async SQLAlchemy + model imports
- [x] Generate initial migration: `alembic revision --autogenerate -m "initial_schema"`
- [x] Run migration: `alembic upgrade head`
- [x] Verify all tables created correctly

### 1.4 Configuration
- [x] Create `server/config.py` — pydantic-settings `Settings` class
- [x] Create `.env.example` with all variables (DATABASE_URL, JWT_SECRET, REDIS_URL, GOOGLE_GENAI_API_KEY, SMTP_*, GOOGLE_CLIENT_ID/SECRET, etc.)
- [x] Create local `.env` file (gitignored)

### 1.5 Authentication System
- [x] Create `server/auth.py` — `hash_password()` using bcrypt
- [x] Create `server/auth.py` — `verify_password()` using bcrypt
- [x] Create `server/auth.py` — `create_access_token()` (15-min expiry, payload: sub, email, role, type)
- [x] Create `server/auth.py` — `create_refresh_token()` (7-day expiry)
- [x] Create `server/auth.py` — `decode_token()` + `get_current_user()` FastAPI dependency
- [x] Create `server/auth.py` — `require_role(*roles)` dependency factory
- [x] Create `server/repositories/user_repository.py` — `create_user()`, `get_by_email()`, `get_by_id()`
- [x] Create `server/schemas/auth_schemas.py` — RegisterRequest, LoginRequest, LoginResponse, TokenResponse, UserResponse
- [x] Create `server/routes/auth_routes.py` — `POST /api/auth/register`
- [x] Create `server/routes/auth_routes.py` — `POST /api/auth/login`
- [x] Create `server/routes/auth_routes.py` — `POST /api/auth/refresh`
- [x] Create `server/routes/auth_routes.py` — `GET /api/auth/me`
- [x] Test: register a patient, login, access protected route

### 1.6 FastAPI App Bootstrap
- [x] Create `server/app.py` — FastAPI app with title, version, description
- [x] Configure CORS middleware (allow frontend origin)
- [x] Add lifespan event: create DB tables on startup
- [x] Add global exception handlers (422 validation, 500 internal, custom exceptions)
- [x] Include all route routers with `/api` prefix
- [x] Add `GET /api/health` endpoint (version, uptime, DB status)
- [x] Create `server/utils/exceptions.py` — SlotConflictError, LLMFailureError, NotFoundError, UnauthorizedError
- [x] Create `server/utils/helpers.py` — date/time utilities
- [x] Create `scripts/seed_db.py` — seed admin user (admin@healthcare.com)
- [x] Verify: `uvicorn server.app:app --reload` starts without errors
- [x] Verify: `/api/health` returns 200
- [x] Verify: `/api/auth/register` + `/api/auth/login` flow works end-to-end

### Phase 1 Checkpoint ✓
- [x] All models created with proper relationships
- [x] Alembic migrations run successfully
- [x] Auth register/login/refresh/me endpoints working
- [x] Health endpoint returns 200
- [x] Admin user seeded

---

## Phase 2 — Core Backend Services `⚡ FLASH` → `🧠 SONNET`
**Goal:** Doctor management, slot engine, appointment booking with concurrency-safe locking, leave management.
**Estimated Duration:** 3–4 days
**Assigned Models:**
- Sections 2.1, 2.3, 2.4 → `⚡ FLASH` (standard CRUD routes, schemas, repositories)
- Sections 2.2, 2.5 → `🧠 SONNET` (slot engine with pessimistic locking + leave conflict cascade — complex concurrency logic)
- Sections 2.2, 2.5 → `🧠 SONNET` (slot engine with pessimistic leave conflict cascade — complex concurrency logic)

### 2.1 Doctor Management (Admin)
- [x] Create `server/repositories/doctor_repository.py` — Doctor profile CRUD, leave management
- [x] Create `server/schemas/doctor_schemas.py` — DoctorCreate, DoctorUpdate, LeaveCreate, SlotResponse
- [x] Create `server/routes/admin_routes.py` — `POST /api/admin/doctors`
- [x] Create `server/routes/admin_routes.py` — `PUT /api/admin/doctors/{id}`
- [x] Create `server/routes/admin_routes.py` — `DELETE /api/admin/doctors/{id}`
- [x] Create `server/routes/admin_routes.py` — `GET /api/admin/doctors`
- [x] Create `server/routes/admin_routes.py` — `POST /api/admin/doctors/{id}/leave`
- [x] Create `server/routes/admin_routes.py` — `DELETE /api/admin/doctors/{id}/leave/{leave_id}`
- [x] Create `server/routes/admin_routes.py` — `GET /api/admin/dashboard` (stats)
- [x] Test: create doctor, update, add leave, list doctors (all as admin)
- [x] Test: verify non-admin gets 403

### 2.2 Slot Engine
- [x] Create `server/services/slot_service.py` — `generate_slots(doctor_id, date)`: compute slots from working_hours + slot_duration
- [x] Create `server/services/slot_service.py` — `get_available_slots(doctor_id, date)`: subtract booked/held slots
- [x] Create `server/services/slot_service.py` — `hold_slot(doctor_id, slot_start, patient_id)`: SELECT FOR UPDATE SKIP LOCKED + insert HELD
- [x] Create `server/services/slot_service.py` — `confirm_slot(appointment_id, patient_id)`: HELD → CONFIRMED
- [x] Create `server/services/slot_service.py` — `release_slot(appointment_id)`: cancel or expire hold
- [x] Validate: slot_start must be in the future
- [x] Validate: slot_start must align with doctor's slot_duration_minutes
- [x] Validate: date must not be a doctor leave day
- [x] Validate: slot must be within doctor's working hours for that day-of-week
- [x] Test: generate slots returns correct time windows
- [x] Test: held slot does not appear in available slots
- [x] Test: concurrent hold attempts — only one succeeds

### 2.3 Appointment Booking (Patient)
- [x] Create `server/repositories/appointment_repository.py` — `create_appointment()`, `get_by_id()`, `list_by_patient()`, `update_status()`
- [x] Create `server/schemas/appointment_schemas.py` — BookingRequest, SymptomFormInput, PostVisitNotesInput, RescheduleRequest, AppointmentResponse, AppointmentDetailResponse
- [x] Create `server/routes/patient_routes.py` — `GET /api/doctors` (search by specialisation)
- [x] Create `server/routes/patient_routes.py` — `GET /api/doctors/{id}` (doctor profile)
- [x] Create `server/routes/patient_routes.py` — `GET /api/doctors/{id}/slots?date=` (available slots)
- [x] Create `server/routes/patient_routes.py` — `POST /api/appointments` (hold slot)
- [x] Create `server/routes/patient_routes.py` — `POST /api/appointments/{id}/symptoms` (submit symptom form)
- [x] Create `server/routes/patient_routes.py` — `POST /api/appointments/{id}/confirm` (confirm booking)
- [x] Create `server/routes/patient_routes.py` — `PUT /api/appointments/{id}/reschedule`
- [x] Create `server/routes/patient_routes.py` — `DELETE /api/appointments/{id}` (cancel)
- [x] Create `server/routes/patient_routes.py` — `GET /api/appointments` (list own)
- [x] Create `server/routes/patient_routes.py` — `GET /api/appointments/{id}` (detail with summaries)
- [x] Test: full booking flow: search doctor → view slots → hold → symptoms → confirm
- [x] Test: cancel and reschedule flows

### 2.4 Doctor Portal Routes
- [x] Create `server/routes/doctor_routes.py` — `GET /api/doctor/appointments` (today's/upcoming)
- [x] Create `server/routes/doctor_routes.py` — `GET /api/doctor/appointments/{id}` (with pre-visit summary)
- [x] Create `server/routes/doctor_routes.py` — `POST /api/doctor/appointments/{id}/notes` (submit notes + prescription)
- [x] Create `server/routes/doctor_routes.py` — `PUT /api/doctor/appointments/{id}/complete` (mark completed)
- [x] Test: doctor views appointments, submits notes, marks complete

### 2.5 Leave Conflict Handling
- [x] Implement leave conflict logic in admin leave route:
  - [x] Query all CONFIRMED appointments for doctor on leave date
  - [x] Update affected appointments status → CANCELLED
  - [x] Return affected appointment list to admin
  - [x] (Email/calendar notifications wired in Phase 5)
- [x] Test: book appointment → mark doctor leave → verify appointment cancelled

### Phase 2 Checkpoint ✓
- [x] Doctor CRUD fully working (admin-only)
- [x] Slot engine generates correct availability
- [x] Double-booking prevented (concurrent test passes)
- [x] Full booking lifecycle: hold → confirm → complete
- [x] Leave conflict auto-cancels affected appointments
- [x] All routes role-protected

---

## Phase 3 — Celery Workers & Background Jobs `🧠 SONNET`
**Goal:** Celery + Redis setup, all background tasks defined, Beat scheduler configured.
**Estimated Duration:** 2 days
**Assigned Model:** Claude Sonnet 4.6 — async bridge pattern, Beat scheduling, Redis Pub/Sub, WebSocket manager

### 3.1 Celery Configuration
- [x] Create `microservices/__init__.py`
- [x] Create `microservices/celery_app.py` — Celery app instance
- [x] Configure Redis as broker and backend: `REDIS_URL`
- [x] Configure task serialization: `task_serializer='json'`, `result_serializer='json'`
- [x] Create `run_async()` helper for async bridge (Celery sync → SQLAlchemy async)
- [x] Define Beat schedule:
  - [x] `release_expired_holds` — every 1 minute
  - [x] `send_appointment_reminder` — every 15 minutes
  - [x] `send_medication_reminder` — every 30 minutes
  - [x] `retry_failed_llm` — every 15 minutes
  - [x] `retry_failed_emails` — every 5 minutes
- [x] Verify: `celery -A microservices.celery_app worker --loglevel=info` starts cleanly
- [x] Verify: `celery -A microservices.celery_app beat --loglevel=info` starts cleanly

### 3.2 Task Definitions
- [x] Create `microservices/tasks.py` — `release_expired_holds`: delete HELD appointments past hold_expires_at
- [x] Create `microservices/tasks.py` — `generate_pre_visit_summary`: call LLM service, update SymptomForm (placeholder until Phase 4)
- [x] Create `microservices/tasks.py` — `generate_post_visit_summary`: call LLM service, update PostVisitNote (placeholder until Phase 4)
- [x] Create `microservices/tasks.py` — `send_email_task`: generic email sender (placeholder until Phase 5)
- [x] Create `microservices/tasks.py` — `send_appointment_reminder`: query upcoming appointments, dispatch emails
- [x] Create `microservices/tasks.py` — `send_medication_reminder`: query active reminders, dispatch emails
- [x] Create `microservices/tasks.py` — `handle_doctor_leave`: cancel appointments, dispatch notifications
- [x] Create `microservices/tasks.py` — `sync_calendar_event`: create/update/delete Google Calendar event (placeholder until Phase 5)
- [x] Create `microservices/tasks.py` — `retry_failed_llm`: pick up FAILED llm_status, re-attempt (max 5)
- [x] Create `microservices/tasks.py` — `retry_failed_emails`: re-attempt failed email sends
- [x] Test: manually dispatch `release_expired_holds.delay()` — verify expired holds cleaned up
- [x] Test: verify Beat schedule triggers tasks at correct intervals

### 3.3 WebSocket Manager
- [x] Create `server/websocket.py` — `ConnectionManager` class (connect, disconnect, send_personal_message)
- [x] Add Redis Pub/Sub subscriber for cross-process notification
- [x] Add WebSocket route: `/ws/appointments/{id}`
- [x] Wire Celery tasks to publish status updates via Redis Pub/Sub
- [x] Test: connect WebSocket, trigger task, verify real-time message received

### 3.4 Wire Celery into Existing Routes
- [x] Appointment confirm → dispatch `send_email_task.delay()` (booking confirmation — placeholder)
- [x] Symptom submission → dispatch `generate_pre_visit_summary.delay()`
- [x] Doctor notes submission → dispatch `generate_post_visit_summary.delay()`
- [x] Appointment cancel → dispatch `send_email_task.delay()` (cancellation — placeholder)
- [x] Admin leave → dispatch `handle_doctor_leave.delay()`

### Phase 3 Checkpoint ✓
- [x] Celery worker + Beat running with Redis
- [x] All 10 task stubs defined and dispatchable
- [x] Expired holds automatically released every minute
- [x] WebSocket delivers real-time updates
- [x] Routes dispatch async tasks on relevant events

---

## Phase 4 — LLM Integration `🧠 SONNET`
**Goal:** Google Gemini for pre-visit & post-visit summaries with graceful failure handling.
**Estimated Duration:** 1–2 days
**Assigned Model:** Claude Sonnet 4.6 — prompt engineering, API integration, retry/fallback strategy, JSON parsing

### 4.1 LLM Service Implementation
- [x] Create `server/services/llm_service.py` — initialize Gemini client from config
- [x] Implement `generate_pre_visit_summary(symptoms: str)`:
  - [x] Format pre-visit prompt with symptoms
  - [x] Call Gemini API
  - [x] Parse JSON response: urgency_level, chief_complaint, suggested_questions
  - [x] Validate response structure
  - [x] Return PreVisitSummary dataclass/dict
- [x] Implement `generate_post_visit_summary(notes: str, prescription: str)`:
  - [x] Format post-visit prompt with notes + prescription
  - [x] Call Gemini API
  - [x] Parse patient-friendly summary text
  - [x] Return PostVisitSummary dataclass/dict

### 4.2 Failure Handling
- [x] Wrap Gemini calls in try-except
- [x] Implement 3 retries with exponential backoff (2s, 4s, 8s)
- [x] On persistent failure: return fallback response (`urgency_level: "Unknown"`, etc.)
- [x] Set `llm_status = 'FAILED'` and increment `retry_count` in DB
- [x] Log failure details for debugging

### 4.3 Wire into Celery Tasks
- [x] Update `generate_pre_visit_summary` task: call LLM service, update SymptomForm with result
- [x] Update `generate_post_visit_summary` task: call LLM service, update PostVisitNote with result
- [x] Update `retry_failed_llm` task: query FAILED records (retry_count < 5), re-attempt
- [x] Publish WebSocket update when summary becomes available
- [x] Test: submit symptoms → verify pre-visit summary generated and stored
- [x] Test: submit doctor notes → verify post-visit summary generated and stored
- [x] Test: set invalid API key → verify fallback returned, llm_status = FAILED
- [x] Test: fix API key → verify retry_failed_llm picks up and succeeds

### 4.4 Medication Reminder Extraction
- [x] Create `server/repositories/reminder_repository.py` — `create_reminders()`, `get_active_reminders()`, `mark_sent()`
- [x] After post-visit summary: parse prescription for medication name, dosage, frequency, duration
- [x] Create `MedicationReminder` records in DB for each medication
- [x] Test: doctor submits prescription → verify MedicationReminder records created

### Phase 4 Checkpoint ✓
- [x] Pre-visit summary generates correctly from symptoms
- [x] Post-visit summary generates correctly from doctor notes
- [x] LLM failures handled gracefully — system never breaks
- [x] Failed summaries retried automatically (max 5 attempts)
- [x] Medication reminders extracted and stored from prescriptions

---

## Phase 5 — Email & Google Calendar Integration `⚡ FLASH`
**Goal:** All email notifications + Google Calendar event sync.
**Estimated Duration:** 2–3 days
**Assigned Model:** Gemini 3.6 Flash — well-documented APIs, template-based email, standard OAuth flow

### 5.1 Email Service
- [x] Create `server/services/email_service.py` — initialize `fastapi-mail` with SMTP config
- [x] Create HTML email template: booking confirmation
- [x] Create HTML email template: appointment reminder (24h before)
- [x] Create HTML email template: cancellation notice
- [x] Create HTML email template: reschedule notice (old → new slot)
- [x] Create HTML email template: doctor leave cancellation
- [x] Create HTML email template: medication reminder
- [x] Create HTML email template: summary ready notification
- [x] Implement `send_email(to, subject, template, context)` → async sender
- [x] Wire into `send_email_task` Celery task (replace placeholder)
- [x] Wire into `send_appointment_reminder` task
- [x] Wire into `send_medication_reminder` task
- [x] Wire into `handle_doctor_leave` task
- [x] Implement email retry logic in `retry_failed_emails` task
- [x] Test: booking → receive confirmation email
- [x] Test: cancellation → receive cancellation email
- [x] Test: verify medication reminder email sent on schedule

### 5.2 Google Calendar Service
- [x] Create `server/services/calendar_service.py` — initialize Google API client
- [x] Implement OAuth 2.0 flow:
  - [x] `GET /api/auth/google/connect` — generate OAuth URL, redirect
  - [x] `GET /api/auth/google/callback` — exchange code for tokens, store in User
- [x] Implement `create_event(user_tokens, appointment_details)` → returns event_id
- [x] Implement `update_event(user_tokens, event_id, new_details)` → for reschedules
- [x] Implement `delete_event(user_tokens, event_id)` → for cancellations
- [x] Wire into `sync_calendar_event` Celery task (replace placeholder)
- [x] Store event IDs in CalendarEvent table
- [x] Handle token refresh when access_token expires
- [x] Graceful degradation: calendar failures don't block appointments, events queued for retry
- [x] Test: connect Google account → book → verify event in calendar
- [x] Test: reschedule → verify event updated
- [x] Test: cancel → verify event deleted

### 5.3 Notification Orchestrator
- [x] Create `server/services/notification_service.py`:
  - [x] `on_booking_confirmed(appointment)` → email + calendar + WebSocket
  - [x] `on_booking_cancelled(appointment, reason)` → email + calendar + WebSocket
  - [x] `on_booking_rescheduled(appointment, old_slot)` → email + calendar + WebSocket
  - [x] `on_doctor_leave(doctor, date, affected_appointments)` → email + calendar
  - [x] `on_summary_ready(appointment, summary_type)` → email + WebSocket
- [x] Wire notification_service into routes (replace direct task dispatches)
- [x] Test: each event type triggers correct notifications

### Phase 5 Checkpoint ✓
- [x] All 7 email templates rendering correctly
- [x] Emails sent for all event types (booking, cancel, reschedule, leave, reminder, summary)
- [x] Failed emails retried automatically
- [x] Google Calendar OAuth flow working
- [x] Calendar events created/updated/deleted on appointment lifecycle
- [x] Notification orchestrator coordinates all channels

---

## Phase 6 — Frontend: Auth & Patient Portal `⚡ FLASH`
**Goal:** React SPA with authentication and complete patient experience.
**Estimated Duration:** 3–4 days
**Assigned Model:** Gemini 3.6 Flash — React components, forms, routing, Tailwind styling, UI patterns

### 6.1 Frontend Scaffolding
- [x] Initialize Vite + React + TypeScript: `npx -y create-vite@latest ./` in `frontend/`
- [x] Install and configure Tailwind CSS
- [x] Install and configure shadcn/ui (init + add components)
- [x] Create healthcare color palette in `tailwind.config.ts`
- [x] Create `frontend/src/lib/api.ts` — typed fetch wrapper with JWT injection
- [x] Create `frontend/src/lib/utils.ts` — Tailwind `cn()` helper
- [x] Create `frontend/src/hooks/useAuth.ts` — AuthContext, login/logout/register, token refresh
- [x] Create `frontend/src/hooks/useWebSocket.ts` — WebSocket hook for real-time updates
- [x] Create `frontend/src/App.tsx` — React Router with route definitions
- [x] Create `RequireAuth` wrapper component (redirect to login if unauthenticated)
- [x] Create role-based route guards (patient routes, doctor routes, admin routes)
- [x] Configure Vite proxy for `/api` → backend in `vite.config.ts`

### 6.2 Authentication Pages
- [x] Create `Login.tsx` — email + password form, error handling, role-based redirect
- [x] Create `Register.tsx` — patient registration form with validation (email, password policy, name, phone)
- [x] Style auth pages: centered card layout, healthcare branding
- [x] Test: register → redirect to patient dashboard
- [x] Test: login as patient → patient dashboard; login as doctor → doctor dashboard; login as admin → admin dashboard

### 6.3 Layout Component
- [x] Create `components/Layout.tsx` — sidebar navigation
- [x] Role-based menu items (Patient: Dashboard, Doctors, Appointments, Settings; Doctor: Dashboard, Appointments, Settings; Admin: Dashboard, Doctors)
- [x] User profile dropdown (name, role, logout)
- [x] Breadcrumb navigation
- [x] Responsive: collapsible sidebar on mobile

### 6.4 Patient Portal — Dashboard
- [x] Create `pages/patient/Dashboard.tsx`:
  - [x] Upcoming appointments list (next 7 days)
  - [x] Recent AI summaries (pre-visit + post-visit)
  - [x] Quick action: "Book Appointment" button
  - [x] Stats: total appointments, upcoming count

### 6.5 Patient Portal — Doctor Search & Booking
- [x] Create `pages/patient/DoctorSearch.tsx`:
  - [x] Search bar with specialisation filter/dropdown
  - [x] Doctor cards: name, specialisation, next available slot
  - [x] "Book Appointment" button per doctor
- [x] Create `components/SlotPicker.tsx`:
  - [x] Date picker (calendar widget)
  - [x] Time slot grid showing available slots
  - [x] Visual distinction: available (green), held/booked (grey), selected (blue)
- [x] Create `components/SymptomForm.tsx`:
  - [x] Multi-step or single textarea for symptom description
  - [x] Validation: minimum character count
  - [x] Submit triggers async LLM summary
- [x] Create `pages/patient/BookAppointment.tsx`:
  - [x] Step 1: Select date → load available slots
  - [x] Step 2: Select slot → hold slot (5-min timer shown)
  - [x] Step 3: Fill symptom form
  - [x] Step 4: Confirm booking
  - [x] Loading states, error handling, slot conflict handling
- [x] Test: complete booking flow end-to-end in browser

### 6.6 Patient Portal — Appointments
- [x] Create `pages/patient/Appointments.tsx`:
  - [x] List of all appointments with status badge (Confirmed, Completed, Cancelled)
  - [x] Filter by status
  - [x] Pagination
  - [x] Actions: View, Cancel, Reschedule
- [x] Create `pages/patient/AppointmentDetail.tsx`:
  - [x] Appointment info (doctor, date, time, status)
  - [x] Pre-visit AI summary (urgency badge, chief complaint, suggested questions)
  - [x] Post-visit summary (if completed: diagnosis, medication schedule, follow-up)
  - [x] Prescription view
  - [x] Cancel / Reschedule buttons (if eligible)
- [x] Create `components/SummaryCard.tsx` — renders AI summaries with urgency color coding
- [x] Create `components/PrescriptionView.tsx` — patient-friendly prescription display

### 6.7 Patient Portal — Settings
- [x] Create `pages/patient/Settings.tsx`:
  - [x] Profile edit (name, phone)
  - [x] "Connect Google Calendar" button → OAuth flow
  - [x] Connected account status indicator

### Phase 6 Checkpoint ✓
- [x] Auth flow works: register, login, token refresh, logout
- [x] Patient can search doctors by specialisation
- [x] Booking flow: date → slot → symptom → confirm (all working)
- [x] Appointment list with status filters
- [x] Appointment detail shows AI summaries and prescriptions
- [x] Google Calendar connect flow works
- [x] Responsive layout on mobile + desktop

---

## Phase 7 — Frontend: Doctor & Admin Portals `⚡ FLASH`
**Goal:** Doctor and admin portal interfaces.
**Estimated Duration:** 2–3 days
**Assigned Model:** Gemini 3.6 Flash — more React pages, dashboard layouts, form components

### 7.1 Doctor Portal — Dashboard
- [x] Create `pages/doctor/Dashboard.tsx`:
  - [x] Today's appointment schedule (timeline view)
  - [x] Each appointment card: patient name, time, urgency badge from AI summary
  - [x] Quick action: click to view appointment detail

### 7.2 Doctor Portal — Appointments
- [x] Create `pages/doctor/Appointments.tsx`:
  - [x] List of all appointments
  - [x] Filter by date range, status
  - [x] Pagination
- [x] Create `pages/doctor/AppointmentDetail.tsx`:
  - [x] Patient info + symptoms
  - [x] Pre-visit AI summary (urgency, chief complaint, 3 suggested questions)
  - [x] Post-visit notes form: text area for clinical notes
  - [x] Prescription form: medication name, dosage, frequency, duration (add multiple)
  - [x] "Submit Notes" button → dispatches LLM post-visit summary
  - [x] "Mark Completed" button
  - [x] View generated patient-friendly summary after submission
- [x] Create `pages/doctor/Settings.tsx` — profile, Google Calendar connect

### 7.3 Admin Portal — Dashboard
- [x] Create `pages/admin/Dashboard.tsx`:
  - [x] System stats: total doctors, total patients, total appointments
  - [x] Appointment status breakdown (chart or cards)
  - [x] Recent activity feed

### 7.4 Admin Portal — Doctor Management
- [x] Create `pages/admin/Doctors.tsx`:
  - [x] List of all doctors (name, specialisation, status, slot count)
  - [x] "Add Doctor" button → modal/form
  - [x] Edit and deactivate actions per doctor
- [x] Create `pages/admin/DoctorDetail.tsx`:
  - [x] Working hours editor (per day-of-week: start time, end time, toggle on/off)
  - [x] Slot duration selector (15/30/45/60 min)
  - [x] Specialisation edit

### 7.5 Admin Portal — Leave Management
- [x] Create `pages/admin/LeaveManager.tsx`:
  - [x] Calendar view of existing leave dates
  - [x] "Add Leave" form: date picker + optional reason
  - [x] On submit: show confirmation dialog listing affected appointments
  - [x] After confirmation: display notification count (X patients notified)
  - [x] Remove leave action

### 7.6 Real-Time Updates
- [x] Integrate WebSocket hook in appointment detail pages
- [x] Toast notifications: booking confirmed, summary ready, appointment cancelled
- [x] Auto-refresh appointment lists on status change via WebSocket

### Phase 7 Checkpoint ✓
- [x] Doctor can view today's schedule with AI summaries
- [x] Doctor can submit notes + prescription → post-visit summary generated
- [x] Admin can create/edit/deactivate doctors
- [x] Admin can manage leave → affected patients shown and notified
- [x] Real-time updates working across portals

---

## Phase 8 — Testing & Quality Assurance `⚡ FLASH`
**Goal:** Comprehensive test coverage matching Metis patterns.
**Estimated Duration:** 2 days
**Assigned Model:** Gemini 3.6 Flash — pytest fixtures, test case writing, assertions

### 8.1 Test Infrastructure
- [x] Create `tests/__init__.py`
- [x] Create `tests/conftest.py`:
  - [x] Async SQLite in-memory test database fixture
  - [x] Override `get_db()` FastAPI dependency
  - [x] `test_client` fixture via httpx `ASGITransport`
  - [x] `auth_client(role)` fixture — pre-authenticated with JWT for given role
  - [x] Factory fixtures: `create_test_user()`, `create_test_doctor()`, `create_test_appointment()`

### 8.2 Unit Tests
- [x] Create `tests/unit/test_auth.py`:
  - [x] Test password hashing + verification
  - [x] Test JWT access token creation + decode
  - [x] Test JWT refresh token creation + decode
  - [x] Test expired token rejection
  - [x] Test role-based access
- [x] Create `tests/unit/test_slot_service.py`:
  - [x] Test slot generation from working hours
  - [x] Test available slots exclude booked/held
  - [x] Test slot hold creates HELD appointment
  - [x] Test slot confirm transitions HELD → CONFIRMED
  - [x] Test slot hold rejects conflict
  - [x] Test slot on leave date rejected
- [x] Create `tests/unit/test_llm_service.py`:
  - [x] Test pre-visit prompt formatting
  - [x] Test post-visit prompt formatting
  - [x] Test JSON response parsing
  - [x] Test fallback on API failure
  - [x] Test retry logic (mock Gemini)
- [x] Create `tests/unit/test_repositories.py`:
  - [x] Test UserRepository CRUD
  - [x] Test DoctorRepository CRUD + leave
  - [x] Test AppointmentRepository CRUD + status transitions
  - [x] Test ReminderRepository create + query active
- [x] Create `tests/unit/test_schemas.py`:
  - [x] Test Pydantic validation for edge cases
  - [x] Test required fields, enum values, constraints

### 8.3 Integration Tests
- [x] Create `tests/integration/test_api_endpoints.py`:
  - [x] Test all auth endpoints
  - [x] Test all admin endpoints (with + without admin role)
  - [x] Test all patient endpoints
  - [x] Test all doctor endpoints
  - [x] Mock Celery `.delay()` to avoid Redis dependency
- [x] Create `tests/integration/test_booking_flow.py`:
  - [x] Test: hold → symptom → confirm → notes → complete (full lifecycle)
- [x] Create `tests/integration/test_leave_conflict.py`:
  - [x] Test: book → mark leave → verify auto-cancellation
- [x] Create `tests/integration/test_double_booking.py`:
  - [x] Test: concurrent hold attempts → only one succeeds

### 8.4 End-to-End Tests
- [x] Create `tests/e2e/test_complete_flow.py`:
  - [x] Full journey: register patient → search doctor → book → symptom → pre-visit summary → doctor notes → post-visit summary → medication reminders

### 8.5 Frontend Validation
- [x] Run `cd frontend && npm run lint` — zero errors
- [x] Run `cd frontend && npm run build` — zero TypeScript errors
- [x] Manual cross-browser check (Chrome, Firefox)

### 8.6 Run Full Suite
- [x] `pytest -v --tb=short` — all tests pass
- [x] Fix any failures
- [x] Document test coverage

### Phase 8 Checkpoint ✓
- [x] All unit tests passing
- [x] All integration tests passing
- [x] E2E test passing
- [x] Frontend lint + build clean
- [x] No regressions in existing functionality

---

## Phase 9 — Documentation & Deployment `⚡ FLASH`
**Goal:** Complete all assignment deliverables and deploy.
**Estimated Duration:** 2 days
**Assigned Model:** Gemini 3.6 Flash — README, system design write-up, Dockerfiles, deployment config

### 9.1 README.md
- [x] Project title + description
- [x] Architecture diagram (Mermaid)
- [x] Tech stack table
- [x] Features list
- [x] Prerequisites (Python 3.11+, Node 20+, PostgreSQL 16, Redis 7)
- [x] Quick start with Docker Compose
- [x] Local development setup (manual step-by-step)
- [x] `.env.example` reference with all variables explained
- [x] Database schema diagram
- [x] API endpoint summary table
- [x] LLM prompts used (with example I/O)
- [x] Google Calendar OAuth setup instructions
- [x] Deployment instructions
- [x] Hosted application URL

### 9.2 System Design Write-Up
- [x] Create `docs/SYSTEM_DESIGN.md` (≤ 800 words):
  - [x] Double-booking prevention: 3-layer defense (partial unique index + SELECT FOR UPDATE SKIP LOCKED + app validation)
  - [x] Doctor leave conflict handling: async cascade (query → cancel → email → calendar cleanup)
  - [x] Slot hold mechanism: 5-min TTL with Celery Beat cleanup every 60s
  - [x] Notification failure handling: Celery retry with exponential backoff (3 attempts) + dead-letter logging
- [x] Word count check: ≤ 800 words

### 9.3 Technical Documentation
- [x] Create `docs/API_DOCS.md` — all endpoints with request/response schemas + curl examples
- [x] Create `docs/LOCAL_SETUP.md` — step-by-step dev environment guide
- [x] Create `docs/GOOGLE_CALENDAR_SETUP.md` — GCP project, OAuth consent, API enabling, credential download
- [x] Create `docs/LLM_PROMPTS.md` — all prompts, example inputs/outputs, rationale, fallback behavior

### 9.4 Docker Deployment
- [x] Create `Dockerfile.backend` — Python 3.11-slim, install system deps, pip install, expose port
- [x] Create `Dockerfile.frontend` — multi-stage: Node 20 build → Nginx Alpine serve
- [x] Create `docker-compose.yml` — 5 services (db, redis, backend, worker, frontend)
- [x] Create `nginx.conf` — SPA routing + /api/ proxy + WebSocket proxy
- [x] Test: `docker-compose up --build` — all services start, app accessible at localhost
- [x] Test: full flow works through Docker deployment

### 9.5 Cloud Deployment
- [x] Deploy PostgreSQL + Redis (Render/Railway free tier)
- [x] Deploy backend + Celery worker (Render/Railway)
- [x] Deploy frontend (Vercel or same platform)
- [x] Configure environment variables on hosting platform
- [x] Verify hosted URL is accessible and functional
- [x] Run smoke test on hosted version: register → login → book → cancel
- [x] Add hosted URL to README

### 9.6 Final Submission Checklist
- [x] App runs without errors locally (`docker-compose up --build`)
- [x] App runs without errors on hosted URL
- [x] Code files properly structured and named
- [x] `.gitignore` blocks: node_modules, __pycache__, .env, dist/, venv/, *.pyc, .idea/, .vscode/
- [x] No unnecessary files committed (verified via `git status`)
- [x] Branch name is `main`
- [x] Repository is public and downloadable
- [x] Repository size within GitHub limits
- [x] README complete: setup guide, .env.example, API docs, DB schema, LLM prompts, Google Calendar setup
- [x] Hosted application URL included in README
- [x] System design write-up present and ≤ 800 words
- [x] Dependencies are minimal — only what's strictly required
- [x] Zip file of complete source code prepared (if needed for alternative submission)

### Phase 9 Checkpoint ✓
- [x] All 5 deliverables complete:
  1. [ ] Complete source code (git repo)
  2. [ ] README with all required sections
  3. [ ] Hosted application URL (working)
  4. [ ] System design write-up (≤ 800 words)
  5. [ ] Documentation suite in docs/

---

## Summary

| Phase | Focus | Est. Days | Status |
|:------|:------|:---------:|:------:|
| **Phase 1** | Foundation & Scaffolding | 2–3 | `[ ]` |
| **Phase 2** | Core Backend Services | 3–4 | `[ ]` |
| **Phase 3** | Celery Workers & Background Jobs | 2 | `[ ]` |
| **Phase 4** | LLM Integration | 1–2 | `[ ]` |
| **Phase 5** | Email & Google Calendar | 2–3 | `[ ]` |
| **Phase 6** | Frontend: Auth & Patient Portal | 3–4 | `[ ]` |
| **Phase 7** | Frontend: Doctor & Admin Portals | 2–3 | `[ ]` |
| **Phase 8** | Testing & Quality Assurance | 2 | `[ ]` |
| **Phase 9** | Documentation & Deployment | 2 | `[ ]` |
| **Phase 10** | **Differentiators & Polish** | **2–3** | `[ ]` |
| | **Total Estimated** | **21–27** | |

> **Note:** Phases 2–5 (backend) and Phases 6–7 (frontend) can run in parallel to compress to ~14–17 days.

---

## Phase 10 — Differentiators & Polish ⭐ `⚡ FLASH`
**Goal:** Every feature below is what separates our submission from the other 499. This is what makes evaluators pause and say "this one is different."
**Estimated Duration:** 2–3 days (can be partially parallelized with Phases 6–9)
**Assigned Model:** Gemini 3.6 Flash — UI polish, animations, charts, landing page, PDF generation, QR codes

> **Reference:** Each task is tagged with its ID from the Standout Strategy in the project plan (A1–A12, B1–B10, C1–C10, D1–D6).

### 10.1 🎨 UI/UX Polish — Picture Perfect First Impression

#### Landing Page [A1]
- [x] Create `pages/Landing.tsx` with premium SaaS-quality design:
  - [x] Frosted glass sticky header: `backdrop-blur` + `bg-background/60` + border-b
  - [x] Social proof badge: "Trusted by 500+ Clinics" with award icon
  - [x] Gradient headline: `bg-gradient-to-r from-teal-600 to-blue-600 bg-clip-text text-transparent`
  - [x] Hero section with feature highlights + animated CTA button
  - [x] Metric proof grid: "99.9% Uptime", "10K+ Appointments Managed", "50+ Clinics"
  - [x] Feature cards grid with icon containers: `bg-primary/10 rounded-xl` + `shadow-medium hover:shadow-large transition-all duration-300`
  - [x] Compliance/trust badges: "HIPAA-Aware", "Data Encrypted", "SOC2 Practices"
  - [x] Full-width gradient CTA section at bottom
  - [x] "Watch Demo" button → triggers onboarding tour in dashboard
  - [x] Footer with links

#### Dark / Light Mode [A2]
- [x] Create `components/theme-provider.tsx` — React Context + `localStorage` + `classList` sync
- [x] Create `components/mode-toggle.tsx` — smooth icon rotation: `rotate-0 scale-100 dark:-rotate-90 dark:scale-0`
- [x] Define HSL CSS variables in `index.css`:
  - [x] Light theme: clean white surfaces, soft shadows, teal/blue accents
  - [x] Dark theme: midnight navy (`222 84% 5%`), not harsh black, elevated card surfaces
- [x] Test: toggle smoothly with no flash, persists across page refresh

#### Interactive Onboarding Tour [A3]
- [x] Install `react-joyride@^3.2.0`
- [x] Create patient tour (4 steps):
  - [x] Step 1: "Search for a doctor by specialisation" → target `.tour-doctor-search`
  - [x] Step 2: "Pick an available time slot" → target `.tour-slot-picker`
  - [x] Step 3: "Describe your symptoms for an AI summary" → target `.tour-symptom-form`
  - [x] Step 4: "Track all your appointments here" → target `.tour-appointments`
- [x] Create doctor tour (3 steps):
  - [x] Step 1: "Today's schedule with AI-powered patient summaries" → target `.tour-schedule`
  - [x] Step 2: "Review symptoms and urgency before the consultation" → target `.tour-pre-visit`
  - [x] Step 3: "Submit notes here — an AI summary is sent to your patient" → target `.tour-notes`
- [x] Auto-trigger on first login (`localStorage` flag: `healthcare_tour_completed_<role>`)
- [x] "Watch Demo" on Landing page clears flag + routes to dashboard tour
- [x] Style: primary color `#0d9488` (teal-600), skip button, progress dots

#### Skeleton Loaders [A4]
- [x] Create `components/SkeletonCard.tsx` — shimmer effect card placeholder
- [x] Create `components/SkeletonTable.tsx` — shimmer effect table rows
- [x] Create `components/SkeletonSlotGrid.tsx` — shimmer slot grid
- [x] Replace all loading spinners with skeleton loaders:
  - [x] Doctor search results
  - [x] Appointment list
  - [x] Slot grid while loading
  - [x] Dashboard stats cards
  - [x] AI summary cards while LLM is processing

#### Micro-Animations [A5]
- [x] Install `tailwindcss-animate@^1.0.7`
- [x] Add entrance animations: cards fade-in + slide-up on mount
- [x] Add hover effects: card lift (`hover:-translate-y-1`), button scale (`hover:scale-[1.02]`)
- [x] Add smooth tab transitions: content fade between tabs
- [x] Add accordion animations for expandable sections
- [x] Add button press feedback: `active:scale-95 transition-transform`
- [x] Add page transition animations between routes

#### Slot Hold Countdown Timer [A6]
- [x] Create `components/HoldCountdown.tsx`:
  - [x] Visual countdown: `5:00` → `0:00` with large clear font
  - [x] Progress ring or progress bar depleting
  - [x] Color shift: green (>3min) → amber (1–3min) → red (<1min) → pulsing red (<30s)
  - [x] Warning text at 1 minute: "Your hold expires soon! Confirm to secure your slot."
  - [x] On expiry: auto-redirect to slot selection with toast: "Hold expired. Please select a new slot."
- [x] Integrate into `BookAppointment.tsx` Step 2

#### Urgency Color-Coded AI Cards [A7]
- [x] Update `components/SummaryCard.tsx`:
  - [x] Pulsing urgency badge: 🟢 Low (teal), 🟡 Medium (amber), 🔴 High (red)
  - [x] Card border color matches urgency
  - [x] Chief complaint in bold
  - [x] Suggested questions as numbered list with doctor icon
  - [x] "Processing..." state with animated brain icon while LLM is working

#### Dashboard Analytics Charts [A8]
- [x] Install `recharts@^2.15.0`
- [x] Patient Dashboard:
  - [x] Appointment history trend (line chart — last 6 months)
- [x] Doctor Dashboard:
  - [x] Weekly appointment load (bar chart)
  - [x] Urgency distribution (donut chart: Low/Medium/High)
- [x] Admin Dashboard:
  - [x] Appointments per day (area chart — last 30 days)
  - [x] Status breakdown (donut: Confirmed/Completed/Cancelled)
  - [x] Doctor utilization (horizontal bar chart)
  - [x] Specialisation demand (pie chart)

#### Beautiful HTML Email Templates [A9]
- [x] Design responsive HTML email template base (600px wide, inline CSS)
- [x] Clinic logo + brand header
- [x] Template: booking confirmation (doctor photo, slot details, QR code)
- [x] Template: appointment reminder (countdown: "Tomorrow at 10:30 AM")
- [x] Template: cancellation notice (reason, rebooking link)
- [x] Template: post-visit summary (formatted diagnosis, medication table)
- [x] Template: medication reminder (pill icon, dosage, time)
- [x] Test: renders correctly in Gmail, Outlook, Apple Mail

#### Toast Notifications [A10]
- [x] Install `sonner@^1.7.0`
- [x] Configure Toaster in App.tsx with healthcare theme
- [x] Add toasts for: booking success, cancellation, summary ready, hold expiring, error states
- [x] Style: success (teal), warning (amber), error (red), info (blue)

#### Mobile-Responsive Design [A11]
- [x] Sidebar collapses to hamburger menu on mobile (<768px)
- [x] Bottom navigation bar on mobile for key actions
- [x] Slot picker: swipeable time slots on touch screens
- [x] Appointment cards: full-width stacked layout on mobile
- [x] Test: Chrome DevTools responsive modes (iPhone SE, iPad, Galaxy S20)

#### Command Palette [A12]
- [x] Install `cmdk@^1.1.0`
- [x] Create `components/CommandPalette.tsx`:
  - [x] Trigger: Cmd+K (Mac) / Ctrl+K (Windows)
  - [x] Search: doctors, appointments, navigate to pages
  - [x] Quick actions: "Book Appointment", "View Today's Schedule", "Add Doctor"
  - [x] Role-scoped: patients see patient actions, admins see admin actions
  - [x] Keyboard navigation: arrow keys + enter

---

### 10.2 ⚡ Functional — Beyond the Requirements

#### PDF Prescription Download [B1]
- [x] Install `@react-pdf/renderer@^4.0.0`
- [x] Create `components/PrescriptionPDF.tsx`:
  - [x] Clinic letterhead + logo
  - [x] Patient name, date, doctor name
  - [x] Diagnosis summary
  - [x] Medication table: name, dosage, frequency, duration
  - [x] Follow-up date
  - [x] Doctor signature placeholder
- [x] "Download PDF" button on AppointmentDetail page
- [x] Test: renders clean, printable A4 PDF

#### QR Code for Appointment [B2]
- [x] Install `qrcode.react@^4.0.0`
- [x] Generate QR on booking confirmation containing appointment ID + patient name
- [x] Display QR on AppointmentDetail page
- [x] Include QR in booking confirmation email
- [x] Concept: patient scans at clinic front desk for instant check-in

#### Smart Symptom Autocomplete [B3]
- [x] Create `data/common_symptoms.json` — curated list of 200+ common symptoms (based on ICD-10 common terms)
- [x] Create `components/SymptomAutocomplete.tsx`:
  - [x] Typeahead/combobox with fuzzy search
  - [x] Shows matching symptoms as user types
  - [x] Multi-select: can tag multiple symptoms
  - [x] Free-text area for additional description
  - [x] Category grouping: "General", "Pain", "Respiratory", "Digestive", etc.

#### Doctor Availability Heatmap [B4]
- [x] Create `components/AvailabilityHeatmap.tsx`:
  - [x] 7-day × time-slots grid (weekly view)
  - [x] Color intensity: green (many open slots) → yellow (few) → red (fully booked) → grey (not working)
  - [x] Clickable: selecting a time slot navigates to booking
  - [x] Tooltip: "X of Y slots available"

#### CSV Export [B5]
- [x] Create `lib/exportCsv.ts` — generic CSV export utility
- [x] Patient: "Export My Appointments" button on Appointments page
- [x] Admin: "Export All Appointments" + "Export Patient List" buttons
- [x] Doctor: "Export Consultation Log" button
- [x] File naming: `appointments_export_2026-08-20.csv`

#### Medical Document Upload [B6]
- [x] Install `react-dropzone@^14.3.0`
- [x] Create `components/MedicalFileUpload.tsx`:
  - [x] Drag-and-drop zone with animated border on drag-over
  - [x] Accept: PDF, PNG, JPG (up to 5MB)
  - [x] File preview card with size, name, remove button
  - [x] Upload to backend and attach to appointment record
- [x] Backend: `POST /api/appointments/{id}/documents` — file upload endpoint
- [x] Store files on disk (or S3 in production)
- [x] Display uploaded documents on AppointmentDetail page

#### Unsaved Changes Guard [B7]
- [x] Create `hooks/useUnsavedChangesGuard.ts`:
  - [x] `beforeunload` event listener when form is dirty
  - [x] In-app navigation interception with confirmation dialog
  - [x] `window.isConsultationEditing` flag for sidebar click interception
- [x] Apply to: doctor's post-visit notes form, admin's doctor profile edit form

#### Relative Timestamps [B8]
- [x] Install `date-fns@^3.6.0`
- [x] Use `formatDistanceToNow` throughout:
  - [x] Appointment lists: "in 2 hours", "3 days ago"
  - [x] Notification toasts: "Just now", "5 minutes ago"
  - [x] Activity feed: "Updated 1 hour ago"
- [x] Smart formatting: show relative for <7 days, absolute for older

#### Patient Feedback / Rating [B9]
- [x] Backend: Add `DoctorReview` model (appointment_id FK, rating 1-5, comment, created_at)
- [x] Backend: `POST /api/appointments/{id}/review` — submit rating + comment
- [x] Backend: `GET /api/doctors/{id}/reviews` — list reviews with average rating
- [x] Frontend: star rating component on completed appointment detail
- [x] Frontend: doctor profile shows average rating + review count
- [x] Test: submit review → appears on doctor profile

#### Admin Audit Log [B10]
- [x] Backend: Add `AuditLog` model (admin_id FK, action, target_type, target_id, details JSON, created_at)
- [x] Backend: middleware/decorator to auto-log admin actions
- [x] Backend: `GET /api/admin/audit-log` — paginated log with filters
- [x] Frontend: `admin/AuditLog.tsx` — table with action type, admin, timestamp, details
- [x] Log events: doctor created/updated/deleted, leave marked/removed, system config changes

---

### 10.3 🔧 Technical Polish

#### Rate Limiting [C7]
- [x] Install `slowapi` for FastAPI
- [x] Apply rate limits:
  - [x] `/api/auth/login`: 5 requests/minute (brute force prevention)
  - [x] `/api/auth/register`: 3 requests/minute
  - [x] General API: 100 requests/minute per user
- [x] Return 429 with `Retry-After` header
- [x] Add to system design write-up

#### Security Headers [C10]
- [x] Add middleware for security headers:
  - [x] `X-Content-Type-Options: nosniff`
  - [x] `X-Frame-Options: DENY`
  - [x] `X-XSS-Protection: 1; mode=block`
  - [x] `Strict-Transport-Security` (for production)
- [x] Input sanitization on all text fields (prevent XSS)
- [x] SQL injection prevention (already via SQLAlchemy ORM, but verify)

#### Interactive API Documentation [C8]
- [x] Configure FastAPI Swagger UI at `/docs` with custom title + description
- [x] Configure ReDoc at `/redoc`
- [x] Add detailed docstrings to all route handlers
- [x] Add example request/response in Pydantic schemas (`model_config = {"json_schema_extra": {...}}`)
- [x] Group endpoints with tags: "Auth", "Admin", "Patient", "Doctor"
- [x] Screenshot Swagger UI for README

---

### 10.4 📚 Documentation — The Silent Differentiator

#### Mermaid Sequence Diagrams [D2]
- [x] Booking flow sequence diagram (Patient ↔ Frontend ↔ Backend ↔ DB ↔ Celery ↔ Email/Calendar)
- [x] Leave conflict cascade sequence diagram
- [x] LLM retry flow sequence diagram
- [x] Add to README and/or docs/SYSTEM_DESIGN.md

#### Video Demo [D3]
- [x] Record 30–60 second screen recording:
  - [x] Landing page → Register → Login → Search doctor → Book slot → Symptom form → AI summary
  - [x] Doctor view: pre-visit summary → add notes → post-visit summary
  - [x] Admin: create doctor, mark leave
- [x] Convert to GIF or upload to YouTube/Loom
- [x] Embed in README: `![Demo](link)` or `[▶ Watch Demo](link)`

#### Postman Collection [D4]
- [x] Create `healthcare-api.postman_collection.json`:
  - [x] All endpoints organized by folder (Auth, Admin, Patient, Doctor)
  - [x] Pre-configured variables: `{{base_url}}`, `{{access_token}}`
  - [x] Example request bodies for each endpoint
  - [x] Auto-set token from login response
- [x] Include in repo root
- [x] Mention in README: "Import into Postman for instant API testing"

#### Code Comments [D6]
- [x] Add `# WHY:` comments on non-obvious decisions:
  - [x] `SELECT FOR UPDATE SKIP LOCKED` — explain race condition prevention
  - [x] `hold_expires_at` — explain temporary reservation pattern
  - [x] LLM retry logic — explain degradation strategy
  - [x] Celery `run_async()` bridge — explain sync/async boundary
- [x] Add module-level docstrings to all service files

---

### Phase 10 Checkpoint ✓
- [x] Landing page looks like a polished SaaS product
- [x] Dark/light mode toggle works seamlessly
- [x] Onboarding tour guides new users through each portal
- [x] Skeleton loaders replace all spinners
- [x] Micro-animations on hover, click, and transitions
- [x] Hold countdown timer with urgency color shift
- [x] Dashboard charts rendering with real data
- [x] PDF prescription downloads correctly
- [x] QR code generates on booking
- [x] Symptom autocomplete working
- [x] Availability heatmap rendering
- [x] CSV export downloads correctly
- [x] Command palette (Cmd+K) works
- [x] Rate limiting active on auth endpoints
- [x] Postman collection importable and working
- [x] Video demo recorded and embedded in README
- [x] **Overall impression: "This doesn't look like an intern project"**
