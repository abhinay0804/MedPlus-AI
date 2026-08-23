"""
End-to-End Complete Flow Test
=============================
Validates the full patient & doctor lifecycle over HTTP:
  Patient Register → Search Doctor → View Slots → Hold Slot → Submit Symptoms → Confirm → Doctor Notes & Prescription → Complete.
"""

import pytest
from unittest.mock import patch, MagicMock
from httpx import AsyncClient, ASGITransport
from datetime import datetime, timedelta

from server.app import app


@pytest.mark.asyncio
async def test_full_patient_doctor_e2e_journey():
    mock_task = MagicMock()
    mock_task.delay = MagicMock(return_value=MagicMock(id="mock-task-id"))

    patches = [
        patch("server.routes.patient_routes.generate_pre_visit_summary_task", mock_task),
        patch("server.routes.patient_routes.send_email_task", mock_task),
        patch("server.routes.patient_routes.sync_calendar_event_task", mock_task),
        patch("server.routes.doctor_routes.generate_post_visit_summary_task", mock_task),
    ]

    with patches[0], patches[1], patches[2], patches[3]:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            # 1. Admin Registers & Logins
            admin_reg = await ac.post("/api/auth/register", json={
                "email": "e2e_admin@test.com",
                "password": "AdminPassword123!",
                "full_name": "E2E Admin",
                "role": "ADMIN"
            })
            assert admin_reg.status_code == 201
            admin_token = admin_reg.json()["access_token"]
            admin_h = {"Authorization": f"Bearer {admin_token}"}

            # 2. Admin Creates Doctor Profile
            today = datetime.utcnow().date()
            days_ahead = ((7 - today.weekday()) % 7 or 7) + 7
            target_date = today + timedelta(days=days_ahead)

            doc_res = await ac.post("/api/admin/doctors", json={
                "email": "e2e_doctor@test.com",
                "password": "DoctorPassword123!",
                "full_name": "Dr. E2E Specialist",
                "specialisation": "Dermatology",
                "working_hours": {"mon": {"start": "09:00", "end": "17:00"}},
                "slot_duration_minutes": 30
            }, headers=admin_h)
            assert doc_res.status_code == 201
            doctor_id = doc_res.json()["id"]

            # 3. Patient Registers & Logins
            patient_reg = await ac.post("/api/auth/register", json={
                "email": "e2e_patient@test.com",
                "password": "PatientPassword123!",
                "full_name": "E2E Patient",
                "role": "PATIENT"
            })
            assert patient_reg.status_code == 201
            patient_token = patient_reg.json()["access_token"]
            patient_h = {"Authorization": f"Bearer {patient_token}"}

            # 4. Patient Searches Doctors
            search_res = await ac.get("/api/patient/doctors")
            assert search_res.status_code == 200
            assert len(search_res.json()) >= 1

            # 5. Patient Checks Slots
            slots_res = await ac.get(f"/api/patient/doctors/{doctor_id}/slots?target_date={target_date.isoformat()}")
            assert slots_res.status_code == 200
            slots = slots_res.json()
            available = [s for s in slots if s["is_available"]]
            assert len(available) > 0
            first_slot = available[0]["slot_start"]

            # 6. Patient Holds Slot
            hold_res = await ac.post("/api/patient/appointments", json={
                "doctor_id": doctor_id,
                "slot_start": first_slot
            }, headers=patient_h)
            assert hold_res.status_code == 201
            appointment_id = hold_res.json()["id"]
            assert hold_res.json()["status"] == "HELD"

            # 7. Patient Submits Symptoms
            symptoms_res = await ac.post(f"/api/patient/appointments/{appointment_id}/symptoms", json={
                "symptoms_text": "I have developed a skin rash with mild itching over the last 3 days."
            }, headers=patient_h)
            assert symptoms_res.status_code == 201
            assert symptoms_res.json()["symptoms_text"] == "I have developed a skin rash with mild itching over the last 3 days."

            # 8. Patient Confirms Booking
            confirm_res = await ac.post(f"/api/patient/appointments/{appointment_id}/confirm", headers=patient_h)
            assert confirm_res.status_code == 200
            assert confirm_res.json()["status"] == "PENDING_APPROVAL"

            # 9. Doctor Logins
            doc_login = await ac.post("/api/auth/login", json={
                "email": "e2e_doctor@test.com",
                "password": "DoctorPassword123!"
            })
            assert doc_login.status_code == 200
            doc_token = doc_login.json()["access_token"]
            doc_h = {"Authorization": f"Bearer {doc_token}"}

            # 9.5 Doctor Approves Appointment
            approve_res = await ac.put(f"/api/doctor/appointments/{appointment_id}/approve", headers=doc_h)
            assert approve_res.status_code == 200
            assert approve_res.json()["status"] == "CONFIRMED"

            # 10. Doctor Views Schedule
            doc_appts = await ac.get("/api/doctor/appointments", headers=doc_h)
            assert doc_appts.status_code == 200
            assert len(doc_appts.json()) >= 1

            # 11. Doctor Submits Notes & Prescription
            notes_res = await ac.post(f"/api/doctor/appointments/{appointment_id}/notes", json={
                "doctor_notes": "Patient diagnosed with contact dermatitis. Apply topical cream twice daily.",
                "prescription_text": "Hydrocortisone 1% cream apply twice daily for 5 days."
            }, headers=doc_h)
            assert notes_res.status_code == 201
            assert notes_res.json()["doctor_notes"] == "Patient diagnosed with contact dermatitis. Apply topical cream twice daily."

            # 12. Doctor Marks Complete
            complete_res = await ac.put(f"/api/doctor/appointments/{appointment_id}/complete", headers=doc_h)
            assert complete_res.status_code == 200
            assert complete_res.json()["status"] == "COMPLETED"

            # 13. Patient Verifies Completed Appointment Detail
            detail_res = await ac.get(f"/api/patient/appointments/{appointment_id}", headers=patient_h)
            assert detail_res.status_code == 200
            detail = detail_res.json()
            assert detail["status"] == "COMPLETED"
            assert detail["symptom_form"] is not None
            assert detail["post_visit_note"] is not None
