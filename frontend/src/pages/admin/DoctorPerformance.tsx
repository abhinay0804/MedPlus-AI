import React, { useState, useEffect } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { Layout } from '../../components/Layout'
import { api } from '../../lib/api'
import { DoctorProfile } from '../../types'
import {
  ArrowLeft,
  Calendar,
  Clock,
  Star,
  MessageSquare,
  AlertTriangle,
  Send,
  Sparkles,
  Info,
  CalendarRange,
  Users,
  CheckCircle,
  XCircle,
  FileText,
  UserCheck
} from 'lucide-react'
import { toast } from 'sonner'

interface AdminNote {
  id: string
  doctor_id: string
  subject: string
  body: string
  priority: string
  is_read: boolean
  created_at: string
}

interface PerformanceMetrics {
  leaves_taken: number
  leaves_list: { id: string; leave_date: string; reason: string }[]
  cases_completed: number
  cases_cancelled: number
  cases_confirmed: number
  cases_high: number
  cases_medium: number
  cases_low: number
  total_working_hours: number
  avg_working_hours_per_day: number
  rating_avg: number
  rating_count: number
  reviews: { id: string; rating: number; comment: string; patient_name: string; created_at: string }[]
  gemini_analysis: {
    summary: string
    strengths: string[]
    areas_for_improvement: string[]
    suggestions: string
  }
}

