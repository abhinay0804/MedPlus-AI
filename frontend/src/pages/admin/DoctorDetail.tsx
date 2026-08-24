import React, { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Layout } from '../../components/Layout'
import { api } from '../../lib/api'
import { DoctorProfile } from '../../types'
import { ArrowLeft, Clock, Calendar, Check, Save, Send, AlertTriangle, MessageSquare, Info } from 'lucide-react'
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

export const DoctorDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [doctor, setDoctor] = useState<DoctorProfile | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [specialisation, setSpecialisation] = useState('')
  const [slotDuration, setSlotDuration] = useState('30')
  const [isSaving, setIsSaving] = useState(false)
  const [isReactivating, setIsReactivating] = useState(false)

  const handleReactivate = async () => {
    const confirm = window.confirm("Are you sure you want to reactivate this doctor's profile and reset their demerit points to 0?")
    if (!confirm) return
    try {
      setIsReactivating(true)
      await api.post(`/admin/doctors/${id}/reactivate`, {})
      toast.success("Doctor's profile reactivated successfully and demerits reset.")
      fetchDoctor()
    } catch (err: any) {
      toast.error(err.message || "Failed to reactivate doctor profile.")
    } finally {
      setIsReactivating(false)
    }
  }

  // Working Hours State
  const [workingHours, setWorkingHours] = useState<Record<string, { start: string; end: string; enabled: boolean }>>({
    mon: { start: '09:00', end: '17:00', enabled: false },
    tue: { start: '09:00', end: '17:00', enabled: false },
    wed: { start: '09:00', end: '17:00', enabled: false },
    thu: { start: '09:00', end: '17:00', enabled: false },
    fri: { start: '09:00', end: '17:00', enabled: false },
    sat: { start: '09:00', end: '17:00', enabled: false },
    sun: { start: '09:00', end: '17:00', enabled: false },
  })

  // Directives State
  const [notes, setNotes] = useState<AdminNote[]>([])
  const [noteSubject, setNoteSubject] = useState('')
  const [noteBody, setNoteBody] = useState('')
  const [notePriority, setNotePriority] = useState('ROUTINE')
  const [isSendingNote, setIsSendingNote] = useState(false)

  useEffect(() => {
    fetchDoctor()
    fetchNotes()
  }, [id])

  const fetchDoctor = async () => {
    try {
      setIsLoading(true)
      const data = await api.get<DoctorProfile>(`/admin/doctors/${id}`)
      setDoctor(data)
      setSpecialisation(data.specialisation)
      setSlotDuration(data.slot_duration_minutes.toString())

      // Initialize working hours checklist
      const initialHours = {
        mon: { start: '09:00', end: '17:00', enabled: false },
        tue: { start: '09:00', end: '17:00', enabled: false },
        wed: { start: '09:00', end: '17:00', enabled: false },
        thu: { start: '09:00', end: '17:00', enabled: false },
        fri: { start: '09:00', end: '17:00', enabled: false },
        sat: { start: '09:00', end: '17:00', enabled: false },
        sun: { start: '09:00', end: '17:00', enabled: false },
      }
      if (data.working_hours) {
        Object.keys(initialHours).forEach((day) => {
          if (data.working_hours[day]) {
            initialHours[day as keyof typeof initialHours] = {
              start: data.working_hours[day].start,
              end: data.working_hours[day].end,
              enabled: true,
            }
          }
        })
      }
      setWorkingHours(initialHours)
    } catch (err: any) {
      toast.error(err.message || 'Failed to load doctor details')
    } finally {
      setIsLoading(false)
    }
  }

  const fetchNotes = async () => {
    try {
      const data = await api.get<AdminNote[]>(`/admin/doctors/${id}/notes`)
      setNotes(data)
    } catch (err: any) {
      console.error('Failed to load notes', err)
    }
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      setIsSaving(true)

      const formattedHours: Record<string, { start: string; end: string }> = {}
      Object.keys(workingHours).forEach((day) => {
        if (workingHours[day].enabled) {
          formattedHours[day] = {
            start: workingHours[day].start,
            end: workingHours[day].end,
          }
        }
      })

      if (Object.keys(formattedHours).length === 0) {
        toast.error('Doctor must have at least one enabled working day.')
        return
      }

      await api.put(`/admin/doctors/${id}`, {
        specialisation,
        slot_duration_minutes: parseInt(slotDuration, 10),
        working_hours: formattedHours,
      })
      toast.success('Doctor updated successfully!')
      fetchDoctor()
    } catch (err: any) {
      toast.error(err.message || 'Failed to update doctor')
    } finally {
      setIsSaving(false)
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
      fetchNotes()
    } catch (err: any) {
      toast.error(err.message || 'Failed to send directive')
    } finally {
      setIsSendingNote(false)
    }
  }

  const handleHourChange = (day: string, field: 'start' | 'end', value: string) => {
    setWorkingHours((prev) => ({
      ...prev,
      [day]: {
        ...prev[day],
        [field]: value,
      },
    }))
  }

  const toggleDayEnabled = (day: string) => {
    setWorkingHours((prev) => ({
      ...prev,
      [day]: {
        ...prev[day],
        enabled: !prev[day].enabled,
      },
    }))
  }

  const getPriorityBadge = (priority: string) => {
    switch (priority) {
      case 'URGENT':
        return 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300'
      case 'IMPORTANT':
        return 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
      default:
        return 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300'
    }
  }

  return (
    <Layout activeTab="doctors">
      <div className="max-w-4xl mx-auto space-y-6 pb-12">
        <button
          onClick={() => navigate('/admin/doctors')}
          className="flex items-center space-x-2 text-sm text-slate-500 hover:text-slate-900 dark:hover:text-white transition-colors cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Doctor Roster</span>
        </button>

        {isLoading ? (
          <div className="p-8 text-center text-slate-400">Loading doctor details...</div>
        ) : doctor ? (
          <>
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-2xl font-bold text-slate-900 dark:text-white">{doctor.user?.full_name}</h1>
                <p className="text-slate-500 text-sm">{doctor.user?.email} • {doctor.user?.phone || 'No phone'}</p>
              </div>
              <div className="flex items-center space-x-2">
                {doctor.is_suspended && (
                  <span className="px-3 py-1 rounded-full text-xs font-bold bg-red-100 text-red-850 dark:bg-red-950 dark:text-red-300 animate-pulse flex items-center space-x-1">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    <span>Suspended</span>
                  </span>
                )}
                <span className={`px-3 py-1 rounded-full text-xs font-semibold ${doctor.is_active ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300' : 'bg-rose-100 text-rose-800'}`}>
                  {doctor.is_active ? 'Active' : 'Inactive'}
                </span>
              </div>
            </div>

            {/* Demerits & Suspension Governance Panel */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="space-y-1">
                <span className="text-xs font-black text-slate-400 dark:text-slate-500 uppercase tracking-wider block">Clinic Governance & Demerits</span>
                <p className="text-sm text-slate-650 dark:text-slate-400">
                  {doctor.is_suspended 
                    ? "This doctor profile is currently locked. Reactivating resets demerits." 
                    : `Accumulated demerits: ${doctor.demerit_points || 0} / 10. Auto-suspended at 10.`}
                </p>
              </div>
              <div className="flex items-center space-x-4">
                <div className="text-right">
                  <span className="text-xs text-slate-400 uppercase tracking-wider block">Total Demerits</span>
                  <span className={`text-2xl font-black font-mono ${doctor.is_suspended ? 'text-red-500' : 'text-slate-700 dark:text-slate-300'}`}>
                    {doctor.demerit_points || 0}
                  </span>
                </div>
                {doctor.is_suspended && (
                  <button
                    onClick={handleReactivate}
                    disabled={isReactivating}
                    className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition shadow disabled:opacity-50 flex items-center space-x-1 cursor-pointer"
                  >
                    <Check className="w-3.5 h-3.5" />
                    <span>{isReactivating ? 'Reactivating...' : 'Reactivate Profile'}</span>
                  </button>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Doctor Details & Working Hours */}
              <div className="lg:col-span-2 space-y-6">
                <div className="bg-white dark:bg-slate-900 rounded-xl p-6 shadow-sm border border-slate-200 dark:border-slate-800 space-y-6">
                  <h2 className="text-lg font-semibold text-slate-900 dark:text-white flex items-center space-x-2">
                    <Calendar className="w-5 h-5 text-teal-600" />
                    <span>Clinical Profile & Schedule Override</span>
                  </h2>
                  <form onSubmit={handleSave} className="space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-semibold uppercase text-slate-600 dark:text-slate-400 mb-1">Specialisation</label>
                        <input
                          type="text"
                          value={specialisation}
                          onChange={(e) => setSpecialisation(e.target.value)}
                          className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-slate-900 dark:text-white text-sm focus:ring-2 focus:ring-teal-500 outline-none"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold uppercase text-slate-600 dark:text-slate-400 mb-1">Slot Duration (Minutes)</label>
                        <select
                          value={slotDuration}
                          onChange={(e) => setSlotDuration(e.target.value)}
                          className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-slate-900 dark:text-white text-sm focus:ring-2 focus:ring-teal-500 outline-none"
                        >
                          <option value="15">15 Minutes</option>
                          <option value="30">30 Minutes</option>
                          <option value="45">45 Minutes</option>
                          <option value="60">60 Minutes</option>
                        </select>
                      </div>
                    </div>

                    <div className="space-y-3">
                      <label className="block text-xs font-semibold uppercase text-slate-600 dark:text-slate-400">Weekly Schedule</label>
                      <div className="space-y-2 border border-slate-200 dark:border-slate-800 rounded-lg p-4 bg-slate-50 dark:bg-slate-950/50">
                        {Object.keys(workingHours).map((day) => {
                          const hours = workingHours[day]
                          return (
                            <div key={day} className="flex items-center justify-between py-2 border-b border-slate-100 dark:border-slate-900 last:border-0">
                              <div className="flex items-center space-x-3">
                                <input
                                  type="checkbox"
                                  checked={hours.enabled}
                                  onChange={() => toggleDayEnabled(day)}
                                  className="w-4 h-4 text-teal-600 border-slate-300 rounded focus:ring-teal-500"
                                />
                                <span className="text-sm font-medium uppercase text-slate-700 dark:text-slate-300 w-12">{day}</span>
                              </div>
                              {hours.enabled ? (
                                <div className="flex items-center space-x-2">
                                  <input
                                    type="time"
                                    value={hours.start}
                                    onChange={(e) => handleHourChange(day, 'start', e.target.value)}
                                    className="px-2 py-1 text-xs rounded border border-slate-250 bg-white dark:bg-slate-900 text-slate-900 dark:text-white outline-none focus:ring-1 focus:ring-teal-500"
                                  />
                                  <span className="text-xs text-slate-400">to</span>
                                  <input
                                    type="time"
                                    value={hours.end}
                                    onChange={(e) => handleHourChange(day, 'end', e.target.value)}
                                    className="px-2 py-1 text-xs rounded border border-slate-250 bg-white dark:bg-slate-900 text-slate-900 dark:text-white outline-none focus:ring-1 focus:ring-teal-500"
                                  />
                                </div>
                              ) : (
                                <span className="text-xs text-slate-400 italic">Off Day</span>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    </div>

                    <div className="flex justify-end">
                      <button
                        type="submit"
                        disabled={isSaving}
                        className="flex items-center space-x-2 px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-lg text-sm font-medium transition-colors cursor-pointer disabled:opacity-50"
                      >
                        <Save className="w-4 h-4" />
                        <span>{isSaving ? 'Saving...' : 'Save Configuration Override'}</span>
                      </button>
                    </div>
                  </form>
                </div>
              </div>

              {/* Directives & Communications Inbox */}
              <div className="space-y-6">
                <div className="bg-white dark:bg-slate-900 rounded-xl p-6 shadow-sm border border-slate-200 dark:border-slate-800 space-y-4">
                  <h2 className="text-lg font-semibold text-slate-900 dark:text-white flex items-center space-x-2">
                    <Send className="w-5 h-5 text-teal-600" />
                    <span>Send Directive</span>
                  </h2>
                  <form onSubmit={handleSendNote} className="space-y-3">
                    <div>
                      <label className="block text-[10px] font-semibold uppercase text-slate-500 mb-1">Subject</label>
                      <input
                        type="text"
                        value={noteSubject}
                        onChange={(e) => setNoteSubject(e.target.value)}
                        placeholder="e.g. Priotised triage reviews"
                        className="w-full px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-slate-900 dark:text-white text-xs focus:ring-2 focus:ring-teal-500 outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-semibold uppercase text-slate-500 mb-1">Directive Details</label>
                      <textarea
                        value={noteBody}
                        onChange={(e) => setNoteBody(e.target.value)}
                        rows={3}
                        placeholder="Provide details or priorities for the doctor..."
                        className="w-full px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-slate-900 dark:text-white text-xs focus:ring-2 focus:ring-teal-500 outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-semibold uppercase text-slate-500 mb-1">Priority Level</label>
                      <select
                        value={notePriority}
                        onChange={(e) => setNotePriority(e.target.value)}
                        className="w-full px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-slate-900 dark:text-white text-xs focus:ring-2 focus:ring-teal-500 outline-none"
                      >
                        <option value="ROUTINE">Routine Directive</option>
                        <option value="IMPORTANT">Important Alert</option>
                        <option value="URGENT">Urgent Action Required</option>
                      </select>
                    </div>
                    <button
                      type="submit"
                      disabled={isSendingNote}
                      className="w-full flex items-center justify-center space-x-2 px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-lg text-xs font-semibold transition-colors disabled:opacity-50"
                    >
                      <Send className="w-3.5 h-3.5" />
                      <span>{isSendingNote ? 'Sending...' : 'Dispatch Note'}</span>
                    </button>
                  </form>
                </div>

                {/* Sent directives log */}
                <div className="bg-white dark:bg-slate-900 rounded-xl p-6 shadow-sm border border-slate-200 dark:border-slate-800 space-y-4">
                  <h3 className="text-sm font-semibold text-slate-955 dark:text-white flex items-center space-x-2">
                    <MessageSquare className="w-4 h-4 text-teal-600" />
                    <span>Communications History</span>
                  </h3>
                  {notes.length === 0 ? (
                    <p className="text-xs text-slate-400 italic">No directives sent to this doctor yet.</p>
                  ) : (
                    <div className="space-y-3 max-h-60 overflow-y-auto pr-1">
                      {notes.map((note) => (
                        <div key={note.id} className="p-3 rounded-lg border border-slate-100 dark:border-slate-800 space-y-1.5">
                          <div className="flex items-center justify-between">
                            <span className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase ${getPriorityBadge(note.priority)}`}>
                              {note.priority}
                            </span>
                            <span className="text-[9px] text-slate-400">
                              {new Date(note.created_at + 'Z').toLocaleDateString(undefined, {
                                month: 'short',
                                day: 'numeric',
                              })}
                            </span>
                          </div>
                          <h4 className="text-xs font-semibold text-slate-800 dark:text-slate-200">{note.subject}</h4>
                          <p className="text-[11px] text-slate-600 dark:text-slate-400">{note.body}</p>
                          <div className="flex justify-end">
                            <span className={`text-[9px] font-medium ${note.is_read ? 'text-emerald-500' : 'text-amber-500'}`}>
                              {note.is_read ? 'Read' : 'Delivered / Unread'}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </>
        ) : (
          <div className="p-8 text-center text-slate-400">Doctor not found.</div>
        )}
      </div>
    </Layout>
  )
}
