import React, { useState } from 'react'
import { Layout } from '../../components/Layout'
import { ShieldCheck, Search, Filter, Stethoscope, User, ShieldAlert, Cpu } from 'lucide-react'

interface LogEntry {
  id: string
  action: string
  user: string
  actorRole: 'PATIENT' | 'DOCTOR' | 'ADMIN' | 'SYSTEM'
  patientName?: string
  doctorName?: string
  doctorCategory?: string
  target: string
  timestamp: string
  details: string
}

export const AuditLogPage: React.FC = () => {
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedRole, setSelectedRole] = useState<'ALL' | 'PATIENT' | 'DOCTOR' | 'ADMIN' | 'SYSTEM'>('ALL')
  const [selectedSpecialty, setSelectedSpecialty] = useState<string>('ALL')
  const [doctorSearchName, setDoctorSearchName] = useState('')
  const [patientSearchName, setPatientSearchName] = useState('')

  // Realistic Audit Trail derived from DB AuditLog model schema
  const logs: LogEntry[] = [
    { id: '1', action: 'APPOINTMENT_CONFIRMED', user: 'patient@healthcare.com', actorRole: 'PATIENT', patientName: 'John Doe', target: 'Appointment #102', timestamp: '2026-08-23 19:44:00', details: 'Patient John Doe confirmed appointment with Dr. Sarah Smith' },
    { id: '2', action: 'DOCTOR_LEAVE_MARKED', user: 'admin@healthcare.com', actorRole: 'ADMIN', target: 'Dr. Sarah Smith', timestamp: '2026-08-23 12:15:22', details: 'Admin marked leave for Dr. Sarah Smith on 2026-08-25', doctorName: 'Dr. Sarah Smith', doctorCategory: 'Cardiology' },
    { id: '3', action: 'SUMMARY_GENERATED', user: 'Gemini 2.0 AI Worker', actorRole: 'SYSTEM', target: 'Appointment #101', timestamp: '2026-08-23 11:05:14', details: 'AI post-visit patient friendly summary generated for John Doe' },
    { id: '4', action: 'PATIENT_REGISTERED', user: 'john.doe@example.com', actorRole: 'PATIENT', patientName: 'John Doe', target: 'User #88', timestamp: '2026-08-23 09:45:00', details: 'New patient registered: John Doe' },
    { id: '5', action: 'CONSULTATION_COMPLETED', user: 'dr.smith@healthcare.com', actorRole: 'DOCTOR', doctorName: 'Dr. Sarah Smith', doctorCategory: 'Cardiology', target: 'Appointment #101', timestamp: '2026-08-22 17:30:00', details: 'Dr. Sarah Smith completed consultation for John Doe and submitted notes.' },
    { id: '6', action: 'WORKING_HOURS_REQUESTED', user: 'dr.patel@healthcare.com', actorRole: 'DOCTOR', doctorName: 'Dr. Raj Patel', doctorCategory: 'Dermatology', target: 'DoctorProfile', timestamp: '2026-08-22 14:20:10', details: 'Dr. Raj Patel requested working hours change to 09:00 - 15:00.' },
    { id: '7', action: 'APPOINTMENT_CONFIRMED', user: 'jane.foster@healthcare.com', actorRole: 'PATIENT', patientName: 'Jane Foster', target: 'Appointment #103', timestamp: '2026-08-22 10:15:00', details: 'Patient Jane Foster booked appointment with Dr. Raj Patel' },
    { id: '8', action: 'ADMIN_APPROVE_SCHEDULE', user: 'admin@healthcare.com', actorRole: 'ADMIN', target: 'Dr. Raj Patel', timestamp: '2026-08-22 09:30:00', details: 'Admin approved schedule change request for Dr. Raj Patel', doctorName: 'Dr. Raj Patel', doctorCategory: 'Dermatology' },
    { id: '9', action: 'MEDICINE_REMINDERS_SCHEDULED', user: 'Gemini 2.0 AI Worker', actorRole: 'SYSTEM', target: 'Appointment #101', timestamp: '2026-08-22 17:35:00', details: 'AI scheduled 3 daily reminders for 7 days based on doctor prescription.' },
    { id: '10', action: 'PASSWORD_RESET', user: 'patient@healthcare.com', actorRole: 'PATIENT', patientName: 'John Doe', target: 'User #10', timestamp: '2026-08-21 11:22:00', details: 'Patient John Doe successfully reset password using Email OTP.' },
    { id: '11', action: 'DOCTOR_ONBOARDED', user: 'admin@healthcare.com', actorRole: 'ADMIN', target: 'Dr. Chen', timestamp: '2026-08-20 16:45:00', details: 'Admin onboarded new doctor: Dr. Chen (Pediatrics)', doctorName: 'Dr. Chen', doctorCategory: 'Pediatrics' }
  ]

  // Multi-tier filtering logic
  const filtered = logs.filter((log) => {
    // 1. Role Filter
    if (selectedRole !== 'ALL' && log.actorRole !== selectedRole) {
      return false
    }

    // 2. Specialty Filter (only applies to doctor logs or all logs if matching doctor profile)
    if (selectedSpecialty !== 'ALL') {
      if (!log.doctorCategory || log.doctorCategory !== selectedSpecialty) {
        return false
      }
    }

    // 3. Doctor Name Search (only applies to doctor logs or if matching doctorName)
    if (doctorSearchName.trim() !== '') {
      if (!log.doctorName || !log.doctorName.toLowerCase().includes(doctorSearchName.toLowerCase())) {
        return false
      }
    }

    // 4. Patient Name Search (only applies to patient logs or if matching patientName)
    if (patientSearchName.trim() !== '') {
      if (!log.patientName || !log.patientName.toLowerCase().includes(patientSearchName.toLowerCase())) {
        return false
      }
    }

    // 5. Global Search Term (matches action, details or email)
    if (searchTerm.trim() !== '') {
      const matchText = `${log.action} ${log.details} ${log.user} ${log.target}`.toLowerCase()
      if (!matchText.includes(searchTerm.toLowerCase())) {
        return false
      }
    }

    return true
  })

  const specialties = ['ALL', 'Cardiology', 'Dermatology', 'Pediatrics']

  const getActorIcon = (role: string) => {
    switch (role) {
      case 'PATIENT': return <User className="w-3.5 h-3.5" />
      case 'DOCTOR': return <Stethoscope className="w-3.5 h-3.5" />
      case 'ADMIN': return <ShieldCheck className="w-3.5 h-3.5" />
      default: return <Cpu className="w-3.5 h-3.5" />
    }
  }

  const getActorBadgeClass = (role: string) => {
    switch (role) {
      case 'PATIENT': return 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400'
      case 'DOCTOR': return 'bg-teal-50 text-teal-700 dark:bg-teal-500/10 dark:text-teal-400'
      case 'ADMIN': return 'bg-indigo-50 text-indigo-700 dark:bg-indigo-500/10 dark:text-indigo-400'
      default: return 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
    }
  }

  return (
    <Layout activeTab="audit">
      <div className="max-w-5xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center space-x-2">
            <ShieldCheck className="w-7 h-7 text-teal-500" />
            <span>HIPAA & System Audit Trail</span>
          </h1>
          <p className="text-slate-500 text-sm">Security events, appointment state changes, and AI summarization logs.</p>
        </div>

        {/* Filters Card */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-800 p-5 space-y-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            {/* Actor Role Tabs */}
            <div className="flex flex-wrap bg-slate-100 dark:bg-slate-950 p-1 rounded-xl">
              {(['ALL', 'PATIENT', 'DOCTOR', 'ADMIN', 'SYSTEM'] as const).map((role) => (
                <button
                  key={role}
                  onClick={() => {
                    setSelectedRole(role)
                    // Reset sub-filters if changing role category
                    if (role !== 'DOCTOR' && role !== 'ALL') {
                      setSelectedSpecialty('ALL')
                      setDoctorSearchName('')
                    }
                    if (role !== 'PATIENT' && role !== 'ALL') {
                      setPatientSearchName('')
                    }
                  }}
                  className={`px-3.5 py-1.5 text-xs font-bold rounded-lg transition ${
                    selectedRole === role
                      ? 'bg-white dark:bg-slate-800 text-teal-600 dark:text-teal-400 shadow-sm'
                      : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
                  }`}
                >
                  {role === 'ALL' ? 'All Actors' : role.charAt(0) + role.slice(1).toLowerCase() + 's'}
                </button>
              ))}
            </div>

            {/* Global Search Bar */}
            <div className="flex items-center space-x-2 bg-slate-50 dark:bg-slate-950 px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-800 flex-1 max-w-md">
              <Search className="w-4 h-4 text-slate-400" />
              <input
                type="text"
                placeholder="Global text search (action, details...)"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full bg-transparent text-xs text-slate-900 dark:text-white outline-none placeholder-slate-400"
              />
            </div>
          </div>

          {/* Sub-Filters Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2 border-t border-slate-100 dark:border-slate-800/60">
            {/* Doctor Specialties Filter (Visible for Doctor role and ALL) */}
            {(selectedRole === 'ALL' || selectedRole === 'DOCTOR') && (
              <>
                <div className="space-y-1">
                  <label className="block text-[10px] font-bold uppercase text-slate-400">Doctor Category</label>
                  <select
                    value={selectedSpecialty}
                    onChange={(e) => setSelectedSpecialty(e.target.value)}
                    className="w-full text-xs bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl p-2.5 text-slate-950 dark:text-slate-50 focus:outline-none focus:border-teal-500"
                  >
                    {specialties.map((spec) => (
                      <option key={spec} value={spec}>
                        {spec === 'ALL' ? 'All Specialties' : spec}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="block text-[10px] font-bold uppercase text-slate-400">Search by Doctor Name</label>
                  <div className="relative">
                    <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-3" />
                    <input
                      type="text"
                      placeholder="Doctor name..."
                      value={doctorSearchName}
                      onChange={(e) => setDoctorSearchName(e.target.value)}
                      className="w-full pl-9 pr-3 py-2 text-xs bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-slate-900 dark:text-white focus:outline-none focus:border-teal-500 placeholder-slate-400"
                    />
                  </div>
                </div>
              </>
            )}

            {/* Patient Search Filter (Visible for Patient role and ALL) */}
            {(selectedRole === 'ALL' || selectedRole === 'PATIENT') && (
              <div className="space-y-1">
                <label className="block text-[10px] font-bold uppercase text-slate-400">Search by Patient Name</label>
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-3" />
                  <input
                    type="text"
                    placeholder="Patient name..."
                    value={patientSearchName}
                    onChange={(e) => setPatientSearchName(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 text-xs bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-slate-900 dark:text-white focus:outline-none focus:border-teal-500 placeholder-slate-400"
                  />
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Logs Table */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-800 overflow-hidden">
          <div className="p-4 bg-slate-50 dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800/80 flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Log Entries ({filtered.length})</span>
            {filtered.length === 0 && (
              <span className="text-xs text-rose-500 font-semibold">No logs match the current filters.</span>
            )}
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-[700px]">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/50 text-[11px] font-bold uppercase text-slate-500">
                  <th className="p-4 w-[160px]">Timestamp</th>
                  <th className="p-4 w-[180px]">Action</th>
                  <th className="p-4 w-[120px]">Actor Role</th>
                  <th className="p-4 w-[220px]">User / Actor</th>
                  <th className="p-4">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 text-xs">
                {filtered.map((log) => (
                  <tr key={log.id} className="hover:bg-slate-50/40 dark:hover:bg-slate-800/20 transition">
                    <td className="p-4 font-mono text-slate-500">{log.timestamp}</td>
                    <td className="p-4 font-bold text-slate-900 dark:text-slate-100">
                      <span className="px-2 py-1 rounded bg-teal-500/5 text-teal-600 dark:text-teal-400 border border-teal-500/10">
                        {log.action}
                      </span>
                    </td>
                    <td className="p-4">
                      <span className={`px-2 py-0.5 rounded-full font-bold flex items-center space-x-1 w-max text-[10px] ${getActorBadgeClass(log.actorRole)}`}>
                        {getActorIcon(log.actorRole)}
                        <span>{log.actorRole}</span>
                      </span>
                    </td>
                    <td className="p-4 text-slate-700 dark:text-slate-300 font-medium">
                      <div>{log.user}</div>
                      {log.patientName && <div className="text-[10px] text-slate-400 mt-0.5">Name: {log.patientName}</div>}
                      {log.doctorName && <div className="text-[10px] text-teal-500 mt-0.5">{log.doctorName} ({log.doctorCategory})</div>}
                    </td>
                    <td className="p-4 text-slate-500 dark:text-slate-400 font-normal leading-relaxed">{log.details}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </Layout>
  )
}
