import asyncio
import sys
import os

# Add parent directory to path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from server.database.connection import AsyncSessionLocal
from server.repositories.user_repository import UserRepository
from server.database.models import UserRole, DoctorProfile, SupportTicket
from datetime import datetime
from sqlalchemy import select

from server.auth import hash_password

async def seed():
    print("🌱 Seeding database...")
    from server.database.connection import engine, Base
    import server.database.models as _models
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    async with AsyncSessionLocal() as db:
        user_repo = UserRepository(db)
        
        # 1. Seed Admin User
        admin_email = "admin@healthcare.com"
        admin = await user_repo.get_by_email(admin_email)
        if not admin:
            admin = await user_repo.create_user(
                email=admin_email,
                password="AdminPassword123!",
                full_name="System Administrator",
                phone="+1234567890",
                role=UserRole.ADMIN
            )
            print(f"✅ Admin created: {admin_email} / AdminPassword123!")
        else:
            admin.password_hash = hash_password("AdminPassword123!")
            print(f"🔄 Admin password reset: {admin_email} / AdminPassword123!")

        # 2. Seed Sample Doctor Users & Profiles
        doctors_data = [
            {
                "email": "dr.smith@healthcare.com",
                "name": "Dr. Sarah Smith",
                "specialisation": "Cardiology",
                "phone": "+1987654321",
                "hours": {
                    "mon": {"start": "09:00", "end": "17:00"},
                    "tue": {"start": "09:00", "end": "17:00"},
                    "wed": {"start": "09:00", "end": "17:00"},
                    "thu": {"start": "09:00", "end": "17:00"},
                    "fri": {"start": "09:00", "end": "15:00"},
                },
                "slot_duration": 30
            },
            {
                "email": "dr.patel@healthcare.com",
                "name": "Dr. Raj Patel",
                "specialisation": "Dermatology",
                "phone": "+1987654322",
                "hours": {
                    "mon": {"start": "10:00", "end": "18:00"},
                    "tue": {"start": "10:00", "end": "18:00"},
                    "thu": {"start": "10:00", "end": "18:00"},
                    "fri": {"start": "10:00", "end": "16:00"},
                },
                "slot_duration": 30
            },
            {
                "email": "dr.chen@healthcare.com",
                "name": "Dr. Emily Chen",
                "specialisation": "General Medicine",
                "phone": "+1987654323",
                "hours": {
                    "mon": {"start": "08:00", "end": "16:00"},
                    "tue": {"start": "08:00", "end": "16:00"},
                    "wed": {"start": "08:00", "end": "16:00"},
                    "thu": {"start": "08:00", "end": "16:00"},
                    "fri": {"start": "08:00", "end": "14:00"},
                },
                "slot_duration": 20
            }
        ]

        for d in doctors_data:
            doc_user = await user_repo.get_by_email(d["email"])
            if not doc_user:
                doc_user = await user_repo.create_user(
                    email=d["email"],
                    password="DoctorPassword123!",
                    full_name=d["name"],
                    phone=d["phone"],
                    role=UserRole.DOCTOR
                )
                profile = DoctorProfile(
                    user_id=doc_user.id,
                    specialisation=d["specialisation"],
                    working_hours=d["hours"],
                    slot_duration_minutes=d["slot_duration"]
                )
                db.add(profile)
                await db.flush()
                print(f"✅ Doctor created: {d['name']} ({d['specialisation']}) — {d['email']} / DoctorPassword123!")
            else:
                doc_user.password_hash = hash_password("DoctorPassword123!")
                print(f"🔄 Doctor password reset: {d['email']} / DoctorPassword123!")

        # 3. Seed Sample Patient
        patient_email = "patient@healthcare.com"
        patient = await user_repo.get_by_email(patient_email)
        if not patient:
            patient = await user_repo.create_user(
                email=patient_email,
                password="PatientPassword123!",
                full_name="John Doe",
                phone="+1122334455",
                role=UserRole.PATIENT
            )
            print(f"✅ Sample Patient created: {patient_email} / PatientPassword123!")
        else:
            patient.password_hash = hash_password("PatientPassword123!")
            print(f"🔄 Sample Patient password reset: {patient_email} / PatientPassword123!")

        # 4. Seed Support Tickets for Patient
        ticket_check = await db.execute(select(SupportTicket).where(SupportTicket.patient_id == patient.id))
        if not ticket_check.scalars().first():
            open_ticket = SupportTicket(
                patient_id=patient.id,
                subject="Double charge on consultation fee",
                category="BILLING_ISSUE",
                message="Hi, I noticed my card was billed twice for my last appointment on Monday. Can you please refund the extra charge?",
                status="OPEN"
            )
            resolved_ticket = SupportTicket(
                patient_id=patient.id,
                subject="Need to change doctor due to urgency",
                category="APPOINTMENT_QUERY",
                message="Can I reschedule my appointment with Dr. Chen to tomorrow? I have a sudden checkup need.",
                status="RESOLVED",
                admin_response="We have approved your request and updated your booking to tomorrow at 9:00 AM.",
                rating=5,
                rating_comment="Fast response! Thank you very much.",
                resolved_at=datetime.utcnow()
            )
            db.add_all([open_ticket, resolved_ticket])
            print("✅ Seeding support tickets for Sample Patient")

        await db.commit()
    print("🌱 Database seeding complete!")

if __name__ == "__main__":
    asyncio.run(seed())