export const DoctorPerformance: React.FC = () => {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [doctor, setDoctor] = useState<DoctorProfile | null>(null)
  const [metrics, setMetrics] = useState<PerformanceMetrics | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isMetricsLoading, setIsMetricsLoading] = useState(true)

  // Filters State
  const [period, setPeriod] = useState<'day' | 'month' | '3months' | '6months' | '1year' | 'total'>('total')
  const [selectedDate, setSelectedDate] = useState<string>(new Date().toISOString().split('T')[0])
  const [selectedMonth, setSelectedMonth] = useState<string>(new Date().toISOString().slice(0, 7)) // YYYY-MM

  // Send Note State
  const [noteSubject, setNoteSubject] = useState('')
  const [noteBody, setNoteBody] = useState('')
  const [notePriority, setNotePriority] = useState('ROUTINE')
  const [isSendingNote, setIsSendingNote] = useState(false)
  const [notesHistory, setNotesHistory] = useState<AdminNote[]>([])

  useEffect(() => {
    fetchDoctor()
    fetchNotesHistory()
  }, [id])

  useEffect(() => {
    fetchPerformance()
  }, [id, period, selectedDate, selectedMonth])

  const fetchDoctor = async () => {
    try {
      setIsLoading(true)
      const data = await api.get<DoctorProfile>(`/admin/doctors/${id}`)
      setDoctor(data)
    } catch (err: any) {
      toast.error('Failed to load doctor profile')
      navigate('/admin/doctors')
    } finally {
      setIsLoading(false)
    }
  }

  const fetchNotesHistory = async () => {
    try {
      const data = await api.get<AdminNote[]>(`/admin/doctors/${id}/notes`)
      setNotesHistory(data)
    } catch (err: any) {
      console.error('Failed to load notes history', err)
    }
  }

  const fetchPerformance = async () => {
    try {
      setIsMetricsLoading(true)
      const dateQuery = period === 'day' ? selectedDate : period === 'month' ? selectedMonth : undefined
      const queryParams = new URLSearchParams()
      queryParams.append('period', period)
      if (dateQuery) {
        queryParams.append('date_str', dateQuery)
      }
      const data = await api.get<PerformanceMetrics>(`/admin/doctors/${id}/performance?${queryParams.toString()}`)
      setMetrics(data)
    } catch (err: any) {
      toast.error('Failed to load performance metrics')
    } finally {
      setIsMetricsLoading(false)
    }
  }

  const handleSendNote = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!noteSubject.trim() || !noteBody.trim()) {
      toast.error('Subject and directive body cannot be empty.')
      return
    }
    try {
      setIsSendingNote(true)
      await api.post(`/admin/doctors/${id}/notes`, {
        subject: noteSubject,
        body: noteBody,
        priority: notePriority,
      })
      toast.success('Directive sent to doctor successfully!')
      setNoteSubject('')
      setNoteBody('')
      setNotePriority('ROUTINE')
      fetchNotesHistory()
    } catch (err: any) {
      toast.error(err.message || 'Failed to send directive')
    } finally {
      setIsSendingNote(false)
    }
  }

  if (isLoading || !doctor) {
    return (
      <Layout activeTab="doctors">
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="w-8 h-8 border-4 border-teal-500 border-t-transparent rounded-full animate-spin"></div>
        </div>
      </Layout>
    )
  }

  const totalCases = metrics
    ? metrics.cases_completed + metrics.cases_cancelled + metrics.cases_confirmed
    : 0

  return (
    <Layout activeTab="doctors">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Back and Header */}
        <div className="flex items-center space-x-4">
          <Link
            to={`/admin/doctors/${id}`}
            className="p-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg text-slate-500 hover:text-slate-800 dark:hover:text-white transition"
          >
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <div className="flex items-center space-x-2">
              <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Dr. {doctor.user?.full_name}</h1>
              {doctor.is_suspended && (
                <span className="px-2 py-0.5 rounded bg-rose-500/20 text-rose-500 text-[10px] font-black uppercase tracking-wider">
                  Suspended
                </span>
              )}
            </div>
            <p className="text-slate-500 text-sm">{doctor.specialisation} Specialist Practice & Performance metrics</p>
          </div>
        </div>

        {/* Doctor Summary Info */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6 text-sm">
            <div>
              <span className="text-slate-400 text-xs block mb-1">Email Address</span>
              <span className="font-semibold text-slate-800 dark:text-slate-200">{doctor.user?.email}</span>
            </div>
            <div>
              <span className="text-slate-400 text-xs block mb-1">Phone Number</span>
              <span className="font-semibold text-slate-800 dark:text-slate-200">{doctor.user?.phone || 'N/A'}</span>
            </div>
            <div>
              <span className="text-slate-400 text-xs block mb-1">Clinic Status</span>
              <span className="font-semibold text-slate-800 dark:text-slate-200 flex items-center space-x-1.5">
                <span className={`w-2 h-2 rounded-full ${doctor.is_active && !(doctor.is_suspended ?? false) ? 'bg-emerald-500' : 'bg-rose-500'}`} />
                <span>{doctor.is_active && !(doctor.is_suspended ?? false) ? 'Active Practice' : (doctor.is_suspended ?? false) ? 'Suspended' : 'Inactive'}</span>
              </span>
            </div>
            <div>
              <span className="text-slate-400 text-xs block mb-1">Accountability Demerits</span>
              <span className={`font-black ${(doctor.demerit_points ?? 0) >= 10 ? 'text-rose-500' : 'text-slate-800 dark:text-slate-200'}`}>
                {doctor.demerit_points ?? 0}/10 Points
              </span>
            </div>
          </div>
        </div>

        {/* Time Filter Bar */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex flex-wrap gap-2">
            {(['day', 'month', '3months', '6months', '1year', 'total'] as const).map((p) => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                className={`px-4 py-2 rounded-lg text-xs font-bold uppercase transition cursor-pointer ${
                  period === p
                    ? 'bg-teal-600 text-white'
                    : 'bg-slate-100 hover:bg-slate-200 text-slate-650 dark:bg-slate-800 dark:text-slate-350 dark:hover:bg-slate-750'
                }`}
              >
                {p === '3months' ? '3 Months' : p === '6months' ? '6 Months' : p === '1year' ? '1 Year' : p}
              </button>
            ))}
          </div>

          {/* Context Date Pickers */}
          {period === 'day' && (
            <div className="flex items-center space-x-2 text-sm">
              <span className="text-slate-400">Select Date:</span>
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-xs text-slate-805 dark:text-white p-2 focus:outline-none"
              />
            </div>
          )}

          {period === 'month' && (
            <div className="flex items-center space-x-2 text-sm">
              <span className="text-slate-400">Select Month:</span>
              <input
                type="month"
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value)}
                className="bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-xs text-slate-805 dark:text-white p-2 focus:outline-none"
              />
            </div>
          )}
        </div>

        {/* Metrics Dashboard */}
        {isMetricsLoading || !metrics ? (
          <div className="flex items-center justify-center min-h-[250px] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl">
            <div className="w-8 h-8 border-4 border-teal-500 border-t-transparent rounded-full animate-spin"></div>
          </div>
        ) : (
          <div className="space-y-6 animate-fade-in">
            {/* KPI Cards Grid */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              {/* Card 1: Completed cases */}
              <div className="bg-white dark:bg-slate-900 p-5 rounded-xl border border-slate-200 dark:border-slate-800 flex items-center space-x-4 shadow-sm">
                <div className="p-3 bg-emerald-50 dark:bg-emerald-500/10 rounded-lg">
                  <CheckCircle className="w-6 h-6 text-emerald-600 dark:text-emerald-400" />
                </div>
                <div>
                  <span className="text-slate-400 text-xs block">Completed Cases</span>
                  <span className="text-xl font-black text-slate-850 dark:text-white">{metrics.cases_completed}</span>
                  <span className="text-[10px] text-slate-400 block pt-0.5">Total booked: {total_cases_count(metrics)}</span>
                </div>
              </div>

              {/* Card 2: Cancellations */}
              <div className="bg-white dark:bg-slate-900 p-5 rounded-xl border border-slate-200 dark:border-slate-800 flex items-center space-x-4 shadow-sm">
                <div className="p-3 bg-rose-50 dark:bg-rose-500/10 rounded-lg">
                  <XCircle className="w-6 h-6 text-rose-600 dark:text-rose-400" />
                </div>
                <div>
                  <span className="text-slate-400 text-xs block">Cancelled (Physician)</span>
                  <span className="text-xl font-black text-slate-850 dark:text-white">{metrics.cases_cancelled}</span>
                  <span className="text-[10px] text-slate-400 block pt-0.5">Demerits added</span>
                </div>
              </div>

              {/* Card 3: Working Hours */}
              <div className="bg-white dark:bg-slate-900 p-5 rounded-xl border border-slate-200 dark:border-slate-800 flex items-center space-x-4 shadow-sm">
                <div className="p-3 bg-blue-50 dark:bg-blue-500/10 rounded-lg">
                  <Clock className="w-6 h-6 text-blue-650 dark:text-blue-400" />
                </div>
                <div>
                  <span className="text-slate-400 text-xs block">Hours Mapped</span>
                  <span className="text-xl font-black text-slate-850 dark:text-white">{metrics.total_working_hours}h</span>
                  <span className="text-[10px] text-slate-400 block pt-0.5">Avg/day: {metrics.avg_working_hours_per_day}h</span>
                </div>
              </div>

              {/* Card 4: Ratings */}
              <div className="bg-white dark:bg-slate-900 p-5 rounded-xl border border-slate-200 dark:border-slate-800 flex items-center space-x-4 shadow-sm">
                <div className="p-3 bg-amber-50 dark:bg-amber-500/10 rounded-lg">
                  <Star className="w-6 h-6 text-amber-550 dark:text-amber-400 fill-amber-550 dark:fill-amber-400" />
                </div>
                <div>
                  <span className="text-slate-400 text-xs block">Average Rating</span>
                  <span className="text-xl font-black text-slate-850 dark:text-white">{metrics.rating_avg}/5</span>
                  <span className="text-[10px] text-slate-400 block pt-0.5">{metrics.rating_count} Patient review(s)</span>
                </div>
              </div>
            </div>

            {/* Urgency Distribution Bar */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-sm space-y-3">
              <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200">Patient Case Urgency Profile</h3>
              <div className="flex h-4 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                {metrics.cases_high > 0 && (
                  <div
                    style={{ width: `${(metrics.cases_high / Math.max(1, metrics.cases_completed)) * 100}%` }}
                    className="bg-rose-500 h-full hover:opacity-90 transition-opacity"
                    title="High Urgency"
                  />
                )}
                {metrics.cases_medium > 0 && (
                  <div
                    style={{ width: `${(metrics.cases_medium / Math.max(1, metrics.cases_completed)) * 100}%` }}
                    className="bg-amber-500 h-full hover:opacity-90 transition-opacity"
                    title="Medium Urgency"
                  />
                )}
                {metrics.cases_low > 0 && (
                  <div
                    style={{ width: `${(metrics.cases_low / Math.max(1, metrics.cases_completed)) * 100}%` }}
                    className="bg-blue-500 h-full hover:opacity-90 transition-opacity"
                    title="Low Urgency"
                  />
                )}
              </div>
              <div className="flex items-center space-x-6 text-xs font-semibold text-slate-500 pt-1">
                <span className="flex items-center space-x-1.5">
                  <span className="w-2.5 h-2.5 bg-rose-500 rounded" />
                  <span>High: {metrics.cases_high} Cases</span>
                </span>
                <span className="flex items-center space-x-1.5">
                  <span className="w-2.5 h-2.5 bg-amber-500 rounded" />
                  <span>Medium: {metrics.cases_medium} Cases</span>
                </span>
                <span className="flex items-center space-x-1.5">
                  <span className="w-2.5 h-2.5 bg-blue-500 rounded" />
                  <span>Low: {metrics.cases_low} Cases</span>
                </span>
              </div>
            </div>

            {/* Performance appraisal & notes grid */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              {/* Left Side: Gemini Appraisal & Send Directive (Col 7) */}
              <div className="lg:col-span-7 space-y-6">
                {/* Gemini Review Panel */}
                <div className="bg-gradient-to-br from-teal-500/5 to-blue-500/5 border border-teal-500/20 dark:border-teal-400/10 rounded-xl p-6 shadow-sm space-y-4">
                  <div className="flex items-center space-x-2 border-b border-teal-500/10 pb-3">
                    <Sparkles className="w-5 h-5 text-teal-600 dark:text-teal-400" />
                    <h3 className="font-extrabold text-sm text-slate-900 dark:text-white uppercase tracking-wider">
                      Gemini Clinical Practice Audit
                    </h3>
                  </div>

                  <div className="space-y-4 text-sm text-slate-650 dark:text-slate-350">
                    <div>
                      <span className="text-[10px] font-bold uppercase tracking-wider text-teal-650 dark:text-teal-450 block mb-1">Executive Summary</span>
                      <p className="italic">"{metrics.gemini_analysis.summary}"</p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1">
                      <div>
                        <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-650 dark:text-emerald-450 block mb-1">Key Strengths</span>
                        <ul className="list-disc pl-4 space-y-1">
                          {metrics.gemini_analysis.strengths.map((str, idx) => (
                            <li key={idx}>{str}</li>
                          ))}
                        </ul>
                      </div>
                      <div>
                        <span className="text-[10px] font-bold uppercase tracking-wider text-rose-650 dark:text-rose-450 block mb-1">Areas for Improvement</span>
                        <ul className="list-disc pl-4 space-y-1">
                          {metrics.gemini_analysis.areas_for_improvement.map((area, idx) => (
                            <li key={idx}>{area}</li>
                          ))}
                        </ul>
                      </div>
                    </div>

                    <div className="pt-2 border-t border-teal-500/10">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-blue-650 dark:text-blue-450 block mb-1">AI Recommendation</span>
                      <p className="font-semibold text-slate-800 dark:text-slate-200">{metrics.gemini_analysis.suggestions}</p>
                    </div>
                  </div>
                </div>

                {/* Send notes/directives */}
                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 shadow-sm space-y-4">
                  <div className="flex items-center space-x-2 border-b border-slate-100 dark:border-slate-800 pb-3">
                    <FileText className="w-5 h-5 text-slate-500" />
                    <h3 className="font-bold text-slate-900 dark:text-white">Send Directive Note</h3>
                  </div>

                  <form onSubmit={handleSendNote} className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div className="md:col-span-2">
                        <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Subject</label>
                        <input
                          type="text"
                          value={noteSubject}
                          onChange={(e) => setNoteSubject(e.target.value)}
                          placeholder="e.g. Schedule audit, Clinical triage mismatch policy"
                          className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-sm text-slate-850 dark:text-white p-2.5 focus:outline-none"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Priority Level</label>
                        <select
                          value={notePriority}
                          onChange={(e) => setNotePriority(e.target.value)}
                          className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-sm text-slate-850 dark:text-white p-2.5 focus:outline-none"
                        >
                          <option value="ROUTINE">Routine Note</option>
                          <option value="IMPORTANT">Important Alert</option>
                          <option value="URGENT">Urgent Action</option>
                        </select>
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Directive Body</label>
                      <textarea
                        value={noteBody}
                        onChange={(e) => setNoteBody(e.target.value)}
                        placeholder="Define directive instruction content. An email notification will be automatically sent to the physician."
                        rows={4}
                        className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-sm text-slate-850 dark:text-white p-2.5 focus:outline-none resize-none"
                      />
                    </div>

                    <div className="flex justify-end">
                      <button
                        type="submit"
                        disabled={isSendingNote}
                        className="flex items-center space-x-2 px-5 py-2.5 bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white rounded-lg text-sm font-semibold transition cursor-pointer"
                      >
                        <Send className="w-4 h-4" />
                        <span>{isSendingNote ? 'Sending...' : 'Send Directive'}</span>
                      </button>
                    </div>
                  </form>
                </div>

                {/* Sent directives log history */}
                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 shadow-sm space-y-4">
                  <h3 className="font-bold text-slate-900 dark:text-white text-sm">Directives Dispatch Log</h3>
                  {notesHistory.length === 0 ? (
                    <p className="text-xs text-slate-400 italic">No previous notes dispatched to Dr. {doctor.user?.full_name}.</p>
                  ) : (
                    <div className="space-y-3 overflow-y-auto max-h-60 pr-2">
                      {notesHistory.map((note) => (
                        <div key={note.id} className="p-3 border border-slate-100 dark:border-slate-800 rounded-xl text-xs space-y-1 bg-slate-50/50 dark:bg-slate-950/20">
                          <div className="flex items-center justify-between">
                            <span className="font-bold text-slate-800 dark:text-slate-200">{note.subject}</span>
                            <span className={`px-1.5 py-0.5 rounded text-[8px] font-black uppercase ${
                              note.priority === 'URGENT'
                                ? 'bg-rose-500/10 text-rose-500'
                                : note.priority === 'IMPORTANT'
                                ? 'bg-amber-500/10 text-amber-550'
                                : 'bg-slate-150 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
                            }`}>
                              {note.priority}
                            </span>
                          </div>
                          <p className="text-slate-500 dark:text-slate-400">{note.body}</p>
                          <div className="flex items-center justify-between text-[10px] text-slate-400 pt-1.5 border-t border-slate-100 dark:border-slate-800/40">
                            <span>Status: {note.is_read ? '✓ Read' : 'Unread'}</span>
                            <span>{new Date(note.created_at + 'Z').toLocaleDateString()}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Right Side: Leaves & Reviews (Col 5) */}
              <div className="lg:col-span-5 space-y-6">
                {/* Leaves Table */}
                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-sm space-y-4">
                  <div className="flex items-center space-x-2 border-b border-slate-100 dark:border-slate-800 pb-3">
                    <CalendarRange className="w-5 h-5 text-slate-500" />
                    <h3 className="font-bold text-slate-900 dark:text-white">Leaves Log</h3>
                  </div>

                  {metrics.leaves_list.length === 0 ? (
                    <div className="p-4 text-center text-xs text-slate-400 italic">No leaves recorded in the selected period.</div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs border-collapse">
                        <thead>
                          <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-405 font-bold uppercase">
                            <th className="py-2">Date</th>
                            <th className="py-2">Reason</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-850">
                          {metrics.leaves_list.map((leave) => (
                            <tr key={leave.id} className="text-slate-650 dark:text-slate-350">
                              <td className="py-2.5 font-bold">{leave.leave_date}</td>
                              <td className="py-2.5 italic">"{leave.reason || 'Personal reasons'}"</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>

                {/* Patient Feedback Reviews list */}
                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-sm space-y-4">
                  <div className="flex items-center space-x-2 border-b border-slate-100 dark:border-slate-800 pb-3">
                    <MessageSquare className="w-5 h-5 text-slate-500" />
                    <h3 className="font-bold text-slate-900 dark:text-white">Patient Reviews</h3>
                  </div>

                  {metrics.reviews.length === 0 ? (
                    <div className="p-4 text-center text-xs text-slate-400 italic">No patient reviews recorded in the selected period.</div>
                  ) : (
                    <div className="space-y-4 max-h-[300px] overflow-y-auto pr-2">
                      {metrics.reviews.map((rev) => (
                        <div key={rev.id} className="space-y-2 border-b border-slate-50 dark:border-slate-800 pb-3 last:border-0 last:pb-0">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
                              {rev.patient_name}
                            </span>
                            <div className="flex items-center space-x-0.5">
                              {[...Array(5)].map((_, i) => (
                                <Star
                                  key={i}
                                  className={`w-3.5 h-3.5 ${
                                    i < rev.rating
                                      ? 'text-amber-550 fill-amber-555'
                                      : 'text-slate-200 dark:text-slate-750'
                                  }`}
                                />
                              ))}
                            </div>
                          </div>
                          <p className="text-xs text-slate-600 dark:text-slate-400 italic">"{rev.comment || 'No comment provided'}"</p>
                          <span className="text-[10px] text-slate-400 block">{rev.created_at}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </Layout>
  )
}

function total_cases_count(metrics: PerformanceMetrics) {
  return metrics.cases_completed + metrics.cases_cancelled + metrics.cases_confirmed
}
