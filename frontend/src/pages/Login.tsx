import React, { useEffect, useState } from 'react'
import { Link, useNavigate, useLocation, useSearchParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { isValidEmail } from '../lib/utils'
import { Activity, Lock, Mail, ArrowRight, ShieldCheck, AlertCircle, Eye, EyeOff } from 'lucide-react'

import { ThemeToggle } from '../components/ThemeProvider'

import { ForgotPasswordModal } from '../components/ForgotPasswordModal'

export const Login: React.FC = () => {
  const { login } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [searchParams, setSearchParams] = useSearchParams()

  const demoRole = location.state?.demoRole || searchParams.get('demo')

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [isForgotPasswordOpen, setIsForgotPasswordOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [loginType, setLoginType] = useState<'patient' | 'staff'>('patient')

  // Check for expired session flag in sessionStorage cleanly
  useEffect(() => {
    const expiredFlag = sessionStorage.getItem('session_expired')
    if (expiredFlag === 'true' || location.state?.expired) {
      setError('Your session has expired due to inactivity. Please log in again.')
      sessionStorage.removeItem('session_expired')
    }
    // Clean URL bar if query parameters exist
    if (searchParams.has('expired') || searchParams.has('demo')) {
      navigate('/login', { replace: true, state: location.state })
    }
  }, [])

  const isEmailValid = isValidEmail(email)
  const isPasswordAllowed = isEmailValid || password.length > 0

  const handleLogin = async (loginEmail: string, loginPass: string) => {
    setError(null)
    setIsSubmitting(true)

    try {
      const user = await login({ email: loginEmail, password: loginPass })
      if (user.role === 'ADMIN') navigate('/admin/dashboard')
      else if (user.role === 'DOCTOR') navigate('/doctor/dashboard')
      else navigate('/patient/dashboard')
    } catch (err: any) {
      setError(err.message || 'Invalid credentials')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!isEmailValid) {
      setError('Please enter a valid email address (e.g. name@example.com).')
      return
    }
    handleLogin(email, password)
  }

  // Quick Demo Logins for fast evaluation (fills and auto-logs in instantly)
  const fillDemo = (demoEmail: string, demoPass: string) => {
    setEmail(demoEmail)
    setPassword(demoPass)
    handleLogin(demoEmail, demoPass)
  }

  // Auto-login if user clicked a Quick Evaluator launcher from Landing Page
  useEffect(() => {
    if (demoRole === 'PATIENT') {
      fillDemo('patient@healthcare.com', 'PatientPassword123!')
    } else if (demoRole === 'DOCTOR') {
      fillDemo('dr.smith@healthcare.com', 'DoctorPassword123!')
    } else if (demoRole === 'ADMIN') {
      fillDemo('admin@healthcare.com', 'AdminPassword123!')
    }
  }, [demoRole])

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex items-center justify-center p-4 relative overflow-hidden transition-colors duration-200">
      <div className="absolute top-4 right-4 z-20">
        <ThemeToggle />
      </div>

      {/* Dynamic Background Effects */}
      <div className="absolute -top-40 -left-40 w-96 h-96 bg-teal-500/20 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-40 -right-40 w-96 h-96 bg-emerald-500/20 rounded-full blur-3xl pointer-events-none" />

      <div className="w-full max-w-md bg-white dark:bg-slate-800/90 border border-slate-200 dark:border-slate-700/80 rounded-2xl shadow-2xl backdrop-blur-xl p-8 z-10">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="w-14 h-14 bg-gradient-to-tr from-teal-500 to-emerald-400 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg shadow-teal-500/30">
            <Activity className="w-8 h-8 text-white" />
          </div>
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight">Welcome Back</h2>
          <p className="text-slate-600 dark:text-slate-400 text-sm mt-1">Sign in to MedPulse AI — Smart Healthcare Portal</p>
        </div>

        {/* Tab Selection */}
        <div className="flex bg-slate-100 dark:bg-slate-900 p-1.5 rounded-xl mb-6">
          <button
            type="button"
            onClick={() => {
              setLoginType('patient')
              setEmail('')
              setPassword('')
              setError(null)
            }}
            className={`flex-1 py-2 text-xs font-bold rounded-lg transition ${
              loginType === 'patient'
                ? 'bg-white dark:bg-slate-800 text-teal-600 dark:text-teal-400 shadow-sm'
                : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
            }`}
          >
            Patient Portal
          </button>
          <button
            type="button"
            onClick={() => {
              setLoginType('staff')
              setEmail('')
              setPassword('')
              setError(null)
            }}
            className={`flex-1 py-2 text-xs font-bold rounded-lg transition ${
              loginType === 'staff'
                ? 'bg-white dark:bg-slate-800 text-teal-600 dark:text-teal-400 shadow-sm'
                : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
            }`}
          >
            Staff Portal
          </button>
        </div>

        {loginType === 'staff' && (
          <div className="mb-6 p-4 rounded-xl bg-teal-500/10 border border-teal-500/20 text-teal-700 dark:text-teal-300 text-xs text-center font-semibold">
            Staff access is restricted. Credentials are provided upon administrative onboarding.
          </div>
        )}

        {error && (
          <div className="mb-6 p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 flex items-start space-x-3 text-rose-600 dark:text-rose-300 text-sm">
            <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-2">
              Email Address
            </label>
            <div className="relative">
              <Mail className="w-5 h-5 absolute left-3.5 top-3.5 text-slate-400 dark:text-slate-500" />
              <input
                type="email"
                name="email"
                autoComplete="username"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@example.com"
                className="w-full pl-11 pr-4 py-3 bg-slate-50 dark:bg-slate-900/60 border border-slate-300 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:border-teal-500 text-sm transition"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-2 flex justify-between items-center">
              <span>Password</span>
              <button
                type="button"
                onClick={() => setIsForgotPasswordOpen(true)}
                className="text-[11px] text-teal-600 dark:text-teal-400 font-semibold hover:underline lowercase tracking-normal cursor-pointer"
              >
                Forgot Password?
              </button>
            </label>
            <div className="relative">
              <Lock className="w-5 h-5 absolute left-3.5 top-3.5 text-slate-400 dark:text-slate-500" />
              <input
                type={showPassword ? 'text' : 'password'}
                name="password"
                autoComplete="current-password"
                required
                disabled={!isPasswordAllowed}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={isPasswordAllowed ? "••••••••" : "Enter valid email first..."}
                className={`w-full pl-11 pr-11 py-3 border rounded-xl text-sm transition ${
                  !isPasswordAllowed
                    ? 'bg-slate-100 dark:bg-slate-900/30 border-slate-200 dark:border-slate-800 text-slate-400 dark:text-slate-500 cursor-not-allowed opacity-50'
                    : 'bg-slate-50 dark:bg-slate-900/60 border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:border-teal-500'
                }`}
              />
              <button
                type="button"
                disabled={!isPasswordAllowed}
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3.5 top-3.5 text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 transition cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
                title={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full py-3.5 px-4 bg-gradient-to-r from-teal-500 to-emerald-500 hover:from-teal-600 hover:to-emerald-600 text-white font-semibold rounded-xl shadow-lg shadow-teal-500/25 flex items-center justify-center space-x-2 transition-all disabled:opacity-50"
          >
            {isSubmitting ? (
              <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <>
                <span>Sign In</span>
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </form>

        {/* Demo Login Shortcuts */}
        <div className="mt-8 pt-6 border-t border-slate-200 dark:border-slate-700/60">
          <p className="text-xs text-slate-500 dark:text-slate-400 font-semibold text-center mb-3 uppercase tracking-wider">
            Quick Demo Accelerators
          </p>
          <p className="text-[10px] text-slate-500 dark:text-slate-400 text-center mb-3 leading-normal font-semibold">
            Note: Register a new account to test live email notifications and calendar features.
          </p>
          <div className="grid grid-cols-3 gap-2">
            <button
              onClick={() => fillDemo('admin@healthcare.com', 'AdminPassword123!')}
              className="px-2.5 py-1.5 bg-slate-100 dark:bg-slate-700/60 hover:bg-slate-200 dark:hover:bg-slate-700 text-xs font-medium text-slate-700 dark:text-slate-300 rounded-lg border border-slate-300 dark:border-slate-600/50 transition text-center"
            >
              Admin Demo
            </button>
            <button
              onClick={() => fillDemo('dr.smith@healthcare.com', 'DoctorPassword123!')}
              className="px-2.5 py-1.5 bg-slate-100 dark:bg-slate-700/60 hover:bg-slate-200 dark:hover:bg-slate-700 text-xs font-medium text-slate-700 dark:text-slate-300 rounded-lg border border-slate-300 dark:border-slate-600/50 transition text-center"
            >
              Doctor Demo
            </button>
            <button
              onClick={() => fillDemo('patient@healthcare.com', 'PatientPassword123!')}
              className="px-2.5 py-1.5 bg-slate-100 dark:bg-slate-700/60 hover:bg-slate-200 dark:hover:bg-slate-700 text-xs font-medium text-slate-700 dark:text-slate-300 rounded-lg border border-slate-300 dark:border-slate-600/50 transition text-center"
            >
              Patient Demo
            </button>
          </div>
        </div>

        {loginType === 'patient' && (
          <p className="mt-6 text-center text-xs text-slate-600 dark:text-slate-400">
            Don't have an account?{' '}
            <Link to="/register" className="text-teal-600 dark:text-teal-400 font-semibold hover:underline">
              Register here
            </Link>
          </p>
        )}
      </div>

      <ForgotPasswordModal
        isOpen={isForgotPasswordOpen}
        onClose={() => setIsForgotPasswordOpen(false)}
      />
    </div>
  )
}
