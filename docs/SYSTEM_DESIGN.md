# System Architecture & Technical Design Document

**Project:** HealthCare Appointment & Follow-Up Manager  
**Version:** 1.0.0  
**Compliance Target:** HIPAA & Medical Data Privacy Standards  

---

## 1. Executive Summary & Overview

The HealthCare Appointment & Follow-Up Manager is a modern, full-stack medical consultation and scheduling engine. It bridges real-time availability management with Google Gemini 2.0 AI symptom triage and automated post-visit follow-up notes.

---

## 2. 3-Layer Concurrency & Slot Locking Engine

To guarantee zero double-booking across concurrent patient requests, the platform implements a 3-tier concurrency architecture:

```
[ Patient Client ] ---> [ FastAPI Service ] ---> [ SELECT FOR UPDATE SKIP LOCKED ] (PostgreSQL 16)
                                 |                          | (SQLite Fallback)
                                 v                          v
                        [ 5-Min TTL Hold ] <---> [ Redis Key Expiry & Celery Beat ]
```

1. **PostgreSQL Pessimistic Row Locking (`SELECT FOR UPDATE SKIP LOCKED`):**
   When a patient initiates a hold, PostgreSQL locks the exact slot row. Concurrent requests immediately skip locked rows without thread blocking or deadlock.
2. **SQLite Atomic Concurrency Fallback:**
   For local development/testing without PostgreSQL, isolated atomic transaction checks verify slot status before setting `HELD`.
3. **5-Minute Temporary Slot Hold TTL:**
   Slots are placed in a transient `HELD` status with `hold_expires_at = NOW() + 5 minutes`. If the patient fails to submit symptoms or confirm within 300 seconds, Celery Beat automatically releases the slot back to `AVAILABLE`.

---

## 3. Doctor Leave Cascade Algorithm

When an admin marks a doctor as on leave for a specific date:
1. A `DoctorLeave` record is created.
2. A single atomic database transaction identifies all `CONFIRMED` or `HELD` appointments for that doctor on that date.
3. Appointments are transitioned to `CANCELLED`.
4. Celery dispatches `handle_doctor_leave_task` asynchronously to email affected patients and revoke synced Google Calendar events.

---

## 4. LLM Integration & Resiliency Pipeline

```
[ Symptom Submission ] ---> [ Celery Worker ] ---> [ Google Gemini 2.0 Flash ]
                                                           | (Success)
                                                           v
                                                  [ Urgency JSON Output ]
                                                           | (Failure / Rate Limit)
                                                           v
                                                  [ Exponential Backoff (2s, 4s, 8s) ]
                                                           | (Final Failure)
                                                           v
                                                  [ Deterministic Fallback Dict ]
```

- **Pre-Visit Triage:** Formats patient symptoms into urgency categories (`LOW`, `MEDIUM`, `HIGH`), chief complaint, and 3 suggested clinical questions for the physician.
- **Post-Visit Explanation:** Transforms physician clinical notes & prescriptions into patient-friendly language and extracts structured medication schedules (`MedicationReminder`).
- **Resiliency:** 3-attempt exponential backoff retry loop with JSON code-block stripping and non-blocking deterministic fallback dicts.

---

## 5. Background Task Architecture (Celery & Redis Pub/Sub)

- **Celery Beat Schedules:**
  - `release_expired_holds_task` (Every 60s)
  - `send_appointment_reminders_task` (Every 15m)
  - `send_medication_reminders_task` (Every 30m)
  - `retry_failed_llm_task` (Every 15m)
  - `retry_failed_emails_task` (Every 5m)
- **WebSocket Live Updates:**
  Updates are published to Redis channels (`appointment:<id>`). FastAPI lifespan runs an async Redis subscriber that broadcasts JSON payloads to connected browser clients in real time.
