import React, { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Layout } from '../../components/Layout'
import { api } from '../../lib/api'
import { DoctorProfile } from '../../types'
import { ArrowLeft, Clock, Calendar, Check, Save } from 'lucide-react'
import { toast } from 'sonner'

export const DoctorDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [doctor, setDoctor] = useState<DoctorProfile | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [specialisation, setSpecialisation] = useState('')
  const [slotDuration, setSlotDuration] = useState('30')
  const [isSaving, setIsSaving] = useState(false)

  useEffect(() => {
    fetchDoctor()
  }, [id])

  const fetchDoctor = async () => {
    try {
      setIsLoading(true)
      const data = await api.get<DoctorProfile>(`/admin/doctors/${id}`)
      setDoctor(data)
      setSpecialisation(data.specialisation)
      setSlotDuration(data.slot_duration_minutes.toString())
    } catch (err: any) {
      toast.error(err.message || 'Failed to load doctor details')
    } finally {
      setIsLoading(false)
    }
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      setIsSaving(true)
      await api.put(`/admin/doctors/${id}`, {
        specialisation,
        slot_duration_minutes: parseInt(slotDuration, 10),
      })
      toast.success('Doctor updated successfully!')
      fetchDoctor()
    } catch (err: any) {
      toast.error(err.message || 'Failed to update doctor')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <Layout activeTab="doctors">
      <div className="max-w-4xl mx-auto space-y-6">
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
              <span className={`px-3 py-1 rounded-full text-xs font-semibold ${doctor.is_active ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300' : 'bg-rose-100 text-rose-800'}`}>
                {doctor.is_active ? 'Active' : 'Inactive'}
              </span>
            </div>

            <div className="bg-white dark:bg-slate-900 rounded-xl p-6 shadow-sm border border-slate-200 dark:border-slate-800 space-y-6">
              <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Doctor Configuration</h2>
              <form onSubmit={handleSave} className="space-y-4">
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

                <div className="flex justify-end">
                  <button
                    type="submit"
                    disabled={isSaving}
                    className="flex items-center space-x-2 px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-lg text-sm font-medium transition-colors cursor-pointer"
                  >
                    <Save className="w-4 h-4" />
                    <span>{isSaving ? 'Saving...' : 'Save Configuration'}</span>
                  </button>
                </div>
              </form>
            </div>
          </>
        ) : (
          <div className="p-8 text-center text-slate-400">Doctor not found.</div>
        )}
      </div>
    </Layout>
  )
}
