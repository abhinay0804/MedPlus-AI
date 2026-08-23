import React from 'react'
import { Check, X } from 'lucide-react'

interface PasswordStrengthChecklistProps {
  password: string
}

export const getPasswordRequirements = (pwd: string) => {
  return {
    length: pwd.length >= 8,
    casing: /[A-Z]/.test(pwd) && /[a-z]/.test(pwd),
    number: /\d/.test(pwd),
    special: /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>/?]/.test(pwd),
  }
}

export const isPasswordStrong = (pwd: string) => {
  const reqs = getPasswordRequirements(pwd)
  return reqs.length && reqs.casing && reqs.number && reqs.special
}

export const PasswordStrengthChecklist: React.FC<PasswordStrengthChecklistProps> = ({ password }) => {
  // Hide tracker if password is empty or verified strong. Reappears on backspace/policy violation.
  if (!password || isPasswordStrong(password)) return null

  const reqs = getPasswordRequirements(password)

  const items = [
    { label: 'At least 8 characters', met: reqs.length },
    { label: 'Uppercase & Lowercase letters (A-Z, a-z)', met: reqs.casing },
    { label: 'At least 1 number (0-9)', met: reqs.number },
    { label: 'At least 1 special char (@, $, !, %, etc.)', met: reqs.special },
  ]

  return (
    <div className="mt-2 p-3 bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 rounded-xl space-y-1.5 text-xs">
      <div className="font-semibold text-slate-700 dark:text-slate-300 text-[11px] uppercase tracking-wider mb-1">
        Password Strength Policy
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
        {items.map((item, i) => (
          <div
            key={i}
            className={`flex items-center space-x-1.5 ${
              item.met ? 'text-emerald-600 dark:text-emerald-400 font-medium' : 'text-slate-400 dark:text-slate-500'
            }`}
          >
            {item.met ? (
              <Check className="w-3.5 h-3.5 shrink-0 text-emerald-500" />
            ) : (
              <X className="w-3.5 h-3.5 shrink-0 text-slate-400 opacity-60" />
            )}
            <span>{item.label}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
