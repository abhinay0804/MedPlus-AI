# REST API & WebSocket Documentation

**Base API Path:** `/api`  
**WebSocket Path:** `/ws/appointments/{appointment_id}?token={jwt_token}`  

---

## 1. Authentication Endpoints (`/api/auth`)

### `POST /api/auth/register`
Registers a new user account.
- **Request Body:**
  ```json
  {
    "email": "patient@example.com",
    "password": "SecurePassword123!",
    "full_name": "John Doe",
    "phone": "+15551234567",
    "role": "PATIENT"
  }
  ```
- **Response (201 Created):** `UserResponse`

### `POST /api/auth/login`
Authenticates a user and returns access and refresh JWT tokens.
- **Request Body:**
  ```json
  {
    "email": "patient@example.com",
    "password": "SecurePassword123!"
  }
  ```
- **Response (200 OK):** `TokenResponse` (`access_token`, `refresh_token`, `token_type`, `user`)

### `POST /api/auth/refresh`
Rotates access token using a valid refresh token.

### `GET /api/auth/me`
Returns current authenticated user details.

---

## 2. Patient Endpoints (`/api/patient`)

### `GET /api/patient/doctors`
Search doctors by specialisation.
- **Query Params:** `specialisation` (optional)

### `GET /api/patient/doctors/{id}/slots`
Get available consultation time slots for a specific date.
- **Query Params:** `date` (YYYY-MM-DD)

### `POST /api/patient/appointments`
Hold a 5-minute temporary slot.
- **Request Body:**
  ```json
  {
    "doctor_id": "uuid",
    "slot_start": "2026-08-25T10:00:00Z",
    "slot_end": "2026-08-25T10:30:00Z"
  }
  ```

### `POST /api/patient/appointments/{id}/symptoms`
Submit pre-visit symptoms for an held appointment.

### `POST /api/patient/appointments/{id}/confirm`
Confirm appointment booking.

### `PUT /api/patient/appointments/{id}/reschedule`
Reschedule an existing appointment to a new slot.

---

## 3. Doctor Endpoints (`/api/doctor`)

### `GET /api/doctor/appointments`
List doctor's scheduled appointments for a given date.

### `POST /api/doctor/appointments/{id}/notes`
Save clinical notes and prescription text.

### `PUT /api/doctor/appointments/{id}/complete`
Mark appointment status as `COMPLETED`. Triggers post-visit AI summary generation.

---

## 4. Admin Endpoints (`/api/admin`)

### `POST /api/admin/doctors`
Create a new doctor profile and user account.

### `POST /api/admin/doctors/{id}/leave`
Mark doctor on leave for a specific date.

### `GET /api/admin/dashboard`
Returns platform aggregate statistics and appointment distribution counts.
