import React, { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Layout } from '../../components/Layout'
import { api } from '../../lib/api'
import { Appointment, AppointmentStatus } from '../../types'
import { formatDateTime } from '../../lib/utils'
import { Calendar, Clock, Stethoscope, ChevronRight, XCircle, ArrowRight, AlertTriangle, RefreshCw } from 'lucide-react'
import { SkeletonRow } from '../../components/SkeletonLoader'
import { PendingBookingBanner } from '../../components/PendingBookingBanner'

const parseUtcTime = (isoString?: string): number => {
  if (!isoString) return Date.now()
  const formatted = isoString.endsWith('Z') || isoString.includes('+') ? isoString : `${isoString}Z`
  return new Date(formatted).getTime()
}

const HeldTimerBadge: React.FC<{ expiresAt?: string }> = ({ expiresAt }) => {
  const [timeLeft, setTimeLeft] = useState('')

  useEffect(() => {
    if (!expiresAt) return
    const updateTimer = () => {
      const expireTime = parseUtcTime(expiresAt)
      const diff = Math.floor((expireTime - Date.now()) / 1000)
      if (diff <= 0) {
        setTimeLeft('EXPIRED')
      } else {
        const m = Math.floor(diff / 60)
        const s = diff % 60
        setTimeLeft(`${m}:${s < 10 ? '0' : ''}${s}`)
      }
    }
    updateTimer()
    const timer = setInterval(updateTimer, 1000)
    return () => clearInterval(timer)
  }, [expiresAt])

  return (
    <span className="px-3 py-1 bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30 rounded-full text-xs font-black flex items-center space-x-1 animate-pulse">
      <Clock className="w-3.5 h-3.5" />
      <span>HELD ({timeLeft || '5-MIN'})</span>
    </span>
  )
}

