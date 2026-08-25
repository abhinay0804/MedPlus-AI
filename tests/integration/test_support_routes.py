import pytest
from httpx import AsyncClient, ASGITransport
from server.app import app
from server.database.connection import engine, Base, AsyncSessionLocal
from server.database.models import UserRole

@pytest.mark.asyncio
async def test_support_tickets_full_workflow():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        # 1. Register and login admin
        admin_data = {
            "email": "adm.support@healthcare.com",
            "password": "AdminPassword123!",
            "full_name": "Admin Support Specialist",
            "role": "ADMIN"
        }
        res = await client.post("/api/auth/register", json=admin_data)
        assert res.status_code == 201
        admin_token = res.json()["access_token"]
        admin_headers = {"Authorization": f"Bearer {admin_token}"}

        # 2. Register and login patient
        patient_data = {
            "email": "pat.support@healthcare.com",
            "password": "PatientPassword123!",
            "full_name": "Support Seeking Patient",
            "role": "PATIENT"
        }
        res = await client.post("/api/auth/register", json=patient_data)
        assert res.status_code == 201
        patient_token = res.json()["access_token"]
        patient_headers = {"Authorization": f"Bearer {patient_token}"}

        # 3. Create a support ticket
        payload = {
            "subject": "Missing refund for duplicate booking",
            "category": "BILLING_ISSUE",
            "message": "Hello, I was double billed for my cardiologists visit. Can you please check?",
        }
        resp = await client.post("/api/patient/support/tickets", json=payload, headers=patient_headers)
        assert resp.status_code == 200
        ticket = resp.json()
        assert ticket["subject"] == payload["subject"]
        assert ticket["category"] == payload["category"]
        assert ticket["status"] == "OPEN"
        ticket_id = ticket["id"]

        # 4. List own support tickets
        resp = await client.get("/api/patient/support/tickets", headers=patient_headers)
        assert resp.status_code == 200
        tickets_list = resp.json()
        assert any(t["id"] == ticket_id for t in tickets_list)

        # 5. Admin lists all support tickets
        resp = await client.get("/api/admin/support/tickets", headers=admin_headers)
        assert resp.status_code == 200
        admin_list = resp.json()
        assert any(t["id"] == ticket_id for t in admin_list)

        # 6. Admin responds to the ticket (Resolving it)
        reply_payload = {
            "admin_response": "We have processed your refund. It should reflect in 3-5 business days.",
            "keep_open": False
        }
        resp = await client.put(f"/api/admin/support/tickets/{ticket_id}/respond", json=reply_payload, headers=admin_headers)
        assert resp.status_code == 200
        resolved = resp.json()
        assert resolved["status"] == "RESOLVED"
        assert resolved["admin_response"] == reply_payload["admin_response"]

        # 7. Patient rates the support resolution
        rate_payload = {
            "rating": 5,
            "rating_comment": "Excellent customer care. Refund received!"
        }
        resp = await client.put(f"/api/patient/support/tickets/{ticket_id}/rate", json=rate_payload, headers=patient_headers)
        assert resp.status_code == 200
        rated = resp.json()
        assert rated["rating"] == 5
        assert rated["rating_comment"] == rate_payload["rating_comment"]

        # 8. Admin checks patient detail support list to verify rating is visible
        patient_id = rated["patient_id"]
        resp = await client.get(f"/api/admin/support/patients/{patient_id}/tickets", headers=admin_headers)
        assert resp.status_code == 200
        pat_tickets = resp.json()
        target_ticket = next(t for t in pat_tickets if t["id"] == ticket_id)
        assert target_ticket["rating"] == 5
        assert target_ticket["rating_comment"] == rate_payload["rating_comment"]

@pytest.mark.asyncio
async def test_support_chatbot_route():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        # Register and login patient
        patient_data = {
            "email": "pat.chatbot@healthcare.com",
            "password": "PatientPassword123!",
            "full_name": "Chatbot Tester Patient",
            "role": "PATIENT"
        }
        res = await client.post("/api/auth/register", json=patient_data)
        assert res.status_code == 201
        patient_token = res.json()["access_token"]
        patient_headers = {"Authorization": f"Bearer {patient_token}"}

        payload = {
            "message": "When is my next appointment booking?",
            "history": []
        }
        resp = await client.post("/api/patient/support/chat", json=payload, headers=patient_headers)
        assert resp.status_code == 200
        data = resp.json()
        assert "reply" in data
        assert len(data["reply"]) > 0
