import React, { useState, useEffect } from 'react'
import { Layout } from '../../components/Layout'
import { api } from '../../lib/api'
import { Search, User, Mail, Phone, Globe, Calendar, CheckCircle2, AlertTriangle, ShieldCheck } from 'lucide-react'
import { toast } from 'sonner'

interface PatientStats {
  COMPLETED?: number
  CANCELLED?: number
  CONFIRMED?: number
  PENDING_APPROVAL?: number
  RESCHEDULED?: number
}

interface PatientRecord {
  id: string
  full_name: string
  email: string
  phone: string | null
  country: string
  created_at: string
  stats: PatientStats
  last_visit: string | null
}

export const Patients: React.FC = () => {
  const [patients, setPatients] = useState<PatientRecord[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedPatient, setSelectedPatient] = useState<PatientRecord | null>(null)
  const [patientHistory, setPatientHistory] = useState<any[]>([])
  const [isLoadingHistory, setIsLoadingHistory] = useState(false)

  useEffect(() => {
    fetchPatients()
  }, [])

  const fetchPatients = async () => {
    try {
      setIsLoading(true)
      let url = '/admin/patients?skip=0&limit=100'
      if (searchTerm.trim()) {
        url += `&search=${encodeURIComponent(searchTerm)}`
      }
      const data = await api.get<PatientRecord[]>(url)
      setPatients(data)
    } catch (err: any) {
      toast.error(err.message || 'Failed to load patient directory')
    } finally {
      setIsLoading(false)
    }
  }

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    fetchPatients()
  }

  const handleViewHistory = async (patient: PatientRecord) => {
    try {
      setSelectedPatient(patient)
      setIsLoadingHistory(true)
      setPatientHistory([])
      const data = await api.get<any[]>(`/admin/appointments?patient_id=${patient.id}`)
      setPatientHistory(data)
    } catch (err: any) {
      toast.error(err.message || 'Failed to load patient history')
    } finally {
      setIsLoadingHistory(false)
    }
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'COMPLETED':
        return 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300'
      case 'CANCELLED':
        return 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300'
      case 'CONFIRMED':
        return 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
      default:
        return 'bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-350'
    }
  }

  return (
    <Layout activeTab="patients">
      <div className="max-w-6xl mx-auto space-y-6 pb-12">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Patient Registry</h1>
            <p className="text-slate-500 text-sm">Search and inspect clinic patient registrations, contact details, and cross-visit medical stats.</p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Patient Directory List */}
          <div className="lg:col-span-2 space-y-6">
            {/* Search Box */}
            <div className="bg-white dark:bg-slate-900 rounded-xl p-4 shadow-sm border border-slate-200 dark:border-slate-800">
              <form onSubmit={handleSearchSubmit} className="flex space-x-2">
                <div className="relative flex-1">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                  <input
                    type="text"
                    placeholder="Search by patient name, email, phone..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white text-sm focus:ring-2 focus:ring-teal-500 outline-none"
                  />
                </div>
                <button
                  type="submit"
                  className="px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-lg text-sm font-medium transition-colors cursor-pointer"
                >
                  Search
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setSearchTerm('')
                    setPatients([])
                    setTimeout(fetchPatients, 50)
                  }}
                  className="px-3 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-lg text-sm font-medium transition-colors cursor-pointer"
                >
                  Reset
                </button>
              </form>
            </div>

            {/* Patients List Grid */}
            {isLoading ? (
              <div className="p-8 text-center text-slate-400 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
                Loading patient roster...
              </div>
            ) : patients.length === 0 ? (
              <div className="p-8 text-center text-slate-400 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
                No registered patients found.
              </div>
            ) : (
              <div className="space-y-4">
                {patients.map((p) => (
                  <div
                    key={p.id}
                    onClick={() => handleViewHistory(p)}
                    className={`bg-white dark:bg-slate-900 rounded-xl p-5 shadow-sm border transition-all cursor-pointer flex flex-col md:flex-row md:items-center justify-between gap-4 ${
                      selectedPatient?.id === p.id
                        ? 'border-teal-550 ring-2 ring-teal-500/20'
                        : 'border-slate-200 dark:border-slate-800 hover:border-slate-350 dark:hover:border-slate-700'
                    }`}
                  >
                    <div className="space-y-2">
                      <div className="flex items-center space-x-2">
                        <div className="w-8 h-8 rounded-full bg-teal-100 dark:bg-teal-950 text-teal-700 dark:text-teal-300 flex items-center justify-center font-bold uppercase text-sm">
                          {p.full_name.charAt(0)}
                        </div>
                        <div>
                          <h3 className="font-semibold text-slate-900 dark:text-white">{p.full_name}</h3>
                          <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-500">
                            <span className="flex items-center space-x-1">
                              <Mail className="w-3.5 h-3.5 text-slate-400" />
                              <span>{p.email}</span>
                            </span>
                            {p.phone && (
                              <span className="flex items-center space-x-1">
                                <Phone className="w-3.5 h-3.5 text-slate-400" />
                                <span>{p.phone}</span>
                              </span>
                            )}
                            <span className="flex items-center space-x-1">
                              <Globe className="w-3.5 h-3.5 text-slate-400" />
                              <span>{p.country}</span>
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-row md:flex-col items-start md:items-end justify-between md:justify-center border-t md:border-t-0 border-slate-100 dark:border-slate-800 pt-3 md:pt-0 gap-2">
                      <div className="flex space-x-3 text-xs">
                        <div className="text-center">
                          <div className="font-bold text-slate-900 dark:text-white">{p.stats.COMPLETED || 0}</div>
                          <div className="text-[10px] text-slate-500 uppercase">Visits</div>
                        </div>
                        <div className="text-center border-l border-slate-200 dark:border-slate-800 pl-3">
                          <div className="font-bold text-slate-900 dark:text-white">
                            {(p.stats.CONFIRMED || 0) + (p.stats.PENDING_APPROVAL || 0)}
                          </div>
                          <div className="text-[10px] text-slate-500 uppercase">Upcoming</div>
                        </div>
                        <div className="text-center border-l border-slate-200 dark:border-slate-800 pl-3">
                          <div className="font-bold text-slate-500">{p.stats.CANCELLED || 0}</div>
                          <div className="text-[10px] text-slate-550 uppercase">Cancelled</div>
                        </div>
                      </div>

                      <div className="text-[11px] text-slate-400 flex items-center space-x-1">
                        <Calendar className="w-3.5 h-3.5" />
                        <span>
                          Last Visit:{' '}
                          {p.last_visit
                            ? new Date(p.last_visit + 'Z').toLocaleDateString(undefined, {
                                month: 'short',
                                day: 'numeric',
                                year: 'numeric',
                              })
                            : 'Never'}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Patient Detail / History Inspector */}
          <div className="space-y-6">
            {selectedPatient ? (
              <div className="bg-white dark:bg-slate-900 rounded-xl p-6 shadow-sm border border-slate-200 dark:border-slate-800 space-y-4">
                <div className="border-b border-slate-100 dark:border-slate-800 pb-4">
                  <h2 className="text-lg font-bold text-slate-900 dark:text-white">{selectedPatient.full_name}</h2>
                  <p className="text-xs text-slate-400">Registry ID: {selectedPatient.id}</p>
                  <p className="text-xs text-slate-400 mt-1">Joined: {new Date(selectedPatient.created_at).toLocaleDateString()}</p>
                </div>

                <div className="space-y-3">
                  <h3 className="text-sm font-semibold text-slate-950 dark:text-white flex items-center space-x-2">
                    <ShieldCheck className="w-4 h-4 text-teal-600" />
                    <span>Consultation History log</span>
                  </h3>

                  {isLoadingHistory ? (
                    <p className="text-xs text-slate-400 italic">Retrieving historical records...</p>
                  ) : patientHistory.length === 0 ? (
                    <p className="text-xs text-slate-400 italic">No historical visits found.</p>
                  ) : (
                    <div className="space-y-3 max-h-96 overflow-y-auto pr-1">
                      {patientHistory.map((appt) => (
                        <div key={appt.id} className="p-3 rounded-lg border border-slate-100 dark:border-slate-850 space-y-2">
                          <div className="flex items-center justify-between text-[10px]">
                            <span className={`px-2 py-0.5 rounded font-bold uppercase ${getStatusBadge(appt.status)}`}>
                              {appt.status.replace('_', ' ')}
                            </span>
                            <span className="text-slate-400">
                              {new Date(appt.slot_start + 'Z').toLocaleDateString(undefined, {
                                month: 'short',
                                day: 'numeric',
                                year: 'numeric',
                              })}
                            </span>
                          </div>

                          <div className="text-xs">
                            <span className="text-slate-500">Doctor: </span>
                            <span className="font-semibold text-slate-800 dark:text-slate-200">Dr. {appt.doctor?.user?.full_name}</span>
                          </div>

                          {appt.symptom_form && (
                            <div className="text-[11px] bg-slate-50 dark:bg-slate-950 p-2 rounded text-slate-600 dark:text-slate-450 border border-slate-100 dark:border-slate-900/50">
                              <span className="font-medium">Symptoms: </span>
                              {appt.symptom_form.symptoms_text}
                            </div>
                          )}

                          {appt.post_visit_note && (
                            <div className="text-[11px] bg-slate-50 dark:bg-slate-950 p-2 rounded text-slate-600 dark:text-slate-450 border border-slate-100 dark:border-slate-900/50">
                              <span className="font-medium">Diagnosis: </span>
                              {appt.post_visit_note.patient_summary ? (
                                <span>Note summaries parsed</span>
                              ) : (
                                appt.post_visit_note.doctor_notes
                              )}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="bg-slate-50 dark:bg-slate-900/50 border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-xl p-8 text-center text-slate-400">
                Select a patient from the list to view their consultation history and detailed profile statistics.
              </div>
            )}
          </div>
        </div>
      </div>
    </Layout>
  )
}
