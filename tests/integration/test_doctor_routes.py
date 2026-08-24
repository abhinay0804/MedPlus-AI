import pytest
from httpx import AsyncClient, ASGITransport
from datetime import datetime, timedelta
from server.app import app


@pytest.mark.asyncio
async def test_doctor_patient_history_ai_summary():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        # Find next Monday so working hours are enabled
        today = datetime.utcnow().date()
        days_ahead = 0 - today.weekday()
        if days_ahead <= 0:  # Target next Monday
            days_ahead += 7
        next_monday = today + timedelta(days=days_ahead)
        monday_str = next_monday.isoformat()

        # 1. Register Admin to manage doctors
        admin_payload = {
            "email": "govadmin@healthcare.com",
            "password": "AdminPassword123!",
            "full_name": "Governance Admin",
            "role": "ADMIN"
        }
        res = await ac.post("/api/auth/register", json=admin_payload)
        assert res.status_code == 201, res.text
        admin_token = res.json()["access_token"]
        admin_headers = {"Authorization": f"Bearer {admin_token}"}

        # 2. Register Cardiology Doctor (Dr. Cardio)
        doc1_payload = {
            "email": "dr.cardio@healthcare.com",
            "password": "DoctorPassword123!",
            "full_name": "Dr. Heart Cardio",
            "specialisation": "Cardiology",
            "working_hours": {
                "mon": {"start": "09:00", "end": "17:00"},
                "tue": {"start": "09:00", "end": "17:00"},
                "wed": {"start": "09:00", "end": "17:00"},
                "thu": {"start": "09:00", "end": "17:00"},
                "fri": {"start": "09:00", "end": "17:00"},
                "sat": {"start": "09:00", "end": "17:00"},
                "sun": {"start": "09:00", "end": "17:00"}
            },
            "slot_duration_minutes": 30
        }
        res = await ac.post("/api/admin/doctors", json=doc1_payload, headers=admin_headers)
        assert res.status_code == 201, res.text
        doc1_id = res.json()["id"]

        # Login Dr. Cardio
        res = await ac.post("/api/auth/login", json={"email": "dr.cardio@healthcare.com", "password": "DoctorPassword123!"})
        assert res.status_code == 200, res.text
        doc1_headers = {"Authorization": f"Bearer {res.json()['access_token']}"}

        # 3. Register Dermatology Doctor (Dr. Derma)
        doc2_payload = {
            "email": "dr.derma@healthcare.com",
            "password": "DoctorPassword123!",
            "full_name": "Dr. Skin Derma",
            "specialisation": "Dermatology",
            "working_hours": {
                "mon": {"start": "09:00", "end": "17:00"},
                "tue": {"start": "09:00", "end": "17:00"},
                "wed": {"start": "09:00", "end": "17:00"},
                "thu": {"start": "09:00", "end": "17:00"},
                "fri": {"start": "09:00", "end": "17:00"},
                "sat": {"start": "09:00", "end": "17:00"},
                "sun": {"start": "09:00", "end": "17:00"}
            },
            "slot_duration_minutes": 30
        }
        res = await ac.post("/api/admin/doctors", json=doc2_payload, headers=admin_headers)
        assert res.status_code == 201, res.text
        doc2_id = res.json()["id"]

        # Login Dr. Derma
        res = await ac.post("/api/auth/login", json={"email": "dr.derma@healthcare.com", "password": "DoctorPassword123!"})
        assert res.status_code == 200, res.text
        doc2_headers = {"Authorization": f"Bearer {res.json()['access_token']}"}

        # 4. Register Patient
        patient_payload = {
            "email": "patient.gov@healthcare.com",
            "password": "PatientPassword123!",
            "full_name": "Patient Governance",
            "role": "PATIENT"
        }
        res = await ac.post("/api/auth/register", json=patient_payload)
        assert res.status_code == 201, res.text
        patient_headers = {"Authorization": f"Bearer {res.json()['access_token']}"}

        # 5. Fetch available slots for Dr. Cardio
        res = await ac.get(f"/api/patient/doctors/{doc1_id}/slots", params={"target_date": monday_str}, headers=patient_headers)
        assert res.status_code == 200, res.text
        slots_cardio = [s for s in res.json() if s["is_available"]]
        assert len(slots_cardio) > 5

        # 6. Book appointment 1 (Cardiology)
        slot1 = slots_cardio[0]["slot_start"]
        res = await ac.post("/api/patient/appointments", json={"doctor_id": doc1_id, "slot_start": slot1}, headers=patient_headers)
        assert res.status_code == 201, res.text
        appt1_id = res.json()["id"]

        # Submit symptoms for appt 1
        res = await ac.post(
            f"/api/patient/appointments/{appt1_id}/symptoms",
            json={"symptoms_text": "I feel slight chest pain when walking fast."},
            headers=patient_headers
        )
        assert res.status_code == 201, res.text

        # Confirm appt 1
        res = await ac.post(f"/api/patient/appointments/{appt1_id}/confirm", headers=patient_headers)
        assert res.status_code == 200, res.text

        # Verify AI summary for first appointment (should show default "first recorded appointment" values)
        res = await ac.get(f"/api/doctor/appointments/{appt1_id}/patient-history-ai-summary", headers=doc1_headers)
        assert res.status_code == 200, res.text
        summary_data = res.json()
        assert "first recorded" in summary_data["diagnostic_factors"].lower()
        assert "No previous records found" in summary_data["specialty_summary"]

        # Approve appointment 1
        res = await ac.put(f"/api/doctor/appointments/{appt1_id}/approve", headers=doc1_headers)
        assert res.status_code == 200, res.text

        # Start appointment 1 (Cardiology)
        res = await ac.get(f"/api/doctor/appointments", headers=doc1_headers)
        assert res.status_code == 200, res.text
        appt_db_1 = [a for a in res.json() if a["id"] == appt1_id][0]
        otp = appt_db_1["start_otp"]

        res = await ac.post(f"/api/doctor/appointments/{appt1_id}/start-verify", json={"otp": otp}, headers=doc1_headers)
        assert res.status_code == 200, res.text

        # Submit notes and complete appointment 1
        res = await ac.post(
            f"/api/doctor/appointments/{appt1_id}/notes",
            json={"doctor_notes": "Mild angina symptoms.", "prescription_text": "Aspirin 75mg once daily."},
            headers=doc1_headers
        )
        assert res.status_code == 201, res.text

        res = await ac.put(f"/api/doctor/appointments/{appt1_id}/complete", headers=doc1_headers)
        assert res.status_code == 200, res.text

        # 7. Book and complete appointment 2 (Dermatology)
        res = await ac.get(f"/api/patient/doctors/{doc2_id}/slots", params={"target_date": monday_str}, headers=patient_headers)
        assert res.status_code == 200, res.text
        slots_derma = [s for s in res.json() if s["is_available"]]
        
        # Book a slot with Dr. Derma
        slot2 = slots_derma[2]["slot_start"]
        res = await ac.post("/api/patient/appointments", json={"doctor_id": doc2_id, "slot_start": slot2}, headers=patient_headers)
        assert res.status_code == 201, res.text
        appt2_id = res.json()["id"]

        # Submit symptoms for appt 2
        res = await ac.post(
            f"/api/patient/appointments/{appt2_id}/symptoms",
            json={"symptoms_text": "I have an itchy red rash on my arm."},
            headers=patient_headers
        )
        assert res.status_code == 201, res.text

        # Confirm appt 2
        res = await ac.post(f"/api/patient/appointments/{appt2_id}/confirm", headers=patient_headers)
        assert res.status_code == 200, res.text

        # Approve appointment 2
        res = await ac.put(f"/api/doctor/appointments/{appt2_id}/approve", headers=doc2_headers)
        assert res.status_code == 200, res.text

        # Start appointment 2 (Dermatology)
        res = await ac.get(f"/api/doctor/appointments", headers=doc2_headers)
        appt_db_2 = [a for a in res.json() if a["id"] == appt2_id][0]
        otp2 = appt_db_2["start_otp"]

        res = await ac.post(f"/api/doctor/appointments/{appt2_id}/start-verify", json={"otp": otp2}, headers=doc2_headers)
        assert res.status_code == 200, res.text

        # Complete appointment 2
        res = await ac.post(
            f"/api/doctor/appointments/{appt2_id}/notes",
            json={"doctor_notes": "Mild eczema rash.", "prescription_text": "Hydrocortisone cream."},
            headers=doc2_headers
        )
        assert res.status_code == 201, res.text
        res = await ac.put(f"/api/doctor/appointments/{appt2_id}/complete", headers=doc2_headers)
        assert res.status_code == 200, res.text

        # 8. Book appointment 3 (Cardiology again)
        res = await ac.get(f"/api/patient/doctors/{doc1_id}/slots", params={"target_date": monday_str}, headers=patient_headers)
        slots_cardio = [s for s in res.json() if s["is_available"]]
        slot3 = slots_cardio[4]["slot_start"]
        
        res = await ac.post("/api/patient/appointments", json={"doctor_id": doc1_id, "slot_start": slot3}, headers=patient_headers)
        assert res.status_code == 201, res.text
        appt3_id = res.json()["id"]

        # Submit symptoms for appt 3
        res = await ac.post(
            f"/api/patient/appointments/{appt3_id}/symptoms",
            json={"symptoms_text": "Chest pain returned with minor dizziness today."},
            headers=patient_headers
        )
        assert res.status_code == 201, res.text

        # Confirm appt 3
        res = await ac.post(f"/api/patient/appointments/{appt3_id}/confirm", headers=patient_headers)
        assert res.status_code == 200, res.text

        # 9. Get AI Longitudinal Summary for appointment 3 as Dr. Cardio
        res = await ac.get(f"/api/doctor/appointments/{appt3_id}/patient-history-ai-summary", headers=doc1_headers)
        assert res.status_code == 200, res.text
        summary_data = res.json()
        
        assert "specialty_summary" in summary_data
        assert "general_medical_summary" in summary_data
        assert "diagnostic_factors" in summary_data

        # Verify fallback or Gemini-generated values robustly
        assert any(w in summary_data["specialty_summary"] for w in ["Cardiology", "Cardio", "Aspirin", "angina"])
        assert any(w in summary_data["general_medical_summary"] for w in ["Dermatology", "Derma", "Hydrocortisone", "eczema", "Skin"])
