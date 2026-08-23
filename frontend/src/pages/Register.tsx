import React, { useState, useEffect } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { api } from '../lib/api'
import { isValidEmail } from '../lib/utils'
import { Activity, Lock, Mail, User as UserIcon, ArrowRight, AlertCircle, Eye, EyeOff, CheckCircle2, X, Pencil, RotateCw, Check, ClipboardPaste } from 'lucide-react'
import { CountryPhoneInput, COUNTRIES, Country } from '../components/CountryPhoneInput'
import { PasswordStrengthChecklist, isPasswordStrong } from '../components/PasswordStrengthChecklist'
import { ThemeToggle } from '../components/ThemeProvider'

export const Register: React.FC = () => {
  const { register } = useAuth()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()

  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [selectedCountry, setSelectedCountry] = useState<Country>(COUNTRIES[0]) // Default India (+91)
  const [nationalPhone, setNationalPhone] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  // OTP Modal State
  const [isOtpModalOpen, setIsOtpModalOpen] = useState(false)
  const [otpCode, setOtpCode] = useState('')

  // Auto-fill OTP from email deep link button
  useEffect(() => {
    const urlOtp = searchParams.get('otp')
    if (urlOtp && urlOtp.length === 6) {
      setOtpCode(urlOtp)
      setIsOtpModalOpen(true)
    }
  }, [searchParams])
  const [isSendingOtp, setIsSendingOtp] = useState(false)
  const [resendCooldown, setResendCooldown] = useState(0)
  const [simulatedOtp, setSimulatedOtp] = useState<string | null>(null)

  // Modal Email Editing State
  const [isEditingEmail, setIsEditingEmail] = useState(false)
  const [editedEmail, setEditedEmail] = useState('')

  // Form Validation Criteria
  const isNameValid = fullName.trim().length >= 2
  const isEmailValid = isValidEmail(email)
  const isPhoneValid = nationalPhone.length === 10
  const isPasswordValid = isPasswordStrong(password)

  const isFormValid = isNameValid && isEmailValid && isPhoneValid && isPasswordValid

  // Resend Cooldown Timer Effect
  useEffect(() => {
    if (resendCooldown <= 0) return
    const timer = setInterval(() => {
      setResendCooldown((prev) => prev - 1)
    }, 1000)
    return () => clearInterval(timer)
  }, [resendCooldown])

  // Dispatch OTP API helper
  const sendOtpRequest = async (targetEmail: string) => {
    setIsSendingOtp(true)
    setError(null)
    try {
      const res = await api.post<{ message: string; simulation?: boolean; simulated_otp?: string }>(
        '/auth/send-otp',
        {
          email: targetEmail,
          full_name: fullName,
          purpose: 'Registration',
        }
      )
      if (res.simulation && res.simulated_otp) {
        setSimulatedOtp(res.simulated_otp)
      } else {
        setSimulatedOtp(null)
      }
      setResendCooldown(30)
      return true
    } catch (err: any) {
      setError(err.message || 'Failed to dispatch email OTP. Please try again.')
      return false
    } finally {
      setIsSendingOtp(false)
    }
  }

  // Handle Initial Submit -> Send OTP Email & open OTP Verification Modal
  const handleInitiateRegister = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (!isFormValid) {
      setError('Please fill in all required fields with valid values before registering.')
      return
    }

    const success = await sendOtpRequest(email)
    if (success) {
      setEditedEmail(email)
      setIsOtpModalOpen(true)
    }
  }

  // Resend OTP Click Handler (guarantees new distinct code & invalidates old OTP)
  const handleResendOtp = async () => {
    if (resendCooldown > 0 || isSendingOtp) return
    setOtpCode('')
    await sendOtpRequest(email)
  }

  // Save Edited Email in Modal -> updates email and dispatches fresh OTP to new email
  const handleSaveEditedEmail = async () => {
    if (!isValidEmail(editedEmail)) {
      setError('Please enter a valid email address.')
      return
    }
    setEmail(editedEmail)
    setIsEditingEmail(false)
    setOtpCode('')
    await sendOtpRequest(editedEmail)
  }

  // Final Submit -> Verify OTP & Complete Account Registration
  const handleVerifyOtpAndRegister = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (otpCode.length !== 6) {
      setError('Please enter a valid 6-digit OTP code.')
      return
    }

    const fullPhone = `${selectedCountry.dialCode}${nationalPhone}`
    setIsSubmitting(true)

    try {
      await register({
        full_name: fullName,
        email,
        password,
        phone: fullPhone,
        country: selectedCountry.name,
        otp_code: otpCode,
        role: 'PATIENT',
      })
      navigate('/patient/dashboard')
    } catch (err: any) {
      setError(err.message || 'Invalid or expired OTP verification code. Please click "Resend OTP" to generate a new code.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex items-center justify-center p-4 relative overflow-hidden transition-colors duration-200">
      <div className="absolute top-4 right-4 z-20">
        <ThemeToggle />
      </div>

      <div className="absolute -top-40 -right-40 w-96 h-96 bg-teal-500/20 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-40 -left-40 w-96 h-96 bg-emerald-500/20 rounded-full blur-3xl pointer-events-none" />

      <div className="w-full max-w-md bg-white dark:bg-slate-800/90 border border-slate-200 dark:border-slate-700/80 rounded-2xl shadow-2xl backdrop-blur-xl p-8 z-10">
        <div className="text-center mb-8">
          <div className="w-14 h-14 bg-gradient-to-tr from-teal-500 to-emerald-400 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg shadow-teal-500/30">
            <Activity className="w-8 h-8 text-white" />
          </div>
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight">Create Patient Account</h2>
          <p className="text-slate-600 dark:text-slate-400 text-sm mt-1">Join MedPulse AI for seamless medical bookings</p>
        </div>

        {error && !isOtpModalOpen && (
          <div className="mb-6 p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 flex items-start space-x-3 text-rose-600 dark:text-rose-300 text-sm">
            <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleInitiateRegister} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1.5 flex justify-between items-center">
              <span>Full Name</span>
              {!isNameValid && fullName.length > 0 && (
                <span className="text-[10px] text-amber-600 dark:text-amber-400 font-normal lowercase">(min 2 characters)</span>
              )}
            </label>
            <div className="relative">
              <UserIcon className="w-5 h-5 absolute left-3.5 top-3.5 text-slate-400 dark:text-slate-500" />
              <input
                type="text"
                required
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="John Doe"
                className="w-full pl-11 pr-4 py-3 bg-slate-50 dark:bg-slate-900/60 border border-slate-300 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:border-teal-500 text-sm transition"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1.5 flex justify-between items-center">
              <span>Email Address</span>
              {!isEmailValid && email.length > 0 && (
                <span className="text-[10px] text-amber-600 dark:text-amber-400 font-normal lowercase">(enter valid email)</span>
              )}
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
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1.5 flex justify-between items-center">
              <span>Mobile Number & Country</span>
              {!isPhoneValid && nationalPhone.length > 0 && (
                <span className="text-[10px] text-amber-600 dark:text-amber-400 font-normal lowercase">(must be 10 digits)</span>
              )}
            </label>
            <CountryPhoneInput
              selectedCountry={selectedCountry}
              onCountryChange={setSelectedCountry}
              nationalNumber={nationalPhone}
              onNationalNumberChange={setNationalPhone}
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1.5">
              Strong Password
            </label>
            <div className="relative">
              <Lock className="w-5 h-5 absolute left-3.5 top-3.5 text-slate-400 dark:text-slate-500" />
              <input
                type={showPassword ? 'text' : 'password'}
                name="password"
                autoComplete="new-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full pl-11 pr-11 py-3 bg-slate-50 dark:bg-slate-900/60 border border-slate-300 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:border-teal-500 text-sm transition"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3.5 top-3.5 text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 transition cursor-pointer"
                title={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
              </button>
            </div>

            <PasswordStrengthChecklist password={password} />
          </div>

          {/* Form Disabled Tooltip Banner */}
          {!isFormValid && (
            <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl text-xs text-amber-700 dark:text-amber-300 flex items-start space-x-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-amber-500" />
              <span>Please complete all fields with valid details (name, email, 10-digit mobile, and strong password) to enable registration.</span>
            </div>
          )}

          <button
            type="submit"
            disabled={!isFormValid || isSendingOtp}
            className="w-full py-3.5 px-4 bg-gradient-to-r from-teal-500 to-emerald-500 hover:from-teal-600 hover:to-emerald-600 text-white font-semibold rounded-xl shadow-lg shadow-teal-500/25 flex items-center justify-center space-x-2 transition-all disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer mt-6"
            title={!isFormValid ? "Form contains invalid or incomplete fields" : "Click to send Email Verification OTP"}
          >
            {isSendingOtp ? (
              <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <>
                <span>Register Patient Account</span>
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </form>

        <p className="mt-6 text-center text-xs text-slate-600 dark:text-slate-400">
          Already registered?{' '}
          <Link to="/login" className="text-teal-600 dark:text-teal-400 font-semibold hover:underline">
            Sign in here
          </Link>
        </p>
      </div>

      {/* EMAIL OTP VERIFICATION MODAL */}
      {isOtpModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in">
          <div className="w-full max-w-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl p-6 relative">
            <button
              onClick={() => setIsOtpModalOpen(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center space-x-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-teal-500/20 text-teal-600 dark:text-teal-400 flex items-center justify-center font-bold shrink-0">
                <Mail className="w-5 h-5" />
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="text-lg font-bold text-slate-900 dark:text-white">Verify Your Email Address</h3>
                
                {/* Editable Email Row */}
                {isEditingEmail ? (
                  <div className="flex items-center space-x-2 mt-1">
                    <input
                      type="email"
                      value={editedEmail}
                      onChange={(e) => setEditedEmail(e.target.value)}
                      className="px-2 py-1 bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded text-xs text-slate-900 dark:text-white focus:outline-none focus:border-teal-500 w-full"
                    />
                    <button
                      onClick={handleSaveEditedEmail}
                      className="p-1 bg-teal-500 text-white rounded hover:bg-teal-600 cursor-pointer shrink-0"
                      title="Save & Send OTP to New Email"
                    >
                      <Check className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => setIsEditingEmail(false)}
                      className="p-1 bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 rounded cursor-pointer shrink-0"
                      title="Cancel"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center space-x-1.5 text-xs text-slate-500 mt-0.5">
                    <span>Code sent to <span className="font-semibold text-slate-800 dark:text-slate-200 truncate inline-block max-w-[180px] align-bottom">{email}</span></span>
                    <button
                      onClick={() => {
                        setEditedEmail(email)
                        setIsEditingEmail(true)
                      }}
                      className="text-teal-600 dark:text-teal-400 hover:text-teal-700 p-0.5 rounded transition cursor-pointer flex items-center space-x-0.5"
                      title="Edit email address"
                    >
                      <Pencil className="w-3.5 h-3.5 inline" />
                      <span className="text-[10px] underline">Edit</span>
                    </button>
                  </div>
                )}
              </div>
            </div>

            {error && (
              <div className="mb-4 p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 flex items-start space-x-2 text-rose-600 dark:text-rose-300 text-xs">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            {/* Development / Simulation Mode Notice Banner */}
            {simulatedOtp && (
              <div className="mb-4 p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-700 dark:text-amber-300 text-xs space-y-1">
                <div className="font-bold flex items-center space-x-1">
                  <AlertCircle className="w-4 h-4 text-amber-500 shrink-0" />
                  <span>Development Email Simulation Mode Active</span>
                </div>
                <p>Since live SMTP keys are not configured, your simulated OTP is <strong className="font-mono text-sm tracking-wider text-amber-600 dark:text-amber-400">{simulatedOtp}</strong>.</p>
                <button
                  type="button"
                  onClick={() => setOtpCode(simulatedOtp)}
                  className="mt-1 px-2.5 py-1 bg-amber-500 hover:bg-amber-600 text-white font-bold text-[10px] rounded-lg transition cursor-pointer"
                >
                  Quick Fill OTP ({simulatedOtp})
                </button>
              </div>
            )}

            <form onSubmit={handleVerifyOtpAndRegister} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold uppercase text-slate-700 dark:text-slate-300 mb-1.5 text-center">
                  Enter 6-Digit Email OTP Code
                </label>
                <input
                  type="text"
                  maxLength={6}
                  required
                  autoFocus
                  value={otpCode}
                  onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder="123456"
                  className="w-full text-center tracking-widest font-mono text-2xl py-3 bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white focus:outline-none focus:border-teal-500 transition"
                />
              </div>

              {/* Resend OTP Button with 30s Cooldown */}
              <div className="flex items-center justify-between text-xs pt-1">
                <span className="text-slate-500">Didn't receive the code?</span>
                <button
                  type="button"
                  onClick={handleResendOtp}
                  disabled={resendCooldown > 0 || isSendingOtp}
                  className="flex items-center space-x-1 text-teal-600 dark:text-teal-400 hover:text-teal-700 font-semibold disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition"
                >
                  <RotateCw className={`w-3.5 h-3.5 ${isSendingOtp ? 'animate-spin' : ''}`} />
                  <span>
                    {isSendingOtp
                      ? 'Sending...'
                      : resendCooldown > 0
                      ? `Resend OTP in ${resendCooldown}s`
                      : 'Resend OTP'}
                  </span>
                </button>
              </div>

              <button
                type="submit"
                disabled={isSubmitting || otpCode.length !== 6}
                className="w-full py-3.5 bg-gradient-to-r from-teal-500 to-emerald-500 hover:from-teal-600 hover:to-emerald-600 text-white font-bold rounded-xl text-sm shadow-lg shadow-teal-500/25 flex items-center justify-center space-x-2 transition disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer mt-2"
              >
                {isSubmitting ? (
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <>
                    <span>Verify OTP & Complete Registration</span>
                    <CheckCircle2 className="w-4 h-4" />
                  </>
                )}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
