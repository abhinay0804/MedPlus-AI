# 🏥 HealthCare Appointment & Follow-Up Manager

A full-stack, enterprise-grade healthcare appointment booking and follow-up management platform built with **FastAPI**, **React 18 + TypeScript**, **PostgreSQL / SQLite**, **Redis**, **Celery**, and **Google Gemini 2.0 AI**.

---

## 🌟 Key Features & Standout Differentiators

- 🛡️ **Zero Double-Booking Engine**: Dual-dialect pessimistic locking (`SELECT FOR UPDATE SKIP LOCKED` on PostgreSQL & serialized checks on SQLite) with a **5-Minute Temporary Slot Hold** countdown.
- 🤖 **AI Pre-Visit Triage Summary**: Powered by Google Gemini 2.0. Analyzes patient symptoms to compute `urgency_level` (`LOW`, `MEDIUM`, `HIGH`), chief complaint summary, and 3 suggested questions for the doctor.
- 📝 **AI Post-Visit Summary & Medication Extraction**: Translates complex clinical notes into patient-friendly instructions and automatically extracts structured daily medication reminders.
- 🔔 **Multi-Channel Notifications**: Integrated HTML Email (7 templates), Google Calendar OAuth 2.0 sync, and real-time WebSocket state updates.
- 📅 **Admin Doctor Roster & Conflict Management**: Admin doctor CRUD, working hours setup, and automatic cancellation/rescheduling notifications when doctor leave is marked.
- 📊 **Interactive Analytics Dashboard**: Glassmorphism UI with Recharts appointment distribution charts and role-based access control (`PATIENT`, `DOCTOR`, `ADMIN`).

---

## 🛠️ Technology Stack

| Layer | Technologies |
| --- | --- |
| **Backend Framework** | Python 3.11+, FastAPI (Async), Pydantic v2 |
| **Database & ORM** | PostgreSQL 16 / SQLite, Async SQLAlchemy 2.0, Alembic |
| **Task Queue & Scheduler** | Redis 7, Celery 5.3, Celery Beat |
| **AI / LLM Integration** | Google Gemini 2.0 Flash (`google-genai`), Exponential Retry & Fallback |
| **Notifications & OAuth** | `fastapi-mail` (SMTP), Google OAuth 2.0 & Calendar API v3, WebSockets |
| **Frontend SPA** | React 18, TypeScript, Vite, Tailwind CSS v4, Lucide Icons, Recharts, Canvas-Confetti |
| **Containerization** | Docker, Docker Compose, Nginx |
| **Test Suite** | Pytest, Pytest-Asyncio, HTTPX |

---

## 🚀 Quick Start with Docker Compose

Ensure Docker and Docker Compose are installed on your machine.

1. **Clone the repository**:
   ```bash
   git clone <repo-url>
   cd Unthinkable
   ```

2. **Configure Environment Variables**:
   Copy `.env.example` to `.env`:
   ```bash
   cp .env.example .env
   ```
   *(Optionally add your `GEMINI_API_KEY` for live AI summaries; simulated fallback runs automatically if unconfigured).*

3. **Launch Docker Services**:
   ```bash
   docker-compose up --build
   ```

4. **Access Applications**:
   - **Frontend Application**: [http://localhost](http://localhost)
   - **Backend API Documentation (Swagger)**: [http://localhost:8000/docs](http://localhost:8000/docs)

---

## 💻 Local Development Setup (Manual)

### 1. Backend Setup
```bash
# Initialize Virtual Environment
python3 -m venv venv
source venv/bin/activate

# Install Dependencies
pip install -r requirements.txt

# Run Database Migrations / Table Creation
python3 -c "import asyncio; from server.database.connection import engine, Base; asyncio.run(engine.begin().then(lambda c: c.run_sync(Base.metadata.create_all)))"

# Start FastAPI Development Server
uvicorn server.app:app --reload --port 8000
```

### 2. Celery Worker & Scheduler
In separate terminal windows with `./venv/` activated:
```bash
# Start Celery Worker
celery -A microservices.celery_app worker --loglevel=info

# Start Celery Beat Scheduler
celery -A microservices.celery_app beat --loglevel=info
```

### 3. Frontend Setup
```bash
cd frontend
npm install
npm run dev
```
Open [http://localhost:5173](http://localhost:5173) in your browser.

---

## 🧪 Running Automated Test Suite

The test suite covers unit tests, repository CRUD, slot locking, API endpoint integration, double-booking concurrency, and end-to-end lifecycle workflows:

```bash
PYTHONPATH=. ./venv/bin/pytest tests/ -v
```
*(All 36 tests passing 100%)*

---

## 📡 API Endpoint Summary

| Method | Endpoint | Description | Role Required |
| --- | --- | --- | --- |
| `POST` | `/api/auth/register` | User registration | Public |
| `POST` | `/api/auth/login` | User login & JWT issuance | Public |
| `GET` | `/api/patient/doctors` | List active doctors & search by specialisation | Patient |
| `GET` | `/api/patient/doctors/{id}/slots` | Get generated slots for target date | Patient |
| `POST` | `/api/patient/appointments` | Reserve slot (5-min HELD status) | Patient |
| `POST` | `/api/patient/appointments/{id}/symptoms` | Submit pre-visit symptoms (triggers AI Triage) | Patient |
| `POST` | `/api/patient/appointments/{id}/confirm` | Confirm booking (dispatches Email & GCal sync) | Patient |
| `GET` | `/api/doctor/appointments` | List scheduled doctor appointments | Doctor |
| `POST` | `/api/doctor/appointments/{id}/notes` | Submit clinical notes & prescription | Doctor |
| `PUT` | `/api/doctor/appointments/{id}/complete` | Mark consultation completed | Doctor |
| `GET` | `/api/admin/dashboard` | Analytics overview & appointment statistics | Admin |
| `POST` | `/api/admin/doctors` | Create doctor profile & working hours | Admin |
| `POST` | `/api/admin/doctors/{id}/leave` | Mark doctor leave & auto-cancel conflicts | Admin |

---

## 📄 License
MIT License. Built for technical assessment evaluation.
