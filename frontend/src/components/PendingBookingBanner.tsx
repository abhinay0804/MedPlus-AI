import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../lib/api'
import { Appointment } from '../types'
import { Clock, ArrowRight, X } from 'lucide-react'

const parseUtcTime = (isoString?: string): number => {
  if (!isoString) return Date.now()
  const formatted = isoString.endsWith('Z') || isoString.includes('+') ? isoString : `${isoString}Z`
  return new Date(formatted).getTime()
}

export const PendingBookingBanner: React.FC = () => {
  const navigate = useNavigate()
  const [heldAppointment, setHeldAppointment] = useState<Appointment | null>(null)
  const [timeLeft, setTimeLeft] = useState<string>('')
  const [isExpired, setIsExpired] = useState(false)
  const [isReleasing, setIsReleasing] = useState(false)

  const fetchHeldAppointment = async () => {
    try {
      const appts = await api.get<Appointment[]>('/patient/appointments')
      const active = appts.find((a) => {
        if (a.status !== 'HELD' || !a.hold_expires_at) return false
        return parseUtcTime(a.hold_expires_at) > Date.now()
      })
      setHeldAppointment(active || null)
    } catch (err) {
      console.error('Error fetching held appointment:', err)
    }
  }

  useEffect(() => {
    fetchHeldAppointment()
    const interval = setInterval(fetchHeldAppointment, 10000) // Poll every 10s
    
    const handleReleased = () => {
      fetchHeldAppointment()
    }
    window.addEventListener('medplus_hold_released', handleReleased)

    return () => {
      clearInterval(interval)
      window.removeEventListener('medplus_hold_released', handleReleased)
    }
  }, [])

  useEffect(() => {
    if (!heldAppointment?.hold_expires_at) return

    const updateTimer = () => {
      const expires = parseUtcTime(heldAppointment.hold_expires_at)
      const now = Date.now()
      const diff = Math.floor((expires - now) / 1000)

      if (diff <= 0) {
        setIsExpired(true)
        setTimeLeft('0:00')
        setHeldAppointment(null)
        window.dispatchEvent(new CustomEvent('medplus_hold_released'))
      } else {
        const mins = Math.floor(diff / 60)
        const secs = diff % 60
        setTimeLeft(`${mins}:${secs < 10 ? '0' : ''}${secs}`)
      }
    }

    updateTimer()
    const timer = setInterval(updateTimer, 1000)
    return () => clearInterval(timer)
  }, [heldAppointment])

  const handleCancelHold = async () => {
    if (!heldAppointment) return
    setIsReleasing(true)
    try {
      await api.delete(`/patient/appointments/${heldAppointment.id}`)
      setHeldAppointment(null)
      window.dispatchEvent(new CustomEvent('medplus_hold_released'))
    } catch (err) {
      console.error('Failed to release hold:', err)
    } finally {
      setIsReleasing(false)
    }
  }

  if (!heldAppointment || isExpired) return null

  const doctorName = heldAppointment.doctor?.user?.full_name || 'Doctor'
  const doctorSpecialty = heldAppointment.doctor?.specialisation || ''
  const slotDateStr = new Date(heldAppointment.slot_start).toLocaleDateString([], {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  })
  const slotTimeStr = new Date(heldAppointment.slot_start).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  })

  return (
    <div className="p-4 rounded-2xl bg-gradient-to-r from-amber-500/15 via-amber-500/10 to-teal-500/10 border-2 border-amber-500/40 dark:border-amber-500/30 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 text-slate-900 dark:text-white shadow-lg shadow-amber-500/5">
      <div className="flex items-start space-x-3.5">
        <div className="w-10 h-10 rounded-xl bg-amber-500/20 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0 mt-0.5 font-bold">
          <Clock className="w-5 h-5" />
        </div>
        <div>
          <div className="flex items-center space-x-2">
            <span className="font-extrabold text-sm text-amber-900 dark:text-amber-300">
              Interrupted Booking in Progress
            </span>
            <span className="px-2 py-0.5 rounded-full bg-amber-500 text-slate-950 font-black text-[11px]">
              {timeLeft} left
            </span>
          </div>
          <p className="text-xs text-slate-600 dark:text-slate-300 mt-1">
            Slot reserved with <strong>Dr. {doctorName}</strong> ({doctorSpecialty}) on {slotDateStr} at {slotTimeStr}.
          </p>
        </div>
      </div>

      <div className="flex items-center space-x-2 shrink-0 self-end sm:self-center">
        <button
          onClick={handleCancelHold}
          disabled={isReleasing}
          className="px-3 py-2 bg-slate-200/80 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-bold text-xs rounded-xl transition flex items-center space-x-1 cursor-pointer disabled:opacity-50"
          title="Release slot for other patients"
        >
          <X className="w-3.5 h-3.5" />
          <span>Release Slot</span>
        </button>

        <button
          onClick={() => navigate(`/patient/doctors/${heldAppointment.doctor_id}/book`)}
          className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-slate-950 font-extrabold text-xs rounded-xl transition flex items-center space-x-1.5 shadow-md shadow-amber-500/20 cursor-pointer"
        >
          <span>Resume Booking</span>
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  )
}
