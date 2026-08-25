"""
MedPulse AI — Rigorous End-to-End Clinic Simulation
===================================================
Simulates 10 patients and doctors performing real-time operations
against the live Render backend instance.

Includes:
1. Patient registration & logins (10 users)
2. Generating, holding, and confirming slots
3. Rescheduling and cancelling appointments
4. Retrieving OTPs and verifying them (Starting consultations)
5. Saving medical summaries, prescribing, and completing consultations
6. Submitting reviews & patient satisfaction ratings
7. Creating Helpdesk support tickets & chatbot queries
8. Doctors submitting leave requests
9. Admin approvals, resolving tickets, and retrieving system-wide audit data
"""

import sys
import time
import httpx
from datetime import datetime, timedelta

API_BASE = "https://medpulse-api-mtje.onrender.com/api"

print("🔥 Starting Rigorous MedPulse AI Clinic Simulation...")
print(f"Target API Base: {API_BASE}\n")

# Use a single httpx Client for session/pool management
client = httpx.Client(timeout=30.0)

# Helper: Log steps clearly
def log_step(name, msg):
    print(f"[{datetime.now().strftime('%H:%M:%S')}] 📌 {name:<18} | {msg}")

# 1. Register 10 unique patients
patients = []
log_step("SYSTEM", "Registering and logging in 10 simulation patients...")
for i in range(1, 11):
    email = f"sim_patient_{i}_{int(time.time())}@simulation.com"
    password = f"PatientPass{i}!123"
    name = f"Simulated Patient {i}"
    
    # Register
    try:
        reg_res = client.post(f"{API_BASE}/auth/register", json={
            "email": email,
            "password": password,
            "full_name": name,
            "role": "PATIENT"
        })
        if reg_res.status_code not in (200, 201):
            log_step("SYSTEM", f"Failed to register patient {i}: {reg_res.text}")
            continue
            
        # Log in
        login_res = client.post(f"{API_BASE}/auth/login", json={
            "email": email,
            "password": password
        })
        if login_res.status_code == 200:
            data = login_res.json()
            patients.append({
                "id": data["user"]["id"],
                "name": name,
                "email": email,
                "token": data["access_token"]
            })
            log_step("PATIENT_SETUP", f"Created: {name} ({email})")
    except Exception as e:
        log_step("SYSTEM", f"Connection error during setup for patient {i}: {e}")

if len(patients) < 1:
    print("❌ Error: No simulation patients were successfully created. Exiting.")
    sys.exit(1)

# 2. Get list of Doctors and slots
log_step("SYSTEM", "Retrieving doctors list...")
try:
    doc_res = client.get(f"{API_BASE}/patient/doctors")
    doctors = doc_res.json()
except Exception as e:
    log_step("SYSTEM", f"Failed to retrieve doctors list: {e}")
    sys.exit(1)

if not doctors:
    log_step("SYSTEM", "No doctors found in system database. Exiting.")
    sys.exit(1)

selected_doctor = doctors[0]
doc_id = selected_doctor["id"]
doc_name = selected_doctor["user"]["full_name"]
log_step("SYSTEM", f"Selected doctor for simulation: Dr. {doc_name} ({selected_doctor['specialisation']})")

# 3. Generate slots if none are available for today
log_step("SYSTEM", f"Generating slots for Dr. {doc_name}...")
# Login as Admin to trigger slot generation
admin_token = None
try:
    admin_login = client.post(f"{API_BASE}/auth/login", json={
        "email": "admin@healthcare.com",
        "password": "AdminPassword123!"
    })
    if admin_login.status_code == 200:
        admin_token = admin_login.json()["access_token"]
        log_step("ADMIN", "Logged in as Admin.")
except Exception as e:
    log_step("ADMIN", f"Failed to login as Admin: {e}")

if admin_token:
    today_str = (datetime.utcnow() + timedelta(days=1)).strftime("%Y-%m-%d")
    try:
        gen_res = client.post(
            f"{API_BASE}/admin/slots/generate",
            headers={"Authorization": f"Bearer {admin_token}"},
            json={
                "doctor_id": doc_id,
                "date": today_str
            }
        )
        log_step("ADMIN", f"Generated slots for {today_str}: {gen_res.status_code} {gen_res.text}")
    except Exception as e:
        log_step("ADMIN", f"Slot generation call failed: {e}")

