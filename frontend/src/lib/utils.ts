import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function parseDate(dateString: string | Date): Date {
  if (dateString instanceof Date) return dateString
  if (!dateString) return new Date()
  const formatted = dateString.endsWith('Z') || dateString.includes('+') ? dateString : `${dateString}Z`
  return new Date(formatted)
}

export function formatDate(dateString: string | Date): string {
  const d = parseDate(dateString)
  return d.toLocaleDateString(undefined, {
    weekday: 'short',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

export function formatTime(dateString: string | Date): string {
  const d = parseDate(dateString)
  return d.toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  })
}

export function formatDateTime(dateString: string | Date): string {
  return `${formatDate(dateString)} at ${formatTime(dateString)}`
}

export function sanitizePhone(val: string): string {
  // Allow only optional leading '+' followed strictly by numeric digits, max 16 chars (+ and 15 digits)
  let cleaned = val.replace(/[^\d+]/g, '')
  if (cleaned.startsWith('+')) {
    cleaned = '+' + cleaned.slice(1).replace(/\+/g, '')
  } else {
    cleaned = cleaned.replace(/\+/g, '')
  }
  return cleaned.slice(0, 16)
}

export function isValidPhone(val: string): boolean {
  if (!val || !val.trim()) return false
  const cleaned = sanitizePhone(val)
  const digits = cleaned.replace(/\D/g, '')

  // 1. Must be between 10 and 15 digits
  if (digits.length < 10 || digits.length > 15) return false

  // 2. Reject all identical repeated digits (e.g. 0000000000, 1111111111, 3333333333)
  if (/^(\d)\1+$/.test(digits)) return false

  // 3. Reject simple ascending or descending sequences (e.g. 1234567890, 9876543210)
  if ('0123456789012345'.includes(digits) || '9876543210987654'.includes(digits)) return false

  // 4. Reject invalid country prefixes like +00
  if (cleaned.startsWith('+0') || cleaned.startsWith('000')) return false

  return true
}

export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
}
