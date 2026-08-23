import React, { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Layout } from '../../components/Layout'
import { api } from '../../lib/api'
import { Appointment } from '../../types'
import { formatDateTime } from '../../lib/utils'
import {
  Calendar,
  Clock,
  Plus,
  Stethoscope,
  Sparkles,
  ChevronRight,
  CheckCircle2,
  Activity,
} from 'lucide-react'

import { PendingBookingBanner } from '../../components/PendingBookingBanner'

export const PatientDashboard: React.FC = () => {
  const [appointments, setAppointments] = useState<Appointment[]>([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    async function loadData() {
      try {
        const data = await api.get<Appointment[]>('/patient/appointments')
        setAppointments(data)
      } catch (err) {
        console.error('Failed to load appointments:', err)
      } finally {
        setIsLoading(false)
      }
    }
    loadData()
  }, [])

  const upcoming = appointments.filter(
    (a) => a.status === 'CONFIRMED' || a.status === 'HELD'
  )
  const completed = appointments.filter((a) => a.status === 'COMPLETED')

  return (
    <Layout>
      <div className="space-y-8">
        <PendingBookingBanner />
        {/* Welcome Banner */}
        <div className="bg-gradient-to-r from-teal-600 via-teal-500 to-emerald-500 rounded-3xl p-8 text-white shadow-xl relative overflow-hidden">
          <div className="absolute right-0 top-0 bottom-0 w-1/3 bg-white/10 blur-2xl transform rotate-12 pointer-events-none" />
          <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div>
              <div className="inline-flex items-center space-x-2 px-3 py-1 bg-white/20 rounded-full text-xs font-semibold backdrop-blur-md mb-3">
                <Sparkles className="w-4 h-4" />
                <span>AI-Powered Healthcare Portal</span>
              </div>
              <h2 className="text-3xl font-extrabold tracking-tight">Patient Health Dashboard</h2>
              <p className="text-teal-100 text-sm mt-1 max-w-xl">
                Book appointments, submit pre-visit symptoms for AI triage, and access doctor consultation notes.
              </p>
            </div>
            <Link
              to="/patient/doctors"
              className="inline-flex items-center space-x-2 px-6 py-3.5 bg-white text-teal-800 font-bold rounded-2xl shadow-lg hover:bg-teal-50 transition transform hover:-translate-y-0.5"
            >
              <Plus className="w-5 h-5" />
              <span>Book Appointment</span>
            </Link>
          </div>
        </div>

        {/* Stats Row */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
          <div className="bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 flex items-center space-x-4 shadow-sm">
            <div className="w-12 h-12 rounded-xl bg-teal-500/20 text-teal-600 dark:text-teal-400 flex items-center justify-center">
              <Calendar className="w-6 h-6" />
            </div>
            <div>
              <p className="text-xs text-slate-500 dark:text-slate-400 font-semibold uppercase">Total Appointments</p>
              <p className="text-2xl font-extrabold text-slate-900 dark:text-white mt-0.5">{appointments.length}</p>
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 flex items-center space-x-4 shadow-sm">
            <div className="w-12 h-12 rounded-xl bg-sky-500/20 text-sky-600 dark:text-sky-400 flex items-center justify-center">
              <Clock className="w-6 h-6" />
            </div>
            <div>
              <p className="text-xs text-slate-500 dark:text-slate-400 font-semibold uppercase">Upcoming Consultations</p>
              <p className="text-2xl font-extrabold text-slate-900 dark:text-white mt-0.5">{upcoming.length}</p>
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 flex items-center space-x-4 shadow-sm">
            <div className="w-12 h-12 rounded-xl bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
              <CheckCircle2 className="w-6 h-6" />
            </div>
            <div>
              <p className="text-xs text-slate-500 dark:text-slate-400 font-semibold uppercase">Completed Consultations</p>
              <p className="text-2xl font-extrabold text-slate-900 dark:text-white mt-0.5">{completed.length}</p>
            </div>
          </div>
        </div>

        {/* Upcoming Appointments List */}
        <div className="bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 space-y-4 shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-4">
            <h3 className="text-lg font-bold text-slate-900 dark:text-white flex items-center space-x-2">
              <Calendar className="w-5 h-5 text-teal-600 dark:text-teal-400" />
              <span>Upcoming Consultations</span>
            </h3>
            <Link
              to="/patient/appointments"
              className="text-xs font-semibold text-teal-600 dark:text-teal-400 hover:underline flex items-center space-x-1"
            >
              <span>View All</span>
              <ChevronRight className="w-4 h-4" />
            </Link>
          </div>

          {isLoading ? (
            <div className="space-y-3">
              {[1, 2].map((i) => (
                <div key={i} className="h-20 bg-slate-100 dark:bg-slate-800/50 rounded-xl animate-pulse" />
              ))}
            </div>
          ) : upcoming.length === 0 ? (
            <div className="text-center py-10">
              <Stethoscope className="w-12 h-12 text-slate-400 dark:text-slate-600 mx-auto mb-3" />
              <p className="text-slate-600 dark:text-slate-400 text-sm font-medium">No upcoming appointments scheduled.</p>
              <Link
                to="/patient/doctors"
                className="mt-4 inline-block px-4 py-2 bg-teal-50 dark:bg-teal-500/20 text-teal-700 dark:text-teal-300 rounded-xl text-xs font-bold border border-teal-200 dark:border-teal-500/30 hover:bg-teal-100 dark:hover:bg-teal-500/30 transition"
              >
                Find a Specialist
              </Link>
            </div>
          ) : (
            <div className="space-y-3">
              {upcoming.map((appt) => (
                <div
                  key={appt.id}
                  className="p-4 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700/60 rounded-xl flex items-center justify-between hover:border-teal-500/40 transition"
                >
                  <div className="flex items-center space-x-4">
                    <div className="w-10 h-10 rounded-xl bg-teal-500/20 text-teal-600 dark:text-teal-400 flex items-center justify-center font-bold">
                      <Stethoscope className="w-5 h-5" />
                    </div>
                    <div>
                      <p className="font-bold text-slate-900 dark:text-white text-sm">
                        {appt.doctor?.user?.full_name || 'Specialist Consultation'}
                      </p>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                        {appt.doctor?.specialisation} • {formatDateTime(appt.slot_start)}
                      </p>
                    </div>
                  </div>
                  <Link
                    to={`/patient/appointments/${appt.id}`}
                    className="px-3 py-1.5 bg-teal-50 dark:bg-teal-500/20 text-teal-700 dark:text-teal-300 rounded-lg text-xs font-semibold border border-teal-200 dark:border-teal-500/30 hover:bg-teal-100 dark:hover:bg-teal-500/30 transition"
                  >
                    View Detail
                  </Link>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </Layout>
  )
}
