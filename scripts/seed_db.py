import asyncio
import sys
import os
import uuid
import random
from datetime import datetime, timedelta

# Add parent directory to path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from server.database.connection import AsyncSessionLocal
from server.repositories.user_repository import UserRepository
from server.database.models import (
    User, UserRole, DoctorProfile, DoctorLeave, DoctorLeaveRequest,
    Appointment, AppointmentStatus, SymptomForm, PostVisitNote,
    DoctorReview, SupportTicket, AdminNote, AuditLog, EmailOTP,
    UrgencyLevel, LLMStatus, MedicationReminder
)
from sqlalchemy import select, delete

from server.auth import hash_password

async def seed():
    print("🌱 Rigorous Database Seeding & Simulation Data Population...")
    from server.database.connection import engine, Base
    
    # Ensure tables exist
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    async with AsyncSessionLocal() as db:
        user_repo = UserRepository(db)
        
        # 1. Clean existing simulation data to allow clean re-runs
        print("🧹 Cleaning stale simulation appointments, reviews, and support tickets...")
        await db.execute(delete(DoctorReview))
        await db.execute(delete(SupportTicket))
        await db.execute(delete(MedicationReminder))
        await db.execute(delete(PostVisitNote))
        await db.execute(delete(SymptomForm))
        await db.execute(delete(Appointment))
        await db.execute(delete(DoctorLeave))
        await db.execute(delete(DoctorLeaveRequest))
        await db.execute(delete(AdminNote))
        
        # 2. Seed Admin User
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

        # 3. Seed Sample Doctor Users & Profiles
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

        seeded_docs = {}
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
                seeded_docs[d["email"]] = profile
            else:
                doc_user.password_hash = hash_password("DoctorPassword123!")
                # Fetch profile
                stmt_prof = select(DoctorProfile).where(DoctorProfile.user_id == doc_user.id)
                res_prof = await db.execute(stmt_prof)
                profile = res_prof.scalar_one()
                seeded_docs[d["email"]] = profile
                print(f"🔄 Doctor password reset: {d['email']} / DoctorPassword123!")

        # 4. Seed the 10 Patients (including requested emails with default password)
        patient_emails = [
            ("namabhinay@gmail.com", "Abhinay Nama", "+919876543210", "India"),
            ("nama.abhinay2023@vitstudent.ac.in", "Abhinay VIT", "+919876543211", "India"),
            ("abhilinux25@gmail.com", "Abhinay Linux", "+919876543212", "India"),
            ("onlyiknowwww@gmail.com", "IKnow Patient", "+919876543213", "India"),
            ("patient@healthcare.com", "John Doe (Demo)", "+1122334455", "USA"),
            ("sim_patient_6@healthcare.com", "Jane Smith", "+1223344556", "UK"),
            ("sim_patient_7@healthcare.com", "Alice Johnson", "+1334455667", "Canada"),
            ("sim_patient_8@healthcare.com", "Bob Brown", "+1445566778", "Australia"),
            ("sim_patient_9@healthcare.com", "Charlie Davis", "+1556677889", "Germany"),
            ("sim_patient_10@healthcare.com", "Diana Evans", "+1667788990", "France"),
        ]

        seeded_patients = {}
        for email, name, phone, country in patient_emails:
            patient = await user_repo.get_by_email(email)
            if not patient:
                patient = await user_repo.create_user(
                    email=email,
                    password="PatientPassword123!",
                    full_name=name,
                    phone=phone,
                    role=UserRole.PATIENT
                )
                patient.country = country
                print(f"✅ Patient created: {name} ({email}) / PatientPassword123!")
            else:
                patient.password_hash = hash_password("PatientPassword123!")
                patient.full_name = name
                patient.phone = phone
                patient.country = country
                print(f"🔄 Patient updated: {email} / PatientPassword123!")
            seeded_patients[email] = patient

        # Flush users
        await db.flush()

        # Get Doctor Profiles for slots
        dr_smith = seeded_docs["dr.smith@healthcare.com"]
        dr_patel = seeded_docs["dr.patel@healthcare.com"]
        dr_chen = seeded_docs["dr.chen@healthcare.com"]

        # Helper: Create Full Appointment Cycle
        async def create_appt(patient_obj, doctor_profile, slot_start, status, is_started=False, review_rating=None, review_comment=None, symptom_txt="High fever and severe headache.", note_summary=None, has_ticket=False, ticket_status="OPEN", ticket_msg=""):
            appt = Appointment(
                patient_id=patient_obj.id,
                doctor_id=doctor_profile.id,
                slot_start=slot_start,
                slot_end=slot_start + timedelta(minutes=doctor_profile.slot_duration_minutes),
                status=status,
                is_started=is_started,
                start_otp=f"{random.randint(1000, 9999)}",
                created_at=datetime.utcnow() - timedelta(days=5)
            )
            db.add(appt)
            await db.flush()

            # Add Symptom Form
            symptom = SymptomForm(
                appointment_id=appt.id,
                symptoms_text=symptom_txt,
                urgency_level=UrgencyLevel.HIGH if "severe" in symptom_txt.lower() else UrgencyLevel.MEDIUM,
                llm_status=LLMStatus.SUCCESS,
                pre_visit_summary={
                    "clinical_summary": f"Patient reports: {symptom_txt}",
                    "symptoms_analysis": ["Fever", "Headache"] if "fever" in symptom_txt.lower() else ["Fatigue", "Muscle cramps"],
                    "ai_warning_flags": ["Severe symptoms - consult doctor promptly"]
                }
            )
            db.add(symptom)

            # Add Post Visit Note & Prescription
            if status == AppointmentStatus.COMPLETED or note_summary:
                note = PostVisitNote(
                    appointment_id=appt.id,
                    doctor_notes=note_summary or "Metabolic clinical review completed. Patient advised to rest.",
                    prescription_text="Magnesium Glycinate 400mg once daily before bedtime. Paracetamol 500mg as needed.",
                    patient_summary="Follow a light, hydrated diet. Sleep 8+ hours. Avoid caffeine after 4 PM.",
                    llm_status=LLMStatus.SUCCESS
                )
                db.add(note)
                await db.flush()
                # Add Reminders
                from datetime import time as time_type
                reminder = MedicationReminder(
                    patient_id=patient_obj.id,
                    post_visit_note_id=note.id,
                    medication_name="Magnesium Glycinate",
                    dosage="400mg",
                    frequency="DAILY",
                    start_date=slot_start.date(),
                    end_date=(slot_start + timedelta(days=14)).date(),
                    reminder_time=time_type(hour=8, minute=0),
                    is_active=True
                )
                db.add(reminder)
            # Add Review
            if review_rating:
                rev = DoctorReview(
                    appointment_id=appt.id,
                    patient_id=patient_obj.id,
                    doctor_id=doctor_profile.id,
                    rating=review_rating,
                    comment=review_comment or "Wonderful consultation."
                )
                db.add(rev)

            # Add Ticket
            if has_ticket:
                ticket = SupportTicket(
                    patient_id=patient_obj.id,
                    appointment_id=appt.id,
                    subject="Query regarding prescription dosage",
                    category="APPOINTMENT_QUERY",
                    message=ticket_msg or "I have a question about the medicine dosage. Can you check?",
                    status=ticket_status,
                    created_at=datetime.utcnow() - timedelta(days=1)
                )
                if ticket_status == "RESOLVED":
                    ticket.admin_response = "We coordinated with Dr. Smith. The dosage of 400mg once daily is correct and safe to take."
                    ticket.rating = 5
                    ticket.rating_comment = "Super helpful support!"
                    ticket.resolved_at = datetime.utcnow()
                db.add(ticket)
                
            return appt

        # Seed realistic appointment grid relative to today
        today = datetime.utcnow().replace(hour=10, minute=0, second=0, microsecond=0)

        # Patient 1: namabhinay@gmail.com
        # - 1 Completed slot (with 5-star review)
        # - 1 Cancelled slot
        # - 1 Confirmed Upcoming slot (rescheduled)
        await create_appt(
            seeded_patients["namabhinay@gmail.com"], dr_smith,
            today - timedelta(days=2), AppointmentStatus.COMPLETED,
            is_started=True, review_rating=5, review_comment="Dr. Smith was amazing! She explained the diagnosis in detail.",
            symptom_txt="Severe chest pain and heavy heart beats when running.",
            note_summary="ECG normal. Mild sinus tachycardia related to fatigue. Prescribed basic cardio vitamins."
        )
        await create_appt(
            seeded_patients["namabhinay@gmail.com"], dr_smith,
            today - timedelta(days=1), AppointmentStatus.CANCELLED,
            symptom_txt="Follow up consultation request."
        )
        await create_appt(
            seeded_patients["namabhinay@gmail.com"], dr_smith,
            today + timedelta(days=1), AppointmentStatus.CONFIRMED,
            symptom_txt="General checkup follow up."
        )

        # Patient 2: nama.abhinay2023@vitstudent.ac.in
        # - 1 Completed Slot (with 4-star review)
        # - 1 Confirmed Slot (tomorrow)
        await create_appt(
            seeded_patients["nama.abhinay2023@vitstudent.ac.in"], dr_chen,
            today - timedelta(days=1), AppointmentStatus.COMPLETED,
            is_started=True, review_rating=4, review_comment="Great general medicine overview. Prompt prescriptions.",
            symptom_txt="Sudden cold, sore throat, and low-grade fever.",
            note_summary="Viral pharyngitis. Rest and hydration recommended. Prescription issued."
        )
        await create_appt(
            seeded_patients["nama.abhinay2023@vitstudent.ac.in"], dr_chen,
            today + timedelta(days=1, hours=2), AppointmentStatus.CONFIRMED,
            symptom_txt="Sore throat follow up check."
        )

        # Patient 3: abhilinux25@gmail.com
        # - 1 Cancelled Slot
        # - 1 Confirmed Slot (tomorrow)
        await create_appt(
            seeded_patients["abhilinux25@gmail.com"], dr_patel,
            today - timedelta(days=1, hours=3), AppointmentStatus.CANCELLED,
            symptom_txt="Skin rash consultation."
        )
        await create_appt(
            seeded_patients["abhilinux25@gmail.com"], dr_patel,
            today + timedelta(days=1, hours=4), AppointmentStatus.CONFIRMED,
            symptom_txt="Persistent skin rash on hand and dry skin."
        )

        # Patient 4: onlyiknowwww@gmail.com
        # - 1 In-Progress Slot (started today, doctor conducting consultation)
        # - 1 Support Ticket (Resolved)
        await create_appt(
            seeded_patients["onlyiknowwww@gmail.com"], dr_smith,
            today, AppointmentStatus.CONFIRMED,
            is_started=True,
            symptom_txt="Shortness of breath under high workload anxiety.",
            has_ticket=True, ticket_status="RESOLVED",
            ticket_msg="Hi, can I confirm if Dr. Smith supports anxiety care?"
        )

        # Patient 5: patient@healthcare.com
        # - 1 Completed Slot
        # - 1 In-Progress Slot (started today)
        await create_appt(
            seeded_patients["patient@healthcare.com"], dr_patel,
            today - timedelta(days=3), AppointmentStatus.COMPLETED,
            is_started=True, review_rating=5, review_comment="Very professional treatment.",
            symptom_txt="Dry patches on arms.",
            note_summary="Diagnosed dry eczema. Recommended moisturising twice daily."
        )
        await create_appt(
            seeded_patients["patient@healthcare.com"], dr_patel,
            today + timedelta(hours=3), AppointmentStatus.CONFIRMED,
            is_started=True,
            symptom_txt="Eczema follow up check."
        )

        # Patient 6: sim_patient_6@healthcare.com
        # - 1 Upcoming Confirmed Slot (not started yet, start_otp generated)
        # - 1 Open Ticket
        await create_appt(
            seeded_patients["sim_patient_6@healthcare.com"], dr_chen,
            today + timedelta(hours=5), AppointmentStatus.CONFIRMED,
            is_started=False,
            symptom_txt="Stomach ache and acid reflux.",
            has_ticket=True, ticket_status="OPEN",
            ticket_msg="I am traveling next week. Will I be able to connect from the mobile app abroad?"
        )

        # Patient 7: sim_patient_7@healthcare.com
        # - 1 Completed Slot
        # - 1 In-Progress Ticket
        await create_appt(
            seeded_patients["sim_patient_7@healthcare.com"], dr_smith,
            today - timedelta(days=4), AppointmentStatus.COMPLETED,
            is_started=True,
            symptom_txt="Migraine symptoms.",
            has_ticket=True, ticket_status="IN_PROGRESS",
            ticket_msg="Unable to open my prescription PDF on my phone. App hangs."
        )

        # Patients 8, 9, 10: Completed slots to build high-volume analytics
        await create_appt(
            seeded_patients["sim_patient_8@healthcare.com"], dr_smith,
            today - timedelta(days=5), AppointmentStatus.COMPLETED,
            is_started=True, review_rating=5, review_comment="Amazing clinic experience."
        )
        await create_appt(
            seeded_patients["sim_patient_9@healthcare.com"], dr_patel,
            today - timedelta(days=6), AppointmentStatus.COMPLETED,
            is_started=True, review_rating=4
        )
        await create_appt(
            seeded_patients["sim_patient_10@healthcare.com"], dr_chen,
            today - timedelta(days=7), AppointmentStatus.COMPLETED,
            is_started=True, review_rating=5
        )

        # 5. Seed Doctor Leaves and Leave Requests
        # - Dr. Raj Patel: Leave approved
        leave_app = DoctorLeave(
            doctor_id=dr_patel.id,
            leave_date=(datetime.utcnow() + timedelta(days=5)).date(),
            reason="Dermatology symposium seminar",
            created_at=datetime.utcnow()
        )
        db.add(leave_app)
        
        # - Dr. Emily Chen: Leave request pending
        leave_req = DoctorLeaveRequest(
            doctor_id=dr_chen.id,
            leave_date=(datetime.utcnow() + timedelta(days=10)).date(),
            reason="Personal emergency health checkup",
            status="PENDING",
            created_at=datetime.utcnow()
        )
        db.add(leave_req)

        # 6. Seed Admin-Doctor Notes
        note_smith = AdminNote(
            doctor_id=dr_smith.id,
            subject="Excellent patient satisfaction feedback",
            body="Dr. Smith, the board notes that your patient ratings are consistently high. Thank you for your service!",
            priority="IMPORTANT"
        )
        note_patel = AdminNote(
            doctor_id=dr_patel.id,
            subject="Dermatology patient queue updates",
            body="Please review your slot capacity settings to allow more morning slots if possible.",
            priority="ROUTINE"
        )
        db.add_all([note_smith, note_patel])

        # Commit everything
        await db.commit()
        
    print("🌱 Database seeding complete! All dashboards are now populated with highly rigorous test cases.")

if __name__ == "__main__":
    asyncio.run(seed())