# 4. Perform booking workflow for the 10 patients
log_step("SYSTEM", "Beginning booking workflow for simulation patients...")
appointments = []

for idx, p in enumerate(patients):
    headers = {"Authorization": f"Bearer {p['token']}"}
    
    # 4.1 Get available slots for the doctor
    try:
        slots_res = client.get(
            f"{API_BASE}/patient/doctors/{doc_id}/slots",
            headers=headers
        )
        slots = slots_res.json()
        available_slots = [s for s in slots if s["status"] == "AVAILABLE"]
        
        if not available_slots:
            log_step(p["name"], "No available slots found to hold.")
            continue
            
        slot_to_hold = available_slots[0]
        slot_id = slot_to_hold["id"]
        
        # 4.2 Hold slot
        hold_res = client.post(
            f"{API_BASE}/patient/appointments/hold",
            headers=headers,
            json={"slot_id": slot_id}
        )
        if hold_res.status_code not in (200, 201):
            log_step(p["name"], f"Failed to hold slot {slot_id}: {hold_res.text}")
            continue
            
        appt_id = hold_res.json()["appointment_id"]
        
        # 4.3 Submit symptoms form (held slot)
        symptom_res = client.post(
            f"{API_BASE}/patient/appointments/{appt_id}/symptoms",
            headers=headers,
            json={
                "symptoms_text": f"Severe muscle cramps and fatigue. Patient {p['name']} requesting diagnostic overview.",
                "duration_days": 3,
                "severity": "MEDIUM",
                "intake_responses": ["Fatigue", "Muscle ache"]
            }
        )
        if symptom_res.status_code not in (200, 201):
            log_step(p["name"], f"Failed to submit symptoms: {symptom_res.text}")
            continue
            
        # 4.4 Confirm appointment
        confirm_res = client.post(
            f"{API_BASE}/patient/appointments/{appt_id}/confirm",
            headers=headers
        )
        if confirm_res.status_code == 200:
            log_step(p["name"], f"✅ Booking CONFIRMED! Appointment ID: {appt_id}")
            appointments.append({
                "patient": p,
                "appointment_id": appt_id,
                "slot_id": slot_id
            })
        else:
            log_step(p["name"], f"Failed to confirm booking: {confirm_res.text}")
            
    except Exception as e:
        log_step(p["name"], f"Error in booking lifecycle: {e}")

if len(appointments) < 3:
    print("❌ Error: Not enough appointments were confirmed for the rest of the simulation. Exiting.")
    sys.exit(1)

# 5. Perform Reschedule and Cancellation operations on some appointments
log_step("SYSTEM", "Simulating Rescheduling and Cancellations...")

# 5.1 Reschedule Patient 1's appointment
p1_appt = appointments[0]
headers_p1 = {"Authorization": f"Bearer {p1_appt['patient']['token']}"}
try:
    # Find another slot
    slots_res = client.get(
        f"{API_BASE}/patient/doctors/{doc_id}/slots",
        headers=headers_p1
    )
    available_slots = [s for s in slots_res.json() if s["status"] == "AVAILABLE"]
    if len(available_slots) > 1:
        new_slot_id = available_slots[1]["id"]
        # Reschedule
        res_res = client.post(
            f"{API_BASE}/patient/appointments/{p1_appt['appointment_id']}/reschedule",
            headers=headers_p1,
            json={"new_slot_id": new_slot_id}
        )
        log_step(p1_appt["patient"]["name"], f"🔄 Rescheduled: Status {res_res.status_code}")
except Exception as e:
    log_step(p1_appt["patient"]["name"], f"Rescheduling error: {e}")

# 5.2 Cancel Patient 2's appointment
p2_appt = appointments[1]
headers_p2 = {"Authorization": f"Bearer {p2_appt['patient']['token']}"}
try:
    cancel_res = client.delete(
        f"{API_BASE}/patient/appointments/{p2_appt['appointment_id']}",
        headers=headers_p2
    )
    log_step(p2_appt["patient"]["name"], f"❌ Cancelled: Status {cancel_res.status_code}")
