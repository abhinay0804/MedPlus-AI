import React, { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Layout } from '../../components/Layout'
import { api } from '../../lib/api'
import { Appointment, UrgencyLevel } from '../../types'
import { formatDateTime, parseDate } from '../../lib/utils'
import { PreVisitSummaryCard } from '../../components/SummaryCard'
import { toast } from 'sonner'
import {
  Stethoscope,
  Calendar,
  Clock,
  CheckCircle2,
  FileText,
  Sparkles,
  AlertTriangle,
  Send,
  Info,
  Check,
  X,
  XOctagon,
  Star,
  Users,
  AlertCircle,
  Play,
  Save,
  MessageSquare,
  Mail,
  Brain
} from 'lucide-react'

type DashboardTab = 'ALL' | 'PENDING_APPROVAL' | 'CONFIRMED' | 'CANCELLED' | 'UPCOMING'

interface AdminNote {
  id: string
  doctor_id: string
  subject: string
  body: string
  priority: string
  is_read: boolean
  created_at: string
}

export const DoctorDashboard: React.FC = () => {
  const [searchParams] = useSearchParams()
  const [appointments, setAppointments] = useState<Appointment[]>([])
  const [selectedAppt, setSelectedAppt] = useState<Appointment | null>(null)
  const [notesText, setNotesText] = useState('')
  const [prescriptionText, setPrescriptionText] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isActionPending, setIsActionPending] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [startedConsultations, setStartedConsultations] = useState<Record<string, boolean>>({})
  const [otpInput, setOtpInput] = useState('')
  const [showOtpInputForId, setShowOtpInputForId] = useState<string | null>(null)
  const [isVerifyingOtp, setIsVerifyingOtp] = useState(false)
  const [doctorProfile, setDoctorProfile] = useState<any>(null)
  
  const [activeTab, setActiveTab] = useState<DashboardTab>('ALL')
  const [averageRating, setAverageRating] = useState('0.0')
  const [reviewsCount, setReviewsCount] = useState(0)

  // Directives State
  const [adminNotes, setAdminNotes] = useState<AdminNote[]>([])
  const [showNotesInbox, setShowNotesInbox] = useState(false)

  // Patient History State
  const [patientHistory, setPatientHistory] = useState<any[]>([])
  const [isLoadingHistory, setIsLoadingHistory] = useState(false)
  const [aiHistorySummary, setAiHistorySummary] = useState<{
    specialty_summary: string
    general_medical_summary: string
    diagnostic_factors: string
  } | null>(null)
  const [isLoadingAiHistory, setIsLoadingAiHistory] = useState(false)

  const fetchSchedule = async () => {
    setIsLoading(true)
    try {
      const data = await api.get<Appointment[]>('/doctor/appointments')
      setAppointments(data)
      
      // Load selected appt or set first
      if (data.length > 0) {
        setSelectedAppt((prev) => {
          if (!prev) return data[0]
          const updated = data.find((a) => a.id === prev.id)
          return updated || data[0]
        })
      } else {
        setSelectedAppt(null)
      }
    } catch (err) {
      console.error('Failed to fetch doctor schedule:', err)
    } finally {
      setIsLoading(false)
    }
  }

  const fetchRatingStats = async () => {
    try {
      const res = await api.get<any>('/doctor/settings')
      if (res.reviews && res.reviews.length > 0) {
        const avg = (res.reviews.reduce((acc: number, r: any) => acc + r.rating, 0) / res.reviews.length).toFixed(1)
        setAverageRating(avg)
        setReviewsCount(res.reviews.length)
      }
      if (res.profile) {
        setDoctorProfile(res.profile)
      }
    } catch (err) {
      console.error('Failed to fetch ratings for dashboard stats:', err)
    }
  }

  const fetchNotes = async () => {
    try {
      const data = await api.get<AdminNote[]>('/doctor/notes')
      setAdminNotes(data)
    } catch (err) {
      console.error('Failed to fetch directives:', err)
    }
  }

  const fetchPatientHistory = async (apptId: string) => {
    try {
      setIsLoadingHistory(true)
      setIsLoadingAiHistory(true)
      setPatientHistory([])
      setAiHistorySummary(null)
      
      const [historyData, aiSummaryData] = await Promise.all([
        api.get<any[]>(`/doctor/appointments/${apptId}/patient-history`),
        api.get<any>(`/doctor/appointments/${apptId}/patient-history-ai-summary`).catch(err => {
          console.error('Failed to fetch AI patient history summary:', err)
          return null
        })
      ])
      
      setPatientHistory(historyData)
      setAiHistorySummary(aiSummaryData)
    } catch (err) {
      console.error('Failed to fetch patient history timeline:', err)
    } finally {
      setIsLoadingHistory(false)
      setIsLoadingAiHistory(false)
    }
  }

  useEffect(() => {
    fetchSchedule()
    fetchRatingStats()
    fetchNotes()
    if (searchParams.get('open_directives') === 'true') {
      setShowNotesInbox(true)
    }
  }, [searchParams])

  useEffect(() => {
    if (selectedAppt) {
      fetchPatientHistory(selectedAppt.id)
      setNotesText(selectedAppt.post_visit_note?.doctor_notes || '')
      setPrescriptionText(selectedAppt.post_visit_note?.prescription_text || '')
      setMessage(selectedAppt.post_visit_note ? 'Existing consultation notes loaded.' : null)
    }
  }, [selectedAppt?.id])

  const handleSaveProgress = async () => {
    if (!selectedAppt) return
    setIsSubmitting(true)
    setMessage(null)
    try {
      await api.post(`/doctor/appointments/${selectedAppt.id}/notes`, {
        doctor_notes: notesText.trim(),
        prescription_text: prescriptionText.trim() || undefined,
      })
      toast.success('Consultation progress saved successfully!')
      setMessage('Existing consultation notes saved.')
      fetchSchedule()
    } catch (err: any) {
      toast.error(err.message || 'Failed to save progress')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleEndAppointment = async () => {
    if (!selectedAppt || !notesText.trim()) return
    setIsSubmitting(true)
    setMessage(null)
    try {
      // 1. Submit notes
      await api.post(`/doctor/appointments/${selectedAppt.id}/notes`, {
        doctor_notes: notesText.trim(),
        prescription_text: prescriptionText.trim() || undefined,
      })
      
      // 2. Complete appointment
      await api.put(`/doctor/appointments/${selectedAppt.id}/complete`, {})
      
      toast.success('Consultation completed successfully!')
      setMessage('Appointment marked as completed. Patient Care summary generated.')
      fetchSchedule()
    } catch (err: any) {
      toast.error(err.message || 'Failed to complete appointment')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleVerifyStartOtp = async (apptId: string) => {
    if (!otpInput || otpInput.length !== 4) {
      toast.error('Verification code must be 4 digits.')
      return
    }
    try {
      setIsVerifyingOtp(true)
      await api.post(`/doctor/appointments/${apptId}/start-verify`, {
        otp: otpInput
      })
      toast.success('Verification code accepted. Consultation unlocked!')
      setStartedConsultations((prev) => ({ ...prev, [apptId]: true }))
      setShowOtpInputForId(null)
      setOtpInput('')
      fetchSchedule()
    } catch (err: any) {
      toast.error(err.message || 'Verification code failed. Please check with the patient.')
    } finally {
      setIsVerifyingOtp(false)
    }
  }

  const handleApprove = async (apptId: string) => {
    try {
      setIsActionPending(true)
      await api.put(`/doctor/appointments/${apptId}/approve`, {})
      toast.success('Consultation request approved!')
      fetchSchedule()
    } catch (err: any) {
      toast.error(err.message || 'Failed to approve request')
    } finally {
      setIsActionPending(false)
    }
  }

  const handleReject = async (apptId: string) => {
    try {
      setIsActionPending(true)
      await api.put(`/doctor/appointments/${apptId}/reject`, {})
      toast.success('Consultation request declined.')
      fetchSchedule()
    } catch (err: any) {
      toast.error(err.message || 'Failed to decline request')
    } finally {
      setIsActionPending(false)
    }
  }

  const handleCancel = async (apptId: string) => {
    const check = window.confirm(
      'Are you sure you want to cancel this consultation? The system will automatically attempt to reschedule this patient with another active doctor in your specialty.'
    )
    if (!check) return

    const reason = window.prompt(
      'Please enter your reason for cancellation (required for hospital administration review):'
    )
    if (reason === null) return
    
    try {
      setIsActionPending(true)
      await api.post(`/doctor/appointments/${apptId}/cancel`, {
        reason: reason.trim() || 'No reason provided'
      })
      toast.success('Appointment cancelled. Auto-reschedule triggered!')
      fetchSchedule()
      fetchRatingStats() // reload demerits
    } catch (err: any) {
      toast.error(err.message || 'Failed to cancel appointment')
    } finally {
      setIsActionPending(false)
    }
  }

  const getFilteredAppointments = () => {
    const now = Date.now()
    switch (activeTab) {
      case 'PENDING_APPROVAL':
        return appointments.filter((a) => a.status === 'PENDING_APPROVAL')
      case 'CONFIRMED':
        return appointments.filter((a) => a.status === 'CONFIRMED')
      case 'CANCELLED':
        return appointments.filter((a) => a.status === 'CANCELLED')
      case 'UPCOMING': {
        const confirmed = appointments.filter((a) => a.status === 'CONFIRMED')
        const next24 = confirmed
          .filter((a) => {
            const start = parseDate(a.slot_start).getTime()
            // We allow start times within 5 minutes ago to handle currently active/just-started slots
            return start >= now - 5 * 60 * 1000 && start <= now + 24 * 60 * 60 * 1000
          })
          .sort((a, b) => parseDate(a.slot_start).getTime() - parseDate(b.slot_start).getTime())
        
        if (next24.length > 0) {
          return next24
        }
        
        return confirmed
          .filter((a) => parseDate(a.slot_start).getTime() >= now - 5 * 60 * 1000)
          .sort((a, b) => parseDate(a.slot_start).getTime() - parseDate(b.slot_start).getTime())
          .slice(0, 5)
      }
      default:
        return appointments
    }
  }

  const filteredAppts = getFilteredAppointments()

  const totalConsultations = appointments.filter((a) => ['CONFIRMED', 'COMPLETED'].includes(a.status)).length
  const pendingRequestsCount = appointments.filter((a) => a.status === 'PENDING_APPROVAL').length

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'URGENT':
        return 'border-red-500 bg-red-50 dark:bg-red-950/20 text-red-800 dark:text-red-300'
      case 'IMPORTANT':
        return 'border-amber-500 bg-amber-50 dark:bg-amber-950/20 text-amber-800 dark:text-amber-300'
      default:
        return 'border-blue-500 bg-blue-50 dark:bg-blue-950/20 text-blue-800 dark:text-blue-300'
    }
  }

  return (
    <Layout>
      {doctorProfile?.is_suspended ? (
        <div className="min-h-[70vh] flex items-center justify-center p-4">
          <div className="max-w-md w-full bg-white dark:bg-slate-900 border border-red-200 dark:border-red-950/60 rounded-3xl p-8 shadow-2xl shadow-red-500/5 text-center space-y-6">
            <div className="w-16 h-16 bg-red-100 dark:bg-red-950/30 rounded-full flex items-center justify-center text-red-650 dark:text-red-400 mx-auto animate-bounce">
              <AlertTriangle className="w-8 h-8" />
            </div>
            <div className="space-y-2">
              <h2 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">Account Suspended</h2>
              <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed">
                Your profile has been suspended by clinic administration due to excessive demerit points.
              </p>
            </div>
            <div className="bg-red-50 dark:bg-red-950/20 border border-red-100 dark:border-red-900/30 p-4 rounded-2xl flex justify-between items-center text-left">
              <div>
                <span className="text-xs text-red-500 dark:text-red-400 font-bold block uppercase tracking-wider">Demerit Points</span>
                <span className="text-sm font-semibold text-slate-800 dark:text-slate-200">Suspension Threshold: 10</span>
              </div>
              <div className="text-3xl font-black text-red-600 dark:text-red-400 font-mono">
                {doctorProfile?.demerit_points} / 10
              </div>
            </div>
            <p className="text-xs text-slate-400 dark:text-slate-500 leading-relaxed">
              Consultation starting, OTP verification, scheduling overrides, and notes submission are currently locked. Please contact the administrator to resolve and reactivate your profile.
            </p>
          </div>
        </div>
      ) : (
        <>
          <div className="space-y-6">
          <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-extrabold text-slate-900 dark:text-white tracking-tight">Doctor Portal — Schedule & Triage</h2>
            <p className="text-slate-600 dark:text-slate-400 text-sm mt-1">
              Access AI pre-visit triage summaries, manage booking requests, conduct consultations, and submit notes.
            </p>
          </div>
          {adminNotes.length > 0 && (
            <button
              onClick={() => setShowNotesInbox(true)}
              className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition shadow cursor-pointer ${
                adminNotes.some(n => !n.is_read)
                  ? 'bg-red-600 hover:bg-red-750 text-white animate-pulse'
                  : 'bg-slate-150 hover:bg-slate-200 text-slate-700 dark:bg-slate-800 dark:hover:bg-slate-750 dark:text-slate-200 border border-slate-200 dark:border-slate-700'
              }`}
            >
              <Mail className="w-3.5 h-3.5" />
              <span>
                {adminNotes.some(n => !n.is_read)
                  ? `Directives (${adminNotes.filter(n => !n.is_read).length})`
                  : 'Directives History'}
              </span>
            </button>
          )}
        </div>

        {/* Stats Cards Section */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm flex items-center space-x-4">
            <div className="w-12 h-12 rounded-xl bg-teal-50 dark:bg-teal-950/30 flex items-center justify-center text-teal-600 dark:text-teal-400">
              <Users className="w-6 h-6" />
            </div>
            <div>
              <span className="text-xs text-slate-400 block font-bold uppercase tracking-wider">Total Consultations</span>
              <span className="text-2xl font-black text-slate-900 dark:text-white">{totalConsultations}</span>
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm flex items-center space-x-4">
            <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${pendingRequestsCount > 0 ? 'bg-amber-50 dark:bg-amber-950/30 text-amber-600 dark:text-amber-400' : 'bg-slate-50 dark:bg-slate-950/30 text-slate-400'}`}>
              <AlertCircle className="w-6 h-6" />
            </div>
            <div>
              <span className="text-xs text-slate-400 block font-bold uppercase tracking-wider">Pending Approvals</span>
              <span className="text-2xl font-black text-slate-900 dark:text-white">{pendingRequestsCount}</span>
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm flex items-center space-x-4">
            <div className="w-12 h-12 rounded-xl bg-amber-50 dark:bg-amber-950/30 flex items-center justify-center text-amber-500">
              <Star className="w-6 h-6 fill-amber-500 text-amber-500" />
            </div>
            <div>
              <span className="text-xs text-slate-400 block font-bold uppercase tracking-wider">Patient Rating</span>
              <span className="text-2xl font-black text-slate-900 dark:text-white">{averageRating}</span>
              <span className="text-[10px] text-slate-400"> ({reviewsCount} reviews)</span>
            </div>
          </div>
        </div>

        {/* Tab Filters */}
        <div className="flex items-center space-x-1 border-b border-slate-200 dark:border-slate-800 pb-px overflow-x-auto scrollbar-none">
          {(['ALL', 'PENDING_APPROVAL', 'CONFIRMED', 'CANCELLED', 'UPCOMING'] as DashboardTab[]).map((tab) => {
            const isActive = activeTab === tab
            const label = tab === 'PENDING_APPROVAL' ? 'Pending Approval' : tab.charAt(0) + tab.slice(1).toLowerCase()
            return (
              <button
                key={tab}
                onClick={() => {
                  setActiveTab(tab)
                  setMessage(null)
                }}
                className={`px-4 py-2 text-xs font-bold transition flex items-center space-x-1.5 whitespace-nowrap border-b-2 cursor-pointer ${
                  isActive 
                    ? 'border-teal-500 text-teal-600 dark:text-teal-400' 
                    : 'border-transparent text-slate-500 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                <span>{label}</span>
                {tab === 'PENDING_APPROVAL' && pendingRequestsCount > 0 && (
                  <span className="px-1.5 py-0.5 rounded-full bg-amber-500 text-white text-[9px] font-black leading-none animate-pulse">
                    {pendingRequestsCount}
                  </span>
                )}
                {tab === 'UPCOMING' && (
                  <span title="Upcoming includes confirmed consultations scheduled within the next 24 hours (or the next 5 future consultations if none are scheduled today).">
                    <Info className="w-3.5 h-3.5 text-slate-400 hover:text-teal-500 cursor-help" />
                  </span>
                )}
              </button>
            )
          })}
        </div>

        {isLoading ? (
          <div className="h-64 bg-slate-100 dark:bg-slate-900/40 rounded-2xl animate-pulse" />
        ) : filteredAppts.length === 0 ? (
          <div className="p-12 text-center bg-white dark:bg-slate-900/40 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
            <Calendar className="w-12 h-12 text-slate-400 dark:text-slate-600 mx-auto mb-3" />
            <p className="text-slate-900 dark:text-slate-300 font-bold">No consultations found matching this filter.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
            {/* Left: Appointments List */}
            <div className="lg:col-span-5 space-y-4">
              <h3 className="text-xs font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider">
                Consultation Records ({filteredAppts.length})
              </h3>
              <div className="space-y-3 max-h-[600px] overflow-y-auto pr-1">
                {filteredAppts.map((appt) => {
                  const isSelected = selectedAppt?.id === appt.id
                  const urgency = appt.symptom_form?.urgency_level || 'LOW'
                  return (
                    <div
                      key={appt.id}
                      onClick={() => setSelectedAppt(appt)}
                      className={`p-4 rounded-2xl border cursor-pointer transition-all ${
                        isSelected
                          ? 'bg-teal-50 dark:bg-teal-500/10 border-teal-500 text-slate-900 dark:text-white shadow-sm'
                          : 'bg-white dark:bg-slate-900/60 border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 text-slate-700 dark:text-slate-300 shadow-sm'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-sm text-slate-900 dark:text-white">
                          {appt.patient?.full_name || 'Patient'}
                        </span>
                        <span className={`text-[9px] font-black px-2 py-0.5 rounded-full border ${
                          appt.status === 'CONFIRMED'
                            ? 'bg-teal-500/10 border-teal-500/30 text-teal-600 dark:text-teal-400'
                            : appt.status === 'PENDING_APPROVAL'
                            ? 'bg-amber-500/10 border-amber-500/30 text-amber-600 dark:text-amber-400 animate-pulse'
                            : appt.status === 'CANCELLED'
                            ? 'bg-rose-500/10 border-rose-500/30 text-rose-600 dark:text-rose-400'
                            : 'bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600'
                        }`}>
                          {appt.status === 'PENDING_APPROVAL' ? 'PENDING APPROVAL' : appt.status}
                        </span>
                      </div>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                        {formatDateTime(appt.slot_start)}
                      </p>
                      {appt.symptom_form?.urgency_level && (
                        <div className={`mt-2 flex items-center space-x-1.5 text-[10px] font-extrabold ${
                          urgency === 'HIGH' 
                            ? 'text-rose-600 dark:text-rose-400' 
                            : urgency === 'MEDIUM' 
                            ? 'text-amber-600 dark:text-amber-400' 
                            : 'text-teal-600 dark:text-teal-400'
                        }`}>
                          <Sparkles className="w-3 h-3 animate-spin" style={{ animationDuration: '3s' }} />
                          <span>AI URGENCY: {appt.symptom_form.urgency_level}</span>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Right: Consultation Detail & Actions */}
            <div className="lg:col-span-7 space-y-6">
              {selectedAppt && (
                <>
                  {/* Approve/Reject pending request block */}
                  {selectedAppt.status === 'PENDING_APPROVAL' && (
                    <div className="bg-gradient-to-r from-amber-500/5 to-amber-500/15 border border-amber-500/20 rounded-2xl p-6 space-y-4">
                      <div className="flex items-start space-x-3">
                        <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                        <div>
                          <h4 className="font-bold text-sm text-slate-900 dark:text-white">Booking Request Pending Approval</h4>
                          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                            This patient has scheduled a consultation for a slot starting in the future. Please review the AI pre-visit summary and accept or decline.
                          </p>
                        </div>
                      </div>

                      <div className="flex flex-col sm:flex-row items-center gap-3 pt-2">
                        <button
                          type="button"
                          disabled={isActionPending}
                          onClick={() => handleApprove(selectedAppt.id)}
                          className="w-full sm:w-auto flex items-center justify-center space-x-2 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition shadow-md shadow-emerald-500/20 cursor-pointer"
                        >
                          <Check className="w-4 h-4" />
                          <span>Approve Consultation</span>
                        </button>
                        <button
                          type="button"
                          disabled={isActionPending}
                          onClick={() => handleReject(selectedAppt.id)}
                          className="w-full sm:w-auto flex items-center justify-center space-x-2 px-5 py-2.5 bg-rose-50 dark:bg-rose-950/20 hover:bg-rose-100 dark:hover:bg-rose-900/30 text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-800 rounded-xl text-xs font-bold transition cursor-pointer"
                        >
                          <X className="w-4 h-4" />
                          <span>Decline Request</span>
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Pre-Visit Triage Card */}
                  {selectedAppt.symptom_form ? (
                    <PreVisitSummaryCard symptomForm={selectedAppt.symptom_form} />
                  ) : (
                    <div className="bg-white dark:bg-slate-900/40 p-4 rounded-xl border border-slate-200 dark:border-slate-800 text-xs text-slate-500 shadow-sm">
                      No pre-visit symptom questionnaire submitted by patient yet.
                    </div>
                  )}

                  {/* Patient History Timeline (Cross-Visit Context) */}
                  <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm space-y-4">
                    <h4 className="text-sm font-bold text-slate-900 dark:text-white flex items-center space-x-2 border-b border-slate-100 dark:border-slate-850 pb-2">
                      <FileText className="w-4 h-4 text-teal-600 dark:text-teal-400" />
                      <span>Patient Medical History Timeline</span>
                    </h4>

                    {/* AI Longitudinal Clinical Briefing Panel */}
                    {patientHistory.length > 0 && (
                      <div className="bg-gradient-to-br from-teal-50/50 to-indigo-50/30 dark:from-slate-900/60 dark:to-slate-900/40 border border-teal-100 dark:border-teal-900/40 rounded-2xl p-5 space-y-4 shadow-sm relative overflow-hidden">
                        <div className="absolute top-0 right-0 w-32 h-32 bg-teal-500/10 rounded-full blur-3xl pointer-events-none" />
                        
                        <div className="flex items-center justify-between border-b border-teal-100/50 dark:border-slate-800 pb-2">
                          <h5 className="text-xs font-extrabold text-teal-800 dark:text-teal-400 uppercase tracking-widest flex items-center space-x-1.5">
                            <Brain className="w-4 h-4 animate-pulse text-teal-500" />
                            <span>Gemini Clinical Assistant</span>
                          </h5>
                          <span className="px-2 py-0.5 rounded-full text-[9px] font-bold bg-teal-100 dark:bg-teal-950/80 text-teal-700 dark:text-teal-400">
                            AI Profile Summary
                          </span>
                        </div>

                        {isLoadingAiHistory ? (
                          <div className="space-y-3 py-2">
                            <div className="flex items-center space-x-2">
                              <Sparkles className="w-3.5 h-3.5 text-teal-400 animate-spin" />
                              <span className="text-[10px] text-slate-405 italic">Gemini is summarizing longitudinal context...</span>
                            </div>
                            <div className="space-y-2">
                              <div className="h-3.5 bg-slate-100 dark:bg-slate-800 rounded animate-pulse w-full" />
                              <div className="h-3.5 bg-slate-100 dark:bg-slate-800 rounded animate-pulse w-5/6" />
                            </div>
                          </div>
                        ) : aiHistorySummary ? (
                          <div className="space-y-4 text-xs">
                            {/* Category A: Target Specialty Summary */}
                            <div className="space-y-1">
                              <span className="font-extrabold text-slate-700 dark:text-slate-300 text-[10px] uppercase tracking-wider block">
                                {selectedAppt.doctor?.specialisation || 'Specialty'} Care Summary
                              </span>
                              <p className="text-slate-600 dark:text-slate-300 text-[11px] leading-relaxed bg-white/60 dark:bg-slate-950/40 p-2.5 rounded-lg border border-slate-150 dark:border-slate-850/60 shadow-2xs">
                                {aiHistorySummary.specialty_summary}
                              </p>
                            </div>

                            {/* Category B: General Medical Context */}
                            <div className="space-y-1">
                              <span className="font-extrabold text-slate-700 dark:text-slate-300 text-[10px] uppercase tracking-wider block">
                                Systemic & Other Specialty Context
                              </span>
                              <p className="text-slate-600 dark:text-slate-300 text-[11px] leading-relaxed bg-white/60 dark:bg-slate-950/40 p-2.5 rounded-lg border border-slate-150 dark:border-slate-850/60 shadow-2xs">
                                {aiHistorySummary.general_medical_summary}
                              </p>
                            </div>

                            {/* Category C: AI Diagnostic / Triage Factors */}
                            <div className="space-y-1">
                              <span className="font-extrabold text-amber-800 dark:text-amber-400 text-[10px] uppercase tracking-wider block flex items-center space-x-1">
                                <AlertCircle className="w-3 h-3" />
                                <span>AI Triage & Diagnostic Factors</span>
                              </span>
                              <div className="text-amber-850 dark:text-amber-300 text-[11px] leading-relaxed bg-amber-500/10 dark:bg-amber-500/5 p-3 rounded-lg border border-amber-200/50 dark:border-amber-900/30 whitespace-pre-line shadow-2xs">
                                {aiHistorySummary.diagnostic_factors}
                              </div>
                            </div>
                          </div>
                        ) : (
                          <p className="text-xs text-slate-400 italic">Longitudinal summarization failed.</p>
                        )}
                      </div>
                    )}

                    {isLoadingHistory ? (
                      <p className="text-xs text-slate-400 italic">Retrieving past clinical records...</p>
                    ) : patientHistory.length === 0 ? (
                      <p className="text-xs text-slate-400 italic">No previous completed or cancelled consultations for this patient.</p>
                    ) : (
                      <div className="space-y-4 max-h-52 overflow-y-auto pr-1">
                        {patientHistory.map((past) => (
                          <div key={past.id} className="relative pl-4 border-l border-slate-200 dark:border-slate-850 py-1 space-y-1.5">
                            <div className="absolute -left-[5px] top-2.5 w-2 h-2 rounded-full bg-teal-500 shadow shadow-teal-500/30" />
                            <div className="flex items-center justify-between text-[10px]">
                              <span className="font-semibold text-slate-500">Dr. {past.doctor_name} ({past.specialisation})</span>
                              <span className="text-slate-400">{new Date(past.slot_start).toLocaleDateString()}</span>
                            </div>
                            {past.symptoms && (
                              <div className="text-[11px] text-slate-700 dark:text-slate-350">
                                <b>Symptoms:</b> {past.symptoms}
                              </div>
                            )}
                            {past.doctor_notes && (
                              <div className="text-[11px] text-slate-650 dark:text-slate-400 bg-slate-50 dark:bg-slate-950 p-2 rounded border border-slate-100 dark:border-slate-900">
                                <b>Diagnosis / Notes:</b> {past.doctor_notes}
                              </div>
                            )}
                            {past.prescription && (
                              <div className="text-[11px] text-teal-700 dark:text-teal-400 font-mono">
                                <b>Rx:</b> {past.prescription}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Consultation Notes Form / Details */}
                  {selectedAppt.status === 'CONFIRMED' && (() => {
                    const hasStarted = startedConsultations[selectedAppt.id] || !!selectedAppt.post_visit_note

                    if (!hasStarted) {
                      const isEnteringOtp = showOtpInputForId === selectedAppt.id

                      return (
                        <div className="bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 text-center space-y-4 shadow-sm">
                          <Stethoscope className="w-12 h-12 text-teal-505 mx-auto animate-pulse" />
                          <h4 className="font-black text-lg text-slate-900 dark:text-white">
                            {isEnteringOtp ? 'OTP Verification Required' : 'Upcoming Consultation'}
                          </h4>
                          
                          {isEnteringOtp ? (
                            <div className="space-y-4 max-w-sm mx-auto">
                              <p className="text-xs text-slate-600 dark:text-slate-400">
                                Ask the patient for the dynamic 4-digit code displayed on their appointment details page.
                              </p>
                              <div className="flex items-center justify-center space-x-2">
                                <input
                                  type="text"
                                  maxLength={4}
                                  placeholder="0000"
                                  value={otpInput}
                                  onChange={(e) => setOtpInput(e.target.value.replace(/\D/g, ''))}
                                  className="w-32 text-center py-2 text-xl font-bold font-mono tracking-widest bg-slate-50 dark:bg-slate-800 border-2 border-slate-200 dark:border-slate-700 focus:border-teal-500 rounded-xl outline-none transition text-slate-950 dark:text-white"
                                />
                              </div>
                              <div className="flex items-center justify-center space-x-2 pt-2">
                                <button
                                  type="button"
                                  disabled={isVerifyingOtp || otpInput.length !== 4}
                                  onClick={() => handleVerifyStartOtp(selectedAppt.id)}
                                  className="flex items-center space-x-1.5 px-4 py-2.5 bg-teal-500 hover:bg-teal-600 text-white rounded-xl text-xs font-bold transition disabled:opacity-50 cursor-pointer"
                                >
                                  <span>{isVerifyingOtp ? 'Verifying...' : 'Verify & Start'}</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setShowOtpInputForId(null)
                                    setOtpInput('')
                                  }}
                                  className="px-4 py-2.5 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 rounded-xl text-xs font-bold transition cursor-pointer"
                                >
                                  Back
                                </button>
                              </div>
                            </div>
                          ) : (
                            <>
                              <p className="text-sm text-slate-600 dark:text-slate-400 max-w-md mx-auto">
                                This consultation is scheduled to begin on {formatDateTime(selectedAppt.slot_start)}. 
                                Please request the verification OTP from the patient to start the consultation.
                              </p>
                              <div className="flex items-center justify-center space-x-3 pt-2">
                                <button
                                  type="button"
                                  onClick={() => setShowOtpInputForId(selectedAppt.id)}
                                  className="flex items-center space-x-2 px-6 py-3 bg-teal-500 hover:bg-teal-600 text-white rounded-xl text-xs font-bold transition shadow-lg shadow-teal-500/20 cursor-pointer"
                                >
                                  <Play className="w-4 h-4 fill-white" />
                                  <span>Start Appointment & Verify OTP</span>
                                </button>
                                {selectedAppt.reassigned_by_admin ? (
                                  <div className="flex items-center space-x-2 px-4 py-2.5 bg-slate-100 dark:bg-slate-800/60 text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-bold shadow-sm">
                                    <Info className="w-4 h-4 text-slate-400" />
                                    <span>Assigned by Admin — Cancellation Restricted</span>
                                  </div>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() => handleCancel(selectedAppt.id)}
                                    className="flex items-center space-x-2 px-5 py-3 bg-rose-50 dark:bg-rose-500/10 text-rose-700 dark:text-rose-400 hover:bg-rose-100 dark:hover:bg-rose-500/20 border border-rose-200 dark:border-rose-500/20 rounded-xl text-xs font-bold transition cursor-pointer"
                                  >
                                    <XOctagon className="w-4 h-4" />
                                    <span>Cancel Booking</span>
                                  </button>
                                )}
                              </div>
                            </>
                          )}
                        </div>
                      )
                    }

                    return (
                      <div className="bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 space-y-4 shadow-sm">
                        <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
                          <h4 className="font-bold text-base text-slate-900 dark:text-white flex items-center space-x-2">
                            <Stethoscope className="w-5 h-5 text-teal-600 dark:text-teal-400 animate-pulse" />
                            <span className="text-teal-600 dark:text-teal-400 font-extrabold">Consultation Room (In Progress)</span>
                          </h4>
                          {!selectedAppt.reassigned_by_admin && (
                            <button
                              type="button"
                              onClick={() => handleCancel(selectedAppt.id)}
                              className="px-3 py-1 bg-rose-50 dark:bg-rose-500/10 text-rose-700 dark:text-rose-400 hover:bg-rose-100 dark:hover:bg-rose-500/20 border border-rose-200 dark:border-rose-500/20 rounded-lg text-xs font-bold transition flex items-center space-x-1 cursor-pointer"
                              title="Cancel Consultation & Auto-Reschedule"
                            >
                              <XOctagon className="w-3.5 h-3.5" />
                              <span>Cancel Booking</span>
                            </button>
                          )}
                        </div>

                        {message && (
                          <div className="p-3 rounded-xl bg-teal-50 dark:bg-teal-500/10 border border-teal-200 dark:border-teal-500/30 text-teal-800 dark:text-teal-300 text-xs font-medium">
                            {message}
                          </div>
                        )}

                        <div className="space-y-4">
                          <div className="space-y-1">
                            <label className="block text-xs font-bold text-slate-700 dark:text-slate-350 uppercase tracking-wider">
                              Doctor Notes / Clinical Findings <span className="text-rose-500">*</span>
                            </label>
                            <textarea
                              rows={4}
                              required
                              value={notesText}
                              onChange={(e) => setNotesText(e.target.value)}
                              placeholder="Enter clinical examination notes, diagnosis, observations..."
                              className="w-full p-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white text-sm focus:outline-none focus:border-teal-500 transition"
                            />
                          </div>

                          <div className="space-y-1">
                            <label className="block text-xs font-bold text-teal-605 dark:text-teal-400 uppercase tracking-wider">
                              Prescription Details (Optional)
                            </label>
                            <textarea
                              rows={3}
                              value={prescriptionText}
                              onChange={(e) => setPrescriptionText(e.target.value)}
                              placeholder="Medication name, dosage (e.g. Aspirin 75mg once daily for 7 days)..."
                              className="w-full p-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white text-sm focus:outline-none focus:border-teal-500 font-mono text-xs transition"
                            />
                          </div>

                          <div className="flex flex-col sm:flex-row items-center gap-3 pt-2">
                            <button
                              type="button"
                              disabled={isSubmitting}
                              onClick={handleSaveProgress}
                              className="w-full sm:w-1/2 flex items-center justify-center space-x-2 px-5 py-3 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl text-xs font-bold transition cursor-pointer"
                            >
                              <Save className="w-4 h-4" />
                              <span>Save Progress</span>
                            </button>
                            <button
                              type="button"
                              disabled={isSubmitting || !notesText.trim()}
                              onClick={handleEndAppointment}
                              className="w-full sm:w-1/2 flex items-center justify-center space-x-2 px-5 py-3 bg-teal-500 hover:bg-teal-600 text-white rounded-xl text-xs font-bold transition shadow-lg shadow-teal-500/20 disabled:opacity-50 cursor-pointer"
                            >
                              <CheckCircle2 className="w-4 h-4" />
                              <span>End Appointment & Complete</span>
                            </button>
                          </div>
                        </div>
                      </div>
                    )
                  })()}
                </>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Directives Inbox Modal Overlay */}
      {showNotesInbox && (
        <div className="fixed inset-0 bg-slate-950/60 flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-lg w-full shadow-2xl overflow-hidden flex flex-col max-h-[80vh]">
            <div className="flex items-center justify-between p-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950">
              <h3 className="font-bold text-slate-900 dark:text-white flex items-center space-x-2">
                <Info className="w-5 h-5 text-red-500" />
                <span>Administrative Directives Inbox</span>
              </h3>
              <button onClick={() => setShowNotesInbox(false)} className="text-slate-400 hover:text-slate-650 dark:hover:text-slate-200 cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 overflow-y-auto space-y-4 flex-1">
              {adminNotes.length === 0 ? (
                <p className="text-sm text-slate-400 italic text-center py-8">Your administrative inbox is empty.</p>
              ) : (
                adminNotes.map((note) => (
                  <div key={note.id} className={`p-4 rounded-xl border border-slate-200 dark:border-slate-800 space-y-2 relative transition-all ${note.is_read ? 'bg-white dark:bg-slate-900/60' : 'bg-red-500/5 border-red-500/20 ring-1 ring-red-500/10'}`}>
                    <div className="flex items-center justify-between">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                        note.priority === 'URGENT' 
                          ? 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300' 
                          : note.priority === 'IMPORTANT' 
                          ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/20' 
                          : 'bg-blue-100 text-blue-800'
                      }`}>
                        {note.priority}
                      </span>
                      <span className="text-[10px] text-slate-400">{new Date(note.created_at + 'Z').toLocaleString()}</span>
                    </div>
                    <h4 className="font-bold text-sm text-slate-900 dark:text-white">{note.subject}</h4>
                    <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed whitespace-pre-wrap">{note.body}</p>
                    {!note.is_read && (
                      <div className="flex justify-end pt-1">
                        <button
                          onClick={async () => {
                            try {
                              await api.put(`/doctor/notes/${note.id}/read`, {})
                              toast.success('Directive marked as read.')
                              fetchNotes()
                            } catch (err: any) {
                              toast.error(err.message || 'Failed to mark as read')
                            }
                          }}
                          className="flex items-center space-x-1 px-3 py-1 bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold rounded-lg cursor-pointer"
                        >
                          <Check className="w-3.5 h-3.5" />
                          <span>Mark Read</span>
                        </button>
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
        </>
      )}
    </Layout>
  )
}
