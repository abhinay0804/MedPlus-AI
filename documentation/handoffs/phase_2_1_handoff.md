# Phase 2.1 Handoff — Doctor Management (Admin CRUD & Leave)

**Completed by:** Gemini 3.6 Flash
**Date:** 2026-08-20
**Status:** ✅ Complete

---

## What Was Built
- Doctor Repository (`server/repositories/doctor_repository.py`):
  - `create_doctor`, `update_doctor`, `list_doctors`, `get_by_id`, `get_by_user_id`
  - Leave management: `add_leave`, `remove_leave`, `get_leaves`, `is_doctor_on_leave`
- Doctor Pydantic Schemas (`server/schemas/doctor_schemas.py`):
  - `WorkingHoursDay`, `DoctorCreate`, `DoctorUpdate`, `DoctorResponse`, `LeaveCreate`, `LeaveResponse`, `SlotResponse`, `AdminDashboardStats`
- Admin REST API Routes (`server/routes/admin_routes.py`):
  - `POST /api/admin/doctors` (creates Doctor user + DoctorProfile)
  - `GET /api/admin/doctors` (list all doctors)
  - `GET /api/admin/doctors/{id}` (single doctor detail)
  - `PUT /api/admin/doctors/{id}` (update doctor profile & user details)
  - `DELETE /api/admin/doctors/{id}` (soft-deactivate doctor profile)
  - `POST /api/admin/doctors/{id}/leave` (mark leave date & auto-cancel affected HELD/CONFIRMED appointments)
  - `GET /api/admin/doctors/{id}/leave` (list leave dates)
  - `DELETE /api/admin/doctors/{id}/leave/{leave_id}` (remove leave date)
  - `GET /api/admin/dashboard` (admin dashboard summary statistics)
- Registered `admin_routes.router` in `server/app.py`
- Integration tests in `tests/integration/test_admin_routes.py` passing 100%

## Key Files Created / Modified

| File | Purpose |
|------|---------|
| `server/repositories/doctor_repository.py` | Async database queries for doctor profiles and leave records |
| `server/schemas/doctor_schemas.py` | Pydantic request/response schemas for doctor administration |
| `server/routes/admin_routes.py` | Admin portal REST API endpoints protected by `require_role(UserRole.ADMIN)` |
| `server/app.py` | Router included at `/api/admin` |
| `tests/integration/test_admin_routes.py` | Integration test suite verifying doctor CRUD, leave marking, and RBAC protection |

## Architecture Decisions Made
- All admin endpoints are strictly protected by `dependencies=[Depends(require_role(UserRole.ADMIN))]`.
- Marking a doctor on leave immediately queries all active appointments (`CONFIRMED` and `HELD`) on that date and transitions their status to `CANCELLED`. Background notification dispatches will be attached in Celery workers.
- Deactivating a doctor sets `is_active = False` rather than hard-deleting the database record.

## How Things Connect
- `DoctorProfile` has a 1-to-1 relation with `User` (`user_id`). `selectinload(DoctorProfile.user)` is used in repository queries so `user` details are pre-fetched for responses.
- `DoctorLeave` belongs to `DoctorProfile` via `doctor_id`.

## Database State
- Tables in use: `users`, `doctor_profiles`, `doctor_leaves`, `appointments`.
- Seed data available from `scripts/seed_db.py`.

## Known Issues / Incomplete Items
- None. Section 2.1 is complete.

## What the Next Phase Needs to Know
- **Phase 2.2 is assigned to `🧠 SONNET`**.
- Phase 2.2 involves building `server/services/slot_service.py` — generating slots from working hours, computing availability, and implementing 5-minute slot reservation holds with `SELECT FOR UPDATE SKIP LOCKED` row locking to prevent double-booking.

## How to Verify This Phase Works
```bash
# Run admin routes integration tests
PYTHONPATH=. ./venv/bin/pytest tests/integration/test_admin_routes.py
```
