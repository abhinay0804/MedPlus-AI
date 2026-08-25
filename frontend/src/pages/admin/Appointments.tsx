import React, { useState, useEffect } from 'react'
import { Layout } from '../../components/Layout'
import { api } from '../../lib/api'
import { DoctorProfile } from '../../types'
import { Search, Calendar, RefreshCw, XCircle, Stethoscope, User, AlertCircle, ShieldAlert, CheckCircle2, X } from 'lucide-react'
import { toast } from 'sonner'

export const Appointments: React.FC = () => {
  const [appointments, setAppointments] = useState<any[]>([])
  const [doctors, setDoctors] = useState<DoctorProfile[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [specialtyFilter, setSpecialtyFilter] = useState('')
  const [selectedAppt, setSelectedAppt] = useState<any | null>(null)
  const [newDoctorId, setNewDoctorId] = useState('')
  const [newSlotStart, setNewSlotStart] = useState('')
  const [isReassigning, setIsReassigning] = useState(false)
  const [isCancelling, setIsCancelling] = useState<string | null>(null)
  const [availableDoctors, setAvailableDoctors] = useState<any[]>([])
  const [isLoadingAvailable, setIsLoadingAvailable] = useState(false)
  const [selectedDate, setSelectedDate] = useState('')
  const [availableSlots, setAvailableSlots] = useState<any[]>([])
  const [isLoadingSlots, setIsLoadingSlots] = useState(false)

  const fetchAvailableDoctors = async (apptId: string) => {
    try {
      setIsLoadingAvailable(true)
      const data = await api.get<any[]>(`/admin/appointments/${apptId}/available-doctors`)
      setAvailableDoctors(data)
    } catch (err) {
      console.error('Failed to fetch available doctors', err)
    } finally {
      setIsLoadingAvailable(false)
    }
  }

  useEffect(() => {
    if (selectedAppt) {
      fetchAvailableDoctors(selectedAppt.id)
    } else {
      setAvailableDoctors([])
    }
  }, [selectedAppt])

  useEffect(() => {
    if (newDoctorId && selectedDate) {
      async function loadSlots() {
        try {
          setIsLoadingSlots(true)
          const data = await api.get<any[]>(`/patient/doctors/${newDoctorId}/slots?target_date=${selectedDate}`)
          setAvailableSlots(data)
        } catch (err) {
          console.error('Failed to load slots:', err)
          setAvailableSlots([])
        } finally {
          setIsLoadingSlots(false)
        }
      }
      loadSlots()
    } else {
      setAvailableSlots([])
    }
  }, [newDoctorId, selectedDate])

  useEffect(() => {
    fetchAppointments()
    fetchDoctors()
  }, [statusFilter, specialtyFilter])

  const fetchAppointments = async () => {
    try {
      setIsLoading(true)
      let url = `/admin/appointments?skip=0&limit=150`
      if (statusFilter) url += `&status=${statusFilter}`
      if (specialtyFilter) url += `&specialisation=${specialtyFilter}`
      if (searchTerm.trim()) url += `&search=${encodeURIComponent(searchTerm)}`
      
      const data = await api.get<any[]>(url)
      setAppointments(data)
    } catch (err: any) {
      toast.error(err.message || 'Failed to load appointments')
    } finally {
      setIsLoading(false)
    }
  }

  const fetchDoctors = async () => {
    try {
      const data = await api.get<DoctorProfile[]>('/admin/doctors?is_active_only=true')
      setDoctors(data)
    } catch (err: any) {
      console.error('Failed to load doctors list', err)
    }
  }

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    fetchAppointments()
  }

  const handleCancelAppointment = async (apptId: string) => {
    try {
      setIsCancelling(apptId)
      // Call DELETE patient appointments endpoint
      await api.delete(`/patient/appointments/${apptId}`)
      toast.success('Appointment cancelled successfully!')
      fetchAppointments()
    } catch (err: any) {
      toast.error(err.message || 'Failed to cancel appointment')
    } finally {
      setIsCancelling(null)
    }
  }

  const handleReassign = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedAppt || !newDoctorId) return
    try {
      setIsReassigning(true)
      const payload: any = {
        new_doctor_id: newDoctorId,
      }
      if (newSlotStart) {
        payload.new_slot_start = new Date(newSlotStart + 'Z').toISOString()
      }

      await api.post(`/admin/appointments/${selectedAppt.id}/reassign`, payload)
      toast.success('Appointment reassigned successfully!')
      setSelectedAppt(null)
      setNewDoctorId('')
      setNewSlotStart('')
      setSelectedDate('')
      fetchAppointments()
    } catch (err: any) {
      toast.error(err.message || 'Failed to reassign appointment')
    } finally {
      setIsReassigning(false)
    }
  }

  const isTodayOrPast = (dateStr: string) => {
    const slotDate = new Date(dateStr + 'Z')
    const now = new Date()
    const slotDay = new Date(slotDate.getFullYear(), slotDate.getMonth(), slotDate.getDate())
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    return slotDay.getTime() <= today.getTime()
  }

  const getStatusStyle = (status: string) => {
    switch (status) {
      case 'CONFIRMED':
        return 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
      case 'PENDING_APPROVAL':
        return 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
      case 'COMPLETED':
        return 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300'
      case 'CANCELLED':
        return 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300'
      default:
        return 'bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-350'
    }
  }

  return (
    <Layout activeTab="appointments">
      <div className="max-w-6xl mx-auto space-y-6 pb-12">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Appointment Command Center</h1>
            <p className="text-slate-500 text-sm">Monitor, reschedule, reassign, or cancel appointments across all clinic departments.</p>
          </div>
        </div>

        {/* Filters Panel */}
        <div className="bg-white dark:bg-slate-900 rounded-xl p-4 shadow-sm border border-slate-200 dark:border-slate-800">
          <form onSubmit={handleSearchSubmit} className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
              <input
                type="text"
                placeholder="Search patient, doctor..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-3 py-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white text-sm focus:ring-2 focus:ring-teal-500 outline-none"
              />
            </div>
            <div>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white text-sm focus:ring-2 focus:ring-teal-500 outline-none"
              >
                <option value="">All Statuses</option>
                <option value="CONFIRMED">Confirmed</option>
                <option value="PENDING_APPROVAL">Pending Approval</option>
                <option value="COMPLETED">Completed</option>
                <option value="CANCELLED">Cancelled</option>
              </select>
            </div>
            <div>
              <select
                value={specialtyFilter}
                onChange={(e) => setSpecialtyFilter(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white text-sm focus:ring-2 focus:ring-teal-500 outline-none"
              >
                <option value="">All Specialties</option>
                <option value="Cardiology">Cardiology</option>
                <option value="Dermatology">Dermatology</option>
                <option value="Pediatrics">Pediatrics</option>
                <option value="Neurology">Neurology</option>
                <option value="General Medicine">General Medicine</option>
              </select>
            </div>
            <div className="flex space-x-2">
              <button
                type="submit"
                className="flex-1 px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-lg text-sm font-medium transition-colors cursor-pointer"
              >
                Apply Filters
              </button>
              <button
                type="button"
                onClick={() => {
                  setSearchTerm('')
                  setStatusFilter('')
                  setSpecialtyFilter('')
                  setAppointments([])
                  setTimeout(fetchAppointments, 50)
                }}
                className="px-3 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-lg text-sm font-medium transition-colors cursor-pointer"
              >
                Reset
              </button>
            </div>
          </form>
        </div>

        {/* Appointments Table */}
        <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-slate-200 dark:border-slate-800 overflow-hidden">
          {isLoading ? (
            <div className="p-8 text-center text-slate-400">Loading appointments directory...</div>
          ) : appointments.length === 0 ? (
            <div className="p-8 text-center text-slate-400">No appointments found matching filters.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-slate-500 text-xs font-semibold uppercase">
                    <th className="p-4">Patient Details</th>
                    <th className="p-4">Consultant (Doctor)</th>
                    <th className="p-4">Department / Slot Time</th>
                    <th className="p-4">Status</th>
                    <th className="p-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-sm">
                  {appointments.map((appt) => (
                    <tr key={appt.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-950/20 text-slate-950 dark:text-slate-100">
                      <td className="p-4">
                        <div className="font-semibold">{appt.patient?.full_name}</div>
                        <div className="text-xs text-slate-400">{appt.patient?.email}</div>
                      </td>
                      <td className="p-4">
                        <div className="font-semibold flex items-center space-x-1.5">
                          <Stethoscope className="w-3.5 h-3.5 text-slate-400" />
                          <span>Dr. {appt.doctor?.user?.full_name}</span>
                        </div>
                        <div className="text-xs text-slate-400">{appt.doctor?.specialisation}</div>
                      </td>
                      <td className="p-4">
                        <div className="flex items-center space-x-1.5 text-xs text-slate-700 dark:text-slate-300">
                          <Calendar className="w-3.5 h-3.5 text-slate-400" />
                          <span>
                            {new Date(appt.slot_start + 'Z').toLocaleDateString(undefined, {
                              weekday: 'short',
                              month: 'short',
                              day: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </span>
                        </div>
                        {appt.symptom_form && (
                          <div className="mt-1 text-[11px] text-slate-400 max-w-[220px] truncate" title={appt.symptom_form.symptoms_text}>
                            Complaints: {appt.symptom_form.symptoms_text}
                          </div>
                        )}
                      </td>
                      <td className="p-4">
                        <div className="flex flex-col space-y-1 items-start">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                            appt.status === 'CANCELLED' && appt.cancel_reason === 'unattended'
                              ? 'bg-slate-105 text-slate-600 dark:bg-slate-800/40 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-800'
                              : getStatusStyle(appt.status)
                          }`}>
                            {appt.status === 'CANCELLED' && appt.cancel_reason === 'unattended'
                              ? 'UNATTENDED'
                              : appt.status.replace('_', ' ')}
                          </span>
                          {appt.status === 'CANCELLED' && appt.cancel_reason === 'unattended' && (
                            <div className="flex flex-col space-y-0.5 text-[9px] text-slate-500 font-semibold leading-normal pt-1">
                              <div>Doc check-in: <span className={appt.doctor_joined ? 'text-teal-600 font-bold' : 'text-rose-500'}>{appt.doctor_joined ? 'Joined' : 'Absent'}</span></div>
                              <div>Pat check-in: <span className={appt.patient_joined ? 'text-teal-600 font-bold' : 'text-rose-500'}>{appt.patient_joined ? 'Joined' : 'Absent'}</span></div>
                            </div>
                          )}
                        </div>
                      </td>
                      <td className="p-4 text-right space-x-2">
                        {appt.status !== 'COMPLETED' && appt.status !== 'CANCELLED' && appt.status !== 'RESCHEDULED' && (
                          <>
                            <button
                              onClick={() => {
                                setSelectedAppt(appt)
                                setNewDoctorId(appt.doctor_id)
                                setSelectedDate(appt.slot_start.split('T')[0])
                                setNewSlotStart(appt.slot_start)
                              }}
                              className="px-2.5 py-1 text-xs font-medium text-teal-600 hover:text-teal-700 dark:text-teal-400 hover:bg-teal-50 dark:hover:bg-teal-950/30 rounded border border-teal-200 dark:border-teal-900 transition-colors cursor-pointer"
                            >
                              Reassign
                            </button>
                            <button
                              onClick={() => handleCancelAppointment(appt.id)}
                              disabled={isCancelling === appt.id}
                              className="px-2.5 py-1 text-xs font-medium text-rose-600 hover:text-rose-700 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 rounded border border-rose-200 dark:border-rose-900 transition-colors cursor-pointer disabled:opacity-50"
                            >
                              {isCancelling === appt.id ? '...' : 'Cancel'}
                            </button>
                          </>
                        )}
                        {appt.status === 'COMPLETED' && (
                          <span className="text-xs text-slate-400 flex items-center justify-end space-x-1">
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                            <span>Archived</span>
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Reassignment Modal */}
        {selectedAppt && (
          <div className="fixed inset-0 bg-slate-950/50 flex items-center justify-center p-4 z-50 animate-fade-in">
            <div className="bg-white dark:bg-slate-900 rounded-xl max-w-md w-full border border-slate-200 dark:border-slate-800 shadow-xl overflow-hidden">
              <div className="flex items-center justify-between p-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950">
                <h3 className="font-bold text-slate-950 dark:text-white flex items-center space-x-2">
                  <RefreshCw className="w-4 h-4 text-teal-600" />
                  <span>Reassign Appointment</span>
                </h3>
                <button onClick={() => setSelectedAppt(null)} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer">
                  <X className="w-4 h-4" />
                </button>
              </div>

              <form onSubmit={handleReassign} className="p-6 space-y-4">
                <div className="p-3 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-850 rounded-lg text-xs space-y-1">
                  <div className="text-slate-500">Patient: <span className="font-semibold text-slate-850 dark:text-slate-200">{selectedAppt.patient?.full_name}</span></div>
                  <div className="text-slate-500">Current Consultant: <span className="font-semibold text-slate-850 dark:text-slate-200">Dr. {selectedAppt.doctor?.user?.full_name} ({selectedAppt.doctor?.specialisation})</span></div>
                  <div className="text-slate-500">Scheduled Time: <span className="font-semibold text-slate-850 dark:text-slate-200">{new Date(selectedAppt.slot_start + 'Z').toLocaleString()}</span></div>
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase text-slate-600 dark:text-slate-400 mb-1">Select New Doctor</label>
                  <select
                    value={newDoctorId}
                    onChange={(e) => {
                      setNewDoctorId(e.target.value)
                      setNewSlotStart('') // reset slot start
                    }}
                    required
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-slate-900 dark:text-white text-sm focus:ring-2 focus:ring-teal-500 outline-none"
                  >
                    <option value="">Select a Doctor</option>
                    {doctors.map((d) => (
                      <option key={d.id} value={d.id}>
                        Dr. {d.user.full_name} ({d.specialisation})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase text-slate-600 dark:text-slate-400 mb-1">Select Reassignment Date</label>
                  <input
                    type="date"
                    value={selectedDate}
                    onChange={(e) => {
                      setSelectedDate(e.target.value)
                      setNewSlotStart('') // reset slot start
                    }}
                    required
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-slate-900 dark:text-white text-sm focus:ring-2 focus:ring-teal-500 outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase text-slate-600 dark:text-slate-400 mb-1">Select Available Time Slot</label>
                  <select
                    value={newSlotStart}
                    onChange={(e) => setNewSlotStart(e.target.value)}
                    required
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-slate-900 dark:text-white text-sm focus:ring-2 focus:ring-teal-500 outline-none"
                  >
                    <option value="">{isLoadingSlots ? 'Loading slots...' : 'Select a Slot'}</option>
                    {availableSlots.map((slot) => {
                      const isOriginal = slot.slot_start === selectedAppt.slot_start;
                      const displayStart = new Date(slot.slot_start + 'Z').toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                      return (
                        <option
                          key={slot.slot_start}
                          value={slot.slot_start}
                          disabled={!slot.is_available && !isOriginal}
                        >
                          {displayStart} {isOriginal ? ' (Current Slot)' : !slot.is_available ? ' (Booked)' : ' (Available)'}
                        </option>
                      )
                    })}
                  </select>
                  {availableSlots.length === 0 && !isLoadingSlots && newDoctorId && selectedDate && (
                    <div className="mt-2 p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl text-[11px] text-amber-600 dark:text-amber-450 flex items-center space-x-1.5 animate-pulse">
                      <AlertCircle className="w-4 h-4 shrink-0" />
                      <span>No matching slots available for this doctor on the selected date.</span>
                    </div>
                  )}
                </div>

                <div className="flex items-center space-x-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setSelectedAppt(null)}
                    className="flex-1 py-2 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-200 rounded-lg text-sm font-medium hover:bg-slate-50 dark:hover:bg-slate-850 transition-colors cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isReassigning}
                    className="flex-1 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-lg text-sm font-medium transition-colors cursor-pointer disabled:opacity-50"
                  >
                    {isReassigning ? 'Reassigning...' : 'Confirm Reassign'}
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
