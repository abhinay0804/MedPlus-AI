import React, { useState, useEffect } from 'react'
import { Layout } from '../../components/Layout'
import { apiRequest } from '../../lib/api'
import {
  MessageSquare, Star, Search, Filter, CheckCircle2,
  Clock, AlertCircle, X, ChevronRight, BookOpen, AlertOctagon
} from 'lucide-react'
import { toast } from 'sonner'

interface SupportTicket {
  id: string
  patient_id: string
  appointment_id: string | null
  subject: string
  category: string
  message: string
  status: string
  admin_response: string | null
  rating: number | null
  rating_comment: string | null
  created_at: string
  resolved_at: string | null
  patient_name: string | null
  patient_email: string | null
  appointment_time: string | null
}

export default function HelpdeskConsole() {
  const [tickets, setTickets] = useState<SupportTicket[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState('ALL')
  const [categoryFilter, setCategoryFilter] = useState('ALL')
  const [searchQuery, setSearchQuery] = useState('')

  // Reply drawer state
  const [selectedTicket, setSelectedTicket] = useState<SupportTicket | null>(null)
  const [replyText, setReplyText] = useState('')
  const [keepOpen, setKeepOpen] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)

  useEffect(() => {
    fetchTickets()
  }, [])

  const fetchTickets = async () => {
    try {
      setIsLoading(true)
      const data = await apiRequest<SupportTicket[]>('/admin/support/tickets')
      setTickets(data)
    } catch (err: any) {
      toast.error(err.message || 'Failed to fetch support tickets')
    } finally {
      setIsLoading(false)
    }
  }

  const handleRespond = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedTicket) return
    if (!replyText.trim()) {
      toast.error('Response content cannot be blank.')
      return
    }

    setIsSubmitting(true)
    try {
      const updated = await apiRequest<SupportTicket>(`/admin/support/tickets/${selectedTicket.id}/respond`, {
        method: 'PUT',
        body: JSON.stringify({
          admin_response: replyText.trim(),
          keep_open: keepOpen
        })
      })
      toast.success(keepOpen ? 'Ticket updated to In Progress status.' : 'Ticket resolved and closed.')
      setTickets(prev => prev.map(t => t.id === selectedTicket.id ? updated : t))
      setSelectedTicket(null)
      setReplyText('')
      setKeepOpen(false)
    } catch (err: any) {
      toast.error(err.message || 'Failed to submit response')
    } finally {
      setIsSubmitting(false)
    }
  }

  const formatDateTime = (dateStr: string) => {
    return new Date(dateStr).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'RESOLVED':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 text-[10px] font-bold">
            <CheckCircle2 className="w-3 h-3 mr-1" />
            Resolved
          </span>
        )
      case 'IN_PROGRESS':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-500 border border-blue-500/20 text-[10px] font-bold">
            <Clock className="w-3 h-3 mr-1" />
            In Progress
          </span>
        )
      default:
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-500 border border-amber-500/20 text-[10px] font-bold">
            <AlertCircle className="w-3 h-3 mr-1 font-bold animate-pulse" />
            Open
          </span>
        )
    }
  }

  const getCategoryLabel = (cat: string) => {
    switch (cat) {
      case 'APPOINTMENT_QUERY':
        return 'Appointment Query'
      case 'BILLING_ISSUE':
        return 'Billing & Fees'
      case 'COMPLAINT':
        return 'Clinic Complaint'
      case 'TECHNICAL_SUPPORT':
        return 'Technical Issue'
      default:
        return 'General / Other'
    }
  }

  // Filtered tickets
  const filtered = tickets.filter(t => {
    if (statusFilter !== 'ALL' && t.status !== statusFilter) return false
    if (categoryFilter !== 'ALL' && t.category !== categoryFilter) return false
    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      const patName = (t.patient_name || '').toLowerCase()
      const patEmail = (t.patient_email || '').toLowerCase()
      const subj = t.subject.toLowerCase()
      const msg = t.message.toLowerCase()
      if (!patName.includes(q) && !patEmail.includes(q) && !subj.includes(q) && !msg.includes(q)) return false
    }
    return true
  })

  // KPI Calculations
  const openCount = tickets.filter(t => t.status === 'OPEN').length
  const progressCount = tickets.filter(t => t.status === 'IN_PROGRESS').length
  const resolvedCount = tickets.filter(t => t.status === 'RESOLVED').length
  const ratedTickets = tickets.filter(t => t.status === 'RESOLVED' && t.rating !== null)
  const avgRating = ratedTickets.length > 0 
    ? (ratedTickets.reduce((sum, t) => sum + t.rating!, 0) / ratedTickets.length).toFixed(1)
    : 'N/A'

  return (
    <Layout>
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-extrabold text-slate-900 dark:text-white tracking-tight">Helpdesk & Support Command</h2>
          <p className="text-slate-600 dark:text-slate-400 text-sm mt-1">Review, coordinate, and reply to patient queries, complaints, and billing issues.</p>
        </div>

        {/* Support KPIs Grid */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 rounded-2xl shadow-sm flex items-center justify-between">
            <div className="space-y-1">
              <span className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-wider block">Open Tickets</span>
              <span className="text-2xl font-extrabold text-amber-500">{openCount}</span>
            </div>
            <AlertOctagon className="w-10 h-10 text-amber-500/20" />
          </div>
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 rounded-2xl shadow-sm flex items-center justify-between">
            <div className="space-y-1">
              <span className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-wider block">In Progress</span>
              <span className="text-2xl font-extrabold text-blue-500">{progressCount}</span>
            </div>
            <Clock className="w-10 h-10 text-blue-500/20" />
          </div>
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 rounded-2xl shadow-sm flex items-center justify-between">
            <div className="space-y-1">
              <span className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-wider block">Resolved Tickets</span>
              <span className="text-2xl font-extrabold text-emerald-500">{resolvedCount}</span>
            </div>
            <CheckCircle2 className="w-10 h-10 text-emerald-500/20" />
          </div>
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 rounded-2xl shadow-sm flex items-center justify-between">
            <div className="space-y-1">
              <span className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-wider block">Support Rating Avg</span>
              <div className="flex items-center space-x-1.5">
                <span className="text-2xl font-extrabold text-indigo-500">{avgRating}</span>
                {avgRating !== 'N/A' && <Star className="w-5 h-5 fill-amber-400 text-amber-400" />}
              </div>
            </div>
            <Star className="w-10 h-10 text-indigo-500/20" />
          </div>
        </div>

        {/* Filter Toolbar */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-5 shadow-sm space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {/* Search */}
            <div className="relative">
              <span className="text-[11px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider block mb-1">Search Tickets</span>
              <div className="relative">
                <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
                <input
                  type="text"
                  placeholder="Patient name, subject..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700/65 rounded-xl text-xs font-semibold focus:outline-none focus:border-teal-500 text-slate-900 dark:text-white"
                />
              </div>
            </div>

            {/* Status Filter */}
            <div>
              <span className="text-[11px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider block mb-1">Filter by Status</span>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700/65 rounded-xl text-xs font-semibold focus:outline-none focus:border-teal-500 text-slate-800 dark:text-slate-100 cursor-pointer"
              >
                <option value="ALL">All Statuses</option>
                <option value="OPEN">Open Enquiries</option>
                <option value="IN_PROGRESS">In Progress</option>
                <option value="RESOLVED">Resolved Enquiries</option>
              </select>
            </div>

            {/* Category Filter */}
            <div>
              <span className="text-[11px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider block mb-1">Filter by Category</span>
              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700/65 rounded-xl text-xs font-semibold focus:outline-none focus:border-teal-500 text-slate-800 dark:text-slate-100 cursor-pointer"
              >
                <option value="ALL">All Categories</option>
                <option value="APPOINTMENT_QUERY">Appointment Query</option>
                <option value="BILLING_ISSUE">Billing & Payments</option>
                <option value="COMPLAINT">Clinic Complaint</option>
                <option value="TECHNICAL_SUPPORT">Technical Issue</option>
                <option value="OTHER">Other / General</option>
              </select>
            </div>

            {/* Reset */}
            <div className="flex items-end">
              <button
                onClick={() => {
                  setStatusFilter('ALL')
                  setCategoryFilter('ALL')
                  setSearchQuery('')
                }}
                className="w-full py-2 bg-slate-100 dark:bg-slate-850 hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-650 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-bold transition cursor-pointer"
              >
                Reset Filters
              </button>
            </div>
          </div>
        </div>

        {/* Tickets Command Table */}
        <div className="bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 rounded-3xl overflow-hidden shadow-sm">
          {isLoading ? (
            <div className="h-64 bg-slate-100 dark:bg-slate-900/40 rounded-2xl animate-pulse" />
          ) : filtered.length === 0 ? (
            <div className="p-12 text-center">
              <MessageSquare className="w-12 h-12 text-slate-400 dark:text-slate-600 mx-auto mb-3" />
              <p className="text-slate-900 dark:text-slate-300 font-bold">No support tickets found.</p>
              <p className="text-xs text-slate-500 mt-1">There are no patient queries matching the current filters.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/30 text-slate-400 dark:text-slate-500 uppercase tracking-wider font-extrabold text-[10px]">
                    <th className="px-6 py-4">Patient Info</th>
                    <th className="px-6 py-4">Subject & Category</th>
                    <th className="px-6 py-4">Submitted At</th>
                    <th className="px-6 py-4">Status</th>
                    <th className="px-6 py-4">Resolution Rating</th>
                    <th className="px-6 py-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-150 dark:divide-slate-850">
                  {filtered.map((t) => (
                    <tr key={t.id} className="hover:bg-slate-50/30 dark:hover:bg-slate-850/20 transition">
                      <td className="px-6 py-4">
                        <div className="font-bold text-slate-900 dark:text-white">{t.patient_name}</div>
                        <div className="text-[10px] text-slate-500">{t.patient_email}</div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="font-semibold text-slate-900 dark:text-white">{t.subject}</div>
                        <div className="text-[10px] text-slate-400 font-medium">{getCategoryLabel(t.category)}</div>
                      </td>
                      <td className="px-6 py-4 text-slate-500 font-medium">{formatDateTime(t.created_at)}</td>
                      <td className="px-6 py-4">{getStatusBadge(t.status)}</td>
                      <td className="px-6 py-4">
                        {t.rating ? (
                          <div className="space-y-0.5">
                            <div className="flex space-x-0.5 text-amber-400">
                              {[1, 2, 3, 4, 5].map(star => (
                                <Star key={star} className={`w-3 h-3 ${star <= t.rating! ? 'fill-amber-400' : 'text-slate-350'}`} />
                              ))}
                            </div>
                            {t.rating_comment && <p className="text-[9px] text-slate-500 italic max-w-[150px] truncate">"{t.rating_comment}"</p>}
                          </div>
                        ) : t.status === 'RESOLVED' ? (
                          <span className="text-[10px] text-slate-400 italic">Not rated yet</span>
                        ) : (
                          <span className="text-[10px] text-slate-400">—</span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <button
                          onClick={() => {
                            setSelectedTicket(t)
                            setReplyText(t.admin_response || '')
                            setKeepOpen(t.status === 'IN_PROGRESS')
                          }}
                          className="px-3.5 py-1.5 bg-teal-50 dark:bg-teal-500/10 hover:bg-teal-500 text-teal-650 dark:text-teal-400 hover:text-white border border-teal-200 dark:border-teal-500/20 rounded-lg font-bold flex items-center space-x-1 ml-auto cursor-pointer transition text-[11px]"
                        >
                          <span>{t.status === 'RESOLVED' ? 'Inspect' : 'Respond'}</span>
                          <ChevronRight className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Drawer Modal: Inspect & Respond to Support Ticket */}
        {selectedTicket && (
          <div className="fixed inset-0 z-50 flex items-center justify-end bg-slate-900/50 backdrop-blur-sm">
            <div className="bg-white dark:bg-slate-950 border-l border-slate-200 dark:border-slate-800 h-full w-full max-w-lg overflow-y-auto flex flex-col shadow-2xl animate-in slide-in-from-right duration-200">
              
              <div className="px-6 py-5 bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
                <div>
                  <h3 className="font-extrabold text-slate-900 dark:text-white text-base">Support Enquiry Reply</h3>
                  <span className="text-[10px] text-slate-500 block mt-0.5">Ticket ID: {selectedTicket.id}</span>
                </div>
                <button
                  onClick={() => {
                    setSelectedTicket(null)
                    setReplyText('')
                  }}
                  className="p-1 text-slate-400 hover:text-slate-650 dark:hover:text-white rounded-lg transition"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="flex-1 p-6 space-y-6 text-xs">
                {/* Patient Roster Card */}
                <div className="bg-slate-50 dark:bg-slate-900/60 p-4 border border-slate-200 dark:border-slate-800/80 rounded-2xl space-y-2">
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider block">Patient Details</span>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <span className="text-[10px] text-slate-400">Full Name</span>
                      <p className="font-bold text-slate-850 dark:text-white">{selectedTicket.patient_name}</p>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-400">Category</span>
                      <p className="font-bold text-slate-850 dark:text-white">{getCategoryLabel(selectedTicket.category)}</p>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-400">Email Address</span>
                      <p className="font-medium text-slate-800 dark:text-slate-250 select-all">{selectedTicket.patient_email}</p>
                    </div>
                    {selectedTicket.appointment_time && (
                      <div>
                        <span className="text-[10px] text-slate-400">Linked Appointment</span>
                        <p className="font-semibold text-slate-800 dark:text-slate-250">{selectedTicket.appointment_time}</p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Patient Query Details */}
                <div className="space-y-1.5">
                  <h4 className="font-black text-slate-400 dark:text-slate-500 uppercase tracking-wider text-[9px]">Subject: {selectedTicket.subject}</h4>
                  <p className="p-4 bg-slate-50 dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800/60 text-slate-700 dark:text-slate-300 leading-relaxed font-medium">
                    {selectedTicket.message}
                  </p>
                </div>

                {/* Patient Rating displays if resolved */}
                {selectedTicket.rating && (
                  <div className="bg-amber-500/5 dark:bg-amber-500/10 p-4 border border-amber-500/20 rounded-2xl flex items-center justify-between">
                    <div className="space-y-0.5">
                      <span className="text-[10px] font-black text-amber-600 dark:text-amber-400 uppercase tracking-wider block">Patient Feedback Rating</span>
                      {selectedTicket.rating_comment && <p className="text-[11px] text-slate-700 dark:text-slate-300 italic">"{selectedTicket.rating_comment}"</p>}
                    </div>
                    <div className="flex space-x-0.5 text-amber-400 shrink-0">
                      {[1, 2, 3, 4, 5].map(star => (
                        <Star key={star} className={`w-4 h-4 ${star <= selectedTicket.rating! ? 'fill-amber-400' : 'text-slate-300 dark:text-slate-700'}`} />
                      ))}
                    </div>
                  </div>
                )}

                {/* Response Entry */}
                <form onSubmit={handleRespond} className="space-y-4 pt-4 border-t border-slate-100 dark:border-slate-800/80">
                  <div>
                    <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                      {selectedTicket.status === 'RESOLVED' ? 'Resolution Reply History' : 'Resolution Response Body'}
                    </label>
                    <textarea
                      rows={6}
                      value={replyText}
                      onChange={(e) => setReplyText(e.target.value)}
                      placeholder="Type your official helpdesk response here..."
                      disabled={selectedTicket.status === 'RESOLVED'}
                      required
                      className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl outline-none focus:border-teal-500 text-slate-900 dark:text-white resize-none text-xs leading-relaxed disabled:opacity-75"
                    />
                  </div>

                  {selectedTicket.status !== 'RESOLVED' && (
                    <div className="flex items-center space-x-2">
                      <input
                        type="checkbox"
                        id="keepOpen"
                        checked={keepOpen}
                        onChange={(e) => setKeepOpen(e.target.checked)}
                        className="w-4 h-4 text-teal-600 focus:ring-teal-500 border-slate-300 rounded cursor-pointer"
                      />
                      <label htmlFor="keepOpen" className="text-xs font-bold text-slate-750 dark:text-slate-300 cursor-pointer">
                        Keep ticket open (Mark status as "In Progress")
                      </label>
                    </div>
                  )}

                  {selectedTicket.status !== 'RESOLVED' && (
                    <div className="flex items-center justify-end space-x-2 pt-2">
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedTicket(null)
                          setReplyText('')
                        }}
                        className="px-4 py-2.5 bg-slate-100 dark:bg-slate-900 text-slate-650 dark:text-slate-400 hover:bg-slate-200 rounded-xl font-bold cursor-pointer"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        disabled={isSubmitting || !replyText.trim()}
                        className="px-5 py-2.5 bg-teal-500 hover:bg-teal-600 text-white font-bold rounded-xl shadow-lg shadow-teal-500/20 transition disabled:opacity-50 cursor-pointer"
                      >
                        {isSubmitting ? 'Submitting...' : keepOpen ? 'Update Ticket' : 'Send & Resolve Ticket'}
                      </button>
                    </div>
                  )}
                </form>
              </div>
            </div>
          </div>
        )}
      </div>
    </Layout>
  )
}
