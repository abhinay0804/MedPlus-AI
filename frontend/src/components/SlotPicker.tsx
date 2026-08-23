import React, { useState, useEffect } from 'react'
import { Slot } from '../types'
import { Clock, Calendar as CalendarIcon, CheckCircle2, AlertCircle } from 'lucide-react'
import { SkeletonSlotGrid } from './SkeletonLoader'

interface SlotPickerProps {
  slots: Slot[]
  selectedSlot: Slot | null
  onSelectSlot: (slot: Slot) => void
  onSelectConflictSlot?: (slot: Slot) => void
  isLoading?: boolean
}

export const SlotPicker: React.FC<SlotPickerProps> = ({
  slots,
  selectedSlot,
  onSelectSlot,
  onSelectConflictSlot,
  isLoading,
}) => {
  if (isLoading) {
    return <SkeletonSlotGrid />
  }

  if (!slots || slots.length === 0) {
    return (
      <div className="p-8 text-center bg-white dark:bg-slate-900/40 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
        <Clock className="w-8 h-8 text-slate-400 dark:text-slate-500 mx-auto mb-2" />
        <p className="text-sm text-slate-700 dark:text-slate-400 font-medium">No available consultation slots for this date.</p>
        <p className="text-xs text-slate-500 mt-1">Please select another date on the calendar.</p>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 py-2">
      {slots.map((slot, idx) => {
        const startTime = new Date(slot.slot_start).toLocaleTimeString([], {
          hour: '2-digit',
          minute: '2-digit',
        })
        const isSelected = selectedSlot?.slot_start === slot.slot_start
        const isAvailable = slot.is_available
        const isPatientConflict = slot.is_patient_conflict

        return (
          <button
            key={idx}
            disabled={!isAvailable && !isPatientConflict}
            onClick={() => {
              if (isAvailable || isPatientConflict) {
                onSelectSlot(slot)
              }
            }}
            className={`py-3 px-4 rounded-xl border text-sm font-semibold flex items-center justify-between transition-all duration-200 ${
              isSelected
                ? 'bg-teal-500 border-teal-400 text-white shadow-lg shadow-teal-500/30 scale-[1.02]'
                : isAvailable
                ? 'bg-white dark:bg-slate-800/80 border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200 hover:border-teal-500/50 hover:bg-slate-50 dark:hover:bg-slate-800 shadow-sm'
                : isPatientConflict
                ? 'bg-rose-50 dark:bg-rose-950/20 border-rose-200 dark:border-rose-800/50 text-rose-700 dark:text-rose-300 hover:border-rose-500/50 cursor-pointer hover:bg-rose-100 dark:hover:bg-rose-900/30'
                : 'bg-slate-100 dark:bg-slate-900/40 border-slate-200 dark:border-slate-800 text-slate-400 dark:text-slate-600 cursor-not-allowed opacity-60'
            }`}
          >
            <span>{startTime}</span>
            {isSelected ? (
              <CheckCircle2 className="w-4 h-4 text-white" />
            ) : isPatientConflict ? (
              <span className="text-[10px] uppercase font-bold text-rose-600 dark:text-rose-400 bg-rose-500/20 px-1.5 py-0.5 rounded border border-rose-500/30">My Booking</span>
            ) : !isAvailable ? (
              <span className="text-[10px] uppercase font-bold text-slate-400 dark:text-slate-600">Booked</span>
            ) : null}
          </button>
        )
      })}
    </div>
  )
}

// 5-minute Hold Timer Countdown Component
export const HoldTimer: React.FC<{ expiresAt?: string; onExpire?: () => void }> = ({
  expiresAt,
  onExpire,
}) => {
  const [secondsLeft, setSecondsLeft] = useState<number>(300)

  useEffect(() => {
    if (!expiresAt) return

    const targetTime = new Date(expiresAt).getTime()
    const updateCountdown = () => {
      const now = new Date().getTime()
      const diff = Math.max(0, Math.floor((targetTime - now) / 1000))
      setSecondsLeft(diff)
      if (diff === 0 && onExpire) {
        onExpire()
      }
    }

    updateCountdown()
    const interval = setInterval(updateCountdown, 1000)
    return () => clearInterval(interval)
  }, [expiresAt, onExpire])

  const mins = Math.floor(secondsLeft / 60)
  const secs = secondsLeft % 60
  const isUrgent = secondsLeft < 60

  return (
    <div
      className={`p-4 rounded-xl border flex items-center justify-between ${
        isUrgent
          ? 'bg-rose-500/10 border-rose-500/40 text-rose-300 animate-pulse'
          : 'bg-amber-500/10 border-amber-500/30 text-amber-300'
      }`}
    >
      <div className="flex items-center space-x-2">
        <Clock className="w-5 h-5 shrink-0" />
        <div>
          <p className="text-xs font-bold uppercase tracking-wider">Slot Reserved (5-Min Hold)</p>
          <p className="text-xs opacity-80">Complete symptom form & confirm before timer expires</p>
        </div>
      </div>
      <div className="text-lg font-mono font-bold tracking-widest">
        {mins}:{secs < 10 ? `0${secs}` : secs}
      </div>
    </div>
  )
}
