# REST API & WebSocket Documentation

**Base API Path:** `/api`  
**WebSocket Path:** `/ws/appointments/{appointment_id}?token={jwt_token}`  

---

## 1. Authentication Endpoints (`/api/auth`)

### `POST /api/auth/register`
Registers a new user account.

### `POST /api/auth/login`
Authenticates a user and returns access and refresh JWT tokens.

### `POST /api/auth/refresh`
Rotates access token using a valid refresh token.

### `GET /api/auth/me`
Returns current authenticated user details.

### `POST /api/auth/otp/send`
Sends an Email OTP for verification.

### `POST /api/auth/otp/verify`
Verifies an Email OTP.

### `GET /api/auth/google/connect`
Initiates Google Calendar OAuth connection.

### `GET /api/auth/google/callback`
Google connect callback to save OAuth tokens and finalize calendar sync.

---

## 2. Patient Endpoints (`/api/patient`)

### `GET /api/patient/doctors`
Search doctors by specialisation.

### `GET /api/patient/doctors/{id}/slots`
Slot calculation: Get available consultation time slots for a specific date.

### `POST /api/patient/appointments`
Hold a 5-minute temporary slot.

### `POST /api/patient/appointments/{id}/symptoms`
Symptom triage: Submit pre-visit symptoms for a held appointment to generate AI triage.

### `POST /api/patient/appointments/{id}/confirm`
Confirm appointment booking.

### `PUT /api/patient/appointments/{id}/reschedule`
Reschedule an existing appointment to a new slot.

### `POST /api/patient/reviews`
Review submits: Submit a review and rating for a completed doctor appointment.

### `GET /api/patient/appointments/{id}/pdf`
PDF download: Download a PDF summary of the appointment, including notes and prescription.

---

## 3. Doctor Endpoints (`/api/doctor`)

### `GET /api/doctor/appointments`
List doctor's scheduled appointments for a given date.

### `GET /api/doctor/analytics/heatmap`
Analytics heatmaps: Get appointment density and patient demographic heatmap data.

### `POST /api/doctor/appointments/{id}/checkin`
OTP verification check-in: Verify patient OTP to securely check-in the patient.

### `POST /api/doctor/appointments/{id}/notes`
Notes submit: Save clinical notes and prescription text.

### `GET /api/doctor/directives`
Directives inbox: Fetch administrative directives or tasks assigned to the doctor.

### `GET /api/doctor/appointments/{id}/briefing`
AI patient briefing: Get an AI-generated briefing of the patient's clinical history before the visit.

### `PUT /api/doctor/appointments/{id}/complete`
Mark appointment status as `COMPLETED`. Triggers post-visit AI summary generation.

---

## 4. Admin Endpoints (`/api/admin`)

### `GET /api/admin/dashboard`
Returns platform aggregate statistics and appointment distribution counts.

### `GET /api/admin/cmo/insights`
CMO AI insights: AI-generated reports on hospital operations and efficiency.

### `POST /api/admin/doctors`
Create a new doctor profile and user account.

### `PUT /api/admin/doctors/{id}/reactivate`
Doctor reactivation: Manually reactivate a suspended doctor's profile and reset demerits.

### `GET /api/admin/doctors/{id}/analytics`
Doctor performance analytics: Fetch metrics, cancellation rates, and demerits.

### `POST /api/admin/doctors/{id}/leave`
Leave approvals: Approve and mark a doctor on leave for specific dates, triggering automatic rescheduling for affected appointments.

### `PUT /api/admin/appointments/{id}/reassign`
Slot reassignments: Manually reassign a patient's appointment to a different doctor or time slot.
