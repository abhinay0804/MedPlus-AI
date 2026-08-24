import React, { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { ThemeToggle } from './ThemeProvider'
import { NotificationBell } from './NotificationBell'
import {
  Activity,
  Calendar,
  LogOut,
  Menu,
  X,
  Stethoscope,
  Users,
  Settings as SettingsIcon,
  ShieldCheck,
  CalendarDays,
  ClipboardList,
} from 'lucide-react'

export const Layout: React.FC<{ children: React.ReactNode; activeTab?: string }> = ({ children, activeTab }) => {
  const { user, logout } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const [mobileOpen, setMobileOpen] = useState(false)

  const handleLogout = () => {
    logout()
    navigate('/login', { replace: true })
  }

  const patientLinks = [
    { to: '/patient/dashboard', label: 'Dashboard', icon: Activity },
    { to: '/patient/doctors', label: 'Find Doctors', icon: Stethoscope },
    { to: '/patient/appointments', label: 'My Appointments', icon: Calendar },
    { to: '/patient/settings', label: 'Account Settings', icon: SettingsIcon },
  ]

  const doctorLinks = [
    { to: '/doctor/dashboard', label: 'Consultation Schedule', icon: Calendar },
    { to: '/doctor/analytics', label: 'Practice Analytics', icon: Activity },
    { to: '/doctor/settings', label: 'Profile & Hours', icon: SettingsIcon },
  ]

  const adminLinks = [
    { to: '/admin/dashboard', label: 'Overview', icon: Activity },
    { to: '/admin/doctors', label: 'Doctor Management', icon: Users },
    { to: '/admin/appointments', label: 'Appointments Center', icon: ClipboardList },
    { to: '/admin/leave', label: 'Leave Manager', icon: CalendarDays },
    { to: '/admin/patients', label: 'Patient Registry', icon: Users },
    { to: '/admin/audit', label: 'Audit Trail', icon: ShieldCheck },
  ]

  let links = patientLinks
  if (user?.role === 'DOCTOR') links = doctorLinks
  if (user?.role === 'ADMIN') links = adminLinks

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col md:flex-row text-slate-900 dark:text-slate-100 transition-colors">
      {/* Mobile Top Nav */}
      <div className="md:hidden bg-white dark:bg-slate-900 text-slate-900 dark:text-white p-4 flex items-center justify-between sticky top-0 z-50 border-b border-slate-200 dark:border-slate-800">
        <div className="flex items-center space-x-2">
          <div className="w-8 h-8 rounded-lg bg-teal-500 flex items-center justify-center font-bold text-white shadow-md">
            <Activity className="w-5 h-5" />
          </div>
          <span className="font-bold text-lg text-teal-600 dark:text-teal-400">MedPulse AI</span>
        </div>
        <div className="flex items-center space-x-2">
          <NotificationBell />
          <ThemeToggle />
          <button onClick={() => setMobileOpen(!mobileOpen)} className="p-2 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white">
            {mobileOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>
      </div>

      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-40 w-64 bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 transform transition-transform duration-300 ease-in-out md:static md:translate-x-0 flex flex-col shadow-sm ${
          mobileOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="p-6 flex items-center justify-between border-b border-slate-200 dark:border-slate-800">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-teal-500 to-emerald-400 flex items-center justify-center text-white shadow-lg shadow-teal-500/20">
              <Activity className="w-6 h-6" />
            </div>
            <div>
              <h1 className="font-bold text-slate-900 dark:text-white text-lg tracking-tight">MedPulse AI</h1>
              <p className="text-[11px] text-teal-600 dark:text-teal-400 font-semibold">Smart Triage & Bookings</p>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            <NotificationBell />
            <ThemeToggle />
          </div>
        </div>

        {/* User Info Card */}
        {user && (
          <div className="mx-4 mt-6 p-3.5 bg-slate-100 dark:bg-slate-800/80 rounded-xl border border-slate-200 dark:border-slate-700/50 flex items-center space-x-3">
            <div className="w-10 h-10 rounded-full bg-teal-500/20 text-teal-600 dark:text-teal-300 flex items-center justify-center font-semibold text-sm border border-teal-500/30">
              {user.full_name.charAt(0).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-slate-900 dark:text-white truncate">{user.full_name}</p>
              <span className="inline-block px-2 py-0.5 text-[10px] font-bold rounded-full bg-teal-500/20 text-teal-600 dark:text-teal-300 border border-teal-500/30">
                {user.role}
              </span>
            </div>
          </div>
        )}

        {/* Navigation */}
        <nav className="flex-1 p-4 space-y-1.5 mt-4">
          {links.map((link) => {
            const Icon = link.icon
            const active = location.pathname === link.to || (activeTab && link.to.includes(activeTab))
            return (
              <Link
                key={link.to}
                to={link.to}
                onClick={() => setMobileOpen(false)}
                className={`flex items-center space-x-3 px-4 py-3 rounded-xl font-medium text-sm transition-all duration-200 ${
                  active
                    ? 'bg-teal-500 text-white shadow-lg shadow-teal-500/25 font-semibold'
                    : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                <Icon className={`w-5 h-5 ${active ? 'text-white' : 'text-slate-500 dark:text-slate-400'}`} />
                <span>{link.label}</span>
              </Link>
            )
          })}
        </nav>

        {/* Logout Footer */}
        <div className="p-4 border-t border-slate-200 dark:border-slate-800">
          <button
            onClick={handleLogout}
            className="w-full flex items-center justify-center space-x-2 px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-slate-800/80 hover:border-rose-300 dark:hover:border-rose-500/30 text-sm font-medium transition-all cursor-pointer"
          >
            <LogOut className="w-4 h-4" />
            <span>Sign Out</span>
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 p-4 sm:p-6 md:p-8 overflow-y-auto max-w-7xl mx-auto w-full">
        {children}
      </main>
    </div>
  )
}
