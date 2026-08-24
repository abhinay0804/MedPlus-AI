import React, { useEffect, useState, useCallback } from 'react'
import { useParams, useNavigate, useSearchParams, Link } from 'react-router-dom'
import { Layout } from '../../components/Layout'
import { api } from '../../lib/api'
import { DoctorProfile, Slot, Appointment } from '../../types'
import { SlotPicker } from '../../components/SlotPicker'
import { parseDate } from '../../lib/utils'
import { HoldCountdown } from '../../components/HoldCountdown'
import confetti from 'canvas-confetti'
import {
  Calendar as CalendarIcon,
  Clock,
  CheckCircle2,
  FileText,
  AlertCircle,
  ArrowRight,
  ArrowLeft,
  Stethoscope,
  Sparkles,
  Eye,
  RefreshCw,
} from 'lucide-react'

export const BookAppointment: React.FC = () => {
  const { doctorId } = useParams<{ doctorId: string }>()
  const [searchParams] = useSearchParams()
  const targetApptId = searchParams.get('appointment_id') || ''
  const initialStepParam = searchParams.get('step') || ''
  const rescheduleAppointmentId = searchParams.get('reschedule_appointment_id')
  const navigate = useNavigate()

  const [doctor, setDoctor] = useState<DoctorProfile | null>(null)
  const [selectedDate, setSelectedDate] = useState<string>(
    new Date().toISOString().split('T')[0]
  )
  const [slots, setSlots] = useState<Slot[]>([])
  const [selectedSlot, setSelectedSlot] = useState<Slot | null>(null)
  const [heldAppointment, setHeldAppointment] = useState<Appointment | null>(null)
  const [symptomsText, setSymptomsText] = useState(() => {
    const carryActive = sessionStorage.getItem('medplus_carry_forward_active') === 'true'
    if (carryActive) {
      return sessionStorage.getItem('medplus_temp_symptoms') || ''
    }
    sessionStorage.removeItem('medplus_temp_symptoms')
    return ''
  })
  const [aiRecommendedSpecialty, setAiRecommendedSpecialty] = useState<string | null>(null)
  const [aiReasoning, setAiReasoning] = useState<string | null>(null)
  const [lastAnalyzedText, setLastAnalyzedText] = useState('')

  const activeRecommendedSpecialty = aiRecommendedSpecialty

  const isSpecialtyMismatch = Boolean(
    doctor &&
    activeRecommendedSpecialty &&
    doctor.specialisation.toLowerCase().trim() !== activeRecommendedSpecialty.toLowerCase().trim() &&
    doctor.specialisation.toLowerCase().trim() !== 'general medicine'
  )

  const [step, setStep] = useState<number>(1) // 1: Select slot, 2: Symptoms, 3: Confirmed
  const [isLoadingSlots, setIsLoadingSlots] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const [intakeQuestions, setIntakeQuestions] = useState<string[]>([
    'How long have you experienced these symptoms?',
    'What recent medications or treatments have you tried?',
    'On a scale of 1-10, what is the pain or discomfort severity?',
    'Are there any specific triggers or aggravating factors?',
  ])
  const [intakeAnswers, setIntakeAnswers] = useState<Record<string, string>>(() => {
    const carryActive = sessionStorage.getItem('medplus_carry_forward_active') === 'true'
    if (carryActive) {
      const saved = sessionStorage.getItem('medplus_temp_intake')
      return saved ? JSON.parse(saved) : {}
    }
    sessionStorage.removeItem('medplus_temp_intake')
    return {}
  })
  const [manualEdits, setManualEdits] = useState<Record<string, boolean>>({})
  const [isAnalyzingSpecialty, setIsAnalyzingSpecialty] = useState(false)

  const isBookingCompletedRef = React.useRef(false)
  const heldAppointmentRef = React.useRef<Appointment | null>(null)

  useEffect(() => {
    heldAppointmentRef.current = heldAppointment
  }, [heldAppointment])

  // Cleanup hold on unmount / navigate away
  useEffect(() => {
    return () => {
      if (heldAppointmentRef.current && !isBookingCompletedRef.current) {
        const apptId = heldAppointmentRef.current.id
        api.delete(`/patient/appointments/${apptId}`).catch((err) => {
          console.error('Failed to release slot hold on unmount:', err)
        })
      }
    }
  }, [])

  // Auto-save symptom text to sessionStorage
  useEffect(() => {
    sessionStorage.setItem('medplus_temp_symptoms', symptomsText)
  }, [symptomsText])

  // Auto-save intake answers to sessionStorage
  useEffect(() => {
    if (Object.keys(intakeAnswers).length > 0) {
      sessionStorage.setItem('medplus_temp_intake', JSON.stringify(intakeAnswers))
    }
  }, [intakeAnswers])

  // Listen to window events to sync hold release triggers
  useEffect(() => {
    sessionStorage.removeItem('medplus_carry_forward_active')

    const handleReleased = () => {
      setHeldAppointment(null)
      setSelectedSlot(null)
      setStep(1)
    }
    window.addEventListener('medplus_hold_released', handleReleased)
    return () => window.removeEventListener('medplus_hold_released', handleReleased)
  }, [])

  // 100% Dynamic Gemini LLM Analysis & Entity Extraction
  useEffect(() => {
    if (!symptomsText || symptomsText.trim().length < 5) {
      setAiRecommendedSpecialty(null)
      setAiReasoning(null)
      setIsAnalyzingSpecialty(false)
      return
    }

    if (symptomsText.trim() === lastAnalyzedText.trim()) {
      return
    }

    setIsAnalyzingSpecialty(true)
    const timer = setTimeout(async () => {
      try {
        const res = await api.post<{
          recommended_specialty: string
          reasoning: string
          extracted_intake?: {
            duration?: string
            medications?: string
            severity?: string
            triggers?: string
          }
        }>('/patient/analyze-specialty', {
          symptoms_text: symptomsText,
        })
        setAiRecommendedSpecialty(res.recommended_specialty)
        setAiReasoning(res.reasoning)
        setLastAnalyzedText(symptomsText)

        // 100% Dynamic Gemini AI Intake Extraction (NO hardcoded regex)
        if (res.extracted_intake) {
          setIntakeAnswers((prev) => {
            const updated = { ...prev }
            const ext = res.extracted_intake!
            intakeQuestions.forEach((q) => {
              if (manualEdits[q]) return
              const q_lower = q.toLowerCase()
              if (q_lower.includes('duration') || q_lower.includes('long') || q_lower.includes('time') || q_lower.includes('day') || q_lower.includes('week') || q_lower.includes('month')) {
                updated[q] = ext.duration && ext.duration !== 'Not specified' ? ext.duration : ''
              } else if (q_lower.includes('medication') || q_lower.includes('treatment') || q_lower.includes('medicine') || q_lower.includes('drug') || q_lower.includes('tried') || q_lower.includes('take')) {
                updated[q] = ext.medications && ext.medications !== 'None mentioned' ? ext.medications : ''
              } else if (q_lower.includes('pain') || q_lower.includes('severity') || q_lower.includes('scale') || q_lower.includes('discomfort')) {
                updated[q] = ext.severity && ext.severity !== 'Not specified' ? ext.severity : ''
              } else if (q_lower.includes('trigger') || q_lower.includes('factor') || q_lower.includes('aggravate') || q_lower.includes('worse')) {
                updated[q] = ext.triggers && ext.triggers !== 'Not specified' ? ext.triggers : ''
              } else {
                updated[q] = ''
              }
            })
            return updated
          })
        }
      } catch (err) {
        console.error('Contextual specialty analysis error:', err)
      } finally {
        setIsAnalyzingSpecialty(false)
      }
    }, 350)

    return () => clearTimeout(timer)
  }, [symptomsText, manualEdits, lastAnalyzedText])
  const [error, setError] = useState<string | null>(null)
  const [conflictAppointmentId, setConflictAppointmentId] = useState<string | null>(null)
  const [myAppointments, setMyAppointments] = useState<Appointment[]>([])

  useEffect(() => {
    async function loadDoctor() {
      if (!doctorId) return
      try {
        const docData = await api.get<DoctorProfile>(`/patient/doctors/${doctorId}`)
        setDoctor(docData)
        if (docData.intake_questions && docData.intake_questions.length > 0) {
          setIntakeQuestions(docData.intake_questions)
        }
      } catch (err) {
        console.error('Failed to load doctor profile:', err)
      }
    }
    loadDoctor()
  }, [doctorId])

  // Load symptom details to carry forward if rescheduling an existing appointment
  useEffect(() => {
    async function loadRescheduleDetails() {
      if (rescheduleAppointmentId) {
        try {
          const oldAppt = await api.get<Appointment>(`/patient/appointments/${rescheduleAppointmentId}`)
          if (oldAppt.symptom_form?.symptoms_text) {
            setSymptomsText(oldAppt.symptom_form.symptoms_text)
            setLastAnalyzedText(oldAppt.symptom_form.symptoms_text)
          }
          if (oldAppt.symptom_form?.pre_visit_summary?.intake_answers) {
            setIntakeAnswers(oldAppt.symptom_form.pre_visit_summary.intake_answers)
          }
        } catch (err) {
          console.error('Failed to load reschedule details:', err)
        }
      }
    }
    loadRescheduleDetails()
  }, [rescheduleAppointmentId])

  const loadMyAppointments = useCallback(async () => {
    if (!doctorId) return
    try {
      const appts = await api.get<Appointment[]>('/patient/appointments')
      setMyAppointments(appts)

      const targetApptId = searchParams.get('appointment_id')
      const initialStepParam = searchParams.get('step')

      let activeHold = targetApptId ? appts.find((a) => a.id === targetApptId) : null
      if (!activeHold) {
        activeHold = appts.find(
          (a) =>
            (a.status === 'HELD' || a.status === 'CONFIRMED') &&
            a.doctor_id === doctorId &&
            a.hold_expires_at &&
            new Date(a.hold_expires_at).getTime() > Date.now()
        )
      }

      if (activeHold) {
        const fullAppt = await api.get<Appointment>(`/patient/appointments/${activeHold.id}`)
        setHeldAppointment(fullAppt)
        if (fullAppt.slot_start) {
          setSelectedDate(fullAppt.slot_start.split('T')[0])
        }
        if (fullAppt.symptom_form?.symptoms_text) {
          setSymptomsText(fullAppt.symptom_form.symptoms_text)
          setLastAnalyzedText(fullAppt.symptom_form.symptoms_text)
        }
        if (fullAppt.symptom_form?.pre_visit_summary?.intake_answers) {
          setIntakeAnswers(fullAppt.symptom_form.pre_visit_summary.intake_answers)
        }
        setSelectedSlot({
          slot_start: fullAppt.slot_start,
          slot_end: fullAppt.slot_end,
          is_available: true,
          doctor_id: fullAppt.doctor_id,
        })
        if (initialStepParam === '2' || targetApptId || fullAppt.status === 'HELD' || fullAppt.status === 'CONFIRMED') {
          setStep(2) // Directly land on Step 2 (Symptoms & Confirm)
        }
      }
    } catch (err) {
      console.error('Failed to load patient appointments:', err)
    }
  }, [doctorId, searchParams])

  // Load patient's existing active appointments to prevent double-booking visually & auto-resume active holds
  useEffect(() => {
    loadMyAppointments()
  }, [loadMyAppointments])

  useEffect(() => {
    async function loadSlots() {
      if (!doctorId || !selectedDate) return
      setIsLoadingSlots(true)
      setError(null)
      setConflictAppointmentId(null)
      try {
        const slotsData = await api.get<Slot[]>(
          `/patient/doctors/${doctorId}/slots?target_date=${selectedDate}`
        )
        
        // Cross-reference slots with patient's existing active appointments to block overlapping slots
        const processed = slotsData.map((s) => {
          const sStart = parseDate(s.slot_start).getTime()
          const sEnd = parseDate(s.slot_end).getTime()
          const conflicting = myAppointments.find((a) => {
            const isHoldActive = a.status === 'HELD' && a.hold_expires_at && parseDate(a.hold_expires_at).getTime() > Date.now()
            const isApptActive = a.status === 'CONFIRMED' || isHoldActive
            if (!isApptActive) return false

            // Do not conflict with the currently held/edited appointment itself
            if (heldAppointment && a.id === heldAppointment.id) return false

            const aStart = parseDate(a.slot_start).getTime()
            const aEnd = parseDate(a.slot_end).getTime()
            return aStart < sEnd && aEnd > sStart
          })

          if (conflicting) {
            return {
              ...s,
              is_available: false,
              is_patient_conflict: true,
              conflicting_appointment_id: conflicting.id,
            }
          }
          return s
        })

        setSlots(processed)
      } catch (err: any) {
        setError('Could not load slots for selected date.')
      } finally {
        setIsLoadingSlots(false)
      }
    }
    loadSlots()
  }, [doctorId, selectedDate, myAppointments])

  const handleSelectConflictSlot = (slot: Slot) => {
    const sStart = parseDate(slot.slot_start).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    const sEnd = parseDate(slot.slot_end).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    setError(`You already have an appointment scheduled (${sStart} - ${sEnd}) that overlaps with this slot.`)
    if (slot.conflicting_appointment_id) {
      setConflictAppointmentId(slot.conflicting_appointment_id)
    }
  }

  const handleCancelHold = async () => {
    if (heldAppointment) {
      try {
        setIsSubmitting(true)
        await api.delete(`/patient/appointments/${heldAppointment.id}`)
      } catch (err) {
        console.error('Failed to cancel held appointment:', err)
      } finally {
        setIsSubmitting(false)
      }
    }
    setHeldAppointment(null)
    setSelectedSlot(null)
    setStep(1)
    loadMyAppointments()
  }

  const handleBackNavigation = async () => {
    if (heldAppointment) {
      try {
        await api.delete(`/patient/appointments/${heldAppointment.id}`)
      } catch (err) {
        console.error('Failed to release hold on back click:', err)
      }
    }
    navigate('/patient/doctors')
  }

  const handleHoldSlot = async (slot: Slot) => {
    if (!doctorId) return
    setSelectedSlot(slot)
    setError(null)
    setConflictAppointmentId(null)
    setIsSubmitting(true)

    try {
      const rescheduleAppointmentId = searchParams.get('reschedule_appointment_id')
      let appt: Appointment
      if (rescheduleAppointmentId) {
        appt = await api.put<Appointment>(`/patient/appointments/${rescheduleAppointmentId}/reschedule`, {
          new_slot_start: slot.slot_start,
          new_doctor_id: doctorId,
        })
      } else if (heldAppointment) {
        appt = await api.put<Appointment>(`/patient/appointments/${heldAppointment.id}/reschedule`, {
          new_slot_start: slot.slot_start,
        })
      } else {
        appt = await api.post<Appointment>('/patient/appointments', {
          doctor_id: doctorId,
          slot_start: slot.slot_start,
        })
      }
      setHeldAppointment(appt)
      setStep(2) // Move to Symptom Form
    } catch (err: any) {
      const errMsg = err.message || 'This slot is no longer available. Please choose another.'
      setError(errMsg)

      // Find matching conflicting appointment for "View Details" button
      const sStart = parseDate(slot.slot_start).getTime()
      const sEnd = parseDate(slot.slot_end).getTime()
      const matching = myAppointments.find((a) => {
        const aStart = parseDate(a.slot_start).getTime()
        const aEnd = parseDate(a.slot_end).getTime()
        return aStart < sEnd && aEnd > sStart
      })
      if (matching) {
        setConflictAppointmentId(matching.id)
      }
    } finally {
      setIsSubmitting(false)
    }
  }

  const overlappingAppointment = myAppointments.find((a) => {
    if (!heldAppointment || a.id === heldAppointment.id) return false
    const isHoldActive = a.status === 'HELD' && a.hold_expires_at && parseDate(a.hold_expires_at).getTime() > Date.now()
    const isApptActive = a.status === 'CONFIRMED' || isHoldActive
    if (!isApptActive) return false

    const aStart = parseDate(a.slot_start).getTime()
    const aEnd = parseDate(a.slot_end).getTime()
    const hStart = parseDate(heldAppointment.slot_start).getTime()
    const hEnd = parseDate(heldAppointment.slot_end).getTime()
    return aStart < hEnd && aEnd > hStart
  })

  const handleConfirmBooking = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!heldAppointment) return

    const isPatientConflictOverlap = Boolean(overlappingAppointment)
    if (isPatientConflictOverlap) {
      setError('Booking blocked: You have an overlapping appointment. Please reschedule it before confirming.')
      return
    }

    // Pre-booking safeguard: Block booking if AI triage specialty mismatch is detected
    const isSpecialtyMismatch = Boolean(
      doctor &&
      aiRecommendedSpecialty &&
      doctor.specialisation.toLowerCase().trim() !== aiRecommendedSpecialty.toLowerCase().trim() &&
      doctor.specialisation.toLowerCase().trim() !== 'general medicine' &&
      aiRecommendedSpecialty.toLowerCase().trim() !== 'general medicine'
    )

    if (isSpecialtyMismatch) {
      setError(`Booking blocked: Dr. ${doctor?.user?.full_name} (${doctor?.specialisation}) cannot treat ${aiRecommendedSpecialty} conditions. The slot has been released for other patients. Please select a ${aiRecommendedSpecialty} specialist.`)
      // Release slot
      try {
        await api.delete(`/patient/appointments/${heldAppointment.id}`)
      } catch (err) {
        console.error('Failed to release mismatched slot:', err)
      }
      return
    }

    setError(null)
    setIsSubmitting(true)

    try {
      // 1. Submit Symptom Form if entered
      if (symptomsText.trim().length >= 5) {
        await api.post(`/patient/appointments/${heldAppointment.id}/symptoms`, {
          symptoms_text: symptomsText.trim(),
          intake_answers: intakeAnswers,
        })
      }

      // 2. Confirm Appointment
      const confirmedAppt = await api.post<Appointment>(
        `/patient/appointments/${heldAppointment.id}/confirm`,
        {}
      )

      isBookingCompletedRef.current = true
      sessionStorage.removeItem('medplus_temp_symptoms')
      sessionStorage.removeItem('medplus_temp_intake')
      window.dispatchEvent(new CustomEvent('medplus_hold_released'))
      setStep(3) // Success
      confetti({
        particleCount: 100,
        spread: 70,
        origin: { y: 0.6 },
      })
    } catch (err: any) {
      setError(err.message || 'Failed to confirm booking. Hold may have expired.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Layout>
      <div className="max-w-3xl mx-auto space-y-8">
        {/* Header with Back Arrow Button */}
        <div className="flex items-center space-x-4">
          <button
            onClick={handleBackNavigation}
            className="p-3 rounded-2xl bg-white dark:bg-slate-800/80 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white border border-slate-200 dark:border-slate-700 transition flex items-center justify-center shrink-0 shadow-sm"
            title="Back to Doctors List"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>

          <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-teal-500 to-emerald-400 text-white flex items-center justify-center font-bold text-xl shadow-lg shadow-teal-500/20 shrink-0">
            <Stethoscope className="w-8 h-8" />
          </div>
          <div>
            <h2 className="text-2xl font-extrabold text-slate-900 dark:text-white tracking-tight">
              {doctor ? `Consultation with ${doctor.user?.full_name}` : 'Book Consultation'}
            </h2>
            <p className="text-slate-600 dark:text-slate-400 text-sm mt-0.5">
              {doctor?.specialisation} • {doctor?.slot_duration_minutes} Minutes Duration
            </p>
          </div>
        </div>

        {/* Red Error Warning Banner with View Appointment Details Button */}
        {error && (
          <div className="p-4 rounded-xl bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/30 flex items-center justify-between text-rose-700 dark:text-rose-300 text-sm shadow-sm">
            <div className="flex items-start space-x-3 pr-2">
              <AlertCircle className="w-5 h-5 shrink-0 mt-0.5 text-rose-600 dark:text-rose-400" />
              <span className="font-medium leading-relaxed">{error}</span>
            </div>

            {conflictAppointmentId && (
              <button
                onClick={() => navigate(`/patient/appointments/${conflictAppointmentId}`)}
                className="px-3.5 py-1.5 bg-rose-100 dark:bg-rose-500/20 hover:bg-rose-200 dark:hover:bg-rose-500/30 border border-rose-300 dark:border-rose-500/40 text-rose-800 dark:text-rose-200 font-bold text-xs rounded-xl transition flex items-center space-x-1.5 shrink-0 shadow-sm cursor-pointer"
              >
                <Eye className="w-4 h-4" />
                <span>View Details</span>
                <ArrowRight className="w-3.5 h-3.5 ml-0.5" />
              </button>
            )}
          </div>
        )}

        {/* Step Indicator */}
        <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-4 text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
          <span className={step >= 1 ? 'text-teal-600 dark:text-teal-400' : ''}>1. Select Time Slot</span>
          <span>→</span>
          <span className={step >= 2 ? 'text-teal-600 dark:text-teal-400' : ''}>2. Symptoms & Confirm</span>
          <span>→</span>
          <span className={step === 3 ? 'text-teal-600 dark:text-teal-400' : ''}>3. Confirmed</span>
        </div>

        {/* STEP 1: Select Date & Slot */}
        {step === 1 && (
          <div className="space-y-6">
            {rescheduleAppointmentId && (
              <div className="p-4 rounded-xl bg-violet-500/15 border border-violet-500/30 flex flex-col sm:flex-row sm:items-center sm:justify-between text-violet-800 dark:text-violet-300 text-xs font-semibold space-y-2 sm:space-y-0 shadow-sm">
                <div className="flex items-center space-x-2">
                  <RefreshCw className="w-4.5 h-4.5 text-violet-600 dark:text-violet-400 shrink-0" />
                  <span>You are rescheduling your consultation. Feel free to choose a new slot or select a different doctor.</span>
                </div>
                <Link
                  to={`/patient/doctors?reschedule_appointment_id=${rescheduleAppointmentId}`}
                  className="px-3.5 py-1.5 bg-violet-600 hover:bg-violet-700 text-white font-bold rounded-lg transition shrink-0 text-center text-[11px]"
                >
                  Change Specialist
                </Link>
              </div>
            )}
            <div className="bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 space-y-6 shadow-sm">
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-2">
                Select Date
              </label>
              <div className="relative inline-block w-full sm:w-auto">
                <input
                  type="date"
                  value={selectedDate}
                  min={new Date().toISOString().split('T')[0]}
                  onChange={(e) => setSelectedDate(e.target.value)}
                  className="w-full sm:w-auto pl-4 pr-10 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:border-teal-500/50 rounded-xl text-slate-900 dark:text-white font-semibold text-sm focus:outline-none focus:border-teal-500 cursor-pointer"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-2">
                Available Time Slots
              </label>
              <SlotPicker
                slots={slots}
                selectedSlot={selectedSlot}
                onSelectSlot={handleHoldSlot}
                onSelectConflictSlot={handleSelectConflictSlot}
                isLoading={isLoadingSlots}
              />
            </div>
          </div>
          </div>
        )}

        {/* STEP 2: Hold Timer, Symptom Form & Confirmation */}
        {step === 2 && (
          <form onSubmit={handleConfirmBooking} className="space-y-6">
            {heldAppointment?.hold_expires_at && (
              <HoldCountdown
                expiresAt={heldAppointment.hold_expires_at}
                onExpire={() => {
                  setError('Your 5-minute slot hold has expired. Please select a slot again.')
                  setStep(1)
                }}
              />
            )}

            <div className="bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 space-y-4 shadow-sm">
              <div className="flex items-center space-x-2 text-teal-600 dark:text-teal-400 border-b border-slate-200 dark:border-slate-800 pb-3">
                <Sparkles className="w-5 h-5" />
                <h3 className="font-bold text-base text-slate-900 dark:text-white">Pre-Visit Symptom Form (AI Triage)</h3>
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-400">
                Describe your symptoms, medical concerns, or reasons for visit. Our AI assistant will analyze this to provide a triage summary for your doctor.
              </p>

              <div>
                <textarea
                  rows={3}
                  required
                  minLength={5}
                  value={symptomsText}
                  onChange={(e) => setSymptomsText(e.target.value)}
                  placeholder="Describe your current symptoms, how long you've experienced them, severity, etc..."
                  className="w-full p-4 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white text-sm focus:outline-none focus:border-teal-500 placeholder-slate-400 dark:placeholder-slate-500 transition"
                />

                {/* Doctor's Pre-Consultation Intake Questionnaire (AI Auto-Filled + Manual Fallback) */}
                {symptomsText.trim().length >= 5 && (
                  <div className="mt-4 p-4 rounded-xl bg-teal-500/5 border border-teal-500/20 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-1.5 text-teal-700 dark:text-teal-300">
                        <Sparkles className="w-4 h-4 text-teal-500" />
                        <span className="font-bold text-xs uppercase tracking-wider">Dr. {doctor?.user?.full_name}'s Intake Questionnaire</span>
                      </div>
                      <span className="px-2 py-0.5 rounded-full bg-teal-500/15 text-teal-700 dark:text-teal-300 font-extrabold text-[10px]">
                        ✨ AI Auto-Filled & Editable
                      </span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                      {intakeQuestions.map((q, idx) => {
                        const val = intakeAnswers[q] || ''
                        const isAutoFilled = Boolean(val)
                        return (
                          <div key={idx} className="bg-white dark:bg-slate-800/80 p-3 rounded-lg border border-slate-200 dark:border-slate-700/60 shadow-2xs space-y-1.5">
                            <div className="flex items-center justify-between">
                              <label className="text-slate-700 dark:text-slate-300 font-bold block">{idx + 1}. {q}</label>
                              {isAutoFilled && (
                                <span className="text-[10px] text-teal-600 dark:text-teal-400 font-extrabold bg-teal-50 dark:bg-teal-950/60 px-1.5 py-0.5 rounded border border-teal-500/20">
                                  ✨ AI Auto-Filled
                                </span>
                              )}
                            </div>
                            <input
                              type="text"
                              value={val}
                              onChange={(e) => {
                                setIntakeAnswers({ ...intakeAnswers, [q]: e.target.value })
                                setManualEdits({ ...manualEdits, [q]: true })
                              }}
                              placeholder="Type answer or leave to auto-extract..."
                              className="w-full px-2.5 py-1.5 rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white text-xs focus:ring-1 focus:ring-teal-500 outline-none"
                            />
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}

                {symptomsText.trim().length < 5 && (
                  <p className="text-xs text-amber-600 dark:text-amber-400 font-semibold mt-2 flex items-center space-x-1">
                    <AlertCircle className="w-3.5 h-3.5 inline mr-1" />
                    <span>Please enter your symptoms (at least 5 characters) to enable the confirmation button.</span>
                  </p>
                )}

                {activeRecommendedSpecialty && activeRecommendedSpecialty.toLowerCase() !== doctor?.specialisation?.toLowerCase() && (
                  <div className={`p-4 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs shadow-sm mt-3 ${
                    isSpecialtyMismatch
                      ? 'bg-rose-50 dark:bg-rose-500/10 border-rose-200 dark:border-rose-500/30 text-rose-800 dark:text-rose-300'
                      : 'bg-teal-50 dark:bg-teal-500/10 border-teal-200 dark:border-teal-500/30 text-teal-900 dark:text-teal-200'
                  }`}>
                    <div className="flex items-start space-x-2.5">
                      <Sparkles className="w-4 h-4 text-teal-600 dark:text-teal-400 shrink-0 mt-0.5" />
                      <div>
                        <p className="font-extrabold text-sm">
                          {isSpecialtyMismatch ? 'Specialisation Mismatch Block' : '✨ AI Clinical Triage Recommendation'}
                        </p>
                        <p className="mt-0.5 opacity-90 leading-relaxed">
                          {isSpecialtyMismatch ? (
                            <>
                              Currently selected doctor <strong>{doctor?.user?.full_name}</strong> is a <strong>{doctor?.specialisation}</strong> specialist, but MedPlus AI recommends a <strong>{activeRecommendedSpecialty}</strong> specialist. Booking is disabled.
                            </>
                          ) : (
                            <>
                              MedPlus AI evaluated your symptoms and suggests a <strong>{activeRecommendedSpecialty}</strong> specialist. You can continue with <strong>{doctor?.user?.full_name}</strong> ({doctor?.specialisation}) or switch to a specialist.
                            </>
                          )}
                        </p>
                        {aiReasoning && <p className="text-[11px] opacity-80 mt-1 italic">{aiReasoning}</p>}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        sessionStorage.setItem('medplus_carry_forward_active', 'true')
                        navigate(`/patient/doctors?specialisation=${encodeURIComponent(activeRecommendedSpecialty)}`)
                      }}
                      className="px-3.5 py-2 bg-teal-500 hover:bg-teal-600 text-white font-bold text-xs rounded-xl transition flex items-center space-x-1.5 shrink-0 self-start sm:self-center cursor-pointer shadow-sm"
                    >
                      <Eye className="w-4 h-4" />
                      <span>View {activeRecommendedSpecialty} Specialists</span>
                      <ArrowRight className="w-3.5 h-3.5 ml-0.5" />
                    </button>
                  </div>
                )}
                {overlappingAppointment && (
                  <div className="p-4 rounded-xl border bg-rose-50 dark:bg-rose-500/10 border-rose-200 dark:border-rose-500/30 text-rose-800 dark:text-rose-300 text-xs shadow-sm mt-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-start space-x-2.5">
                      <AlertCircle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
                      <div>
                        <p className="font-extrabold text-sm text-rose-900 dark:text-rose-300">Schedule Conflict Mismatch</p>
                        <p className="mt-0.5 opacity-90 leading-relaxed text-rose-800 dark:text-rose-450">
                          You already have an appointment scheduled with <strong>Dr. {overlappingAppointment.doctor?.user?.full_name || 'Specialist'}</strong> ({overlappingAppointment.doctor?.specialisation}) that overlaps with this slot (<strong>{parseDate(overlappingAppointment.slot_start).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</strong>).
                        </p>
                        <p className="text-[11px] opacity-80 mt-1">Please reschedule or cancel that appointment before you can confirm this booking.</p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => navigate(`/patient/doctors/${overlappingAppointment.doctor_id}/book?appointment_id=${overlappingAppointment.id}`)}
                      className="px-3.5 py-2 bg-rose-500 hover:bg-rose-600 text-white font-bold text-xs rounded-xl transition flex items-center space-x-1.5 shrink-0 self-start sm:self-center cursor-pointer shadow-sm"
                    >
                      <Eye className="w-4 h-4" />
                      <span>Reschedule Conflicting Booking</span>
                      <ArrowRight className="w-3.5 h-3.5 ml-0.5" />
                    </button>
                  </div>
                )}
              </div>

              <div className="flex flex-col items-end space-y-2 pt-4 border-t border-slate-200 dark:border-slate-800">
                <div className="flex items-center justify-between w-full">
                  <button
                    type="button"
                    onClick={handleCancelHold}
                    className="px-4 py-2.5 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:white text-xs font-bold cursor-pointer"
                  >
                    ← Select Different Slot
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmitting || symptomsText.trim().length < 5 || isSpecialtyMismatch || isAnalyzingSpecialty || Boolean(overlappingAppointment)}
                    title={
                      symptomsText.trim().length < 5
                        ? "Please enter your symptoms (at least 5 characters) to enable booking"
                        : isSpecialtyMismatch
                        ? `Booking blocked: Dr. ${doctor?.user?.full_name} (${doctor?.specialisation}) does not treat ${activeRecommendedSpecialty} conditions.`
                        : isAnalyzingSpecialty
                        ? "Analyzing symptoms against doctor specialty..."
                        : overlappingAppointment
                        ? `Booking blocked: Overlaps with appointment for Dr. ${overlappingAppointment.doctor?.user?.full_name || 'Specialist'}`
                        : undefined
                    }
                    className={`px-6 py-3 font-bold rounded-xl flex items-center space-x-2 text-sm transition ${
                      isSubmitting || symptomsText.trim().length < 5 || isSpecialtyMismatch || isAnalyzingSpecialty || Boolean(overlappingAppointment)
                        ? 'bg-slate-200 dark:bg-slate-800 text-slate-400 dark:text-slate-500 cursor-not-allowed border border-slate-300 dark:border-slate-700/60'
                        : 'bg-gradient-to-r from-teal-500 to-emerald-500 hover:from-teal-600 hover:to-emerald-600 text-white shadow-lg shadow-teal-500/25 cursor-pointer'
                    }`}
                  >
                    {isSubmitting ? (
                      <>
                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-1" />
                        <span>Confirming & Booking...</span>
                      </>
                    ) : isAnalyzingSpecialty ? (
                      <>
                        <div className="w-4 h-4 border-2 border-slate-400 border-t-transparent rounded-full animate-spin mr-1" />
                        <span>✨ AI Triage Analyzing...</span>
                      </>
                    ) : symptomsText.trim().length < 5 ? (
                      <>
                        <span>Enter Symptoms to Enable Booking</span>
                      </>
                    ) : (
                      <>
                        <span>Confirm & Book Appointment</span>
                        <ArrowRight className="w-4 h-4" />
                      </>
                    )}
                  </button>
                </div>

                    {isSpecialtyMismatch && (
                      <p className="text-xs text-rose-600 dark:text-rose-400 font-semibold flex items-center space-x-1">
                        <AlertCircle className="w-3.5 h-3.5 inline mr-1" />
                        <span>Confirm button disabled due to specialty mismatch ({doctor?.specialisation} vs {activeRecommendedSpecialty}). Please choose a {activeRecommendedSpecialty} specialist above.</span>
                      </p>
                    )}
                  </div>
            </div>
          </form>
        )}

        {/* STEP 3: Confirmed Success Screen */}
        {step === 3 && (
          <div className="bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 rounded-3xl p-8 text-center space-y-6 shadow-sm">
            <div className="w-20 h-20 rounded-full bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mx-auto border-2 border-emerald-500/40 animate-bounce">
              <CheckCircle2 className="w-10 h-10" />
            </div>
            <div>
              <h3 className="text-2xl font-extrabold text-slate-900 dark:text-white">Appointment Confirmed!</h3>
              <p className="text-slate-600 dark:text-slate-400 text-sm mt-1">
                A confirmation email has been sent and your Google Calendar synced.
              </p>
            </div>

            <div className="flex justify-center space-x-4 pt-4">
              <button
                onClick={() => navigate('/patient/dashboard')}
                className="px-6 py-3 bg-teal-500 text-white font-bold rounded-xl text-sm shadow-lg shadow-teal-500/20 cursor-pointer"
              >
                Go to Dashboard
              </button>
              <button
                onClick={() => navigate('/patient/appointments')}
                className="px-6 py-3 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold rounded-xl text-sm border border-slate-200 dark:border-slate-700 hover:bg-slate-200 dark:hover:bg-slate-700 cursor-pointer"
              >
                View My Appointments
              </button>
            </div>
          </div>
        )}
      </div>
    </Layout>
  )
}
