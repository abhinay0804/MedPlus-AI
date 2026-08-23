import React, { useState, useEffect } from 'react'
import { Layout } from '../../components/Layout'
import { api } from '../../lib/api'
import { DoctorProfile, DoctorLeave } from '../../types'
import { Calendar, Trash2, User, AlertCircle, Plus, Check, X, Clock, AlertTriangle, ShieldCheck } from 'lucide-react'
import { toast } from 'sonner'

export const LeaveManager: React.FC = () => {
  const [activeSubTab, setActiveSubTab] = useState<'leaves' | 'requests' | 'leaveRequests'>('leaves')
  const [doctors, setDoctors] = useState<DoctorProfile[]>([])
  const [selectedDoctorId, setSelectedDoctorId] = useState<string>('')
  const [leaves, setLeaves] = useState<DoctorLeave[]>([])
  const [requests, setRequests] = useState<any[]>([])
  const [leaveRequests, setLeaveRequests] = useState<any[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [showAddModal, setShowAddModal] = useState(false)
  const [leaveDate, setLeaveDate] = useState('')
  const [reason, setReason] = useState('')

  useEffect(() => {
    fetchDoctors()
    fetchRequests()
    fetchLeaveRequests()
  }, [])

  useEffect(() => {
    if (selectedDoctorId) {
      fetchLeaves(selectedDoctorId)
    }
  }, [selectedDoctorId])

  const fetchDoctors = async () => {
    try {
      const data = await api.get<DoctorProfile[]>('/admin/doctors')
      setDoctors(data)
      if (data.length > 0) {
        setSelectedDoctorId(data[0].id)
      }
    } catch (err: any) {
      toast.error('Failed to load doctors')
    }
  }

  const fetchRequests = async () => {
    try {
      const data = await api.get<any[]>('/admin/working-hours-requests')
      setRequests(data)
    } catch (err: any) {
      toast.error('Failed to load schedule requests')
    }
  }

  const fetchLeaveRequests = async () => {
    try {
      const data = await api.get<any[]>('/admin/leave-requests')
      setLeaveRequests(data)
    } catch (err: any) {
      toast.error('Failed to load doctor leave requests')
    }
  }

  const handleAddLeave = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!leaveDate || !selectedDoctorId) return
    try {
      await api.post(`/admin/doctors/${selectedDoctorId}/leave`, {
        leave_date: leaveDate,
        reason,
      })
      toast.success('Doctor leave recorded! Conflicting appointments auto-cancelled.')
      setShowAddModal(false)
      setLeaveDate('')
      setReason('')
      fetchLeaves(selectedDoctorId)
      fetchLeaveRequests() // refresh in case it counts leaves taken
    } catch (err: any) {
      toast.error(err.message || 'Failed to mark leave')
    }
  }

  const handleRemoveLeave = async (leaveId: string) => {
    if (!confirm('Are you sure you want to remove this leave entry?')) return
    try {
      await api.delete(`/admin/doctors/${selectedDoctorId}/leave/${leaveId}`)
      toast.success('Leave entry removed')
      fetchLeaves(selectedDoctorId)
      fetchLeaveRequests() // refresh in case it counts leaves taken
    } catch (err: any) {
      toast.error(err.message || 'Failed to remove leave')
    }
  }

  const handleResolveRequest = async (reqId: string, status: 'APPROVED' | 'REJECTED') => {
    let adminReason = ''
    if (status === 'REJECTED') {
      const input = prompt('Please enter the reason for rejection (optional):')
      if (input === null) return
      adminReason = input.trim()
    }
    try {
      setIsLoading(true)
      await api.put(`/admin/working-hours-requests/${reqId}/resolve`, {
        status,
        admin_reason: adminReason || undefined,
      })
      toast.success(`Schedule request ${status === 'APPROVED' ? 'approved' : 'rejected'} successfully!`)
      fetchRequests()
    } catch (err: any) {
      toast.error(err.message || 'Failed to resolve schedule request')
    } finally {
      setIsLoading(false)
    }
  }

  const handleResolveLeaveRequest = async (reqId: string, status: 'APPROVED' | 'REJECTED') => {
    let adminReason = ''
    if (status === 'REJECTED') {
      const input = prompt('Please enter the reason for rejection (optional):')
      if (input === null) return
      adminReason = input.trim()
    }
    try {
      setIsLoading(true)
      await api.put(`/admin/leave-requests/${reqId}/resolve`, {
        status,
        admin_reason: adminReason || undefined,
      })
      toast.success(`Doctor leave request ${status === 'APPROVED' ? 'approved' : 'declined'} successfully!`)
      fetchLeaveRequests()
      if (selectedDoctorId) {
        fetchLeaves(selectedDoctorId)
      }
    } catch (err: any) {
      toast.error(err.message || 'Failed to resolve leave request')
    } finally {
      setIsLoading(false)
    }
  }

  const fetchLeaves = async (docId: string) => {
    try {
      setIsLoading(true)
      const data = await api.get<DoctorLeave[]>(`/admin/doctors/${docId}/leave`)
      setLeaves(data)
    } catch (err: any) {
      toast.error('Failed to load doctor leaves')
    } finally {
      setIsLoading(false)
    }
  }

  const pendingLeaveRequestsCount = leaveRequests.filter(r => r.status === 'PENDING').length

  return (
    <Layout activeTab="leave">
      <div className="max-w-5xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Clinical Schedule & Leaves</h1>
            <p className="text-slate-500 text-sm">Review doctor schedule change requests and manage clinical leave calendars.</p>
          </div>
          {activeSubTab === 'leaves' && (
            <button
              onClick={() => setShowAddModal(true)}
              className="flex items-center space-x-2 px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-lg text-sm font-medium transition-colors cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Mark Leave</span>
            </button>
          )}
        </div>

        {/* Sub-tab Navigation */}
        <div className="flex border-b border-slate-200 dark:border-slate-800">
          <button
            onClick={() => setActiveSubTab('leaves')}
            className={`px-4 py-2.5 text-sm font-semibold border-b-2 cursor-pointer transition-colors ${
              activeSubTab === 'leaves'
                ? 'border-teal-500 text-teal-600'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            Leaves Scheduler
          </button>
          <button
            onClick={() => setActiveSubTab('leaveRequests')}
            className={`px-4 py-2.5 text-sm font-semibold border-b-2 cursor-pointer transition-colors flex items-center space-x-1.5 ${
              activeSubTab === 'leaveRequests'
                ? 'border-teal-500 text-teal-600'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            <span>Doctor Leave Requests</span>
            {pendingLeaveRequestsCount > 0 && (
              <span className="bg-amber-500 text-white text-[10px] px-1.5 py-0.5 rounded-full font-bold">
                {pendingLeaveRequestsCount}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveSubTab('requests')}
            className={`px-4 py-2.5 text-sm font-semibold border-b-2 cursor-pointer transition-colors flex items-center space-x-1.5 ${
              activeSubTab === 'requests'
                ? 'border-teal-500 text-teal-600'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            <span>Schedule Change Requests</span>
            {requests.length > 0 && (
              <span className="bg-teal-500 text-white text-[10px] px-1.5 py-0.5 rounded-full font-bold">
                {requests.length}
              </span>
            )}
          </button>
        </div>

        {/* Leaves Scheduler Tab */}
        {activeSubTab === 'leaves' && (
          <div className="space-y-6">
            {/* Doctor Selector */}
            <div className="bg-white dark:bg-slate-900 rounded-xl p-5 shadow-sm border border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div className="flex items-center space-x-3">
                <User className="w-5 h-5 text-teal-500" />
                <div>
                  <h3 className="font-bold text-slate-900 dark:text-white">Select Doctor Profile</h3>
                  <p className="text-xs text-slate-400">View or modify leave dates for a specific physician.</p>
                </div>
              </div>
              <select
                value={selectedDoctorId}
                onChange={(e) => setSelectedDoctorId(e.target.value)}
                className="bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-sm text-slate-900 dark:text-white p-2.5 focus:outline-none focus:ring-2 focus:ring-teal-500 min-w-[200px]"
              >
                {doctors.map((doc) => (
                  <option key={doc.id} value={doc.id}>
                    Dr. {doc.user?.full_name || 'Staff'} ({doc.specialisation})
                  </option>
                ))}
              </select>
            </div>

            {/* Leaves List Table */}
            <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-slate-200 dark:border-slate-800 overflow-hidden">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-xs font-semibold uppercase text-slate-500">
                    <th className="p-4">Leave Date</th>
                    <th className="p-4">Reason</th>
                    <th className="p-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80 text-sm">
                  {isLoading ? (
                    <tr>
                      <td colSpan={3} className="p-8 text-center text-slate-400">Loading leave schedule...</td>
                    </tr>
                  ) : leaves.length === 0 ? (
                    <tr>
                      <td colSpan={3} className="p-8 text-center text-slate-400">No leave days recorded for this doctor.</td>
                    </tr>
                  ) : (
                    leaves.map((leave) => (
                      <tr key={leave.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30">
                        <td className="p-4 font-semibold text-slate-900 dark:text-white flex items-center space-x-2">
                          <Calendar className="w-4 h-4 text-slate-400" />
                          <span>{leave.leave_date}</span>
                        </td>
                        <td className="p-4 text-slate-600 dark:text-slate-400">{leave.reason || 'Not specified'}</td>
                        <td className="p-4 text-right">
                          <button
                            onClick={() => handleRemoveLeave(leave.id)}
                            className="text-rose-500 hover:text-rose-600 p-1.5 hover:bg-rose-50 dark:hover:bg-rose-500/10 rounded-lg cursor-pointer transition"
                            title="Remove Leave Day"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Doctor Leave Requests Tab */}
        {activeSubTab === 'leaveRequests' && (
          <div className="space-y-4">
            {leaveRequests.length === 0 ? (
              <div className="bg-white dark:bg-slate-900 rounded-xl p-8 text-center text-slate-400 border border-slate-200 dark:border-slate-800">
                No doctor leave requests recorded.
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-6">
                {leaveRequests.map((req) => (
                  <div key={req.id} className="bg-white dark:bg-slate-900 rounded-xl p-6 shadow-sm border border-slate-200 dark:border-slate-800 space-y-4">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 dark:border-slate-800 pb-3">
                      <div>
                        <h3 className="font-bold text-slate-900 dark:text-white">Dr. {req.doctor_name}</h3>
                        <p className="text-xs text-slate-500">{req.doctor_specialisation} Specialist</p>
                      </div>
                      
                      <div className="flex items-center space-x-2">
                        {req.status === 'PENDING' ? (
                          <>
                            <button
                              onClick={() => handleResolveLeaveRequest(req.id, 'APPROVED')}
                              className="px-3.5 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400 rounded-lg text-xs font-bold transition flex items-center space-x-1 cursor-pointer"
                            >
                              <Check className="w-3.5 h-3.5" />
                              <span>Approve Leave</span>
                            </button>
                            <button
                              onClick={() => handleResolveLeaveRequest(req.id, 'REJECTED')}
                              className="px-3.5 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 dark:bg-rose-500/10 dark:text-rose-400 rounded-lg text-xs font-bold transition flex items-center space-x-1 cursor-pointer"
                            >
                              <X className="w-3.5 h-3.5" />
                              <span>Decline</span>
                            </button>
                          </>
                        ) : (
                          <span className={`px-2.5 py-1 rounded-full text-xs font-bold uppercase tracking-wider ${
                            req.status === 'APPROVED'
                              ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400'
                              : 'bg-rose-50 text-rose-700 dark:bg-rose-500/10 dark:text-rose-400'
                          }`}>
                            {req.status}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-sm">
                      <div className="bg-slate-50/50 dark:bg-slate-950/20 p-4 rounded-xl border border-slate-100 dark:border-slate-800/40">
                        <label className="block text-[10px] font-bold uppercase text-slate-400 mb-1">Requested Leave Date</label>
                        <p className="font-semibold text-slate-800 dark:text-slate-200 flex items-center space-x-1">
                          <Calendar className="w-4 h-4 text-slate-400" />
                          <span>{req.leave_date}</span>
                        </p>
                      </div>

                      <div className="bg-slate-50/50 dark:bg-slate-950/20 p-4 rounded-xl border border-slate-100 dark:border-slate-800/40">
                        <label className="block text-[10px] font-bold uppercase text-slate-400 mb-1">Reason for Leave</label>
                        <p className="font-semibold text-slate-800 dark:text-slate-200">{req.reason || 'Not provided'}</p>
                      </div>

                      <div className="bg-slate-50/50 dark:bg-slate-950/20 p-4 rounded-xl border border-slate-100 dark:border-slate-800/40 flex items-center justify-between">
                        <div>
                          <label className="block text-[10px] font-bold uppercase text-slate-400 mb-1">Monthly Leave Balance Tracker</label>
                          <p className="font-semibold text-slate-800 dark:text-slate-200 flex items-center space-x-1">
                            <Clock className="w-4 h-4 text-slate-400" />
                            <span>{req.leaves_taken_this_month} Leave(s) Taken in August</span>
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* Conflict Assessment & AI recommendation */}
                    <div className="bg-slate-50/30 dark:bg-slate-950/10 p-4 rounded-xl border border-slate-200/50 dark:border-slate-800/50 space-y-3">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                        <div className="flex items-center space-x-4">
                          <div>
                            <span className="text-[10px] font-bold uppercase text-slate-400 block mb-1">Confirmed Bookings</span>
                            <span className={`px-2 py-0.5 rounded text-xs font-bold ${req.confirmed_appointments > 0 ? 'bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400' : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'}`}>
                              {req.confirmed_appointments} affected
                            </span>
                          </div>
                          <div>
                            <span className="text-[10px] font-bold uppercase text-slate-400 block mb-1">Pending Approval</span>
                            <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-650 dark:bg-slate-800 dark:text-slate-350 text-xs font-semibold">
                              {req.pending_appointments} pending
                            </span>
                          </div>
                        </div>

                        {req.confirmed_appointments + req.pending_appointments > 0 && (
                          <div className="flex items-center space-x-2 text-xs">
                            <span className="text-slate-450 font-medium">Urgency:</span>
                            <span className="px-1.5 py-0.5 rounded bg-rose-50 text-rose-700 dark:bg-rose-500/10 dark:text-rose-400 font-bold">{req.high_urgency_count} High</span>
                            <span className="px-1.5 py-0.5 rounded bg-amber-50 text-amber-750 dark:bg-amber-500/10 dark:text-amber-400 font-bold">{req.medium_urgency_count} Mid</span>
                            <span className="px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-400 font-bold">{req.low_urgency_count} Low</span>
                          </div>
                        )}
                      </div>

                      {/* Gemini Suggestion Badge & reason */}
                      <div className="border-t border-slate-150 dark:border-slate-800/80 pt-3 flex items-start space-x-3">
                        <div className="flex-shrink-0 mt-0.5">
                          <span className={`px-2.5 py-1 rounded text-[10px] font-black tracking-wider uppercase ${
                            req.ai_suggestion === 'APPROVE' 
                              ? 'bg-emerald-100 text-emerald-850 dark:bg-emerald-500/20 dark:text-emerald-400'
                              : req.ai_suggestion === 'REJECT'
                              ? 'bg-rose-100 text-rose-850 dark:bg-rose-500/20 dark:text-rose-400'
                              : 'bg-amber-100 text-amber-855 dark:bg-amber-500/20 dark:text-amber-400'
                          }`}>
                            AI Suggestion: {req.ai_suggestion}
                          </span>
                        </div>
                        <p className="text-xs text-slate-600 dark:text-slate-400 italic">
                          "{req.ai_reason}"
                        </p>
                      </div>
                    </div>

                    {req.admin_reason && (
                      <div className="bg-rose-50/50 dark:bg-rose-950/15 border-l-4 border-rose-500 p-3 rounded-r-lg text-xs text-rose-700 dark:text-rose-300">
                        <strong>Admin Feedback:</strong> {req.admin_reason}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Schedule Change Requests Tab */}
        {activeSubTab === 'requests' && (
          <div className="space-y-4">
            {requests.length === 0 ? (
              <div className="bg-white dark:bg-slate-900 rounded-xl p-8 text-center text-slate-400 border border-slate-200 dark:border-slate-800">
                No schedule change requests pending admin review.
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-6">
                {requests.map((req) => (
                  <div key={req.id} className="bg-white dark:bg-slate-900 rounded-xl p-6 shadow-sm border border-slate-200 dark:border-slate-800 space-y-4">
                    <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
                      <div>
                        <h3 className="font-bold text-slate-900 dark:text-white">Dr. {req.doctor_name}</h3>
                        <p className="text-xs text-slate-400">Submitted: {new Date(req.created_at).toLocaleString()}</p>
                      </div>
                      <div className="flex items-center space-x-2">
                        <button
                          onClick={() => handleResolveRequest(req.id, 'APPROVED')}
                          className="px-3 py-1.5 bg-teal-50 hover:bg-teal-100 text-teal-700 rounded-lg text-xs font-bold transition flex items-center space-x-1 cursor-pointer"
                        >
                          <Check className="w-3.5 h-3.5" />
                          <span>Approve</span>
                        </button>
                        <button
                          onClick={() => handleResolveRequest(req.id, 'REJECTED')}
                          className="px-3 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 rounded-lg text-xs font-bold transition flex items-center space-x-1 cursor-pointer"
                        >
                          <X className="w-3.5 h-3.5" />
                          <span>Decline</span>
                        </button>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      {/* Current Schedule */}
                      <div className="space-y-2 bg-slate-50/50 dark:bg-slate-950/20 p-4 rounded-xl border border-slate-100 dark:border-slate-800/40">
                        <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider">Current Schedule</h4>
                        <div className="text-xs space-y-1">
                          <p className="mb-2"><strong>Slot Duration:</strong> {req.current_slot_duration || '30'} Minutes</p>
                          {req.current_working_hours ? (
                            Object.entries(req.current_working_hours).map(([day, hours]: any) => (
                              <div key={day} className="flex justify-between max-w-[220px]">
                                <span className="capitalize">{day}:</span>
                                <span>{hours.start} - {hours.end}</span>
                              </div>
                            ))
                          ) : (
                            <p className="text-slate-400 italic">No working hours configured</p>
                          )}
                        </div>
                      </div>

                      {/* Proposed Schedule */}
                      <div className="space-y-2 bg-teal-500/5 dark:bg-teal-500/10 p-4 rounded-xl border border-teal-500/20">
                        <h4 className="text-xs font-bold text-teal-600 dark:text-teal-400 uppercase tracking-wider">Proposed Schedule</h4>
                        <div className="text-xs space-y-1">
                          <p className="mb-2"><strong>Slot Duration:</strong> {req.proposed_slot_duration} Minutes</p>
                          {req.proposed_working_hours ? (
                            Object.entries(req.proposed_working_hours).map(([day, hours]: any) => (
                              <div key={day} className="flex justify-between max-w-[220px]">
                                <span className="capitalize">{day}:</span>
                                <span>{hours.start} - {hours.end}</span>
                              </div>
                            ))
                          ) : (
                            <p className="text-slate-400 italic">No working hours proposed</p>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Add Leave Modal */}
        {showAddModal && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
            <div className="bg-white dark:bg-slate-900 rounded-xl p-6 max-w-md w-full shadow-xl border border-slate-200 dark:border-slate-800 space-y-4">
              <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Mark Doctor Leave</h3>
              <form onSubmit={handleAddLeave} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold uppercase text-slate-600 dark:text-slate-400 mb-1">Leave Date</label>
                  <input
                    type="date"
                    required
                    value={leaveDate}
                    onChange={(e) => setLeaveDate(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-slate-900 dark:text-white text-sm focus:ring-2 focus:ring-teal-500 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold uppercase text-slate-600 dark:text-slate-400 mb-1">Reason (Optional)</label>
                  <input
                    type="text"
                    placeholder="Medical Leave, Personal, etc."
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-slate-900 dark:text-white text-sm focus:ring-2 focus:ring-teal-500 outline-none"
                  />
                </div>

                <div className="flex justify-end space-x-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowAddModal(false)}
                    className="px-4 py-2 text-sm text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white text-sm font-medium rounded-lg cursor-pointer"
                  >
                    Confirm Leave
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
