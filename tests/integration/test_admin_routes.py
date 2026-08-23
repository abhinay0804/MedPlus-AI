import pytest
from httpx import AsyncClient, ASGITransport
from server.app import app
from server.database.connection import engine, Base, AsyncSessionLocal
from server.repositories.user_repository import UserRepository
from server.database.models import UserRole


@pytest.mark.asyncio
async def test_admin_doctor_crud():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        # 1. Register admin and login
        reg_admin = {
            "email": "testadmin@healthcare.com",
            "password": "AdminPassword123!",
            "full_name": "Test Admin",
            "role": "ADMIN"
        }
        res = await ac.post("/api/auth/register", json=reg_admin)
        assert res.status_code == 201
        admin_token = res.json()["access_token"]
        admin_headers = {"Authorization": f"Bearer {admin_token}"}

        # 2. Register patient
        reg_patient = {
            "email": "testpatient@healthcare.com",
            "password": "PatientPassword123!",
            "full_name": "Test Patient",
            "role": "PATIENT"
        }
        res = await ac.post("/api/auth/register", json=reg_patient)
        assert res.status_code == 201
        patient_token = res.json()["access_token"]
        patient_headers = {"Authorization": f"Bearer {patient_token}"}

        # 3. Patient tries admin route -> 403 Forbidden
        doc_payload = {
            "email": "new.doc@healthcare.com",
            "password": "DoctorPassword123!",
            "full_name": "Dr. New Doctor",
            "specialisation": "Neurology",
            "working_hours": {
                "mon": {"start": "09:00", "end": "17:00"}
            },
            "slot_duration_minutes": 30
        }
        res = await ac.post("/api/admin/doctors", json=doc_payload, headers=patient_headers)
        assert res.status_code == 403

        # 4. Admin creates doctor -> 201 Created
        res = await ac.post("/api/admin/doctors", json=doc_payload, headers=admin_headers)
        assert res.status_code == 201
        doc_data = res.json()
        assert doc_data["specialisation"] == "Neurology"
        assert doc_data["user"]["full_name"] == "Dr. New Doctor"
        doc_id = doc_data["id"]

        # 5. Admin lists doctors
        res = await ac.get("/api/admin/doctors", headers=admin_headers)
        assert res.status_code == 200
        docs = res.json()
        assert len(docs) >= 1
        assert docs[0]["id"] == doc_id

        # 6. Admin updates doctor
        update_payload = {
            "specialisation": "Pediatric Neurology",
            "slot_duration_minutes": 45
        }
        res = await ac.put(f"/api/admin/doctors/{doc_id}", json=update_payload, headers=admin_headers)
        assert res.status_code == 200
        assert res.json()["specialisation"] == "Pediatric Neurology"
        assert res.json()["slot_duration_minutes"] == 45

        # 7. Admin marks doctor on leave
        leave_payload = {
            "leave_date": "2026-09-01",
            "reason": "Annual Medical Conference"
        }
        res = await ac.post(f"/api/admin/doctors/{doc_id}/leave", json=leave_payload, headers=admin_headers)
        assert res.status_code == 201
        leave_id = res.json()["id"]

        # 8. Admin gets doctor leaves
        res = await ac.get(f"/api/admin/doctors/{doc_id}/leave", headers=admin_headers)
        assert res.status_code == 200
        leaves = res.json()
        assert len(leaves) == 1
        assert leaves[0]["leave_date"] == "2026-09-01"

        # 9. Admin dashboard stats
        res = await ac.get("/api/admin/dashboard", headers=admin_headers)
        assert res.status_code == 200
        stats = res.json()
        assert stats["total_doctors"] == 1
        assert stats["total_patients"] == 1


@pytest.mark.asyncio
async def test_working_hours_approval_flow():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        # 1. Register admin and login
        reg_admin = {
            "email": "hoursadmin@healthcare.com",
            "password": "AdminPassword123!",
            "full_name": "Hours Admin",
            "role": "ADMIN"
        }
        res = await ac.post("/api/auth/register", json=reg_admin)
        assert res.status_code == 201
        admin_token = res.json()["access_token"]
        admin_headers = {"Authorization": f"Bearer {admin_token}"}

        # 2. Register doctor via admin
        doc_payload = {
            "email": "hours.doc@healthcare.com",
            "password": "DoctorPassword123!",
            "full_name": "Dr. Hours Doctor",
            "specialisation": "Cardiology",
            "working_hours": {
                "mon": {"start": "09:00", "end": "17:00", "enabled": True}
            },
            "slot_duration_minutes": 30
        }
        res = await ac.post("/api/admin/doctors", json=doc_payload, headers=admin_headers)
        assert res.status_code == 201

        # 3. Login as doctor
        login_payload = {
            "email": "hours.doc@healthcare.com",
            "password": "DoctorPassword123!"
        }
        res = await ac.post("/api/auth/login", json=login_payload)
        assert res.status_code == 200
        doc_token = res.json()["access_token"]
        doc_headers = {"Authorization": f"Bearer {doc_token}"}

        # 4. Doctor submits first working-hours-request
        request_payload_1 = {
            "working_hours": {
                "mon": {"start": "10:00", "end": "16:00", "enabled": True},
                "tue": {"start": "10:00", "end": "16:00", "enabled": True}
            },
            "slot_duration_minutes": 20
        }
        res = await ac.post("/api/doctor/working-hours-request", json=request_payload_1, headers=doc_headers)
        assert res.status_code == 200
        assert res.json()["success"] is True

        # 5. Doctor submits second working-hours-request (should overwrite)
        request_payload_2 = {
            "working_hours": {
                "mon": {"start": "11:00", "end": "15:00", "enabled": True},
                "tue": {"start": "11:00", "end": "15:00", "enabled": True}
            },
            "slot_duration_minutes": 15
        }
        res = await ac.post("/api/doctor/working-hours-request", json=request_payload_2, headers=doc_headers)
        assert res.status_code == 200

        # 6. Doctor checks status
        res = await ac.get("/api/doctor/working-hours-request/status", headers=doc_headers)
        assert res.status_code == 200
        status_data = res.json()
        assert status_data["status"] == "PENDING"
        assert status_data["proposed_slot_duration"] == 15
        assert status_data["proposed_working_hours"]["mon"]["start"] == "11:00"

        # 7. Admin gets pending requests
        res = await ac.get("/api/admin/working-hours-requests", headers=admin_headers)
        assert res.status_code == 200
        pending_list = res.json()
        assert len(pending_list) == 1
        req_id = pending_list[0]["id"]
        assert pending_list[0]["proposed_slot_duration"] == 15

        # 8. Admin approves the request
        resolve_payload = {
            "status": "APPROVED",
            "admin_reason": "Approved for clinical operations optimization."
        }
        res = await ac.put(f"/api/admin/working-hours-requests/{req_id}/resolve", json=resolve_payload, headers=admin_headers)
        assert res.status_code == 200
        assert res.json()["success"] is True

        # 9. Doctor checks status again
        res = await ac.get("/api/doctor/working-hours-request/status", headers=doc_headers)
        assert res.status_code == 200
        assert res.json()["status"] == "APPROVED"

        # 10. Check if doctor settings updated
        res = await ac.get("/api/doctor/settings", headers=doc_headers)
        assert res.status_code == 200
        settings_data = res.json()
        assert settings_data["profile"]["slot_duration_minutes"] == 15
        assert settings_data["profile"]["working_hours"]["mon"]["start"] == "11:00"
