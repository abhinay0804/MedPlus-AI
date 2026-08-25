import React, { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Layout } from '../../components/Layout'
import { api } from '../../lib/api'
import { DoctorProfile, Appointment } from '../../types'
import { Stethoscope, Search, Calendar, Clock, ChevronRight, Filter, X } from 'lucide-react'
import { SkeletonCard } from '../../components/SkeletonLoader'
import { PendingBookingBanner } from '../../components/PendingBookingBanner'

const SPECIALISATIONS = [
  'All Specialisations',
  'Cardiology',
  'Dermatology',
  'General Medicine',
  'Neurology',
  'Orthopedics',
  'Pediatrics',
]

export const DoctorSearch: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams()
  const rescheduleAppointmentId = searchParams.get('reschedule_appointment_id')

  const [rescheduleSpecialty, setRescheduleSpecialty] = useState<string | null>(null)
  const [doctors, setDoctors] = useState<DoctorProfile[]>([])
  const [specialisation, setSpecialisation] = useState<string>('')
  const [searchName, setSearchName] = useState<string>('')
  const [isLoading, setIsLoading] = useState(true)

  // Fetch reschedule appointment details to enforce specialty consistency
  useEffect(() => {
    const fetchRescheduleSpec = async () => {
      if (!rescheduleAppointmentId) {
        setRescheduleSpecialty(null)
        return
      }
      try {
        const appt = await api.get<Appointment>(`/patient/appointments/${rescheduleAppointmentId}`)
        if (appt && appt.doctor && appt.doctor.specialisation) {
          setRescheduleSpecialty(appt.doctor.specialisation)
        }
      } catch (err) {
        console.error('Failed to load reschedule appointment details:', err)
      }
    }
    fetchRescheduleSpec()
  }, [rescheduleAppointmentId])

  // Sync state when URL params or rescheduleSpecialty change
  useEffect(() => {
    let spec = searchParams.get('specialisation') || ''
    const search = searchParams.get('search') || ''

    if (rescheduleSpecialty) {
      spec = rescheduleSpecialty
    }

    setSpecialisation(spec)
    setSearchName(search)
    fetchDoctors(spec, search)
  }, [searchParams, rescheduleSpecialty])

  const fetchDoctors = async (spec?: string, search?: string) => {
    setIsLoading(true)
    try {
      let endpoint = '/patient/doctors'
      const params = new URLSearchParams()
      if (spec && spec !== 'All Specialisations') {
        params.append('specialisation', spec)
      }
      if (search) {
        params.append('search', search)
      }
      if (params.toString()) {
        endpoint += `?${params.toString()}`
      }

      const data = await api.get<DoctorProfile[]>(endpoint)
      setDoctors(data)
    } catch (err) {
      console.error('Failed to fetch doctors:', err)
    } finally {
      setIsLoading(false)
    }
  }

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    const newParams: Record<string, string> = {}
    if (rescheduleAppointmentId) {
      newParams.reschedule_appointment_id = rescheduleAppointmentId
    }
    if (specialisation && specialisation !== 'All Specialisations') {
      newParams.specialisation = specialisation
    }
    if (searchName.trim()) {
      newParams.search = searchName.trim()
    }
    setSearchParams(newParams)
  }

  const clearFilters = () => {
    setSpecialisation(rescheduleSpecialty || '')
    setSearchName('')
    const newParams: Record<string, string> = {}
    if (rescheduleAppointmentId) {
      newParams.reschedule_appointment_id = rescheduleAppointmentId
    }
    if (rescheduleSpecialty) {
      newParams.specialisation = rescheduleSpecialty
    }
    setSearchParams(newParams)
  }

  // Client-side filtering as backup
  const filteredDoctors = doctors.filter((doc) => {
    const matchesName = searchName
      ? doc.user?.full_name?.toLowerCase().includes(searchName.toLowerCase())
      : true
    const matchesSpec =
      specialisation && specialisation !== 'All Specialisations'
        ? doc.specialisation?.toLowerCase() === specialisation.toLowerCase()
        : true
    return matchesName && matchesSpec
  })

  return (
    <Layout>
      <div className="space-y-8">
        <PendingBookingBanner />
        {searchParams.get('reschedule_appointment_id') && (
          <div className="p-4 rounded-xl bg-violet-500/10 border border-violet-500/20 text-violet-800 dark:text-violet-300 text-xs font-bold shadow-sm flex items-center space-x-2">
            <span>🔄</span>
            <span>You are selecting a different doctor to reschedule your appointment. Pick a specialist below to continue.</span>
          </div>
        )}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h2 className="text-2xl font-extrabold text-slate-900 dark:text-white tracking-tight">Find & Book Medical Specialists</h2>
            <p className="text-slate-600 dark:text-slate-400 text-sm mt-1">
              Search top-rated doctors across specialisations and reserve consultation slots.
            </p>
          </div>
          {(specialisation || searchName) && (
            <button
              onClick={clearFilters}
              className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl text-xs font-semibold border border-slate-200 dark:border-slate-700 flex items-center space-x-1 self-start transition"
            >
              <X className="w-3.5 h-3.5" />
              <span>Clear Filters</span>
            </button>
          )}
        </div>

        {/* Filter & Search Bar */}
        <form onSubmit={handleSearch} className="grid grid-cols-1 md:grid-cols-12 gap-3 bg-white dark:bg-slate-900/60 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
          {/* Name Search */}
          <div className="relative md:col-span-6">
            <Search className="w-4 h-4 absolute left-3.5 top-3.5 text-slate-400 dark:text-slate-500" />
            <input
              type="text"
              value={searchName}
              onChange={(e) => setSearchName(e.target.value)}
              placeholder="Search doctor by name..."
              className="w-full pl-10 pr-4 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:border-teal-500/50 rounded-xl text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:border-teal-500 text-sm transition"
            />
          </div>

          {/* Specialty Dropdown */}
          <div className="relative md:col-span-4">
            <Filter className="w-4 h-4 absolute left-3.5 top-3.5 text-slate-400 dark:text-slate-500" />
            <select
              disabled={Boolean(rescheduleSpecialty)}
              value={specialisation || 'All Specialisations'}
              onChange={(e) => {
                const val = e.target.value
                setSpecialisation(val)
                const newParams: Record<string, string> = {}
                if (rescheduleAppointmentId) newParams.reschedule_appointment_id = rescheduleAppointmentId
                if (val && val !== 'All Specialisations') newParams.specialisation = val
                if (searchName.trim()) newParams.search = searchName.trim()
                setSearchParams(newParams)
              }}
              className={`w-full pl-10 pr-4 py-2.5 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white focus:outline-none focus:border-teal-500 text-sm ${
                rescheduleSpecialty
                  ? 'bg-slate-100 dark:bg-slate-800/80 cursor-not-allowed opacity-75'
                  : 'bg-slate-50 dark:bg-slate-800 hover:border-teal-500/50 cursor-pointer'
              }`}
            >
              {rescheduleSpecialty ? (
                <option value={rescheduleSpecialty}>{rescheduleSpecialty} (Locked)</option>
              ) : (
                SPECIALISATIONS.map((spec) => (
                  <option key={spec} value={spec} className="bg-white dark:bg-slate-800 text-slate-900 dark:text-white">
                    {spec}
                  </option>
                ))
              )}
            </select>
          </div>

          {/* Submit Button */}
          <div className="md:col-span-2">
            <button
              type="submit"
              className="w-full py-2.5 bg-teal-500 hover:bg-teal-600 text-white font-bold rounded-xl text-sm transition shadow-lg shadow-teal-500/20 flex items-center justify-center space-x-1.5 cursor-pointer"
            >
              <Search className="w-4 h-4" />
              <span>Search</span>
            </button>
          </div>
        </form>

        {/* Doctors Grid */}
        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <SkeletonCard key={i} />
            ))}
          </div>
        ) : filteredDoctors.length === 0 ? (
          <div className="p-12 text-center bg-white dark:bg-slate-900/40 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
            <Stethoscope className="w-12 h-12 text-slate-400 dark:text-slate-600 mx-auto mb-3" />
            <p className="text-slate-900 dark:text-slate-300 font-bold">No doctors found matching your criteria.</p>
            <p className="text-xs text-slate-500 mt-1">Try searching for another specialisation or clearing filters.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredDoctors.map((doctor) => {
              const rescheduleAppointmentId = searchParams.get('reschedule_appointment_id')
              const bookUrl = rescheduleAppointmentId
                ? `/patient/book/${doctor.id}?reschedule_appointment_id=${rescheduleAppointmentId}`
                : `/patient/book/${doctor.id}`
              
              return (
                <div
                  key={doctor.id}
                  className="bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 hover:border-teal-500/50 rounded-2xl p-6 space-y-4 shadow-sm transition-all group"
                >
                  <div className="flex items-center space-x-4">
                    <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-teal-500/20 to-emerald-500/20 text-teal-600 dark:text-teal-400 border border-teal-500/30 flex items-center justify-center font-bold text-xl">
                      {doctor.user?.full_name?.charAt(0) || 'D'}
                    </div>
                    <div>
                      <h3 className="font-bold text-slate-900 dark:text-white text-base group-hover:text-teal-600 dark:group-hover:text-teal-400 transition">
                        {doctor.user?.full_name}
                      </h3>
                      <p className="text-xs font-semibold text-teal-600 dark:text-teal-400 mt-0.5">{doctor.specialisation}</p>
                      
                      {/* Rating Display */}
                      <div className="flex items-center space-x-1 mt-1 text-[11px] text-amber-500 font-bold">
                        <span>⭐</span>
                        <span>{(doctor.average_rating || 0.0).toFixed(1)}</span>
                        <span className="text-slate-400 font-normal">({doctor.reviews_count || 0} reviews)</span>
                      </div>
                    </div>
                  </div>

                  <div className="bg-slate-50 dark:bg-slate-800/40 p-3 rounded-xl border border-slate-200 dark:border-slate-700/40 text-xs text-slate-600 dark:text-slate-400 space-y-1">
                    <div className="flex items-center space-x-2">
                      <Clock className="w-4 h-4 text-teal-600 dark:text-teal-400" />
                      <span>{doctor.slot_duration_minutes} Min Consultation</span>
                    </div>
                  </div>

                  <Link
                    to={bookUrl}
                    className="w-full py-2.5 px-4 bg-teal-50 dark:bg-teal-500/20 hover:bg-teal-500 text-teal-700 dark:text-teal-300 hover:text-white font-bold rounded-xl text-xs border border-teal-200 dark:border-teal-500/30 flex items-center justify-center space-x-1.5 transition"
                  >
                    <span>{rescheduleAppointmentId ? 'Reschedule Here' : 'Book Consultation'}</span>
                    <ChevronRight className="w-4 h-4" />
                  </Link>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </Layout>
  )
}
