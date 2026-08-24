import React, { useState, useEffect } from 'react'
import { Layout } from '../../components/Layout'
import { api } from '../../lib/api'
import { Activity, Star, Calendar, Clock, BarChart3, AlertCircle, Award, XCircle } from 'lucide-react'
import { toast } from 'sonner'

interface MonthlyData {
  month: string
  completed: number
}

interface AnalyticsPayload {
  total_completed: number
  total_cancelled: number
  total_confirmed: number
  average_rating: number
  review_count: number
  monthly_data: MonthlyData[]
  urgency_data: Record<string, number>
  heatmap_data: { day: number; hour: number; count: number }[]
}

const DAYS_NAME = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

export const DoctorAnalytics: React.FC = () => {
  const [data, setData] = useState<AnalyticsPayload | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    fetchAnalytics()
  }, [])

  const fetchAnalytics = async () => {
    try {
      setIsLoading(true)
      const res = await api.get<AnalyticsPayload>('/doctor/analytics')
      setData(res)
    } catch (err: any) {
      toast.error(err.message || 'Failed to load practice analytics')
    } finally {
      setIsLoading(false)
    }
  }

  const getHeatmapIntensity = (count: number) => {
    if (count === 0) return 'bg-slate-100 dark:bg-slate-900 border-slate-200 dark:border-slate-800'
    if (count < 3) return 'bg-teal-100 dark:bg-teal-950/40 text-teal-800 dark:text-teal-300 border-teal-200 dark:border-teal-900'
    if (count < 6) return 'bg-teal-300 dark:bg-teal-800/60 text-teal-900 dark:text-teal-200 border-teal-400'
    return 'bg-teal-500 text-white border-teal-600'
  }

  return (
    <Layout activeTab="analytics">
      <div className="max-w-6xl mx-auto space-y-6 pb-12">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Practice Analytics</h1>
          <p className="text-slate-500 text-sm">Analyze practice efficiency, consultation workloads, patient ratings, and triage distributions.</p>
        </div>

        {isLoading ? (
          <div className="p-12 text-center text-slate-400">Loading analytics insights...</div>
        ) : data ? (
          <>
            {/* Stats Cards Grid */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="bg-white dark:bg-slate-900 rounded-xl p-5 shadow-sm border border-slate-200 dark:border-slate-800 flex items-center space-x-4">
                <div className="w-10 h-10 rounded-lg bg-teal-50 dark:bg-teal-950/30 flex items-center justify-center text-teal-600 dark:text-teal-400">
                  <Award className="w-5 h-5" />
                </div>
                <div>
                  <span className="text-[10px] text-slate-450 block font-bold uppercase tracking-wider">Completed Visits</span>
                  <span className="text-xl font-bold text-slate-900 dark:text-white">{data.total_completed}</span>
                </div>
              </div>

              <div className="bg-white dark:bg-slate-900 rounded-xl p-5 shadow-sm border border-slate-200 dark:border-slate-800 flex items-center space-x-4">
                <div className="w-10 h-10 rounded-lg bg-emerald-50 dark:bg-emerald-950/30 flex items-center justify-center text-emerald-600 dark:text-emerald-400">
                  <Calendar className="w-5 h-5" />
                </div>
                <div>
                  <span className="text-[10px] text-slate-450 block font-bold uppercase tracking-wider">Confirmed Upcoming</span>
                  <span className="text-xl font-bold text-slate-900 dark:text-white">{data.total_confirmed}</span>
                </div>
              </div>

              <div className="bg-white dark:bg-slate-900 rounded-xl p-5 shadow-sm border border-slate-200 dark:border-slate-800 flex items-center space-x-4">
                <div className="w-10 h-10 rounded-lg bg-rose-50 dark:bg-rose-950/30 flex items-center justify-center text-rose-600 dark:text-rose-400">
                  <XCircle className="w-5 h-5" />
                </div>
                <div>
                  <span className="text-[10px] text-slate-450 block font-bold uppercase tracking-wider">Cancelled Bookings</span>
                  <span className="text-xl font-bold text-slate-900 dark:text-white">{data.total_cancelled}</span>
                </div>
              </div>

              <div className="bg-white dark:bg-slate-900 rounded-xl p-5 shadow-sm border border-slate-200 dark:border-slate-800 flex items-center space-x-4">
                <div className="w-10 h-10 rounded-lg bg-amber-50 dark:bg-amber-950/30 flex items-center justify-center text-amber-500">
                  <Star className="w-5 h-5 fill-amber-500 text-amber-500" />
                </div>
                <div>
                  <span className="text-[10px] text-slate-450 block font-bold uppercase tracking-wider">Average Rating</span>
                  <span className="text-xl font-bold text-slate-900 dark:text-white">{data.average_rating.toFixed(1)} / 5.0</span>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Monthly Completed Bar Chart */}
              <div className="bg-white dark:bg-slate-900 rounded-xl p-6 shadow-sm border border-slate-200 dark:border-slate-800 space-y-4">
                <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center space-x-2">
                  <BarChart3 className="w-4 h-4 text-teal-600" />
                  <span>Monthly Consultation Trends</span>
                </h3>
                {data.monthly_data.length === 0 ? (
                  <p className="text-xs text-slate-400 italic py-12 text-center">No monthly historical consultation data available.</p>
                ) : (
                  <div className="space-y-4 pt-4">
                    {data.monthly_data.map((m) => {
                      const maxVal = Math.max(...data.monthly_data.map((x) => x.completed), 1)
                      const pct = (m.completed / maxVal) * 100
                      return (
                        <div key={m.month} className="space-y-1">
                          <div className="flex justify-between text-xs font-semibold">
                            <span className="text-slate-600 dark:text-slate-400">{m.month}</span>
                            <span className="text-slate-900 dark:text-white">{m.completed} completed visits</span>
                          </div>
                          <div className="w-full bg-slate-100 dark:bg-slate-950 h-3 rounded-full overflow-hidden">
                            <div className="bg-teal-500 h-full rounded-full transition-all duration-500" style={{ width: `${pct}%` }} />
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>

              {/* Urgency Level Pie Chart / List */}
              <div className="bg-white dark:bg-slate-900 rounded-xl p-6 shadow-sm border border-slate-200 dark:border-slate-800 space-y-4">
                <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center space-x-2">
                  <AlertCircle className="w-4 h-4 text-teal-600" />
                  <span>Symptom Triage Urgency Distribution</span>
                </h3>
                <div className="space-y-4 pt-4">
                  {['HIGH', 'MEDIUM', 'LOW'].map((level) => {
                    const count = data.urgency_data[level] || 0
                    const total = Object.values(data.urgency_data).reduce((a, b) => a + b, 0) || 1
                    const pct = (count / total) * 100
                    const color = level === 'HIGH' ? 'bg-rose-500' : level === 'MEDIUM' ? 'bg-amber-500' : 'bg-teal-500'
                    return (
                      <div key={level} className="space-y-1">
                        <div className="flex justify-between text-xs font-semibold">
                          <span className="text-slate-650 dark:text-slate-400">AI {level} URGENCY</span>
                          <span className="text-slate-900 dark:text-white">
                            {count} ({pct.toFixed(0)}%)
                          </span>
                        </div>
                        <div className="w-full bg-slate-100 dark:bg-slate-950 h-3 rounded-full overflow-hidden">
                          <div className={`${color} h-full rounded-full transition-all duration-500`} style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>

            {/* Busiest Hours Heatmap */}
            <div className="bg-white dark:bg-slate-900 rounded-xl p-6 shadow-sm border border-slate-200 dark:border-slate-800 space-y-4">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center space-x-2">
                <Clock className="w-4 h-4 text-teal-600" />
                <span>Workload Peak Hours Heatmap (Completed consultations)</span>
              </h3>
              <p className="text-xs text-slate-500">Darker cells indicate hours with higher volume of consultations completed.</p>
              
              <div className="overflow-x-auto pt-4">
                <div className="min-w-[600px] grid grid-cols-8 gap-2 text-center text-[10px]">
                  <div></div>
                  {/* Hours headers */}
                  {['09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00'].map((h) => (
                    <div key={h} className="font-semibold text-slate-500">{h}</div>
                  ))}

                  {/* Heatmap rows */}
                  {[1, 2, 3, 4, 5].map((dayNum) => {
                    const dayName = DAYS_NAME[dayNum]
                    return (
                      <React.Fragment key={dayNum}>
                        <div className="text-left font-semibold text-slate-500 py-2 flex items-center">{dayName}</div>
                        {[9, 10, 11, 12, 13, 14, 15].map((hour) => {
                          const match = data.heatmap_data.find((x) => x.day === dayNum && x.hour === hour)
                          const count = match ? match.count : 0
                          return (
                            <div
                              key={hour}
                              className={`p-2 rounded border font-bold text-xs flex items-center justify-center transition-all ${getHeatmapIntensity(
                                count
                              )}`}
                              title={`${count} appointments completed at this hour`}
                            >
                              {count}
                            </div>
                          )
                        })}
                      </React.Fragment>
                    )
                  })}
                </div>
              </div>
            </div>
          </>
        ) : (
          <div className="p-8 text-center text-slate-400">Failed to load analytics details.</div>
        )}
      </div>
    </Layout>
  )
}
