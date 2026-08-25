import React, { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Layout } from '../../components/Layout'
import { useAuth } from '../../context/AuthContext'
import { api } from '../../lib/api'
import { isValidPhone } from '../../lib/utils'
import { User, Calendar, Shield, Save, Globe, Mail } from 'lucide-react'
import { toast } from 'sonner'
import { CountryPhoneInput, COUNTRIES, Country } from '../../components/CountryPhoneInput'

export const PatientSettings: React.FC = () => {
  const { user, refreshUser } = useAuth()
  const [searchParams, setSearchParams] = useSearchParams()

  useEffect(() => {
    const connected = searchParams.get('google_connected')
    const error = searchParams.get('google_error')

    if (connected === 'true') {
      toast.success('Google Calendar connected successfully! Your appointments will now sync.')
      refreshUser()
      searchParams.delete('google_connected')
      setSearchParams(searchParams)
    } else if (error) {
      toast.error(`Failed to link Google Calendar: ${error.replace(/_/g, ' ')}`)
      searchParams.delete('google_error')
      setSearchParams(searchParams)
    }
  }, [searchParams, setSearchParams, refreshUser])
  const [fullName, setFullName] = useState(user?.full_name || '')
  const [selectedCountry, setSelectedCountry] = useState<Country>(() => {
    if (user?.country) {
      const match = COUNTRIES.find((c) => c.name.toLowerCase() === user.country?.toLowerCase())
      if (match) return match
    }
    return COUNTRIES[0]
  })
  const [nationalPhone, setNationalPhone] = useState(() => {
    if (user?.phone) {
      // Remove dial code prefix to isolate 10 digits
      const digitsOnly = user.phone.replace(/\D/g, '')
      return digitsOnly.slice(-10)
    }
    return ''
  })
  const [isSaving, setIsSaving] = useState(false)
  const [isConnectingCalendar, setIsConnectingCalendar] = useState(false)

  useEffect(() => {
    if (user?.full_name) setFullName(user.full_name)
    if (user?.country) {
      const match = COUNTRIES.find((c) => c.name.toLowerCase() === user.country?.toLowerCase())
      if (match) setSelectedCountry(match)
    }
    if (user?.phone) {
      const digitsOnly = user.phone.replace(/\D/g, '')
      setNationalPhone(digitsOnly.slice(-10))
    }
  }, [user])

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    
    let fullPhone: string | undefined = undefined
    if (nationalPhone) {
      if (nationalPhone.length !== 10) {
        toast.error('Please enter a valid 10-digit mobile number.')
        return
      }
      fullPhone = `${selectedCountry.dialCode}${nationalPhone}`
      if (!isValidPhone(fullPhone)) {
        toast.error('Please enter a valid mobile number. Fake repeated (e.g. 0000000000) or sequential numbers are not allowed.')
        return
      }
    }

    setIsSaving(true)
    try {
      await api.put('/auth/profile', {
        full_name: fullName,
        phone: fullPhone,
        country: selectedCountry.name,
      })
      await refreshUser()
      toast.success('Profile and country settings updated successfully!')
    } catch (err: any) {
      toast.error(err.message || 'Failed to update settings')
    } finally {
      setIsSaving(false)
    }
  }

  const handleConnectCalendar = async () => {
    try {
      setIsConnectingCalendar(true)
      const res = await api.get<{ url: string | null; message?: string }>('/auth/google/connect')
      if (res.url) {
        window.location.href = res.url
      } else {
        toast.success(res.message || 'Google Calendar connected! (Development Simulation Mode)')
      }
    } catch (err: any) {
      toast.error(err.message || 'Failed to connect Google Calendar')
    } finally {
      setIsConnectingCalendar(false)
    }
  }

  return (
    <Layout activeTab="settings">
      <div className="max-w-4xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Account Settings</h1>
          <p className="text-slate-500 dark:text-slate-400">Manage your profile, preferences, and Google Calendar sync.</p>
        </div>

        {/* Profile Card */}
        <div className="bg-white dark:bg-slate-900 rounded-xl p-6 shadow-sm border border-slate-200 dark:border-slate-800">
          <div className="flex items-center space-x-3 mb-6">
            <div className="w-10 h-10 rounded-lg bg-teal-50 dark:bg-teal-900/30 flex items-center justify-center text-teal-600 dark:text-teal-400">
              <User className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Personal Profile</h2>
              <p className="text-xs text-slate-500">Your account identity and contact detail</p>
            </div>
          </div>

          <form onSubmit={handleSave} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-1">Full Name</label>
                <input
                  type="text"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-slate-900 dark:text-white text-sm focus:ring-2 focus:ring-teal-500 outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-1">Email Address</label>
                <input
                  type="email"
                  disabled
                  value={user?.email || ''}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 text-slate-500 text-sm cursor-not-allowed"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-1">
                Mobile Number (10 Digits) & Country
              </label>
              <CountryPhoneInput
                selectedCountry={selectedCountry}
                onCountryChange={setSelectedCountry}
                nationalNumber={nationalPhone}
                onNationalNumberChange={setNationalPhone}
              />
              <p className="text-[11px] text-slate-500 mt-1">
                Current Account Country: <span className="font-semibold text-teal-600 dark:text-teal-400">{selectedCountry.flag} {selectedCountry.name} ({selectedCountry.dialCode})</span>
              </p>
            </div>

            <div className="flex justify-end pt-2">
              <button
                type="submit"
                disabled={isSaving}
                className="flex items-center space-x-2 px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-lg text-sm font-medium transition-colors"
              >
                <Save className="w-4 h-4" />
                <span>{isSaving ? 'Saving...' : 'Save Changes'}</span>
              </button>
            </div>
          </form>
        </div>

        {/* Google Calendar Sync */}
        <div className="bg-white dark:bg-slate-900 rounded-xl p-6 shadow-sm border border-slate-200 dark:border-slate-800">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-start space-x-3">
              <div className="w-10 h-10 rounded-lg bg-blue-50 dark:bg-blue-900/30 flex items-center justify-center text-blue-600 dark:text-blue-400 mt-1 flex-shrink-0">
                <Calendar className="w-5 h-5" />
              </div>
              <div className="space-y-1">
                <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Google Calendar Integration</h2>
                <p className="text-xs text-slate-500">Automatically sync confirmed consultations directly to your Google Calendar</p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <a
                href="mailto:abhinaychowdhary97@gmail.com?subject=MedPlus%20AI%20-%20Let%27s%20Connect&body=Hi%20Abhinay,%0D%0A%0D%0AI%20would%20love%20to%20discuss%20the%20project%20with%20you.%20When%20are%20you%20free%20to%20connect%20for%20a%20quick%20discussion%3F%0D%0A%0D%0ABest%20regards,"
                className="flex items-center space-x-1.5 px-3.5 py-2.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-750 dark:text-slate-200 rounded-lg text-xs font-bold transition-colors cursor-pointer border border-slate-200 dark:border-slate-700"
              >
                <Mail className="w-3.5 h-3.5" />
                <span>Contact Developer</span>
              </a>

              <button
                onClick={handleConnectCalendar}
                disabled={isConnectingCalendar}
                className="flex items-center space-x-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold transition-colors cursor-pointer disabled:opacity-50 shadow-sm"
              >
                <Calendar className="w-3.5 h-3.5" />
                <span>{isConnectingCalendar ? 'Connecting...' : 'Connect Calendar'}</span>
              </button>
            </div>
          </div>
        </div>

        {/* Privacy & HIPAA Note */}
        <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800 flex items-start space-x-3">
          <Shield className="w-5 h-5 text-teal-600 dark:text-teal-400 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
            Your data is protected under standard HIPAA compliance protocols. We use end-to-end encryption for AI pre-visit summaries and appointment logs.
          </p>
        </div>
      </div>
    </Layout>
  )
}