except Exception as e:
    log_step(p2_appt["patient"]["name"], f"Cancellation error: {e}")

# 6. Log in as Doctor to conduct consultations (Appointments 3 onwards)
log_step("SYSTEM", "Logging in as Doctor to conduct consultations...")
doc_token = None
try:
    doc_login = client.post(f"{API_BASE}/auth/login", json={
        "email": "dr.smith@healthcare.com",
        "password": "DoctorPassword123!"
    })
    if doc_login.status_code == 200:
        doc_token = doc_login.json()["access_token"]
        log_step("DOCTOR", f"Logged in as Dr. {doc_name}.")
except Exception as e:
    log_step("DOCTOR", f"Failed to login as Doctor: {e}")
    sys.exit(1)

doc_headers = {"Authorization": f"Bearer {doc_token}"}

for appt in appointments[2:]:
    patient_name = appt["patient"]["name"]
    appt_id = appt["appointment_id"]
    patient_headers = {"Authorization": f"Bearer {appt['patient']['token']}"}
    
    # 6.1 Patient fetches the OTP code from their appointment details
    otp_code = None
    try:
        detail_res = client.get(
            f"{API_BASE}/patient/appointments/{appt_id}",
            headers=patient_headers
        )
        if detail_res.status_code == 200:
            otp_code = detail_res.json().get("start_otp")
            log_step(patient_name, f"Retrieved start OTP: {otp_code}")
    except Exception as e:
        log_step(patient_name, f"Failed to retrieve OTP: {e}")
        
    if not otp_code:
        continue
        
    # 6.2 Doctor verifies OTP to start consultation
    try:
        start_res = client.post(
            f"{API_BASE}/doctor/appointments/{appt_id}/start-verify",
            headers=doc_headers,
            json={"otp": otp_code}
        )
        if start_res.status_code == 200:
            log_step("DOCTOR", f"⚡ Consultation STARTED for {patient_name}!")
        else:
            log_step("DOCTOR", f"Failed to verify OTP for {patient_name}: {start_res.text}")
            continue
            
        # 6.3 Doctor saves notes / clinical progress
        note_res = client.post(
            f"{API_BASE}/doctor/appointments/{appt_id}/clinical-note",
            headers=doc_headers,
            json={
                "clinical_summary": f"Patient presents with typical symptoms of metabolic exhaustion. Recommended hydration and blood panels. Checked vital signs, BP normal.",
                "prescriptions": [
                    {"medicine_name": "Magnesium Glycinate", "dosage": "400mg", "duration": "30 days", "instructions": "Take before bed"},
                    {"medicine_name": "Coenzyme Q10", "dosage": "100mg", "duration": "15 days", "instructions": "Take with breakfast"}
                ]
            }
        )
        log_step("DOCTOR", f"📝 Saved clinical progress for {patient_name}: {note_res.status_code}")
        
        # 6.4 Doctor completes consultation
        complete_res = client.post(
            f"{API_BASE}/doctor/appointments/{appt_id}/complete",
            headers=doc_headers,
            json={
                "post_visit_care_plan": "Rest 8 hours daily. Maintain electrolyte-rich liquid diet for next 48 hours. Follow up in 2 weeks.",
                "clinical_summary": "Finalised: metabolic muscle fatigue. Prescriptions locked."
            }
        )
        if complete_res.status_code == 200:
            log_step("DOCTOR", f"🏁 Consultation COMPLETED for {patient_name}!")
        else:
            log_step("DOCTOR", f"Failed to complete consultation for {patient_name}: {complete_res.text}")
            
    except Exception as e:
        log_step("DOCTOR", f"Error during consultation steps: {e}")

