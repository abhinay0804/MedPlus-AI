import React, { useEffect, useState } from 'react'
import { Layout } from '../../components/Layout'
import { api } from '../../lib/api'
import { DoctorProfile, DoctorLeave } from '../../types'
import { Link } from 'react-router-dom'
import {
  Users,
  Stethoscope,
  Plus,
  Calendar,
  Trash2,
  Check,
  X,
  AlertCircle,
  TrendingUp,
} from 'lucide-react'

export const DoctorManagement: React.FC = () => {
  const [doctors, setDoctors] = useState<DoctorProfile[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [showAddModal, setShowAddModal] = useState(false)
  const [showLeaveModal, setShowLeaveModal] = useState<DoctorProfile | null>(null)

  // Add Doctor Form State
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('DoctorPassword123!')
  const [fullName, setFullName] = useState('')
  const [specialisation, setSpecialisation] = useState('Cardiology')
  const [leaveDate, setLeaveDate] = useState('')
  const [leaveReason, setLeaveReason] = useState('')

  const [message, setMessage] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const fetchDoctors = async () => {
    setIsLoading(true)
    try {
      const data = await api.get<DoctorProfile[]>('/admin/doctors')
      setDoctors(data)
    } catch (err) {
      console.error('Failed to fetch doctors:', err)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    fetchDoctors()
  }, [])

  const handleAddDoctor = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSubmitting(true)
    setMessage(null)

    try {
      await api.post('/admin/doctors', {
        email,
        password,
        full_name: fullName,
        specialisation,
        working_hours: {
          mon: { start: '09:00', end: '17:00' },
          tue: { start: '09:00', end: '17:00' },
          wed: { start: '09:00', end: '17:00' },
          thu: { start: '09:00', end: '17:00' },
          fri: { start: '09:00', end: '15:00' },
        },
        slot_duration_minutes: 30,
      })
      setShowAddModal(false)
      setEmail('')
      setFullName('')
      fetchDoctors()
    } catch (err: any) {
      setMessage(err.message || 'Failed to create doctor account')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleAddLeave = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!showLeaveModal || !leaveDate) return
    setIsSubmitting(true)

    try {
      await api.post(`/admin/doctors/${showLeaveModal.id}/leave`, {
        leave_date: leaveDate,
        reason: leaveReason || undefined,
      })
      alert(`Leave date ${leaveDate} added for ${showLeaveModal.user.full_name}. Affected appointments were auto-cancelled.`)
      setShowLeaveModal(null)
      setLeaveDate('')
      setLeaveReason('')
    } catch (err: any) {
      alert(err.message || 'Failed to add leave date')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleDeactivate = async (id: string, currentStatus: boolean) => {
    if (!window.confirm(`Are you sure you want to ${currentStatus ? 'deactivate' : 'activate'} this doctor profile?`)) return
    try {
      if (currentStatus) {
        await api.delete(`/admin/doctors/${id}`)
      } else {
        await api.put(`/admin/doctors/${id}`, { is_active: true })
      }
      fetchDoctors()
    } catch (err: any) {
      alert(err.message || 'Action failed')
    }
  }

  return (
    <Layout>
      <div className="space-y-8">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-2xl font-extrabold text-white tracking-tight">Doctor Roster & Leave Management</h2>
            <p className="text-slate-400 text-sm mt-1">
              Add new doctor accounts, configure working hours, and manage leave dates.
            </p>
          </div>
          <button
            onClick={() => setShowAddModal(true)}
            className="px-5 py-2.5 bg-teal-500 hover:bg-teal-600 text-white font-bold rounded-xl text-xs flex items-center justify-center space-x-1.5 shadow-lg shadow-teal-500/20"
          >
            <Plus className="w-4 h-4" />
            <span>Add New Doctor</span>
          </button>
        </div>

        {/* Doctors Table */}
        {isLoading ? (
          <div className="h-64 bg-slate-900/40 rounded-2xl animate-pulse" />
        ) : (
          <div className="bg-slate-900/60 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm text-slate-300">
                <thead className="bg-slate-800/80 text-xs font-bold uppercase text-slate-400 border-b border-slate-700">
                  <tr>
                    <th className="p-4">Doctor</th>
                    <th className="p-4">Specialisation</th>
                    <th className="p-4">Slot Length</th>
                    <th className="p-4">Demerits</th>
                    <th className="p-4">Unattended</th>
                    <th className="p-4">Status</th>
                    <th className="p-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {doctors.map((doctor) => (
                    <tr key={doctor.id} className="hover:bg-slate-800/40 transition">
                      <td className="p-4 font-semibold text-white">
                        <div className="flex items-center space-x-3">
                          <div className="w-9 h-9 rounded-xl bg-teal-500/20 text-teal-400 flex items-center justify-center font-bold text-sm">
                            {doctor.user.full_name.charAt(0)}
                          </div>
                          <div>
                            <p className="font-bold text-white text-sm">{doctor.user.full_name}</p>
                            <p className="text-xs text-slate-500">{doctor.user.email}</p>
                          </div>
                        </div>
                      </td>
                      <td className="p-4 text-teal-400 font-semibold text-xs">{doctor.specialisation}</td>
                      <td className="p-4 text-xs">{doctor.slot_duration_minutes} Mins</td>
                      <td className="p-4 text-xs font-bold text-rose-500">
                        {doctor.demerit_points || 0} / 10
                      </td>
                      <td className="p-4 text-xs font-semibold text-slate-400">
                        {doctor.unattended_count || 0}
                      </td>
                      <td className="p-4">
                        <span
                          className={`px-2.5 py-1 rounded-full text-[10px] font-bold ${
                            doctor.is_active
                              ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                              : 'bg-rose-500/10 text-rose-400 border border-rose-500/30'
                          }`}
                        >
                          {doctor.is_active ? 'ACTIVE' : 'INACTIVE'}
                        </span>
                      </td>
                      <td className="p-4 text-right space-x-2 flex items-center justify-end">
                        <Link
                          to={`/admin/doctors/${doctor.id}/performance`}
                          className="px-3 py-1.5 bg-teal-550/10 text-teal-400 hover:bg-teal-500/20 border border-teal-500/30 rounded-lg text-xs font-bold transition flex items-center space-x-1"
                        >
                          <TrendingUp className="w-3.5 h-3.5" />
                          <span>Performance</span>
                        </Link>
                        <Link
                          to={`/admin/doctors/${doctor.id}`}
                          className="px-3 py-1.5 bg-slate-800 hover:bg-slate-750 text-slate-350 rounded-lg text-xs font-bold border border-slate-700 transition"
                        >
                          Profile
                        </Link>
                        <button
                          onClick={() => setShowLeaveModal(doctor)}
                          className="px-3 py-1.5 bg-amber-500/10 text-amber-300 hover:bg-amber-500/20 border border-amber-500/30 rounded-lg text-xs font-bold transition cursor-pointer"
                        >
                          Mark Leave
                        </button>
                        <button
                          onClick={() => handleDeactivate(doctor.id, doctor.is_active)}
                          className="px-3 py-1.5 bg-slate-800 hover:bg-slate-750 text-slate-350 rounded-lg text-xs font-bold border border-slate-700 transition cursor-pointer"
                        >
                          {doctor.is_active ? 'Deactivate' : 'Activate'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Add Doctor Modal */}
        {showAddModal && (
          <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <form
              onSubmit={handleAddDoctor}
              className="bg-slate-900 border border-slate-800 rounded-2xl p-6 w-full max-w-md space-y-4 shadow-2xl"
            >
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <h3 className="font-bold text-white text-base">Add New Doctor Profile</h3>
                <button type="button" onClick={() => setShowAddModal(false)} className="text-slate-400 hover:text-white">
                  <X className="w-5 h-5" />
                </button>
              </div>

              {message && (
                <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs">
                  {message}
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-slate-300 uppercase mb-1">Full Name</label>
                <input
                  type="text"
                  required
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Dr. Jane Smith"
                  className="w-full p-3 bg-slate-800 border border-slate-700 rounded-xl text-white text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-300 uppercase mb-1">Email Address</label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="dr.jane@healthcare.com"
                  className="w-full p-3 bg-slate-800 border border-slate-700 rounded-xl text-white text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-300 uppercase mb-1">Specialisation</label>
                <input
                  type="text"
                  required
                  value={specialisation}
                  onChange={(e) => setSpecialisation(e.target.value)}
                  placeholder="Cardiology, Dermatology, etc."
                  className="w-full p-3 bg-slate-800 border border-slate-700 rounded-xl text-white text-sm"
                />
              </div>

              <div className="flex justify-end space-x-3 pt-4 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 text-slate-400 hover:text-white text-xs font-bold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2.5 bg-teal-500 hover:bg-teal-600 text-white font-bold rounded-xl text-xs shadow-lg shadow-teal-500/20"
                >
                  Create Account
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Mark Leave Modal */}
        {showLeaveModal && (
          <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <form
              onSubmit={handleAddLeave}
              className="bg-slate-900 border border-slate-800 rounded-2xl p-6 w-full max-w-md space-y-4 shadow-2xl"
            >
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <h3 className="font-bold text-white text-base">Mark Leave Date</h3>
                <button type="button" onClick={() => setShowLeaveModal(null)} className="text-slate-400 hover:text-white">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <p className="text-xs text-slate-400">
                Doctor: <strong className="text-white">{showLeaveModal.user.full_name}</strong>
              </p>

              <div>
                <label className="block text-xs font-bold text-slate-300 uppercase mb-1">Leave Date</label>
                <input
                  type="date"
                  required
                  value={leaveDate}
                  min={new Date().toISOString().split('T')[0]}
                  onChange={(e) => setLeaveDate(e.target.value)}
                  className="w-full p-3 bg-slate-800 border border-slate-700 rounded-xl text-white text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-300 uppercase mb-1">Reason (Optional)</label>
                <input
                  type="text"
                  value={leaveReason}
                  onChange={(e) => setLeaveReason(e.target.value)}
                  placeholder="Conference, Personal Leave, etc."
                  className="w-full p-3 bg-slate-800 border border-slate-700 rounded-xl text-white text-sm"
                />
              </div>

              <div className="flex justify-end space-x-3 pt-4 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowLeaveModal(null)}
                  className="px-4 py-2 text-slate-400 hover:text-white text-xs font-bold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2.5 bg-amber-500 hover:bg-amber-600 text-white font-bold rounded-xl text-xs shadow-lg shadow-amber-500/20"
                >
                  Confirm Leave
                </button>
              </div>
            </form>
          </div>
        )}
      </div>
    </Layout>
  )
}