export const Appointments: React.FC = () => {
  const navigate = useNavigate()
  const [appointments, setAppointments] = useState<Appointment[]>([])
  const [filter, setFilter] = useState<string>('ALL')
  const [rescheduleConfirmId, setRescheduleConfirmId] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  // Filtering states
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedCategory, setSelectedCategory] = useState('ALL')
  const [selectedYear, setSelectedYear] = useState('ALL')
  const [selectedMonth, setSelectedMonth] = useState('ALL')
  const [selectedDate, setSelectedDate] = useState('')
  const [sortBy, setSortBy] = useState<'latest' | 'oldest' | 'doctor' | 'urgency'>('latest')

  const fetchAppointments = async () => {
    setIsLoading(true)
    try {
      const data = await api.get<Appointment[]>('/patient/appointments')
      setAppointments(data)
    } catch (err) {
      console.error('Failed to fetch appointments:', err)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    fetchAppointments()

    const handleReleased = () => {
      fetchAppointments()
    }
    window.addEventListener('medplus_hold_released', handleReleased)
    return () => window.removeEventListener('medplus_hold_released', handleReleased)
  }, [])

  const categories = ['ALL', 'Cardiology', 'Dermatology', 'Neurology', 'Orthopedics', 'Pediatrics', 'General Medicine']
  const years = ['ALL', ...Array.from(new Set(appointments.map(a => new Date(parseUtcTime(a.slot_start)).getFullYear().toString()))).sort((a, b) => b.localeCompare(a))]

  const months = [
    { value: 'ALL', label: 'All Months' },
    { value: '0', label: 'January' },
    { value: '1', label: 'February' },
    { value: '2', label: 'March' },
    { value: '3', label: 'April' },
    { value: '4', label: 'May' },
    { value: '5', label: 'June' },
    { value: '6', label: 'July' },
    { value: '7', label: 'August' },
    { value: '8', label: 'September' },
    { value: '9', label: 'October' },
    { value: '10', label: 'November' },
    { value: '11', label: 'December' },
  ]
  const filtered = appointments.filter((a) => {
    // 1. Status Filter Tab
    if (filter === 'IN PROGRESS') {
      if (a.status !== 'HELD') return false
    } else if (filter !== 'ALL') {
      if (a.status !== filter) return false
    }

    // 2. Search query (doctor name, specialisation, chief complaint/symptoms text)
    if (searchTerm) {
      const q = searchTerm.toLowerCase()
      const docName = (a.doctor?.user?.full_name || '').toLowerCase()
      const spec = (a.doctor?.specialisation || '').toLowerCase()
      const sympt = (a.symptom_form?.symptoms_text || '').toLowerCase()
      if (!docName.includes(q) && !spec.includes(q) && !sympt.includes(q)) {
        return false
      }
    }

    // 3. Specialty Category Filter
    if (selectedCategory !== 'ALL' && (a.doctor?.specialisation || '').toLowerCase() !== selectedCategory.toLowerCase()) {
      return false
    }

    // 4. Date Year Filter
    const dateObj = new Date(parseUtcTime(a.slot_start))
    if (selectedYear !== 'ALL' && dateObj.getFullYear().toString() !== selectedYear) {
      return false
    }

    // 5. Date Month Filter
    if (selectedMonth !== 'ALL' && dateObj.getMonth().toString() !== selectedMonth) {
      return false
    }

    // 6. Exact Date Filter
    if (selectedDate && a.slot_start.split('T')[0] !== selectedDate) {
      return false
    }

    return true
  })

  const isNoFilterSelected =
    searchTerm.trim() === '' &&
    selectedCategory === 'ALL' &&
    selectedYear === 'ALL' &&
    selectedMonth === 'ALL' &&
    selectedDate === '' &&
    filter === 'ALL'

  const sorted = [...filtered].sort((a, b) => {
    if (isNoFilterSelected && sortBy === 'latest') {
      const timeA = new Date(parseUtcTime(a.created_at || a.slot_start)).getTime()
      const timeB = new Date(parseUtcTime(b.created_at || b.slot_start)).getTime()
      return timeB - timeA
    }
    if (sortBy === 'latest') {
      return new Date(parseUtcTime(b.slot_start)).getTime() - new Date(parseUtcTime(a.slot_start)).getTime()
    }
    if (sortBy === 'oldest') {
      return new Date(parseUtcTime(a.slot_start)).getTime() - new Date(parseUtcTime(b.slot_start)).getTime()
    }
    if (sortBy === 'doctor') {
      const nameA = a.doctor?.user?.full_name || ''
      const nameB = b.doctor?.user?.full_name || ''
      return nameA.localeCompare(nameB)
    }
    if (sortBy === 'urgency') {
      const getUrgencyWeight = (u?: string) => {
        if (u === 'HIGH') return 3
        if (u === 'MEDIUM') return 2
        return 1
      }
      return getUrgencyWeight(b.symptom_form?.urgency_level) - getUrgencyWeight(a.symptom_form?.urgency_level)
    }
    return 0
  })

  const performCancellation = async (id: string) => {
    try {
      await api.delete(`/patient/appointments/${id}`)
      fetchAppointments()
      setRescheduleConfirmId(null)
    } catch (err: any) {
      alert(err.message || 'Failed to cancel appointment')
    }
  }

  const handleCancel = async (id: string) => {
    const appt = appointments.find(a => a.id === id)
    if (appt && (appt.status === 'CONFIRMED' || appt.status === 'PENDING_APPROVAL')) {
      setRescheduleConfirmId(id)
    } else {
      if (!window.confirm('Are you sure you want to release this slot hold?')) return
      performCancellation(id)
    }
  }

  const statusBadge = (appt: Appointment) => {
    switch (appt.status) {
      case 'CONFIRMED':
        return <span className="px-3 py-1 bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 rounded-full text-xs font-bold">CONFIRMED</span>
      case 'HELD':
        return <HeldTimerBadge expiresAt={appt.hold_expires_at} />
      case 'PENDING_APPROVAL':
        return <span className="px-3 py-1 bg-amber-500/10 text-amber-500 border border-amber-500/30 rounded-full text-xs font-bold animate-pulse">PENDING APPROVAL</span>
      case 'COMPLETED':
        return <span className="px-3 py-1 bg-sky-500/10 text-sky-400 border border-sky-500/30 rounded-full text-xs font-bold">COMPLETED</span>
      case 'CANCELLED':
        if (appt.cancel_reason === 'unattended') {
          return <span className="px-3 py-1 bg-slate-100 dark:bg-slate-800/40 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-800 rounded-full text-xs font-bold">UNATTENDED</span>
        }
        return <span className="px-3 py-1 bg-rose-500/10 text-rose-400 border border-rose-500/30 rounded-full text-xs font-bold">CANCELLED</span>
      case 'RESCHEDULED':
        return <span className="px-3 py-1 bg-purple-500/10 text-purple-400 border border-purple-500/30 rounded-full text-xs font-bold">RESCHEDULED</span>
      default:
        return null
    }
  }

  return (
    <Layout>
      <div className="space-y-8">
        <PendingBookingBanner />
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-2xl font-extrabold text-slate-900 dark:text-white tracking-tight">My Consultations</h2>
            <p className="text-slate-600 dark:text-slate-400 text-sm mt-1">Manage and view details of your scheduled consultations.</p>
          </div>
          <Link
            to="/patient/doctors"
            className="px-5 py-2.5 bg-teal-500 hover:bg-teal-600 text-white font-bold rounded-xl text-xs shadow-lg shadow-teal-500/20 text-center"
          >
            + Book New Appointment
          </Link>
        </div>

        {/* Filters and Sorting Panel */}
        <div className="bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 rounded-3xl p-5 shadow-sm space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {/* Search */}
            <div className="relative">
              <span className="text-[11px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider block mb-1">Search</span>
              <input
                type="text"
                placeholder="Doctor, specialty, symptoms..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700/65 rounded-xl text-xs font-semibold focus:outline-none focus:border-teal-500 text-slate-800 dark:text-slate-100"
              />
            </div>

            {/* Specialty Category */}
            <div>
              <span className="text-[11px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider block mb-1">Category</span>
              <select
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700/65 rounded-xl text-xs font-semibold focus:outline-none focus:border-teal-500 text-slate-800 dark:text-slate-100 cursor-pointer"
              >
                {categories.map((c) => (
                  <option key={c} value={c} className="bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100">{c === 'ALL' ? 'All Specialties' : c}</option>
                ))}
              </select>
            </div>

            {/* Sort Order */}
            <div>
              <span className="text-[11px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider block mb-1">Sort By</span>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as any)}
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700/65 rounded-xl text-xs font-semibold focus:outline-none focus:border-teal-500 text-slate-800 dark:text-slate-100 cursor-pointer"
              >
                <option value="latest" className="bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100">Latest Date</option>
                <option value="oldest" className="bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100">Oldest Date</option>
                <option value="doctor" className="bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100">Doctor Name</option>
                <option value="urgency" className="bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100">Urgency (High First)</option>
              </select>
            </div>

            {/* Reset Filters Button */}
            <div className="flex items-end">
              <button
                onClick={() => {
                  setSearchTerm('')
                  setSelectedCategory('ALL')
                  setSelectedYear('ALL')
                  setSelectedMonth('ALL')
                  setSelectedDate('')
                  setSortBy('latest')
                  setFilter('ALL')
                }}
                className="w-full py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-bold transition cursor-pointer"
              >
                Reset All Filters
              </button>
            </div>
          </div>

          <div className="border-t border-slate-200 dark:border-slate-800/80 pt-4 grid grid-cols-1 sm:grid-cols-3 gap-4">
            {/* Year Select */}
            <div>
              <span className="text-[11px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider block mb-1">Filter by Year</span>
              <select
                value={selectedYear}
                onChange={(e) => setSelectedYear(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700/65 rounded-xl text-xs font-semibold focus:outline-none focus:border-teal-500 text-slate-800 dark:text-slate-100 cursor-pointer"
              >
                {years.map((y) => (
                  <option key={y} value={y} className="bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100">{y === 'ALL' ? 'All Years' : y}</option>
                ))}
              </select>
            </div>

            {/* Month Select */}
            <div>
              <span className="text-[11px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider block mb-1">Filter by Month</span>
              <select
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700/65 rounded-xl text-xs font-semibold focus:outline-none focus:border-teal-500 text-slate-800 dark:text-slate-100 cursor-pointer"
              >
                {months.map((m) => (
                  <option key={m.value} value={m.value} className="bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100">{m.label}</option>
                ))}
              </select>
            </div>

            {/* Exact Date */}
            <div>
              <span className="text-[11px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider block mb-1">Filter by Exact Date</span>
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700/65 rounded-xl text-xs font-semibold focus:outline-none focus:border-teal-500 text-slate-800 dark:text-slate-100 cursor-pointer"
              />
            </div>
          </div>
        </div>

        {/* Status Filter Tabs */}
        <div className="flex flex-wrap gap-2 border-b border-slate-200 dark:border-slate-800 pb-4">
          {['ALL', 'IN PROGRESS', 'CONFIRMED', 'COMPLETED', 'CANCELLED'].map((tab) => (
            <button
              key={tab}
              onClick={() => setFilter(tab)}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition cursor-pointer ${
                filter === tab
                  ? 'bg-teal-500 text-white shadow-md'
                  : 'bg-white dark:bg-slate-900/60 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-800 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>

        {/* Appointments List */}
        {isLoading ? (
          <div className="space-y-4">
            {[1, 2, 3, 4].map((i) => (
              <SkeletonRow key={i} />
            ))}
          </div>
        ) : sorted.length === 0 ? (
          <div className="p-12 text-center bg-white dark:bg-slate-900/40 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
            <Calendar className="w-12 h-12 text-slate-400 dark:text-slate-600 mx-auto mb-3" />
            {filter === 'IN PROGRESS' ? (
              <>
                <p className="text-slate-800 dark:text-slate-300 font-bold mb-1">No bookings in progress.</p>
                <p className="text-xs text-slate-500 mt-1 mb-4">
                  You don't have any pending slot holds. Click below to start a new booking.
                </p>
                <Link
                  to="/patient/doctors"
                  className="inline-flex items-center px-4 py-2 bg-teal-500 hover:bg-teal-600 text-white font-bold rounded-xl text-xs transition"
                >
                  + Book New Appointment
                </Link>
              </>
            ) : (
              <p className="text-slate-800 dark:text-slate-300 font-bold">No appointments found.</p>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            {sorted.map((appt) => (
              <div
                key={appt.id}
                className="bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-sm hover:border-teal-500/30 transition"
              >
                <div className="flex items-center space-x-4">
                  <div className="w-12 h-12 rounded-xl bg-teal-500/20 text-teal-600 dark:text-teal-400 flex items-center justify-center font-bold shrink-0">
                    <Stethoscope className="w-6 h-6" />
                  </div>
                  <div>
                    <div className="flex items-center space-x-3 mb-1">
                      <h3 className="font-bold text-slate-900 dark:text-white text-base">
                        {appt.doctor?.user?.full_name || 'Specialist Consultation'}
                      </h3>
                      {statusBadge(appt)}
                    </div>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                      {appt.doctor?.specialisation} • {formatDateTime(appt.slot_start)}
                      {appt.status === 'CANCELLED' && (
                        <span className="text-rose-500 dark:text-rose-400 ml-2 font-semibold">
                          (Cancelled on {formatDateTime(appt.updated_at)})
                        </span>
                      )}
                      {appt.status === 'RESCHEDULED' && appt.rescheduled_to_id && (
                        (() => {
                          const target = appointments.find(a => a.id === appt.rescheduled_to_id)
                          return target ? (
                            <span className="text-violet-600 dark:text-violet-400 ml-2 font-semibold">
                              (Rescheduled to {formatDateTime(target.slot_start)})
                            </span>
                          ) : null
                        })()
                      )}
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {appt.status === 'HELD' && appt.hold_expires_at && parseUtcTime(appt.hold_expires_at) > Date.now() && (
                    <button
                      onClick={() => navigate(`/patient/doctors/${appt.doctor_id}/book?appointment_id=${appt.id}&step=2`)}
                      className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-slate-950 rounded-xl text-xs font-extrabold flex items-center space-x-1.5 shadow-md shadow-amber-500/20 transition cursor-pointer"
                    >
                      <span>Resume Booking</span>
                      <ArrowRight className="w-4 h-4" />
                    </button>
                  )}
                  {(appt.status === 'CONFIRMED' || appt.status === 'PENDING_APPROVAL' || (appt.status === 'HELD' && appt.hold_expires_at && parseUtcTime(appt.hold_expires_at) > Date.now())) && (
                    <button
                      onClick={() => handleCancel(appt.id)}
                      className="px-3.5 py-2 bg-rose-50 dark:bg-rose-500/10 text-rose-600 dark:text-rose-300 hover:bg-rose-100 dark:hover:bg-rose-500/20 border border-rose-200 dark:border-rose-500/30 rounded-xl text-xs font-bold flex items-center space-x-1 transition cursor-pointer"
                    >
                      <XCircle className="w-4 h-4" />
                      <span>Cancel</span>
                    </button>
                  )}
                  {(appt.status === 'CONFIRMED' || appt.status === 'PENDING_APPROVAL') && (
                    <button
                      onClick={() => navigate(`/patient/book/${appt.doctor_id}?reschedule_appointment_id=${appt.id}`)}
                      className="px-3.5 py-2 bg-teal-50 dark:bg-teal-500/10 text-teal-600 dark:text-teal-300 hover:bg-teal-100 dark:hover:bg-teal-500/20 border border-teal-200 dark:border-teal-500/30 rounded-xl text-xs font-bold flex items-center space-x-1 transition cursor-pointer"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                      <span>Reschedule</span>
                    </button>
                  )}
                  <Link
                    to={`/patient/appointments/${appt.id}`}
                    className="px-4 py-2 bg-teal-50 dark:bg-teal-500/20 hover:bg-teal-500 text-teal-700 dark:text-teal-300 hover:text-white border border-teal-200 dark:border-teal-500/30 rounded-xl text-xs font-bold flex items-center space-x-1 transition"
                  >
                    <span>View Detail</span>
                    <ChevronRight className="w-4 h-4" />
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {rescheduleConfirmId && (
        (() => {
          const appt = appointments.find(a => a.id === rescheduleConfirmId)
          const doctorName = appt?.doctor?.user?.full_name || 'your specialist'
          const doctorId = appt?.doctor_id
          
          return (
            <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in">
              <div className="bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 max-w-md w-full space-y-6 shadow-2xl">
                <div className="flex items-center space-x-3 text-amber-600 dark:text-amber-400">
                  <AlertTriangle className="w-6 h-6 shrink-0" />
                  <h3 className="font-extrabold text-base text-slate-900 dark:text-white">Reschedule instead of cancelling?</h3>
                </div>
                
                <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                  We highly recommend rescheduling your consultation with <strong>Dr. {doctorName}</strong>. If you proceed to cancel, your booked slot will be released immediately.
                </p>
                
                <div className="flex flex-col space-y-2.5">
                  <button
                    onClick={() => navigate(`/patient/book/${doctorId}?reschedule_appointment_id=${rescheduleConfirmId}`)}
                    className="w-full py-3 bg-teal-500 hover:bg-teal-600 text-white font-bold rounded-xl text-xs flex items-center justify-center space-x-1.5 shadow-md shadow-teal-500/20 transition cursor-pointer"
                  >
                    <RefreshCw className="w-4 h-4 animate-spin" style={{ animationDuration: '4s' }} />
                    <span>Reschedule Consultation</span>
                  </button>
                  
                  <button
                    onClick={() => performCancellation(rescheduleConfirmId)}
                    className="w-full py-3 bg-rose-50 dark:bg-rose-950/20 hover:bg-rose-100 dark:hover:bg-rose-900/30 text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-800 font-bold rounded-xl text-xs transition cursor-pointer"
                  >
                    Strictly Cancel Appointment
                  </button>
                  
                  <button
                    onClick={() => setRescheduleConfirmId(null)}
                    className="w-full py-3 bg-slate-100 hover:bg-slate-200 dark:bg-slate-900 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 font-semibold rounded-xl text-xs transition cursor-pointer"
                  >
                    Keep Appointment
                  </button>
                </div>
              </div>
            </div>
          )
        })()
      )}
    </Layout>
  )
}
