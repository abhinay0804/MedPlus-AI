import React, { useState, useEffect } from 'react'
import { Layout } from '../../components/Layout'
import { api } from '../../lib/api'
import { useAuth } from '../../context/AuthContext'
import { Clock, Stethoscope, Save, Plus, Trash2, HelpCircle, Star, Calendar, AlertCircle, XCircle } from 'lucide-react'
import { toast } from 'sonner'

const DEFAULT_QUESTIONS = [
  'How long have you experienced these symptoms?',
  'What recent medications or treatments have you tried?',
  'On a scale of 1-10, what is the pain or discomfort severity?',
  'Are there any specific triggers or aggravating factors?',
]

const DAYS_OF_WEEK = [
  { key: 'mon', label: 'Monday' },
  { key: 'tue', label: 'Tuesday' },
  { key: 'wed', label: 'Wednesday' },
  { key: 'thu', label: 'Thursday' },
  { key: 'fri', label: 'Friday' },
  { key: 'sat', label: 'Saturday' },
  { key: 'sun', label: 'Sunday' },
]

export const DoctorSettings: React.FC = () => {
  const { user } = useAuth()
  const [specialisation, setSpecialisation] = useState('General Medicine')
  const [slotDuration, setSlotDuration] = useState('30')
  const [questions, setQuestions] = useState<string[]>(DEFAULT_QUESTIONS)
  const [newQuestionText, setNewQuestionText] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [reviews, setReviews] = useState<any[]>([])
  const [reqStatus, setReqStatus] = useState<any>(null)
  const [leaveRequests, setLeaveRequests] = useState<any[]>([])
  const [newLeaveDate, setNewLeaveDate] = useState('')
  const [newLeaveReason, setNewLeaveReason] = useState('')
  const [isSubmittingLeave, setIsSubmittingLeave] = useState(false)

  const [workingHours, setWorkingHours] = useState<Record<string, { start: string; end: string; enabled: boolean }>>({
    mon: { start: '09:00', end: '17:00', enabled: true },
    tue: { start: '09:00', end: '17:00', enabled: true },
    wed: { start: '09:00', end: '17:00', enabled: true },
    thu: { start: '09:00', end: '17:00', enabled: true },
    fri: { start: '09:00', end: '17:00', enabled: true },
    sat: { start: '09:00', end: '12:00', enabled: false },
    sun: { start: '09:00', end: '12:00', enabled: false },
  })

  useEffect(() => {
    const fetchSettings = async () => {
      setIsLoading(true)
      try {
        const res = await api.get<any>('/doctor/settings')
        const profile = res.profile
        if (profile) {
          setSpecialisation(profile.specialisation || '')
          setSlotDuration(String(profile.slot_duration_minutes || '30'))
          if (profile.intake_questions && profile.intake_questions.length > 0) {
            setQuestions(profile.intake_questions)
          }
          if (profile.working_hours) {
            const updatedHours = { ...workingHours }
            DAYS_OF_WEEK.forEach((d) => {
              const val = profile.working_hours[d.key]
              if (val) {
                updatedHours[d.key] = { start: val.start, end: val.end, enabled: true }
              } else {
                updatedHours[d.key].enabled = false
              }
            })
            setWorkingHours(updatedHours)
          }
        }
        setReviews(res.reviews || [])
      } catch (err: any) {
        console.error('Failed to load doctor settings:', err)
        toast.error('Could not load clinical settings')
      } finally {
        setIsLoading(false)
      }
    }
    const fetchReqStatus = async () => {
      try {
        const res = await api.get<any>('/doctor/working-hours-request/status')
        setReqStatus(res)
      } catch (err) {
        console.error('Failed to load request status:', err)
      }
    }
    const fetchLeaveRequests = async () => {
      try {
        const res = await api.get<any[]>('/doctor/leave-requests')
        setLeaveRequests(res)
      } catch (err) {
        console.error('Failed to load leave requests:', err)
      }
    }
    fetchSettings()
    fetchReqStatus()
    fetchLeaveRequests()
  }, [])

  const handleAddQuestion = (e: React.FormEvent) => {
    e.preventDefault()
    if (!newQuestionText.trim()) return
    setQuestions([...questions, newQuestionText.trim()])
    setNewQuestionText('')
    toast.success('Question template updated locally!')
  }

  const handleRemoveQuestion = (index: number) => {
    if (questions.length <= 1) {
      toast.error('You must keep at least 1 intake question.')
      return
    }
    setQuestions(questions.filter((_, i) => i !== index))
  }

  const handleQuestionChange = (index: number, val: string) => {
    const updated = [...questions]
    updated[index] = val
    setQuestions(updated)
  }

  const handleHourChange = (day: string, field: 'start' | 'end', value: string) => {
    setWorkingHours({
      ...workingHours,
      [day]: {
        ...workingHours[day],
        [field]: value,
      },
    })
  }

  const handleDayToggle = (day: string) => {
    setWorkingHours({
      ...workingHours,
      [day]: {
        ...workingHours[day],
        enabled: !workingHours[day].enabled,
      },
    })
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSaving(true)

    // Build working hours payload containing only enabled days
    const hoursPayload: Record<string, { start: string; end: string }> = {}
    let hasEnabledDay = false
    DAYS_OF_WEEK.forEach((d) => {
      if (workingHours[d.key].enabled) {
        hoursPayload[d.key] = {
          start: workingHours[d.key].start,
          end: workingHours[d.key].end,
        }
        hasEnabledDay = true
      }
    })

    if (!hasEnabledDay) {
      toast.error('You must select at least 1 working day.')
      setIsSaving(false)
      return
    }

    try {
      // 1. Save clinical intake questions templates directly
      await api.put('/doctor/settings', {
        intake_questions: questions,
      })

      // 2. Submit working hours change request to Admin
      await api.post('/doctor/working-hours-request', {
        working_hours: hoursPayload,
        slot_duration_minutes: parseInt(slotDuration),
      })

      toast.success('Clinical template saved. Working schedule submitted for admin approval!')

      // Reload request status immediately
      const statusRes = await api.get<any>('/doctor/working-hours-request/status')
      setReqStatus(statusRes)
    } catch (err: any) {
      toast.error(err.message || 'Failed to save settings')
    } finally {
      setIsSaving(false)
    }
  }

  const averageRating = reviews.length > 0 
    ? (reviews.reduce((acc, r) => acc + r.rating, 0) / reviews.length).toFixed(1)
    : '0.0'

  return (
    <Layout activeTab="settings">
      <div className="max-w-4xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Doctor Settings & Availability</h1>
          <p className="text-slate-500 dark:text-slate-400">Configure your medical profile, weekly schedule, and custom patient intake questions.</p>
        </div>

        {reqStatus?.status === 'PENDING' && (
          <div className="bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-900/30 rounded-2xl p-4 flex items-start space-x-3 text-amber-800 dark:text-amber-300">
            <AlertCircle className="w-5 h-5 mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-sm font-bold">Schedule Update Request Pending</p>
              <p className="text-xs mt-1 leading-relaxed opacity-90">
                Your proposed schedule (<strong>{reqStatus.proposed_slot_duration} Minutes</strong> slot duration) is currently awaiting review by the clinical operations administration. You can still make further edits; the latest update will overwrite this pending request.
              </p>
            </div>
          </div>
        )}

        {reqStatus?.status === 'REJECTED' && (
          <div className="bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-900/30 rounded-2xl p-4 flex items-start space-x-3 text-red-800 dark:text-red-300">
            <XCircle className="w-5 h-5 mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-sm font-bold">Schedule Request Declined</p>
              <p className="text-xs mt-1 leading-relaxed opacity-90">
                Your recent schedule change request was declined by the administration.
                {reqStatus.admin_reason && (
                  <span className="block mt-1 font-semibold italic">Reason: "{reqStatus.admin_reason}"</span>
                )}
              </p>
            </div>
          </div>
        )}

        {isLoading ? (
          <div className="h-96 bg-white dark:bg-slate-900 rounded-xl animate-pulse border border-slate-200 dark:border-slate-800" />
        ) : (
          <form onSubmit={handleSave} className="space-y-6">
            {/* Profile Details Card */}
            <div className="bg-white dark:bg-slate-900 rounded-xl p-6 shadow-sm border border-slate-200 dark:border-slate-800">
              <div className="flex items-center space-x-3 mb-6">
                <div className="w-10 h-10 rounded-lg bg-teal-50 dark:bg-teal-900/30 flex items-center justify-center text-teal-600 dark:text-teal-400">
                  <Stethoscope className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Clinical Details</h2>
                  <p className="text-xs text-slate-500">Public details displayed to patients on search</p>
                </div>
              </div>

              <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-1">Doctor Name</label>
                    <input
                      type="text"
                      disabled
                      value={user?.full_name || ''}
                      className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-slate-500 text-sm cursor-not-allowed"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-1">Specialisation</label>
                    <input
                      type="text"
                      disabled
                      value={specialisation}
                      className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-slate-500 text-sm cursor-not-allowed"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-1">Consultation Slot Duration</label>
                  <div className="flex items-center space-x-3">
                    <Clock className="w-5 h-5 text-slate-400" />
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
              </div>
            </div>

            {/* Days of Working / Weekly Schedule Card */}
            <div className="bg-white dark:bg-slate-900 rounded-xl p-6 shadow-sm border border-slate-200 dark:border-slate-800">
              <div className="flex items-center space-x-3 mb-6">
                <div className="w-10 h-10 rounded-lg bg-teal-50 dark:bg-teal-900/30 flex items-center justify-center text-teal-600 dark:text-teal-400">
                  <Calendar className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Days of Working & Hours</h2>
                  <p className="text-xs text-slate-500">Configure your weekly recurring schedule. Slots are generated dynamically based on these values.</p>
                </div>
              </div>

              <div className="space-y-4">
                {DAYS_OF_WEEK.map((day) => {
                  const item = workingHours[day.key]
                  return (
                    <div key={day.key} className="flex flex-col sm:flex-row sm:items-center sm:justify-between p-3 rounded-lg border border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/20 space-y-2 sm:space-y-0">
                      <div className="flex items-center space-x-3">
                        <input
                          type="checkbox"
                          id={`check-${day.key}`}
                          checked={item.enabled}
                          onChange={() => handleDayToggle(day.key)}
                          className="w-4 h-4 text-teal-600 border-slate-300 rounded focus:ring-teal-500"
                        />
                        <label htmlFor={`check-${day.key}`} className="text-sm font-bold text-slate-700 dark:text-slate-300 select-none">
                          {day.label}
                        </label>
                      </div>
                      
                      {item.enabled && (
                        <div className="flex items-center space-x-2 pl-7 sm:pl-0">
                          <input
                            type="time"
                            value={item.start}
                            onChange={(e) => handleHourChange(day.key, 'start', e.target.value)}
                            className="px-2 py-1 text-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg text-slate-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-teal-500"
                          />
                          <span className="text-slate-400 text-xs">to</span>
                          <input
                            type="time"
                            value={item.end}
                            onChange={(e) => handleHourChange(day.key, 'end', e.target.value)}
                            className="px-2 py-1 text-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg text-slate-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-teal-500"
                          />
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Custom Pre-Consultation Intake Questionnaire Builder */}
            <div className="bg-white dark:bg-slate-900 rounded-xl p-6 shadow-sm border border-slate-200 dark:border-slate-800">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center space-x-2 text-teal-600 dark:text-teal-400">
                  <HelpCircle className="w-5 h-5" />
                  <h3 className="font-bold text-base text-slate-900 dark:text-white">Pre-Consultation Intake Questionnaire Builder</h3>
                </div>
                <span className="px-2 py-0.5 rounded-full bg-teal-500/15 text-teal-700 dark:text-teal-300 font-extrabold text-[11px]">
                  ✨ AI Auto-Filled for Patients
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mb-6">
                Define the clinical intake questions every patient must answer. Gemini AI will auto-extract answers from the patient's symptoms text dynamically.
              </p>

              <div className="space-y-3">
                {questions.map((q, idx) => (
                  <div key={idx} className="flex items-center space-x-2">
                    <span className="text-xs font-bold text-slate-400 w-6 text-center">{idx + 1}.</span>
                    <input
                      type="text"
                      value={q}
                      onChange={(e) => handleQuestionChange(idx, e.target.value)}
                      className="flex-1 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-slate-900 dark:text-white text-sm focus:ring-2 focus:ring-teal-500 outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => handleRemoveQuestion(idx)}
                      className="p-2 text-slate-400 hover:text-rose-500 transition cursor-pointer"
                      title="Remove question"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>

              {/* Add New Question Row */}
              <div className="flex items-center space-x-2 pt-4">
                <input
                  type="text"
                  placeholder="Add a new custom intake question..."
                  value={newQuestionText}
                  onChange={(e) => setNewQuestionText(e.target.value)}
                  className="flex-1 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white text-sm focus:ring-2 focus:ring-teal-500 outline-none placeholder-slate-400"
                />
                <button
                  type="button"
                  onClick={handleAddQuestion}
                  className="px-4 py-2 bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-900 dark:text-white font-bold rounded-lg text-xs transition flex items-center space-x-1 cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  <span>Add Question</span>
                </button>
              </div>
            </div>

            {/* Submit settings */}
            <div className="flex justify-end">
              <button
                type="submit"
                disabled={isSaving}
                className="flex items-center space-x-2 px-6 py-3 bg-teal-600 hover:bg-teal-700 text-white rounded-lg text-sm font-bold shadow-md shadow-teal-500/20 transition cursor-pointer"
              >
                <Save className="w-4 h-4" />
                <span>{isSaving ? 'Saving Settings...' : 'Save Settings & Questionnaire'}</span>
              </button>
            </div>
          </form>
        )}

        {/* Doctor Leave Requests Section */}
        {!isLoading && (
          <div className="bg-white dark:bg-slate-900 rounded-xl p-6 shadow-sm border border-slate-200 dark:border-slate-800 space-y-6">
            <div className="border-b border-slate-100 dark:border-slate-800 pb-4">
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">Request Leave / Absence</h3>
              <p className="text-xs text-slate-500">Submit leaves for approval. Once approved, slot calendars for that day are blocked and patients notified.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              {/* Request Form */}
              <form
                onSubmit={async (e) => {
                  e.preventDefault()
                  if (!newLeaveDate) return
                  setIsSubmittingLeave(true)
                  try {
                    await api.post('/doctor/leave-request', {
                      leave_date: newLeaveDate,
                      reason: newLeaveReason || undefined,
                    })
                    toast.success('Absence leave request submitted for review.')
                    setNewLeaveDate('')
                    setNewLeaveReason('')
                    // Refetch list
                    const res = await api.get<any[]>('/doctor/leave-requests')
                    setLeaveRequests(res)
                  } catch (err: any) {
                    toast.error(err.message || 'Failed to submit leave request')
                  } finally {
                    setIsSubmittingLeave(false)
                  }
                }}
                className="space-y-4"
              >
                <div>
                  <label className="block text-xs font-semibold uppercase text-slate-600 dark:text-slate-400 mb-1">Leave Date</label>
                  <input
                    type="date"
                    required
                    value={newLeaveDate}
                    onChange={(e) => setNewLeaveDate(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-slate-900 dark:text-white text-sm focus:ring-2 focus:ring-teal-500 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold uppercase text-slate-600 dark:text-slate-400 mb-1">Reason</label>
                  <textarea
                    rows={3}
                    placeholder="Medical, personal, conference..."
                    value={newLeaveReason}
                    onChange={(e) => setNewLeaveReason(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-slate-900 dark:text-white text-sm focus:ring-2 focus:ring-teal-500 outline-none resize-none"
                  />
                </div>

                <button
                  type="submit"
                  disabled={isSubmittingLeave}
                  className="w-full flex items-center justify-center space-x-2 px-4 py-2.5 bg-teal-600 hover:bg-teal-700 text-white rounded-lg text-sm font-bold shadow-md shadow-teal-500/20 transition cursor-pointer"
                >
                  <Calendar className="w-4 h-4" />
                  <span>{isSubmittingLeave ? 'Submitting Request...' : 'Submit Leave Request'}</span>
                </button>
              </form>

              {/* History / List */}
              <div className="space-y-4">
                <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider">Leave Request Log</h4>
                {leaveRequests.length === 0 ? (
                  <p className="text-slate-400 text-xs italic">No leave requests submitted yet.</p>
                ) : (
                  <div className="space-y-3 max-h-[300px] overflow-y-auto pr-2">
                    {leaveRequests.map((r) => (
                      <div key={r.id} className="p-3.5 rounded-xl border border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/20 text-xs space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="font-semibold text-slate-800 dark:text-slate-200">{r.leave_date}</span>
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                            r.status === 'APPROVED'
                              ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400'
                              : r.status === 'REJECTED'
                              ? 'bg-rose-50 text-rose-700 dark:bg-rose-500/10 dark:text-rose-400'
                              : 'bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400'
                          }`}>
                            {r.status}
                          </span>
                        </div>
                        {r.reason && <p className="text-slate-500"><strong className="text-slate-600 dark:text-slate-400">Reason:</strong> {r.reason}</p>}
                        {r.admin_reason && (
                          <p className="text-rose-600 dark:text-rose-400 bg-rose-500/5 p-2 rounded border border-rose-500/10 mt-1">
                            <strong>Admin Note:</strong> {r.admin_reason}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Patient Feedback & Reviews Section */}
        {!isLoading && (
          <div className="bg-white dark:bg-slate-900 rounded-xl p-6 shadow-sm border border-slate-200 dark:border-slate-800 space-y-6">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-4">
              <div>
                <h3 className="text-lg font-bold text-slate-900 dark:text-white">Patient Reviews & Feedback</h3>
                <p className="text-xs text-slate-500">Read what your patients say about their consultations</p>
              </div>
              <div className="flex items-center space-x-1.5 bg-amber-50 dark:bg-amber-500/10 px-3 py-1.5 rounded-lg border border-amber-200/50">
                <Star className="w-4 h-4 text-amber-500 fill-amber-500" />
                <span className="text-sm font-bold text-amber-800 dark:text-amber-300">{averageRating} / 5.0</span>
                <span className="text-xs text-slate-400">({reviews.length} reviews)</span>
              </div>
            </div>

            {reviews.length === 0 ? (
              <p className="text-slate-500 text-center py-6 text-sm">No reviews submitted by patients yet.</p>
            ) : (
              <div className="space-y-4 max-h-96 overflow-y-auto pr-2">
                {reviews.map((r) => (
                  <div key={r.id} className="p-4 rounded-xl border border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/20 space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-1">
                        {[...Array(5)].map((_, i) => (
                          <Star 
                            key={i} 
                            className={`w-3.5 h-3.5 ${i < r.rating ? 'text-amber-400 fill-amber-400' : 'text-slate-300'}`} 
                          />
                        ))}
                      </div>
                      <span className="text-[10px] text-slate-400">
                        {new Date(r.created_at).toLocaleDateString(undefined, { dateStyle: 'medium' })}
                      </span>
                    </div>
                    {r.comment && (
                      <p className="text-sm text-slate-700 dark:text-slate-300 italic">"{r.comment}"</p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </Layout>
  )
}
