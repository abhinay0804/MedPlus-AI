import React, { useEffect, useState } from 'react'
import { Layout } from '../../components/Layout'
import { api } from '../../lib/api'
import { Appointment, UrgencyLevel } from '../../types'
import { formatDateTime } from '../../lib/utils'
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
  Save
} from 'lucide-react'

type DashboardTab = 'ALL' | 'PENDING_APPROVAL' | 'CONFIRMED' | 'CANCELLED' | 'UPCOMING'

export const DoctorDashboard: React.FC = () => {
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
  
  const [activeTab, setActiveTab] = useState<DashboardTab>('ALL')
  const [averageRating, setAverageRating] = useState('0.0')
  const [reviewsCount, setReviewsCount] = useState(0)

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
    } catch (err) {
      console.error('Failed to fetch ratings for dashboard stats:', err)
    }
  }

  useEffect(() => {
    fetchSchedule()
    fetchRatingStats()
  }, [])

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
    if (!selectedAppt) return
    if (!notesText.trim()) {
      toast.error('Doctor Notes / Clinical Findings are mandatory to end the appointment.')
      return
    }
    setIsSubmitting(true)
    setMessage(null)
    try {
      // 1. Save Notes
      await api.post(`/doctor/appointments/${selectedAppt.id}/notes`, {
        doctor_notes: notesText.trim(),
        prescription_text: prescriptionText.trim() || undefined,
      })
      // 2. Mark complete
      await api.put(`/doctor/appointments/${selectedAppt.id}/complete`, {})
      toast.success('Appointment marked completed! Summary email sent to patient.')
      fetchSchedule()
    } catch (err: any) {
      toast.error(err.message || 'Failed to complete appointment')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleVerifyStartOtp = async (apptId: string) => {
    if (otpInput.trim().length !== 4) {
      toast.error('Please enter a 4-digit verification OTP.')
      return
    }
    setIsVerifyingOtp(true)
    try {
      await api.post(`/doctor/appointments/${apptId}/start-verify`, {
        otp: otpInput.trim(),
      })
      toast.success('OTP verified successfully! Consultation started.')
      setStartedConsultations((prev) => ({ ...prev, [apptId]: true }))
      setShowOtpInputForId(null)
      setOtpInput('')
      fetchSchedule()
    } catch (err: any) {
      toast.error(err.message || 'Verification failed. Please check the OTP code.')
    } finally {
      setIsVerifyingOtp(false)
    }
  }

  const handleApprove = async (apptId: string) => {
    setIsActionPending(true)
    try {
      await api.put(`/doctor/appointments/${apptId}/approve`, {})
      toast.success('Appointment booking approved successfully!')
      fetchSchedule()
    } catch (err: any) {
      toast.error(err.message || 'Failed to approve booking request')
    } finally {
      setIsActionPending(false)
    }
  }

  const handleReject = async (apptId: string) => {
    if (!window.confirm('Are you sure you want to reject this appointment booking request?')) return
    setIsActionPending(true)
    try {
      await api.put(`/doctor/appointments/${apptId}/reject`, {})
      toast.success('Appointment booking request rejected.')
      fetchSchedule()
    } catch (err: any) {
      toast.error(err.message || 'Failed to reject booking request')
    } finally {
      setIsActionPending(false)
    }
  }

  const handleCancel = async (apptId: string) => {
    const confirmMsg = 'Are you sure you want to cancel this appointment? We will attempt to automatically reschedule the patient to another specialist.'
    if (!window.confirm(confirmMsg)) return
    setIsActionPending(true)
    try {
      const res = await api.post<any>(`/doctor/appointments/${apptId}/cancel`, {})
      toast.success('Appointment cancelled. Patient rescheduled successfully!')
      fetchSchedule()
    } catch (err: any) {
      toast.error(err.message || 'Failed to cancel appointment. No other doctors available to accommodate this slot.')
    } finally {
      setIsActionPending(false)
    }
  }

  // Filter appointments based on active tab
  const getFilteredAppointments = () => {
    const now = Date.now()
    switch (activeTab) {
      case 'PENDING_APPROVAL':
        return appointments.filter((a) => a.status === 'PENDING_APPROVAL')
      case 'CONFIRMED':
        return appointments.filter((a) => a.status === 'CONFIRMED')
      case 'CANCELLED':
        return appointments.filter((a) => a.status === 'CANCELLED')
      case 'UPCOMING':
        // Next 24 hours confirmed appointments
        return appointments
          .filter((a) => {
            const start = new Date(a.slot_start).getTime()
            return a.status === 'CONFIRMED' && start >= now && start <= now + 24 * 60 * 60 * 1000
          })
          .sort((a, b) => new Date(a.slot_start).getTime() - new Date(b.slot_start).getTime())
      default:
        return appointments
    }
  }

  const filteredAppts = getFilteredAppointments()

  // Dynamic statistics
  const totalConsultations = appointments.filter((a) => ['CONFIRMED', 'COMPLETED'].includes(a.status)).length
  const pendingRequestsCount = appointments.filter((a) => a.status === 'PENDING_APPROVAL').length

  return (
    <Layout>
      <div className="space-y-8">
        <div>
          <h2 className="text-2xl font-extrabold text-slate-900 dark:text-white tracking-tight">Doctor Portal — Schedule & Triage</h2>
          <p className="text-slate-600 dark:text-slate-400 text-sm mt-1">
            Access AI pre-visit triage summaries, manage booking requests, conduct consultations, and submit notes.
          </p>
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
                  <span title="Upcoming includes confirmed consultations scheduled within the next 24 hours.">
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
              <h3 className="text-sm font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider">
                Consultation Records ({filteredAppts.length})
              </h3>
              <div className="space-y-3 max-h-[600px] overflow-y-auto pr-1">
                {filteredAppts.map((appt) => {
                  const isSelected = selectedAppt?.id === appt.id
                  const urgency = appt.symptom_form?.urgency_level || 'LOW'
                  return (
                    <div
                      key={appt.id}
                      onClick={() => {
                        setSelectedAppt(appt)
                        setNotesText(appt.post_visit_note?.doctor_notes || '')
                        setPrescriptionText(appt.post_visit_note?.prescription_text || '')
                        setMessage(appt.post_visit_note ? 'Existing consultation notes loaded.' : null)
                      }}
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

                  {/* Consultation Notes Form / Details */}
                  {selectedAppt.status === 'CONFIRMED' && (() => {
                    const hasStarted = startedConsultations[selectedAppt.id] || !!selectedAppt.post_visit_note

                    if (!hasStarted) {
                      const isEnteringOtp = showOtpInputForId === selectedAppt.id

                      return (
                        <div className="bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 text-center space-y-4 shadow-sm">
                          <Stethoscope className="w-12 h-12 text-teal-500 mx-auto animate-pulse" />
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
                                <button
                                  type="button"
                                  onClick={() => handleCancel(selectedAppt.id)}
                                  className="flex items-center space-x-2 px-5 py-3 bg-rose-50 dark:bg-rose-500/10 text-rose-700 dark:text-rose-400 hover:bg-rose-100 dark:hover:bg-rose-500/20 border border-rose-200 dark:border-rose-500/20 rounded-xl text-xs font-bold transition cursor-pointer"
                                >
                                  <XOctagon className="w-4 h-4" />
                                  <span>Cancel Booking</span>
                                </button>
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
                          <button
                            type="button"
                            onClick={() => handleCancel(selectedAppt.id)}
                            className="px-3 py-1 bg-rose-50 dark:bg-rose-500/10 text-rose-700 dark:text-rose-400 hover:bg-rose-100 dark:hover:bg-rose-500/20 border border-rose-200 dark:border-rose-500/20 rounded-lg text-xs font-bold transition flex items-center space-x-1 cursor-pointer"
                            title="Cancel Consultation & Auto-Reschedule"
                          >
                            <XOctagon className="w-3.5 h-3.5" />
                            <span>Cancel Booking</span>
                          </button>
                        </div>

                        {message && (
                          <div className="p-3 rounded-xl bg-teal-50 dark:bg-teal-500/10 border border-teal-200 dark:border-teal-500/30 text-teal-800 dark:text-teal-300 text-xs font-medium">
                            {message}
                          </div>
                        )}

                        <div className="space-y-4">
                          <div>
                            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1">
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

                          <div>
                            <label className="block text-xs font-bold text-teal-600 dark:text-teal-400 uppercase tracking-wider mb-1">
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
    </Layout>
  )
}
