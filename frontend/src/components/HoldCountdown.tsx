import React, { useEffect, useState } from 'react'
import { Clock, AlertTriangle, ShieldCheck } from 'lucide-react'

interface HoldCountdownProps {
  expiresAt: string
  onExpire?: () => void
}

const parseUtcTime = (isoString: string): number => {
  if (!isoString) return new Date().getTime() + 300000
  // If the ISO string doesn't include timezone info ('Z' or '+'), treat it as UTC by appending 'Z'
  const formatted = isoString.endsWith('Z') || isoString.includes('+') ? isoString : `${isoString}Z`
  return new Date(formatted).getTime()
}

export const HoldCountdown: React.FC<HoldCountdownProps> = ({ expiresAt, onExpire }) => {
  const [secondsLeft, setSecondsLeft] = useState<number>(() => {
    const expireTime = parseUtcTime(expiresAt)
    const now = new Date().getTime()
    return Math.max(0, Math.floor((expireTime - now) / 1000))
  })

  const TOTAL_HOLD_SECONDS = 300 // 5 minutes

  useEffect(() => {
    const updateCountdown = () => {
      const expireTime = parseUtcTime(expiresAt)
      const now = new Date().getTime()
      const diff = Math.max(0, Math.floor((expireTime - now) / 1000))
      setSecondsLeft(diff)

      if (diff === 0) {
        if (onExpire) onExpire()
      }
    }

    updateCountdown()
    const interval = setInterval(updateCountdown, 1000)

    return () => clearInterval(interval)
  }, [expiresAt, onExpire])

  const minutes = Math.floor(secondsLeft / 60)
  const remainderSeconds = secondsLeft % 60
  const formattedTime = `${minutes}:${remainderSeconds.toString().padStart(2, '0')}`

  const progressPercent = Math.min(100, Math.max(0, (secondsLeft / TOTAL_HOLD_SECONDS) * 100))

  // Color Shift logic: Green (>3m) -> Amber (1–3m) -> Red (<1m)
  let statusColor = 'bg-teal-500'
  let borderColor = 'border-teal-500/30'
  let textColor = 'text-teal-400'

  if (secondsLeft < 60) {
    statusColor = 'bg-rose-500'
    borderColor = 'border-rose-500/40'
    textColor = 'text-rose-400'
  } else if (secondsLeft < 180) {
    statusColor = 'bg-amber-500'
    borderColor = 'border-amber-500/40'
    textColor = 'text-amber-400'
  }

  return (
    <div className={`p-4 rounded-2xl bg-slate-900/80 border ${borderColor} shadow-xl space-y-2`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-2">
          {secondsLeft < 60 ? (
            <AlertTriangle className="w-5 h-5 text-rose-400 animate-pulse" />
          ) : (
            <ShieldCheck className="w-5 h-5 text-teal-400" />
          )}
          <span className="text-xs font-bold text-slate-200 uppercase tracking-wider">
            Slot Reserved (Pessimistic Lock)
          </span>
        </div>
        <div className="flex items-center space-x-1.5 font-mono font-extrabold text-base">
          <Clock className={`w-4 h-4 ${textColor}`} />
          <span className={textColor}>{formattedTime}</span>
        </div>
      </div>

      {/* Depleting Progress Bar */}
      <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden">
        <div
          className={`h-full ${statusColor} transition-all duration-1000 ease-linear rounded-full`}
          style={{ width: `${progressPercent}%` }}
        />
      </div>
      <p className="text-[10px] text-slate-400">
        Complete your symptom form and confirm booking before countdown expires to lock this time slot.
      </p>
    </div>
  )
}