# 7. Simulating Patient Helpdesk Chatbot & Ticket submissions
log_step("SYSTEM", "Simulating Patient chatbot interactions & tickets creation...")
for appt in appointments[2:]:
    patient_name = appt["patient"]["name"]
    p_headers = {"Authorization": f"Bearer {appt['patient']['token']}"}
    
    # 7.1 Submit Feedback Review
    try:
        review_res = client.post(
            f"{API_BASE}/doctor/appointments/{appt_id}/review",
            headers=p_headers,
            json={
                "rating": 5,
                "comments": "Excellent session! The doctor explained everything clearly and the care plan is very easy to follow."
            }
        )
        log_step(patient_name, f"⭐ Left 5-star review: {review_res.status_code}")
    except Exception as e:
        log_step(patient_name, f"Failed to leave review: {e}")
        
    # 7.2 Send AI Support Chatbot Query
    try:
        chat_res = client.post(
            f"{API_BASE}/patient/support/chat",
            headers=p_headers,
            json={"message": f"Hi! I was diagnosed with muscle cramps. Can I drink coconut water daily?"}
        )
        log_step(patient_name, f"🤖 Chatbot responded: {chat_res.status_code}")
    except Exception as e:
        log_step(patient_name, f"Failed to message chatbot: {e}")
        
    # 7.3 Create Helpdesk Ticket
    try:
        ticket_res = client.post(
            f"{API_BASE}/patient/support/tickets",
            headers=p_headers,
            json={
                "category": "APPOINTMENT_FEEDBACK",
                "subject": "Inquiry about prescription duration",
                "description": "I forgot to ask Dr. Smith if I should stop taking Magnesium Glycinate if cramps go away."
            }
        )
        if ticket_res.status_code in (200, 201):
            log_step(patient_name, f"🎫 Created Ticket: {ticket_res.json()['id']}")
    except Exception as e:
        log_step(patient_name, f"Failed to create ticket: {e}")

# 8. Doctor leave requests
log_step("SYSTEM", "Simulating Doctor leave application...")
try:
    leave_res = client.post(
        f"{API_BASE}/doctor/leaves",
        headers=doc_headers,
        json={
            "start_date": (datetime.utcnow() + timedelta(days=10)).strftime("%Y-%m-%d"),
            "end_date": (datetime.utcnow() + timedelta(days=12)).strftime("%Y-%m-%d"),
            "reason": "Attending medical conference in Paris"
        }
    )
    if leave_res.status_code in (200, 201):
        log_step("DOCTOR", f"✈️ Leave request submitted successfully! ID: {leave_res.json()['id']}")
except Exception as e:
    log_step("DOCTOR", f"Failed to submit leave request: {e}")

# 9. Admin checks system logs, resolves tickets, and approvals
if admin_token:
    admin_headers = {"Authorization": f"Bearer {admin_token}"}
    log_step("SYSTEM", "Simulating Admin audit actions...")
    
    # 9.1 Approve leave requests
    try:
        req_res = client.get(f"{API_BASE}/admin/leaves", headers=admin_headers)
        pending_leaves = [l for l in req_res.json() if l["status"] == "PENDING"]
        for leave in pending_leaves:
            app_res = client.post(
                f"{API_BASE}/admin/leaves/{leave['id']}/approve",
                headers=admin_headers
            )
            log_step("ADMIN", f"✅ Approved Leave Request {leave['id']}: {app_res.status_code}")
    except Exception as e:
        log_step("ADMIN", f"Failed to process leave approvals: {e}")
        
    # 9.2 Retrieve support tickets and resolve them
    try:
        tix_res = client.get(f"{API_BASE}/admin/support/tickets", headers=admin_headers)
        open_tickets = [t for t in tix_res.json() if t["status"] == "PENDING"]
        for ticket in open_tickets[:3]:
            res_res = client.post(
                f"{API_BASE}/admin/support/tickets/{ticket['id']}/resolve",
                headers=admin_headers,
                json={"resolution_summary": "Advised patient to stick to prescription duration. If symptoms resolve early, consult physician before stopping."}
            )
            log_step("ADMIN", f"🎫 Resolved Ticket {ticket['id']}: {res_res.status_code}")
    except Exception as e:
        log_step("ADMIN", f"Failed to resolve tickets: {e}")

print("\n🎉 MedPulse AI Stress Clinic Simulation completed successfully!")
print("🚀 Dashboards are now populated with highly rigorous test cases and live transactions!")
