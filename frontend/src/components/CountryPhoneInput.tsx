import React from 'react'

export interface Country {
  name: string
  code: string
  dialCode: string
  flag: string
}

export const COUNTRIES: Country[] = [
  { name: 'India', code: 'IN', dialCode: '+91', flag: '🇮🇳' },
  { name: 'United States', code: 'US', dialCode: '+1', flag: '🇺🇸' },
  { name: 'United Kingdom', code: 'GB', dialCode: '+44', flag: '🇬🇧' },
  { name: 'Australia', code: 'AU', dialCode: '+61', flag: '🇦🇺' },
  { name: 'Canada', code: 'CA', dialCode: '+1', flag: '🇨🇦' },
  { name: 'Singapore', code: 'SG', dialCode: '+65', flag: '🇸🇬' },
  { name: 'United Arab Emirates', code: 'AE', dialCode: '+971', flag: '🇦🇪' },
  { name: 'Germany', code: 'DE', dialCode: '+49', flag: '🇩🇪' },
]

interface CountryPhoneInputProps {
  selectedCountry: Country
  onCountryChange: (country: Country) => void
  nationalNumber: string
  onNationalNumberChange: (number: string) => void
}

export const CountryPhoneInput: React.FC<CountryPhoneInputProps> = ({
  selectedCountry,
  onCountryChange,
  nationalNumber,
  onNationalNumberChange,
}) => {
  const handleNumberChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    // Strict 10 digits MAX, digits only
    const digitsOnly = e.target.value.replace(/\D/g, '').slice(0, 10)
    onNationalNumberChange(digitsOnly)
  }

  return (
    <div className="flex space-x-2">
      {/* Country Selector Dropdown */}
      <div className="relative shrink-0 w-36">
        <select
          value={selectedCountry.code}
          onChange={(e) => {
            const found = COUNTRIES.find((c) => c.code === e.target.value)
            if (found) onCountryChange(found)
          }}
          className="w-full h-full py-3 pl-3 pr-8 bg-slate-50 dark:bg-slate-900/60 border border-slate-300 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white text-xs sm:text-sm focus:outline-none focus:border-teal-500 transition cursor-pointer appearance-none"
        >
          {COUNTRIES.map((c) => (
            <option key={c.code} value={c.code} className="bg-white dark:bg-slate-900 text-slate-900 dark:text-white py-1">
              {c.flag} {c.dialCode} ({c.code})
            </option>
          ))}
        </select>
        <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-slate-400">
          <svg className="w-4 h-4 fill-current" viewBox="0 0 20 20">
            <path d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" />
          </svg>
        </div>
      </div>

      {/* 10-Digit Phone Input */}
      <div className="relative flex-1">
        <input
          type="tel"
          maxLength={10}
          value={nationalNumber}
          onChange={handleNumberChange}
          placeholder="10-digit mobile number"
          className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-900/60 border border-slate-300 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:border-teal-500 text-sm transition"
        />
        {nationalNumber.length > 0 && (
          <span className={`absolute right-3 top-3.5 text-xs font-semibold ${nationalNumber.length === 10 ? 'text-teal-600 dark:text-teal-400' : 'text-amber-500'}`}>
            {nationalNumber.length}/10
          </span>
        )}
      </div>
    </div>
  )
}
