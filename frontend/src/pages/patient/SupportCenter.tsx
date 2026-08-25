import React, { useState, useEffect, useRef } from 'react'
import { Layout } from '../../components/Layout'
import { apiRequest } from '../../lib/api'
import {
  MessageSquare, Send, Plus, Star, HelpCircle,
  CheckCircle2, Clock, AlertCircle, X, ChevronDown, ChevronUp, Calendar
} from 'lucide-react'
import { toast } from 'sonner'

interface Appointment {
  id: string
  slot_start: string
  doctor?: {
    user?: {
      full_name: string
    }
  }
}

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
  appointment_time: string | null
}

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

export default function SupportCenter() {
  const [tickets, setTickets] = useState<SupportTicket[]>([])
  const [appointments, setAppointments] = useState<Appointment[]>([])
  const [isLoading, setIsLoading] = useState(true)
  
  // Chat state
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([
    {
      role: 'assistant',
      content: "Hello! I am your MedPulse AI Assistant. I can check your current bookings, explain clinic policies, or help you locate available specialists. Ask me anything!"
    }
  ])
  const [chatInput, setChatInput] = useState('')
  const [isAiResponding, setIsAiResponding] = useState(false)
  const chatEndRef = useRef<HTMLDivElement>(null)

  // Ticket Form state
  const [isFormOpen, setIsFormOpen] = useState(false)
  const [subject, setSubject] = useState('')
  const [category, setCategory] = useState('APPOINTMENT_QUERY')
  const [message, setMessage] = useState('')
  const [selectedApptId, setSelectedApptId] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Rating state
  const [ratingTargetId, setRatingTargetId] = useState<string | null>(null)
  const [hoverRating, setHoverRating] = useState(0)
  const [ratingVal, setRatingVal] = useState(5)
  const [ratingComment, setRatingComment] = useState('')

  // Expandable tickets state
  const [expandedTicketId, setExpandedTicketId] = useState<string | null>(null)

  useEffect(() => {
    fetchInitialData()
  }, [])

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [chatMessages, isAiResponding])

  const fetchInitialData = async () => {
    try {
      setIsLoading(true)
      const [ticketsData, apptsData] = await Promise.all([
        apiRequest<SupportTicket[]>('/patient/support/tickets'),
        apiRequest<Appointment[]>('/patient/appointments')
      ])
      setTickets(ticketsData)
      // Only keep confirmed or completed appointments to link tickets to
      setAppointments(apptsData || [])
    } catch (err: any) {
      toast.error(err.message || 'Failed to load Helpdesk data')
    } finally {
      setIsLoading(false)
    }
  }

  const handleSendChat = async (e?: React.FormEvent, customMsg?: string) => {
    e?.preventDefault()
    const msg = (customMsg || chatInput).trim()
    if (!msg) return

    if (!customMsg) {
      setChatInput('')
    }

    const newMessages = [...chatMessages, { role: 'user' as const, content: msg }]
    setChatMessages(newMessages)
    setIsAiResponding(true)

    try {
      const response = await apiRequest<{ reply: string }>('/patient/support/chat', {
        method: 'POST',
        body: JSON.stringify({
          message: msg,
          history: chatMessages.map(m => ({ role: m.role, content: m.content }))
        })
      })
      setChatMessages(prev => [...prev, { role: 'assistant', content: response.reply }])
    } catch (err: any) {
      setChatMessages(prev => [
        ...prev,
        { role: 'assistant', content: "I'm sorry, I'm experiencing technical issues connecting to my AI core right now. Feel free to open a support ticket for our administrator if you need immediate assistance." }
      ])
    } finally {
      setIsAiResponding(false)
    }
  }

  const handleCreateTicket = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!subject.trim() || !message.trim()) {
      toast.error('Subject and message are required.')
      return
    }

    setIsSubmitting(true)
    try {
      const newTicket = await apiRequest<SupportTicket>('/patient/support/tickets', {
        method: 'POST',
        body: JSON.stringify({
          subject: subject.trim(),
          category,
          message: message.trim(),
          appointment_id: selectedApptId || null
        })
      })
      toast.success('Support ticket created successfully!')
      setTickets(prev => [newTicket, ...prev])
      setIsFormOpen(false)
      // Reset form
      setSubject('')
      setCategory('APPOINTMENT_QUERY')
      setMessage('')
      setSelectedApptId('')
    } catch (err: any) {
      toast.error(err.message || 'Failed to submit ticket')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleSubmitRating = async (ticketId: string) => {
    try {
      const updated = await apiRequest<SupportTicket>(`/patient/support/tickets/${ticketId}/rate`, {
        method: 'PUT',
        body: JSON.stringify({
          rating: ratingVal,
          rating_comment: ratingComment.trim() || null
        })
      })
      toast.success('Thank you for rating our support!')
      setTickets(prev => prev.map(t => t.id === ticketId ? updated : t))
      setRatingTargetId(null)
      setRatingComment('')
      setRatingVal(5)
    } catch (err: any) {
      toast.error(err.message || 'Failed to submit rating')
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

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-2xl font-extrabold text-slate-900 dark:text-white tracking-tight">Helpdesk & Support Center</h2>
            <p className="text-slate-600 dark:text-slate-400 text-sm mt-1">Get immediate answers from our AI assistant or open a help ticket for the clinic administrator.</p>
          </div>
          <button
            onClick={() => setIsFormOpen(true)}
            className="px-5 py-2.5 bg-teal-500 hover:bg-teal-600 text-white font-bold rounded-xl text-xs shadow-lg shadow-teal-500/20 flex items-center justify-center space-x-1.5 cursor-pointer transition"
          >
            <Plus className="w-4 h-4 font-bold" />
            <span>Open Support Ticket</span>
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          
          {/* LEFT: Gemini Support AI Chatbot */}
          <div className="lg:col-span-6 bg-white dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 rounded-3xl overflow-hidden flex flex-col h-[560px] shadow-sm">
            <div className="p-4 bg-slate-50 dark:bg-slate-900/60 border-b border-slate-200 dark:border-slate-800 flex items-center space-x-3">
              <div className="w-9 h-9 rounded-xl bg-teal-500/20 text-teal-600 dark:text-teal-400 flex items-center justify-center font-bold">
                AI
              </div>
              <div>
                <h3 className="text-sm font-black text-slate-900 dark:text-white leading-none">MedPulse AI Assistant</h3>
                <span className="text-[10px] text-teal-500 font-bold flex items-center mt-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-teal-500 mr-1 animate-ping" />
                  Live Chatbot Console
                </span>
              </div>
            </div>

            <div className="flex-1 p-4 overflow-y-auto space-y-4">
              {chatMessages.map((msg, i) => (
                <div
                  key={i}
                  className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-[80%] rounded-2xl px-4 py-3 text-xs leading-relaxed whitespace-pre-line ${
                      msg.role === 'user'
                        ? 'bg-teal-500 text-white font-semibold rounded-tr-none shadow-md shadow-teal-500/10'
                        : 'bg-slate-100 dark:bg-slate-850/80 text-slate-800 dark:text-slate-100 rounded-tl-none border border-slate-200/50 dark:border-slate-800/40'
                    }`}
                  >
                    {msg.content}
                  </div>
                </div>
              ))}
              {isAiResponding && (
                <div className="flex justify-start">
                  <div className="bg-slate-100 dark:bg-slate-850/80 text-slate-500 rounded-2xl rounded-tl-none px-4 py-3 border border-slate-200/50 dark:border-slate-800/40 flex items-center space-x-1.5 text-xs">
                    <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                    <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                    <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                  </div>
                </div>
              )}
              <div ref={chatEndRef} />
            </div>

            {/* Quick Suggestion Pills */}
            <div className="px-4 py-2 border-t border-slate-100 dark:border-slate-800/50 flex flex-wrap gap-1.5 bg-slate-50/50 dark:bg-slate-900/30">
              <button
                onClick={() => handleSendChat(undefined, "List my appointment bookings")}
                className="px-2.5 py-1 bg-white dark:bg-slate-850 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 rounded-lg text-[10px] font-semibold transition"
              >
                📅 My active bookings
              </button>
              <button
                onClick={() => handleSendChat(undefined, "Show doctor specialists directory")}
                className="px-2.5 py-1 bg-white dark:bg-slate-850 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 rounded-lg text-[10px] font-semibold transition"
              >
                🩺 Specialists list
              </button>
              <button
                onClick={() => handleSendChat(undefined, "What is the doctor suspension and demerits policy?")}
                className="px-2.5 py-1 bg-white dark:bg-slate-850 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 rounded-lg text-[10px] font-semibold transition"
              >
                ⚠️ Suspension rules
              </button>
            </div>

            <form onSubmit={handleSendChat} className="p-3 border-t border-slate-200 dark:border-slate-800 flex items-center space-x-2">
              <input
                type="text"
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                placeholder="Ask assistant about bookings or clinic help..."
                className="flex-1 px-4 py-2 text-xs bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl focus:outline-none focus:border-teal-500 text-slate-900 dark:text-white"
              />
              <button
                type="submit"
                disabled={!chatInput.trim() || isAiResponding}
                className="p-2.5 bg-teal-500 hover:bg-teal-600 text-white rounded-xl transition disabled:opacity-50 cursor-pointer"
              >
                <Send className="w-4 h-4 fill-white" />
              </button>
            </form>
          </div>

          {/* RIGHT: Ticket History & Expandable Drawer */}
          <div className="lg:col-span-6 space-y-4">
            <h3 className="text-xs font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider">
              My Support Enquiries ({tickets.length})
            </h3>

            {tickets.length === 0 ? (
              <div className="p-8 text-center bg-white dark:bg-slate-900/40 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm">
                <MessageSquare className="w-10 h-10 text-slate-400 dark:text-slate-600 mx-auto mb-2" />
                <p className="text-slate-800 dark:text-slate-300 text-xs font-bold mb-1">No support tickets found.</p>
                <p className="text-[11px] text-slate-500">Submit a support request to the clinic administrators if you have any payments, account, or booking issues.</p>
              </div>
            ) : (
              <div className="space-y-3 max-h-[500px] overflow-y-auto pr-1">
                {tickets.map((t) => {
                  const isExpanded = expandedTicketId === t.id
                  return (
                    <div
                      key={t.id}
                      className="bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden shadow-sm"
                    >
                      <div
                        onClick={() => setExpandedTicketId(isExpanded ? null : t.id)}
                        className="p-4 flex items-center justify-between cursor-pointer hover:bg-slate-50/50 dark:hover:bg-slate-850/40 transition"
                      >
                        <div className="space-y-1">
                          <div className="flex items-center space-x-2">
                            <span className="text-xs font-black text-slate-900 dark:text-white">{t.subject}</span>
                            {getStatusBadge(t.status)}
                          </div>
                          <div className="flex items-center space-x-2 text-[10px] text-slate-500">
                            <span>{getCategoryLabel(t.category)}</span>
                            <span>•</span>
                            <span>{formatDateTime(t.created_at)}</span>
                          </div>
                        </div>
                        {isExpanded ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
                      </div>

                      {isExpanded && (
                        <div className="px-4 pb-4 pt-2 border-t border-slate-100 dark:border-slate-800/80 bg-slate-50/30 dark:bg-slate-950/20 space-y-4 text-xs">
                          {/* Patient Message */}
                          <div className="space-y-1">
                            <h4 className="font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider text-[9px]">Your Message</h4>
                            <p className="text-slate-700 dark:text-slate-300 leading-relaxed bg-white dark:bg-slate-900 p-3 rounded-xl border border-slate-100 dark:border-slate-800/60">
                              {t.message}
                            </p>
                          </div>

                          {/* Related Appointment Info */}
                          {t.appointment_time && (
                            <div className="flex items-center space-x-1.5 text-[10px] text-slate-500">
                              <Calendar className="w-3.5 h-3.5 text-slate-400" />
                              <span>Linked Consultation: <strong>{t.appointment_time}</strong></span>
                            </div>
                          )}

                          {/* Admin Response */}
                          {t.admin_response ? (
                            <div className="space-y-2">
                              <h4 className="font-bold text-teal-600 dark:text-teal-400 uppercase tracking-wider text-[9px]">Administrator Response</h4>
                              <p className="text-slate-700 dark:text-slate-300 leading-relaxed bg-teal-500/5 dark:bg-teal-500/10 p-3 rounded-xl border border-teal-500/10">
                                {t.admin_response}
                              </p>

                              {/* Customer Resolution Rating Section */}
                              {t.rating ? (
                                <div className="p-3 bg-slate-50 dark:bg-slate-900 rounded-xl border border-slate-100 dark:border-slate-800/60 flex items-center justify-between">
                                  <div className="space-y-0.5">
                                    <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 block">Your Review Rating</span>
                                    {t.rating_comment && <p className="text-[11px] text-slate-600 dark:text-slate-400 italic">"{t.rating_comment}"</p>}
                                  </div>
                                  <div className="flex space-x-0.5 text-amber-400">
                                    {[1, 2, 3, 4, 5].map(star => (
                                      <Star key={star} className={`w-3.5 h-3.5 ${star <= t.rating! ? 'fill-amber-400' : 'text-slate-300'}`} />
                                    ))}
                                  </div>
                                </div>
                              ) : ratingTargetId === t.id ? (
                                <div className="p-3 bg-slate-50 dark:bg-slate-900 rounded-xl border border-slate-100 dark:border-slate-800/60 space-y-3">
                                  <div className="flex items-center justify-between">
                                    <span className="font-bold text-[10px] text-slate-500">Rate the resolution provided:</span>
                                    <div className="flex space-x-1">
                                      {[1, 2, 3, 4, 5].map(star => (
                                        <button
                                          key={star}
                                          type="button"
                                          onClick={() => setRatingVal(star)}
                                          onMouseEnter={() => setHoverRating(star)}
                                          onMouseLeave={() => setHoverRating(0)}
                                          className="focus:outline-none cursor-pointer"
                                        >
                                          <Star
                                            className={`w-4 h-4 transition-colors ${
                                              star <= (hoverRating || ratingVal) ? 'fill-amber-400 text-amber-400' : 'text-slate-300 dark:text-slate-600'
                                            }`}
                                          />
                                        </button>
                                      ))}
                                    </div>
                                  </div>
                                  <input
                                    type="text"
                                    value={ratingComment}
                                    onChange={(e) => setRatingComment(e.target.value)}
                                    placeholder="Any feedback on the response? (optional)"
                                    className="w-full px-3 py-1.5 text-xs bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg outline-none focus:border-teal-500 text-slate-900 dark:text-white"
                                  />
                                  <div className="flex justify-end space-x-1.5">
                                    <button
                                      onClick={() => {
                                        setRatingTargetId(null)
                                        setRatingComment('')
                                      }}
                                      className="px-2.5 py-1.5 bg-slate-100 dark:bg-slate-800 text-slate-650 dark:text-slate-400 rounded-lg text-[10px] font-bold cursor-pointer"
                                    >
                                      Cancel
                                    </button>
                                    <button
                                      onClick={() => handleSubmitRating(t.id)}
                                      className="px-3 py-1.5 bg-teal-500 hover:bg-teal-600 text-white rounded-lg text-[10px] font-bold cursor-pointer"
                                    >
                                      Submit Rating
                                    </button>
                                  </div>
                                </div>
                              ) : (
                                <button
                                  onClick={() => {
                                    setRatingTargetId(t.id)
                                    setRatingVal(5)
                                  }}
                                  className="px-3 py-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-teal-50 hover:text-teal-600 dark:hover:bg-teal-500/10 dark:hover:text-teal-400 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-800 rounded-xl font-bold flex items-center justify-center space-x-1 cursor-pointer transition w-full text-[10px]"
                                >
                                  <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
                                  <span>Rate this support resolution</span>
                                </button>
                              )}
                            </div>
                          ) : (
                            <div className="p-3 bg-slate-100/50 dark:bg-slate-900/30 rounded-xl text-center text-[10px] text-slate-500 italic">
                              Enquiry is pending admin review. We will notify you once answered.
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>

        {/* Modal: New Ticket Submission Form */}
        {isFormOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
            <div className="bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-3xl w-full max-w-lg overflow-hidden shadow-2xl animate-in fade-in zoom-in-95 duration-150">
              <div className="px-6 py-4 bg-slate-50 dark:bg-slate-900/80 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
                <h3 className="font-extrabold text-slate-900 dark:text-white text-base">Submit Support Enquiry</h3>
                <button
                  onClick={() => setIsFormOpen(false)}
                  className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-white rounded-lg transition"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleCreateTicket} className="p-6 space-y-4 text-xs">
                {/* Category Selection */}
                <div>
                  <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">Query Category</label>
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-slate-55 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl outline-none focus:border-teal-500 text-slate-900 dark:text-white cursor-pointer"
                  >
                    <option value="APPOINTMENT_QUERY">Appointment Enquiry</option>
                    <option value="BILLING_ISSUE">Billing & Payments</option>
                    <option value="COMPLAINT">Clinic Complaint</option>
                    <option value="TECHNICAL_SUPPORT">Technical / System Issue</option>
                    <option value="OTHER">Other Query</option>
                  </select>
                </div>

                {/* Optional Linked Appointment selection */}
                <div>
                  <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Related Consultation <span className="text-slate-400 font-normal">(optional)</span>
                  </label>
                  <select
                    value={selectedApptId}
                    onChange={(e) => setSelectedApptId(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-slate-55 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl outline-none focus:border-teal-500 text-slate-900 dark:text-white cursor-pointer"
                  >
                    <option value="">-- None / General clinic query --</option>
                    {appointments.map((a) => (
                      <option key={a.id} value={a.id}>
                        {formatDateTime(a.slot_start)} — Dr. {a.doctor?.user?.full_name}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Subject Input */}
                <div>
                  <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">Subject</label>
                  <input
                    type="text"
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    placeholder="Short description of your query..."
                    maxLength={255}
                    required
                    className="w-full px-3.5 py-2.5 bg-slate-55 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl outline-none focus:border-teal-500 text-slate-900 dark:text-white"
                  />
                </div>

                {/* Message Textarea */}
                <div>
                  <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">Detailed Message</label>
                  <textarea
                    rows={4}
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    placeholder="Explain your query, concern, or complaint details in depth here..."
                    required
                    className="w-full px-3.5 py-2.5 bg-slate-55 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl outline-none focus:border-teal-500 text-slate-900 dark:text-white resize-none"
                  />
                </div>

                {/* Action Buttons */}
                <div className="flex items-center justify-end space-x-2 pt-2 border-t border-slate-100 dark:border-slate-800/80">
                  <button
                    type="button"
                    onClick={() => setIsFormOpen(false)}
                    className="px-4 py-2.5 bg-slate-100 dark:bg-slate-900 text-slate-650 dark:text-slate-400 hover:bg-slate-200 rounded-xl font-bold cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="px-5 py-2.5 bg-teal-500 hover:bg-teal-600 text-white font-bold rounded-xl shadow-lg shadow-teal-500/20 transition disabled:opacity-50 cursor-pointer"
                  >
                    {isSubmitting ? 'Submitting...' : 'Submit Support Ticket'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </Layout>
  )
}
