export type UserRole = 'PATIENT' | 'DOCTOR' | 'ADMIN'

export type AppointmentStatus =
  | 'HELD'
  | 'CONFIRMED'
  | 'CANCELLED'
  | 'COMPLETED'
  | 'RESCHEDULED'
  | 'PENDING_APPROVAL'

export type UrgencyLevel = 'LOW' | 'MEDIUM' | 'HIGH'

export type LLMStatus = 'PENDING' | 'PROCESSING' | 'SUCCESS' | 'FAILED'

export interface User {
  id: string
  email: string
  full_name: string
  phone?: string
  country?: string
  role: UserRole
  has_google_calendar: boolean
  unattended_count?: number
  created_at: string
}

export interface WorkingHoursDay {
  start: string
  end: string
}

export interface DoctorProfile {
  id: string
  user_id: string
  user: User
  specialisation: string
  working_hours: Record<string, WorkingHoursDay>
  slot_duration_minutes: number
  intake_questions?: string[]
  average_rating?: number
  reviews_count?: number
  is_active: boolean
  demerit_points?: number
  is_suspended?: boolean
  unattended_count?: number
  created_at: string
}

export interface DoctorLeave {
  id: string
  doctor_id: string
  leave_date: string
  reason?: string
  created_at: string
}

export interface Slot {
  slot_start: string
  slot_end: string
  is_available: boolean
  doctor_id: string
  is_patient_conflict?: boolean
  conflicting_appointment_id?: string
  is_past?: boolean
}

export interface SymptomForm {
  id: string
  symptoms_text: string
  pre_visit_summary?: {
    urgency_level: UrgencyLevel
    chief_complaint: string
    key_symptoms: string[]
    suggested_questions: string[]
    red_flags: string[]
    intake_answers?: Record<string, string>
  }
  urgency_level?: UrgencyLevel
  llm_status: LLMStatus
  created_at: string
}

export interface PostVisitNote {
  id: string
  doctor_notes: string
  prescription_text?: string
  patient_summary?: string
  llm_status: LLMStatus
  created_at: string
}

export interface Appointment {
  id: string
  patient_id: string
  doctor_id: string
  slot_start: string
  slot_end: string
  status: AppointmentStatus
  hold_expires_at?: string
  rescheduled_to_id?: string
  start_otp?: string
  is_started?: boolean
  start_reminder_sent?: boolean
  reassigned_by_admin?: boolean
  doctor_joined?: boolean
  patient_joined?: boolean
  unattended_by?: string
  cancel_reason?: string
  created_at: string
  updated_at: string
  doctor?: DoctorProfile
  patient?: User
  symptom_form?: SymptomForm
  post_visit_note?: PostVisitNote
  review?: { rating: number; comment?: string; created_at: string }
}

export interface AdminDashboardStats {
  total_doctors: number
  active_doctors: number
  total_patients: number
  total_appointments: number
  pending_appointments: number
  completed_appointments: number
  cancelled_appointments: number
}

export interface TokenResponse {
  access_token: string
  refresh_token: string
  token_type: string
  user: User
}
