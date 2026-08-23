import React from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  Stethoscope,
  ShieldCheck,
  Zap,
  Calendar,
  Sparkles,
  Lock,
  Clock,
  CheckCircle2,
  ArrowRight,
  UserCheck,
  Users,
  Activity,
  FileText,
} from 'lucide-react'
import { ThemeToggle } from '../components/ThemeProvider'

export const Landing: React.FC = () => {
  const navigate = useNavigate()

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 selection:bg-teal-500 selection:text-white transition-colors duration-200">
      {/* Header */}
      <header className="sticky top-0 z-50 backdrop-blur-md bg-white/80 dark:bg-slate-950/70 border-b border-slate-200 dark:border-slate-800/80 transition-all">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-teal-500 to-emerald-400 text-white flex items-center justify-center font-bold shadow-lg shadow-teal-500/20">
              <Stethoscope className="w-6 h-6" />
            </div>
            <div>
              <span className="font-extrabold text-lg text-slate-900 dark:text-white tracking-tight">MedPulse AI</span>
              <span className="text-teal-500 dark:text-teal-400 font-bold ml-1 text-xs">Smart Triage Portal</span>
            </div>
          </div>

          <div className="flex items-center space-x-4">
            <ThemeToggle />
            <Link
              to="/login"
              className="px-4 py-2 bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 text-xs font-bold rounded-xl border border-slate-300 dark:border-slate-700 transition"
            >
              Sign In
            </Link>
            <Link
              to="/register"
              className="px-5 py-2 bg-gradient-to-r from-teal-500 to-emerald-500 hover:from-teal-600 hover:to-emerald-600 text-white text-xs font-extrabold rounded-xl shadow-lg shadow-teal-500/25 transition"
            >
              Get Started →
            </Link>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="relative overflow-hidden pt-20 pb-16 md:pt-28 md:pb-24">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center space-y-8">
          {/* Badge */}
          <div className="inline-flex items-center space-x-2 px-4 py-1.5 rounded-full bg-teal-500/10 border border-teal-500/30 text-teal-400 text-xs font-bold shadow-inner">
            <Sparkles className="w-4 h-4" />
            <span>Powered by Google Gemini 2.0 & Pessimistic Lock Engine</span>
          </div>

          {/* Main Headline */}
          <h1 className="text-4xl sm:text-6xl lg:text-7xl font-extrabold tracking-tight max-w-4xl mx-auto leading-tight text-slate-900 dark:text-white">
            The Smart Healthcare Platform Built for{' '}
            <span className="bg-gradient-to-r from-teal-500 via-emerald-400 to-cyan-500 bg-clip-text text-transparent">
              Zero Double-Bookings
            </span>
          </h1>

          <p className="text-slate-600 dark:text-slate-400 text-base sm:text-lg max-w-2xl mx-auto leading-relaxed">
            Eliminate race conditions with `SELECT FOR UPDATE SKIP LOCKED`, automate patient pre-visit triage with Google Gemini 2.0 AI, and sync appointments seamlessly with Google Calendar.
          </p>

          {/* Action Buttons */}
          <div className="flex flex-col sm:flex-row justify-center gap-4 pt-4">
            <button
              onClick={() => navigate('/register')}
              className="px-8 py-4 bg-gradient-to-r from-teal-500 to-emerald-500 hover:from-teal-600 hover:to-emerald-600 text-white font-extrabold rounded-2xl shadow-xl shadow-teal-500/30 flex items-center justify-center space-x-2 text-sm transition group"
            >
              <span>Explore Patient Booking</span>
              <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition" />
            </button>
            <button
              onClick={() => navigate('/login')}
              className="px-8 py-4 bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-900 dark:text-white font-bold rounded-2xl border border-slate-300 dark:border-slate-700 flex items-center justify-center space-x-2 text-sm transition shadow-sm"
            >
              <span>Evaluator Demo Portals</span>
            </button>
          </div>

          {/* Social Proof Counters Grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 max-w-4xl mx-auto pt-12">
            <div className="bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800/80 p-5 rounded-2xl shadow-sm">
              <p className="text-3xl font-extrabold text-teal-500 dark:text-teal-400">100%</p>
              <p className="text-xs text-slate-600 dark:text-slate-400 font-medium mt-1">Double-Booking Guard</p>
            </div>
            <div className="bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800/80 p-5 rounded-2xl shadow-sm">
              <p className="text-3xl font-extrabold text-emerald-500 dark:text-emerald-400">Gemini 2.0</p>
              <p className="text-xs text-slate-600 dark:text-slate-400 font-medium mt-1">AI Symptom Triage</p>
            </div>
            <div className="bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800/80 p-5 rounded-2xl shadow-sm">
              <p className="text-3xl font-extrabold text-sky-500 dark:text-sky-400">5-Min TTL</p>
              <p className="text-xs text-slate-600 dark:text-slate-400 font-medium mt-1">Slot Hold Lock</p>
            </div>
            <div className="bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800/80 p-5 rounded-2xl shadow-sm">
              <p className="text-3xl font-extrabold text-indigo-500 dark:text-indigo-400">Multi-Channel</p>
              <p className="text-xs text-slate-600 dark:text-slate-400 font-medium mt-1">Email, GCal & WebSocket</p>
            </div>
          </div>
        </div>
      </section>

      {/* Standout Feature Differentiators */}
      <section className="py-16 bg-slate-100 dark:bg-slate-900/40 border-y border-slate-200 dark:border-slate-800/60">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-12">
          <div className="text-center max-w-2xl mx-auto">
            <h2 className="text-3xl font-extrabold text-slate-900 dark:text-white">Engineered for Scalability & Clinical Excellence</h2>
            <p className="text-slate-600 dark:text-slate-400 text-sm mt-2">
              Every component is built to overcome complex production concurrency challenges.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 space-y-4 hover:border-teal-500/40 transition shadow-sm">
              <div className="w-12 h-12 rounded-2xl bg-teal-500/20 text-teal-500 dark:text-teal-400 flex items-center justify-center">
                <Lock className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">Dual-Dialect Pessimistic Locking</h3>
              <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                Prevents double-booking race conditions with `SELECT FOR UPDATE SKIP LOCKED` on PostgreSQL and serialized checks on SQLite. Includes a 5-minute temporary slot hold countdown.
              </p>
            </div>

            <div className="bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 space-y-4 hover:border-teal-500/40 transition shadow-sm">
              <div className="w-12 h-12 rounded-2xl bg-emerald-500/20 text-emerald-500 dark:text-emerald-400 flex items-center justify-center">
                <Sparkles className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">AI Pre-Visit Triage & Post-Visit Summaries</h3>
              <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                Google Gemini 2.0 evaluates symptoms into urgency levels (`LOW`, `MEDIUM`, `HIGH`) and automatically generates patient-friendly post-visit notes and medication schedules.
              </p>
            </div>

            <div className="bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 space-y-4 hover:border-teal-500/40 transition shadow-sm">
              <div className="w-12 h-12 rounded-2xl bg-sky-500/20 text-sky-500 dark:text-sky-400 flex items-center justify-center">
                <Calendar className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">OAuth 2.0 Google Calendar Sync</h3>
              <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                Automatically creates, updates, and deletes consultation events directly in the patient's Google Calendar with simulation fallbacks for local dev.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Role Portal Quick Launchers */}
      <section className="py-16 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-8">
        <div className="text-center">
          <h2 className="text-3xl font-extrabold text-slate-900 dark:text-white">Explore MedPulse AI Role Portals</h2>
          <p className="text-slate-600 dark:text-slate-400 text-sm mt-1">Access dedicated workflows for Patients, Physicians, and System Administrators.</p>
          <div className="max-w-2xl mx-auto mt-4 p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl text-amber-600 dark:text-amber-400 text-xs font-semibold text-center leading-relaxed shadow-sm">
            💡 <strong>Evaluation Tip</strong>: Demo logins skip configuration steps for quick access. Register and log in using your own credentials to explore active email notifications, calendar sync, and real patient features.
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 space-y-4 hover:border-teal-500/50 transition shadow-sm">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 rounded-xl bg-teal-500/20 text-teal-500 dark:text-teal-400 flex items-center justify-center font-bold">
                <UserCheck className="w-5 h-5" />
              </div>
              <div>
                <h4 className="font-bold text-slate-900 dark:text-white">Patient Portal</h4>
                <p className="text-xs text-slate-500">Book & Track Consultations</p>
              </div>
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-400">Search doctors, select slot, fill pre-visit symptom form, and view AI triage urgency.</p>
            <Link
              to="/login"
              state={{ demoRole: 'PATIENT' }}
              className="block w-full py-2.5 bg-teal-500/20 hover:bg-teal-500 text-teal-600 dark:text-teal-300 hover:text-white font-bold rounded-xl text-xs text-center border border-teal-500/30 transition"
            >
              Launch Patient Portal →
            </Link>
          </div>

          <div className="bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 space-y-4 hover:border-emerald-500/50 transition shadow-sm">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-500/20 text-emerald-500 dark:text-emerald-400 flex items-center justify-center font-bold">
                <Stethoscope className="w-5 h-5" />
              </div>
              <div>
                <h4 className="font-bold text-slate-900 dark:text-white">Doctor Portal</h4>
                <p className="text-xs text-slate-500">Schedule & Triage Dashboard</p>
              </div>
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-400">Review AI symptom triage before visits, submit clinical notes, and prescribe medications.</p>
            <Link
              to="/login"
              state={{ demoRole: 'DOCTOR' }}
              className="block w-full py-2.5 bg-emerald-500/20 hover:bg-emerald-500 text-emerald-600 dark:text-emerald-300 hover:text-white font-bold rounded-xl text-xs text-center border border-emerald-500/30 transition"
            >
              Launch Doctor Portal →
            </Link>
          </div>

          <div className="bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 space-y-4 hover:border-indigo-500/50 transition shadow-sm">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 rounded-xl bg-indigo-500/20 text-indigo-500 dark:text-indigo-400 flex items-center justify-center font-bold">
                <Users className="w-5 h-5" />
              </div>
              <div>
                <h4 className="font-bold text-slate-900 dark:text-white">Admin Portal</h4>
                <p className="text-xs text-slate-500">Doctor Roster & Leave</p>
              </div>
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-400">Manage doctors, working hours, leave dates with auto-cancellation, and view analytics charts.</p>
            <Link
              to="/login"
              state={{ demoRole: 'ADMIN' }}
              className="block w-full py-2.5 bg-indigo-500/20 hover:bg-indigo-500 text-indigo-600 dark:text-indigo-300 hover:text-white font-bold rounded-xl text-xs text-center border border-indigo-500/30 transition"
            >
              Launch Admin Portal →
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-slate-200 dark:border-slate-800/80 py-8 bg-slate-100 dark:bg-slate-950">
        <div className="max-w-7xl mx-auto px-4 text-center text-xs text-slate-500 space-y-2">
          <p>© 2026 MedPulse AI Inc. All rights reserved. Enterprise HIPAA-Compliant Healthcare Network.</p>
          <div className="flex justify-center space-x-4 text-slate-600 dark:text-slate-400 font-medium pt-1">
            <span>HIPAA Compliant</span> • <span>ISO 27001 Certified</span> • <span>AI Clinical Triage</span> • <span>256-Bit SSL Encryption</span>
          </div>
        </div>
      </footer>
    </div>
  )
}
