import pytest
from httpx import AsyncClient, ASGITransport
from server.app import app
from server.database.connection import engine, Base, AsyncSessionLocal


@pytest.mark.asyncio
async def test_auth_full_flow():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        # 1. Health check
        res = await ac.get("/api/health")
        assert res.status_code == 200
        assert res.json()["status"] == "healthy"

        # 2. Register patient
        reg_payload = {
            "email": "testpatient@example.com",
            "password": "Password123!",
            "full_name": "Test Patient",
            "phone": "+1999888777",
            "role": "PATIENT"
        }
        res = await ac.post("/api/auth/register", json=reg_payload)
        assert res.status_code == 201
        data = res.json()
        assert "access_token" in data
        assert "refresh_token" in data
        assert data["user"]["email"] == "testpatient@example.com"
        assert data["user"]["role"] == "PATIENT"

        access_token = data["access_token"]
        refresh_token = data["refresh_token"]

        # 3. Get profile (/me)
        headers = {"Authorization": f"Bearer {access_token}"}
        res = await ac.get("/api/auth/me", headers=headers)
        assert res.status_code == 200
        user_data = res.json()
        assert user_data["email"] == "testpatient@example.com"

        # 4. Login
        login_payload = {
            "email": "testpatient@example.com",
            "password": "Password123!"
        }
        res = await ac.post("/api/auth/login", json=login_payload)
        assert res.status_code == 200
        assert "access_token" in res.json()

        # 5. Refresh token
        refresh_payload = {"refresh_token": refresh_token}
        res = await ac.post("/api/auth/refresh", json=refresh_payload)
        assert res.status_code == 200
        assert "access_token" in res.json()
