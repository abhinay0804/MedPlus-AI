import React from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { UserRole } from '../types'

interface RequireAuthProps {
  children: React.ReactNode
  allowedRoles?: UserRole[]
}

export const RequireAuth: React.FC<RequireAuthProps> = ({ children, allowedRoles }) => {
  const { user, isLoading } = useAuth()
  const location = useLocation()

  if (isLoading) {
    let loadingText = "Verifying session & loading portal..."
    if (location.pathname.includes('/patient/appointments')) {
      loadingText = "Loading your appointments..."
    } else if (location.pathname.includes('/patient/doctors')) {
      loadingText = "Loading available doctors..."
    } else if (location.pathname.includes('/doctor/')) {
      loadingText = "Loading doctor portal & consultations..."
    } else if (location.pathname.includes('/admin/')) {
      loadingText = "Loading admin portal..."
    }

    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-900 text-slate-100">
        <div className="flex flex-col items-center space-y-4">
          <div className="w-12 h-12 border-4 border-teal-500 border-t-transparent rounded-full animate-spin"></div>
          <p className="text-slate-300 font-semibold text-sm tracking-wide">{loadingText}</p>
        </div>
      </div>
    )
  }

  const tokenInStorage = localStorage.getItem('access_token')

  if (!user || !tokenInStorage) {
    return <Navigate to="/login" state={{ from: location }} replace />
  }

  if (allowedRoles && !allowedRoles.includes(user.role)) {
    // Redirect to proper role dashboard if unauthorized
    if (user.role === 'ADMIN') return <Navigate to="/admin/dashboard" replace />
    if (user.role === 'DOCTOR') return <Navigate to="/doctor/dashboard" replace />
    return <Navigate to="/patient/dashboard" replace />
  }

  return <>{children}</>
}
