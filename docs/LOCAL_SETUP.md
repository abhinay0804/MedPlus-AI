# Local Development & Setup Guide

This guide provides step-by-step instructions for setting up and running the HealthCare Appointment Manager locally.

---

## Prerequisites

- **Python:** 3.11+
- **Node.js:** v18+ or v20+
- **Virtual Environment:** `./venv/`
- **Docker & Docker Compose:** Optional (for full multi-container deployment)

---

## 1. Environment Setup

Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```

Ensure Python virtual environment is activated:
```bash
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
pip install -r requirements-test.txt
```

---

## 2. Running Backend Locally

Run FastAPI backend on port 8000:
```bash
PYTHONPATH=. ./venv/bin/python -m uvicorn server.app:app --host 0.0.0.0 --port 8000 --reload
```

Seed initial database (Admin, Doctors, Patient):
```bash
PYTHONPATH=. ./venv/bin/python scripts/seed_db.py
```

---

## 3. Running Frontend Locally

Navigate to `frontend/` directory and install npm packages:
```bash
cd frontend
npm install
npm run dev
```
Access the application in your browser at `http://localhost:5173`.

---

## 4. Running Test Suite

Execute all unit, integration, and E2E tests:
```bash
PYTHONPATH=. ./venv/bin/pytest tests/ -v
```

---

## 5. Quick Evaluator Demo Logins

- **Admin Demo:** `admin@healthcare.com` / `Admin123!`
- **Doctor Demo:** `doctor@healthcare.com` / `Doctor123!`
- **Patient Demo:** `patient@healthcare.com` / `Patient123!`
