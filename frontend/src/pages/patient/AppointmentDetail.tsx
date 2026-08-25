import React, { useEffect, useState, useCallback } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { Layout } from '../../components/Layout'
import { api } from '../../lib/api'
import { Appointment } from '../../types'
import { formatDateTime, formatTime } from '../../lib/utils'
import { PreVisitSummaryCard, PostVisitSummaryCard } from '../../components/SummaryCard'
import { useWebSocket } from '../../hooks/useWebSocket'
import { QRCodeModal } from '../../components/QRCodeModal'
import { SkeletonCard } from '../../components/SkeletonLoader'
import { Calendar, Stethoscope, Clock, ArrowLeft, QrCode, XCircle, AlertCircle, Edit3, Sparkles, FileText, CheckCircle2, Star, RefreshCw } from 'lucide-react'
import { toast } from 'sonner'

export const AppointmentDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [appointment, setAppointment] = useState<Appointment | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [showQR, setShowQR] = useState(false)
  const [rescheduledToAppt, setRescheduledToAppt] = useState<Appointment | null>(null)
  const [rating, setRating] = useState<number>(0)
  const [hoverRating, setHoverRating] = useState<number>(0)
  const [comment, setComment] = useState('')
  const [isSubmittingReview, setIsSubmittingReview] = useState(false)

  useEffect(() => {
    async function loadRescheduledTarget() {
      if (appointment?.rescheduled_to_id) {
        try {
          const res = await api.get<Appointment>(`/patient/appointments/${appointment.rescheduled_to_id}`)
          setRescheduledToAppt(res)
        } catch (err) {
          console.error('Failed to load rescheduled target appointment:', err)
        }
      }
    }
    loadRescheduledTarget()
  }, [appointment?.rescheduled_to_id])

  const fetchDetail = useCallback(async () => {
    if (!id) return
    setIsLoading(true)
    try {
      const data = await api.get<Appointment>(`/patient/appointments/${id}`)
      setAppointment(data)
    } catch (err) {
      console.error('Failed to fetch appointment detail:', err)
      toast.error('Failed to load appointment details')
    } finally {
      setIsLoading(false)
    }
  }, [id])

  const handleSubmitReview = async (e: React.FormEvent) => {
    e.preventDefault()
    if (rating < 1 || rating > 5) {
      toast.error('Please select a star rating')
      return
    }
    setIsSubmittingReview(true)
    try {
      await api.post(`/patient/appointments/${appointment?.id}/review`, {
        rating,
        comment: comment.trim() || undefined,
      })
      toast.success('Thank you for your feedback! Review submitted successfully.')
      fetchDetail()
    } catch (err: any) {
      toast.error(err.message || 'Failed to submit review')
    } finally {
      setIsSubmittingReview(false)
    }
  }

  useEffect(() => {
    fetchDetail()
  }, [fetchDetail])

  // Real-time WebSocket hook: auto-refreshes appointment detail when Celery completes AI summary
  useWebSocket(id, (wsData) => {
    if (
      wsData.event === 'pre_visit_summary_ready' ||
      wsData.event === 'post_visit_summary_ready' ||
      wsData.event === 'appointment_status_change'
    ) {
      console.log('[WebSocket Event Received] Auto-refreshing detail...', wsData)
      fetchDetail()
    }
  })

  if (isLoading) {
    return (
      <Layout>
        <div className="max-w-3xl mx-auto p-8 space-y-6">
          <SkeletonCard />
          <SkeletonCard />
        </div>
      </Layout>
    )
  }

  if (!appointment) {
    return (
      <Layout>
        <div className="text-center py-12">
          <p className="text-slate-400">Appointment not found.</p>
          <Link to="/patient/appointments" className="text-teal-400 font-bold hover:underline mt-2 inline-block">
            Back to Appointments
          </Link>
        </div>
      </Layout>
    )
  }

  const slotStartStr = formatDateTime(appointment.slot_start)
  const slotEndStr = formatTime(appointment.slot_end)
  const bookedTimeStr = appointment.created_at ? formatDateTime(appointment.created_at) : 'N/A'

  return (
    <Layout>
      <div className="max-w-3xl mx-auto space-y-6">
        <Link
          to="/patient/appointments"
          className="inline-flex items-center space-x-1.5 text-xs font-bold text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Consultations</span>
        </Link>

        {/* Info Header Card */}
        <div className="bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 shadow-sm space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-4">
            <div className="flex items-center space-x-4">
              <div className="w-14 h-14 rounded-2xl bg-teal-500/20 text-teal-600 dark:text-teal-400 border border-teal-500/30 flex items-center justify-center font-bold text-xl">
                <Stethoscope className="w-7 h-7" />
              </div>
              <div>
                <h2 className="text-xl font-extrabold text-slate-900 dark:text-white">
                  {appointment.doctor?.user?.full_name || 'Specialist Consultation'}
                </h2>
                <p className="text-xs font-semibold text-teal-600 dark:text-teal-400 mt-0.5">
                  {appointment.doctor?.specialisation}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {appointment.status === 'HELD' && (
                <button
                  onClick={() => navigate(`/patient/doctors/${appointment.doctor_id}/book?appointment_id=${appointment.id}&step=2`)}
                  className="px-3.5 py-1.5 bg-amber-500 hover:bg-amber-600 text-slate-950 rounded-full text-xs font-extrabold flex items-center space-x-1.5 transition shadow-sm cursor-pointer"
                  title="Resume your held booking"
                >
                  <Edit3 className="w-3.5 h-3.5" />
                  <span>Resume Booking</span>
                </button>
              )}
              {(appointment.status === 'CONFIRMED' || appointment.status === 'PENDING_APPROVAL') && !appointment.is_started && (
                <button
                  onClick={() => navigate(`/patient/book/${appointment.doctor_id}?reschedule_appointment_id=${appointment.id}`)}
                  className="px-3.5 py-1.5 bg-amber-500 hover:bg-amber-600 text-slate-950 rounded-full text-xs font-extrabold flex items-center space-x-1.5 transition shadow-sm cursor-pointer"
                  title="Reschedule your appointment slot"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Reschedule</span>
                </button>
              )}
              {appointment.status === 'CONFIRMED' && (
                <button
                  onClick={() => setShowQR(true)}
                  className="px-3.5 py-1.5 bg-teal-50 dark:bg-teal-500/20 hover:bg-teal-500 text-teal-700 dark:text-teal-300 hover:text-white border border-teal-200 dark:border-teal-500/30 rounded-full text-xs font-extrabold flex items-center space-x-1.5 transition shadow-sm cursor-pointer"
                >
                  <QrCode className="w-4 h-4" />
                  <span>QR Ticket</span>
                </button>
              )}
              {appointment.status === 'COMPLETED' && (
                <button
                  onClick={() => {
                    const token = localStorage.getItem('access_token') || ''
                    const apiBase = import.meta.env.VITE_API_URL || '/api'
                    window.open(`${apiBase}/patient/appointments/${appointment.id}/pdf?token=${token}`, '_blank')
                  }}
                  className="px-3.5 py-1.5 bg-teal-600 hover:bg-teal-700 text-white rounded-full text-xs font-extrabold flex items-center space-x-1.5 transition shadow-sm cursor-pointer"
                >
                  <FileText className="w-4 h-4" />
                  <span>Download Prescription PDF</span>
                </button>
              )}
              {(appointment.status === 'CONFIRMED' || appointment.status === 'HELD' || appointment.status === 'PENDING_APPROVAL') && !appointment.is_started && (
                <button
                  onClick={async () => {
                    if (window.confirm('Are you sure you want to cancel this appointment?')) {
                      try {
                        await api.delete(`/patient/appointments/${appointment.id}`)
                        fetchDetail()
                      } catch (err: any) {
                        alert(err.message || 'Failed to cancel appointment')
                      }
                    }
                  }}
                  className="px-3.5 py-1.5 bg-rose-50 dark:bg-rose-500/10 hover:bg-rose-100 dark:hover:bg-rose-500/20 text-rose-600 dark:text-rose-300 border border-rose-200 dark:border-rose-500/30 rounded-full text-xs font-extrabold flex items-center space-x-1.5 transition cursor-pointer"
                >
                  <XCircle className="w-4 h-4" />
                  <span>Cancel</span>
                </button>
              )}
              <span className={`px-3.5 py-1.5 rounded-full text-xs font-extrabold border ${
                appointment.is_started && appointment.status === 'CONFIRMED'
                  ? 'bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-300 border-indigo-200 dark:border-indigo-500/30 animate-pulse'
                  : appointment.status === 'COMPLETED'
                  ? 'bg-teal-50 dark:bg-teal-500/10 text-teal-600 dark:text-teal-300 border-teal-200 dark:border-teal-500/30'
                  : appointment.status === 'CANCELLED'
                  ? 'bg-rose-50 dark:bg-rose-500/10 text-rose-600 dark:text-rose-300 border-rose-200 dark:border-rose-500/30'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700'
              }`}>
                STATUS: {appointment.is_started && appointment.status === 'CONFIRMED' ? 'IN PROGRESS' : appointment.status}
              </span>
            </div>
          </div>

          {/* Timestamps Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs text-slate-700 dark:text-slate-300">
            <div className="bg-slate-50 dark:bg-slate-800/50 p-3 rounded-xl border border-slate-200 dark:border-slate-700/40 space-y-1">
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">Booked Time</span>
              <div className="flex items-center space-x-1.5 font-semibold text-slate-900 dark:text-white">
                <Clock className="w-3.5 h-3.5 text-teal-500 shrink-0" />
                <span>{bookedTimeStr}</span>
              </div>
            </div>

            <div className="bg-slate-50 dark:bg-slate-800/50 p-3 rounded-xl border border-slate-200 dark:border-slate-700/40 space-y-1 sm:col-span-2">
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">Consultation Slot Window</span>
              <div className="flex items-center space-x-1.5 font-semibold text-slate-900 dark:text-white">
                <Calendar className="w-3.5 h-3.5 text-teal-500 shrink-0" />
                <span>{slotStartStr} – {slotEndStr}</span>
              </div>
            </div>

            {appointment.status === 'RESCHEDULED' && (
              <div className="bg-slate-50 dark:bg-slate-800/50 p-3 rounded-xl border border-slate-200 dark:border-slate-700/40 space-y-1 sm:col-span-3">
                <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">Rescheduled To</span>
                <div className="flex items-center space-x-1.5 font-semibold text-slate-900 dark:text-white">
                  <Clock className="w-3.5 h-3.5 text-violet-500 shrink-0" />
                  <span>
                    {rescheduledToAppt
                      ? formatDateTime(rescheduledToAppt.slot_start)
                      : 'Loading rescheduled appointment details...'}
                  </span>
                </div>
              </div>
            )}
            {appointment.status === 'CONFIRMED' && !appointment.is_started && appointment.start_otp && (
              <div className="bg-gradient-to-r from-teal-500/10 to-emerald-500/10 p-4 rounded-xl border border-teal-500/20 space-y-2 sm:col-span-3">
                <span className="text-[11px] font-bold text-teal-600 dark:text-teal-400 uppercase tracking-wider block">Start Consultation Verification Code (OTP)</span>
                <div className="flex items-center space-x-3">
                  <div className="bg-teal-500 text-white font-extrabold tracking-widest text-lg px-4 py-1.5 rounded-lg shadow-md font-mono">
                    {appointment.start_otp}
                  </div>
                  <p className="text-xs text-slate-600 dark:text-slate-400 leading-normal">
                    Please share this dynamic 4-digit code with your doctor to start your consultation.
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Symptoms Content Provided Card */}
        <div className="bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 shadow-sm space-y-3">
          <div className="flex items-center space-x-2 text-teal-600 dark:text-teal-400 pb-1">
            <FileText className="w-5 h-5" />
            <h3 className="font-bold text-base text-slate-900 dark:text-white">Symptoms Content Provided</h3>
          </div>
          <p className="text-sm text-slate-800 dark:text-slate-200 bg-slate-50 dark:bg-slate-800/60 p-4 rounded-2xl border border-slate-200 dark:border-slate-700/50 leading-relaxed">
            {appointment.symptom_form?.symptoms_text || 'No symptoms text provided.'}
          </p>
        </div>



        {/* Pre-Visit AI Summary Card */}
        {appointment.symptom_form && (
          <PreVisitSummaryCard symptomForm={appointment.symptom_form} />
        )}

        {/* Post-Visit Note Card */}
        {appointment.post_visit_note && (
          <PostVisitSummaryCard note={appointment.post_visit_note} />
        )}

        {/* Patient Review & Feedback Form */}
        {appointment.status === 'COMPLETED' && (
          <div className="bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 shadow-sm space-y-4">
            <div className="flex items-center space-x-2 text-teal-600 dark:text-teal-400 pb-1 border-b border-slate-200 dark:border-slate-800">
              <Star className="w-5 h-5 fill-teal-600 text-teal-600" />
              <h3 className="font-bold text-base text-slate-900 dark:text-white">Feedback & Rating</h3>
            </div>

            {appointment.review ? (
              <div className="text-center py-6 space-y-3 bg-gradient-to-br from-teal-500/10 to-teal-600/5 rounded-2xl border border-teal-500/20 p-6">
                <div className="w-12 h-12 bg-teal-500/20 text-teal-600 dark:text-teal-400 rounded-full flex items-center justify-center mx-auto mb-2 border border-teal-500/30">
                  <CheckCircle2 className="w-6 h-6 animate-bounce" />
                </div>
                <h4 className="font-extrabold text-base text-slate-900 dark:text-white">Feedback Submitted!</h4>
                <p className="text-xs text-slate-600 dark:text-slate-400 max-w-sm mx-auto leading-relaxed font-semibold">
                  We're always striving to serve you better! Thanks for sharing your feedback—it helps us keep our service top-tier. You're the best! 🚀
                </p>
              </div>
            ) : (
              <form onSubmit={handleSubmitReview} className="space-y-4">
                <p className="text-xs text-slate-600 dark:text-slate-400">
                  Please rate your overall consultation experience with Dr. {appointment.doctor?.user?.full_name}:
                </p>

                {/* Interactive Star Selection */}
                <div className="flex items-center space-x-2">
                  {[1, 2, 3, 4, 5].map((star) => {
                    const isFilled = hoverRating ? star <= hoverRating : star <= rating
                    return (
                      <button
                        type="button"
                        key={star}
                        onClick={() => setRating(star)}
                        onMouseEnter={() => setHoverRating(star)}
                        onMouseLeave={() => setHoverRating(0)}
                        className="transition transform hover:scale-110 cursor-pointer focus:outline-none"
                      >
                        <Star 
                          className={`w-7 h-7 ${isFilled ? 'text-amber-400 fill-amber-400' : 'text-slate-300 dark:text-slate-700'}`} 
                        />
                      </button>
                    )
                  })}
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider mb-2">
                    Share your experience (Optional)
                  </label>
                  <textarea
                    rows={3}
                    value={comment}
                    onChange={(e) => setComment(e.target.value)}
                    placeholder="Provide details about your doctor visit, care received, bedside manner..."
                    className="w-full p-4 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white text-sm focus:outline-none focus:border-teal-500 placeholder-slate-400 dark:placeholder-slate-500 transition"
                  />
                </div>

                <button
                  type="submit"
                  disabled={isSubmittingReview || rating === 0}
                  className="px-5 py-2.5 bg-teal-500 hover:bg-teal-600 text-white font-bold rounded-xl text-xs flex items-center justify-center space-x-1.5 transition shadow-lg shadow-teal-500/20 disabled:opacity-50 cursor-pointer"
                >
                  <span>Submit Feedback</span>
                </button>
              </form>
            )}
          </div>
        )}

        {/* QR Code Modal */}
        {showQR && (
          <QRCodeModal
            appointmentId={appointment.id}
            doctorName={appointment.doctor?.user?.full_name || 'Doctor'}
            patientName={appointment.patient?.full_name || 'Patient'}
            slotStart={appointment.slot_start}
            onClose={() => setShowQR(false)}
          />
        )}
      </div>
    </Layout>
  )
}
