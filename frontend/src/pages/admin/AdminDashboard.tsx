import React, { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Layout } from '../../components/Layout'
import { api } from '../../lib/api'
import { AdminDashboardStats } from '../../types'
import {
  Users,
  Stethoscope,
  Calendar,
  CheckCircle2,
  Clock,
  Activity,
  AlertCircle,
  Sparkles,
  Cpu,
  Database,
  Mail,
  RefreshCw,
  Sliders,
  ShieldAlert,
  Gauge,
  Terminal,
  Loader2,
  Trash2
} from 'lucide-react'
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts'
import { toast } from 'sonner'

interface AIInsights {
  insights_html: string
  peak_hours_prediction: string
  department_alert: string
}

interface TelemetryData {
  cpu_usage: number
  memory_usage: number
  db_rows: number
  redis_status: string
  celery_status: string
  api_response_time_ms: number
}

interface SmtpLog {
  to: string
  subject: string
  template: string
  status: string
  timestamp: string
  preview: string
}

export const AdminDashboard: React.FC = () => {
  const [stats, setStats] = useState<AdminDashboardStats | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [activeSubTab, setActiveSubTab] = useState<'overview' | 'insights' | 'control'>('overview')

  // AI Insights state
  const [aiInsights, setAiInsights] = useState<AIInsights | null>(null)
  const [isLoadingInsights, setIsLoadingInsights] = useState(false)

  // Telemetry & Control states
  const [telemetry, setTelemetry] = useState<TelemetryData | null>(null)
  const [smtpLogs, setSmtpLogs] = useState<SmtpLog[]>([])
  const [isResettingDb, setIsResettingDb] = useState(false)
  const [isLoadingTelemetry, setIsLoadingTelemetry] = useState(false)

  // Load basic stats
  const loadStats = async () => {
    try {
      const data = await api.get<AdminDashboardStats>('/admin/dashboard')
      setStats(data)
    } catch (err) {
      console.error('Failed to load admin stats:', err)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    loadStats()
  }, [])

  // Load AI Insights
  const generateAiInsights = async () => {
    setIsLoadingInsights(true)
    try {
      const data = await api.post<AIInsights>('/admin/ai-insights', {})
      setAiInsights(data)
      toast.success('Gemini Operational Analytics generated successfully!')
    } catch (err: any) {
      toast.error(err.message || 'Failed to generate AI insights')
    } finally {
      setIsLoadingInsights(false)
    }
  }

  // Load Telemetry & SMTP logs
  const loadSystemControlData = async () => {
    setIsLoadingTelemetry(true)
    try {
      const teleData = await api.get<TelemetryData>('/admin/telemetry')
      setTelemetry(teleData)
      const logs = await api.get<SmtpLog[]>('/admin/smtp-logs')
      setSmtpLogs(logs)
    } catch (err) {
      console.error('Failed to load telemetry/smtp logs:', err)
    } finally {
      setIsLoadingTelemetry(false)
    }
  }

  useEffect(() => {
    if (activeSubTab === 'control') {
      loadSystemControlData()
      const interval = setInterval(loadSystemControlData, 5000) // Poll every 5s
      return () => clearInterval(interval)
    }
  }, [activeSubTab])

  // Reset database handler
  const handleResetDb = async () => {
    if (!window.confirm('WARNING: This will delete ALL appointments, symptom forms, reviews, and custom doctor slots, resetting the system database to its default seed states. Do you wish to continue?')) {
      return
    }
    setIsResettingDb(true)
    try {
      await api.post('/admin/reset-db', {})
      toast.success('Database reset and re-seeded successfully!')
      loadStats()
      if (activeSubTab === 'control') {
        loadSystemControlData()
      }
    } catch (err: any) {
      toast.error(err.message || 'Failed to reset database')
    } finally {
      setIsResettingDb(false)
    }
  }

  const pieData = stats
    ? [
        { name: 'Completed', value: stats.completed_appointments, color: '#10b981' },
        { name: 'Pending / Confirmed', value: stats.pending_appointments, color: '#0ea5e9' },
        { name: 'Cancelled', value: stats.cancelled_appointments, color: '#f43f5e' },
      ]
    : []

  return (
    <Layout activeTab="dashboard">
      <div className="space-y-6">
        {/* Page Title */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-extrabold text-slate-900 dark:text-white tracking-tight">Admin Portal & Control Center</h1>
            <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">
              Real-time resource capacity, telemetry, Gemini-powered staffing forecasting, and system controls.
            </p>
          </div>
          <div className="flex items-center space-x-3">
            <Link
              to="/admin/doctors"
              className="px-4 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-bold rounded-xl text-xs transition"
            >
              Doctor Roster
            </Link>
            <Link
              to="/admin/leave"
              className="px-4 py-2 bg-teal-500 hover:bg-teal-600 text-white font-bold rounded-xl text-xs shadow-lg shadow-teal-500/20 transition"
            >
              Approve Leaves
            </Link>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="flex border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 p-1.5 rounded-xl">
          <button
            onClick={() => setActiveSubTab('overview')}
            className={`flex items-center space-x-2 px-4 py-2 text-xs font-bold rounded-lg transition-all ${
              activeSubTab === 'overview'
                ? 'bg-teal-500 text-white shadow-md'
                : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
            }`}
          >
            <Activity className="w-4 h-4" />
            <span>Operational Overview</span>
          </button>
          <button
            onClick={() => setActiveSubTab('insights')}
            className={`flex items-center space-x-2 px-4 py-2 text-xs font-bold rounded-lg transition-all ${
              activeSubTab === 'insights'
                ? 'bg-teal-500 text-white shadow-md'
                : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
            }`}
          >
            <Sparkles className="w-4 h-4" />
            <span>AI Clinical Analyst</span>
          </button>
          <button
            onClick={() => setActiveSubTab('control')}
            className={`flex items-center space-x-2 px-4 py-2 text-xs font-bold rounded-lg transition-all ${
              activeSubTab === 'control'
                ? 'bg-teal-500 text-white shadow-md'
                : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
            }`}
          >
            <Sliders className="w-4 h-4" />
            <span>System Control & Telemetry</span>
          </button>
        </div>

        {/* TAB 1: OVERVIEW */}
        {activeSubTab === 'overview' && (
          <div className="space-y-6 animate-fadeIn">
            {/* Stats Grid */}
            {isLoading ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="h-24 bg-slate-100 dark:bg-slate-900/40 rounded-2xl animate-pulse" />
                ))}
              </div>
            ) : stats ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
                <div className="bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 flex items-center space-x-4 shadow-sm">
                  <div className="w-11 h-11 rounded-xl bg-teal-500/20 text-teal-600 dark:text-teal-400 flex items-center justify-center shrink-0">
                    <Stethoscope className="w-5.5 h-5.5" />
                  </div>
                  <div>
                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Total Roster</p>
                    <p className="text-xl font-extrabold text-slate-900 dark:text-white mt-0.5">{stats.total_doctors} Doctors</p>
                  </div>
                </div>

                <div className="bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 flex items-center space-x-4 shadow-sm">
                  <div className="w-11 h-11 rounded-xl bg-sky-500/20 text-sky-600 dark:text-sky-400 flex items-center justify-center shrink-0">
                    <Users className="w-5.5 h-5.5" />
                  </div>
                  <div>
                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Registrations</p>
                    <p className="text-xl font-extrabold text-slate-900 dark:text-white mt-0.5">{stats.total_patients} Patients</p>
                  </div>
                </div>

                <div className="bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 flex items-center space-x-4 shadow-sm">
                  <div className="w-11 h-11 rounded-xl bg-indigo-500/20 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0">
                    <Calendar className="w-5.5 h-5.5" />
                  </div>
                  <div>
                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Total Consults</p>
                    <p className="text-xl font-extrabold text-slate-900 dark:text-white mt-0.5">{stats.total_appointments} Booked</p>
                  </div>
                </div>

                <div className="bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 flex items-center space-x-4 shadow-sm">
                  <div className="w-11 h-11 rounded-xl bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
                    <CheckCircle2 className="w-5.5 h-5.5" />
                  </div>
                  <div>
                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Completed Consults</p>
                    <p className="text-xl font-extrabold text-slate-900 dark:text-white mt-0.5">{stats.completed_appointments} Done</p>
                  </div>
                </div>
              </div>
            ) : null}

            {/* Charts Section */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2 bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm flex flex-col justify-between">
                <div className="mb-4">
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center space-x-2">
                    <Activity className="w-4 h-4 text-teal-500" />
                    <span>Appointment Status Distribution</span>
                  </h3>
                  <p className="text-xs text-slate-500">Live share of booking pipeline.</p>
                </div>
                {isLoading ? (
                  <div className="h-64 bg-slate-100 dark:bg-slate-950 rounded-xl animate-pulse" />
                ) : stats && stats.total_appointments > 0 ? (
                  <div className="h-64 flex items-center justify-center">
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
                          contentStyle={{
                            backgroundColor: '#0f172a',
                            borderColor: '#334155',
                            borderRadius: '12px',
                            color: '#fff',
                            fontSize: '11px',
                          }}
                        />
                        <Legend wrapperStyle={{ fontSize: '11px' }} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <div className="h-64 flex flex-col items-center justify-center text-slate-500 text-xs">
                    <Clock className="w-8 h-8 mb-2 opacity-50" />
                    No appointments booked yet. Seed data in System Control to see charts.
                  </div>
                )}
              </div>

              {/* Quick links & audit status card */}
              <div className="bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm space-y-5">
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">Security & Auditing</h3>
                  <p className="text-xs text-slate-500 mt-1">Audit trail monitoring status.</p>
                </div>
                <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800/80 space-y-3">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-500">HIPAA Logging:</span>
                    <span className="text-emerald-500 font-bold flex items-center gap-1">
                      <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                      ACTIVE
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-500">GDPR Compliance:</span>
                    <span className="text-emerald-500 font-bold flex items-center gap-1">
                      <span className="w-2 h-2 rounded-full bg-emerald-500" />
                      ENABLED
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-500">Auto-Approve Daemon:</span>
                    <span className="text-emerald-500 font-bold flex items-center gap-1">
                      <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                      RUNNING
                    </span>
                  </div>
                </div>
                <Link
                  to="/admin/audit"
                  className="w-full py-3 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 font-bold rounded-xl text-xs flex items-center justify-center space-x-2 transition"
                >
                  <span>View System Audit Logs</span>
                </Link>
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: AI CLINICAL INSIGHTS */}
        {activeSubTab === 'insights' && (
          <div className="space-y-6 animate-fadeIn">
            <div className="bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 dark:border-slate-800/60 pb-5">
                <div>
                  <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center space-x-2">
                    <Sparkles className="w-5 h-5 text-amber-500" />
                    <span>Gemini AI Operations Assistant</span>
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">Analyses patient symptoms, leave risk, and department workloads to optimize operations.</p>
                </div>
                <button
                  onClick={generateAiInsights}
                  disabled={isLoadingInsights}
                  className="px-4 py-2 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-white font-bold rounded-xl text-xs flex items-center space-x-2 shadow-lg shadow-amber-500/10 transition disabled:opacity-50"
                >
                  {isLoadingInsights ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Analysing system...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-3.5 h-3.5" />
                      <span>Generate AI Analytics</span>
                    </>
                  )}
                </button>
              </div>

              {isLoadingInsights ? (
                <div className="py-20 flex flex-col items-center justify-center space-y-3">
                  <Loader2 className="w-8 h-8 text-amber-500 animate-spin" />
                  <p className="text-xs text-slate-500 font-bold uppercase tracking-widest">Gemini is processing live metadata...</p>
                </div>
              ) : aiInsights ? (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 pt-6">
                  {/* Left Column: Markdown content */}
                  <div className="lg:col-span-2 space-y-4">
                    <div
                      className="text-xs leading-relaxed text-slate-700 dark:text-slate-300 space-y-4"
                      dangerouslySetInnerHTML={{ __html: aiInsights.insights_html }}
                    />
                  </div>

                  {/* Right Column: Predictive Stats Widget */}
                  <div className="space-y-4">
                    <div className="p-5 rounded-2xl bg-amber-500/5 border border-amber-500/20 space-y-4">
                      <h4 className="text-xs font-extrabold text-amber-800 dark:text-amber-300 uppercase tracking-wider flex items-center gap-1.5">
                        <AlertCircle className="w-4 h-4" />
                        Operational Alerts
                      </h4>
                      <div className="space-y-3">
                        <div>
                          <p className="text-[10px] text-slate-400 uppercase font-bold">Predicted Peak Hours</p>
                          <p className="text-sm font-bold text-slate-900 dark:text-white mt-0.5">{aiInsights.peak_hours_prediction}</p>
                        </div>
                        <hr className="border-amber-500/10" />
                        <div>
                          <p className="text-[10px] text-slate-400 uppercase font-bold">Staffing Department Alert</p>
                          <p className={`text-sm font-bold mt-0.5 ${aiInsights.department_alert !== 'None' ? 'text-rose-500' : 'text-slate-900 dark:text-white'}`}>
                            {aiInsights.department_alert === 'None' ? '✅ Roster fully staffed' : `⚠️ High load: ${aiInsights.department_alert}`}
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="p-5 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800/80 space-y-3">
                      <h4 className="text-xs font-bold text-slate-900 dark:text-white">AI Capacity Index</h4>
                      <div className="space-y-2">
                        <div className="flex justify-between text-[10px] text-slate-400 uppercase font-bold">
                          <span>Clinic Capacity Utilisation</span>
                          <span>{stats ? Math.min(100, Math.floor((stats.total_appointments / ((stats.total_doctors || 1) * 12)) * 100)) : 0}%</span>
                        </div>
                        <div className="w-full bg-slate-200 dark:bg-slate-850 h-2 rounded-full overflow-hidden">
                          <div
                            className="bg-amber-500 h-full rounded-full transition-all duration-500"
                            style={{ width: `${stats ? Math.min(100, Math.floor((stats.total_appointments / ((stats.total_doctors || 1) * 12)) * 100)) : 0}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="py-20 flex flex-col items-center justify-center text-slate-500 text-xs">
                  <Sparkles className="w-10 h-10 text-amber-500/40 mb-3" />
                  <p className="font-semibold text-slate-700 dark:text-slate-400">Operations analytics not yet generated for this session.</p>
                  <p className="opacity-70 mt-1">Click "Generate AI Analytics" above to run Gemini predictive staffing analysis.</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 3: SYSTEM CONTROL & TELEMETRY */}
        {activeSubTab === 'control' && (
          <div className="space-y-6 animate-fadeIn">
            {/* System Status Dials */}
            <div className="bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center space-x-2 mb-6">
                <Cpu className="w-4 h-4 text-indigo-500" />
                <span>Live Server Telemetry & Daemon Status</span>
              </h3>

              {isLoadingTelemetry && !telemetry ? (
                <div className="py-12 flex justify-center">
                  <Loader2 className="w-6 h-6 animate-spin text-indigo-500" />
                </div>
              ) : telemetry ? (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  {/* Gauge 1: CPU */}
                  <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-850 flex flex-col items-center text-center space-y-2">
                    <p className="text-[10px] text-slate-400 uppercase font-bold">API CPU Load</p>
                    <div className="text-3xl font-black text-slate-900 dark:text-white flex items-baseline">
                      <span>{telemetry.cpu_usage}</span>
                      <span className="text-xs font-semibold text-slate-500 ml-0.5">%</span>
                    </div>
                    <div className="w-full bg-slate-200 dark:bg-slate-800 h-1.5 rounded-full overflow-hidden">
                      <div className="bg-indigo-500 h-full rounded-full" style={{ width: `${telemetry.cpu_usage}%` }} />
                    </div>
                  </div>

                  {/* Gauge 2: Memory */}
                  <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-855 flex flex-col items-center text-center space-y-2">
                    <p className="text-[10px] text-slate-400 uppercase font-bold">Memory Utilisation</p>
                    <div className="text-3xl font-black text-slate-900 dark:text-white flex items-baseline">
                      <span>{telemetry.memory_usage}</span>
                      <span className="text-xs font-semibold text-slate-500 ml-0.5">%</span>
                    </div>
                    <div className="w-full bg-slate-200 dark:bg-slate-800 h-1.5 rounded-full overflow-hidden">
                      <div className="bg-sky-500 h-full rounded-full" style={{ width: `${telemetry.memory_usage}%` }} />
                    </div>
                  </div>

                  {/* Gauge 3: Database & Cache status */}
                  <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-855 flex flex-col items-center text-center space-y-2">
                    <p className="text-[10px] text-slate-400 uppercase font-bold">Active DB Rows</p>
                    <div className="text-3xl font-black text-teal-500 flex items-baseline">
                      <span>{telemetry.db_rows}</span>
                      <span className="text-xs font-semibold text-slate-500 ml-0.5">rows</span>
                    </div>
                    <div className="flex items-center space-x-2 text-[10px] font-bold text-slate-500">
                      <span className="flex items-center gap-0.5">
                        <Database className="w-3 h-3" /> SQLITE
                      </span>
                      <span>•</span>
                      <span className={telemetry.redis_status === 'HEALTHY' ? 'text-emerald-500' : 'text-rose-500'}>
                        REDIS: {telemetry.redis_status}
                      </span>
                    </div>
                  </div>
                </div>
              ) : null}
            </div>

            {/* Simulated SMTP Logs console */}
            <div className="bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center space-x-2">
                  <Terminal className="w-4 h-4 text-emerald-500" />
                  <span>Outbound SMTP Email Dispatch Console (Developer Sandbox)</span>
                </h3>
                <span className="text-[10px] uppercase bg-emerald-500/10 text-emerald-500 px-2 py-0.5 rounded border border-emerald-500/20 font-extrabold tracking-wider">
                  Live Dispatch Logger
                </span>
              </div>

              <div className="bg-slate-950 rounded-2xl p-4 border border-slate-850 font-mono text-[11px] text-slate-300 space-y-3.5 max-h-72 overflow-y-auto">
                {smtpLogs.length === 0 ? (
                  <p className="text-slate-500 italic">Console initialized. No transactional emails have been triggered yet. Create appointments or resolve leaves to see SMTP events.</p>
                ) : (
                  smtpLogs.map((log, idx) => (
                    <div key={idx} className="space-y-1 pb-3 border-b border-slate-900/80 last:border-b-0">
                      <div className="flex items-center justify-between text-[10px] text-slate-500">
                        <span>[{log.timestamp}] - Action Code: SMTP_{log.status}</span>
                        <span className="text-emerald-400 font-bold">Status: {log.status}</span>
                      </div>
                      <p className="text-teal-400 font-semibold">To: &lt;{log.to}&gt; | Subject: "{log.subject}"</p>
                      <p className="text-slate-400 text-[10px]">Template: {log.template} | Preview: {log.preview}</p>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Database Purge / Reset Section */}
            <div className="bg-rose-500/5 border border-rose-500/20 rounded-2xl p-6 space-y-4 shadow-sm flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <h3 className="text-sm font-bold text-rose-700 dark:text-rose-450 flex items-center space-x-2">
                  <ShieldAlert className="w-5 h-5" />
                  <span>Developer Sandbox Reset & Re-Seed</span>
                </h3>
                <p className="text-xs text-slate-500 mt-1 max-w-xl">
                  Easily reset the database to a clean, known seeded state containing default doctor profiles (Dr. Smith, Dr. Patel, Dr. Chen) and patient accounts to restart evaluations cleanly.
                </p>
              </div>
              <button
                onClick={handleResetDb}
                disabled={isResettingDb}
                className="px-5 py-3 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-xl text-xs flex items-center justify-center space-x-2 shrink-0 transition shadow-lg shadow-rose-600/10 disabled:opacity-50"
              >
                {isResettingDb ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Resetting system...</span>
                  </>
                ) : (
                  <>
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Purge & Re-Seed Database</span>
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    </Layout>
  )
}
