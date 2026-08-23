import React, { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Layout } from '../../components/Layout'
import { api } from '../../lib/api'
import { AdminDashboardStats } from '../../types'
import { Users, Stethoscope, Calendar, CheckCircle2, Clock, Activity, AlertCircle } from 'lucide-react'
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts'

export const AdminDashboard: React.FC = () => {
  const [stats, setStats] = useState<AdminDashboardStats | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    async function loadStats() {
      try {
        const data = await api.get<AdminDashboardStats>('/admin/dashboard')
        setStats(data)
      } catch (err) {
        console.error('Failed to load admin stats:', err)
      } finally {
        setIsLoading(false)
      }
    }
    loadStats()
  }, [])

  const pieData = stats
    ? [
        { name: 'Completed', value: stats.completed_appointments, color: '#10b981' },
        { name: 'Pending / Confirmed', value: stats.pending_appointments, color: '#0ea5e9' },
        { name: 'Cancelled', value: stats.cancelled_appointments, color: '#f43f5e' },
      ]
    : []

  return (
    <Layout>
      <div className="space-y-8">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-2xl font-extrabold text-slate-900 dark:text-white tracking-tight">Admin Overview & Analytics</h2>
            <p className="text-slate-600 dark:text-slate-400 text-sm mt-1">
              System health, doctor rosters, patient registrations, and appointment distribution.
            </p>
          </div>
          <Link
            to="/admin/doctors"
            className="px-5 py-2.5 bg-teal-500 hover:bg-teal-600 text-white font-bold rounded-xl text-xs shadow-lg shadow-teal-500/20 text-center"
          >
            Manage Doctors & Leave
          </Link>
        </div>

        {/* Stats Grid */}
        {isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-28 bg-slate-100 dark:bg-slate-900/40 rounded-2xl animate-pulse" />
            ))}
          </div>
        ) : stats ? (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
              <div className="bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 flex items-center space-x-4 shadow-sm">
                <div className="w-12 h-12 rounded-xl bg-teal-500/20 text-teal-600 dark:text-teal-400 flex items-center justify-center">
                  <Stethoscope className="w-6 h-6" />
                </div>
                <div>
                  <p className="text-xs text-slate-500 dark:text-slate-400 font-semibold uppercase">Total Doctors</p>
                  <p className="text-2xl font-extrabold text-slate-900 dark:text-white mt-0.5">{stats.total_doctors}</p>
                </div>
              </div>

              <div className="bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 flex items-center space-x-4 shadow-sm">
                <div className="w-12 h-12 rounded-xl bg-sky-500/20 text-sky-600 dark:text-sky-400 flex items-center justify-center">
                  <Users className="w-6 h-6" />
                </div>
                <div>
                  <p className="text-xs text-slate-500 dark:text-slate-400 font-semibold uppercase">Registered Patients</p>
                  <p className="text-2xl font-extrabold text-slate-900 dark:text-white mt-0.5">{stats.total_patients}</p>
                </div>
              </div>

              <div className="bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 flex items-center space-x-4 shadow-sm">
                <div className="w-12 h-12 rounded-xl bg-indigo-500/20 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
                  <Calendar className="w-6 h-6" />
                </div>
                <div>
                  <p className="text-xs text-slate-500 dark:text-slate-400 font-semibold uppercase">Total Appointments</p>
                  <p className="text-2xl font-extrabold text-slate-900 dark:text-white mt-0.5">{stats.total_appointments}</p>
                </div>
              </div>

              <div className="bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 flex items-center space-x-4 shadow-sm">
                <div className="w-12 h-12 rounded-xl bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
                  <CheckCircle2 className="w-6 h-6" />
                </div>
                <div>
                  <p className="text-xs text-slate-500 dark:text-slate-400 font-semibold uppercase">Completed Consults</p>
                  <p className="text-2xl font-extrabold text-slate-900 dark:text-white mt-0.5">{stats.completed_appointments}</p>
                </div>
              </div>
            </div>

            {/* Analytics Donut Chart */}
            <div className="bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm space-y-4">
              <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center space-x-2">
                <Activity className="w-5 h-5 text-teal-600 dark:text-teal-400" />
                <span>Appointment Status Breakdown</span>
              </h3>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={pieData}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={90}
                      paddingAngle={5}
                      dataKey="value"
                    >
                      {pieData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{ backgroundColor: 'var(--tooltip-bg, #0f172a)', borderColor: '#334155', borderRadius: '12px', color: '#fff' }}
                    />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>
          </>
        ) : null}
      </div>
    </Layout>
  )
}
