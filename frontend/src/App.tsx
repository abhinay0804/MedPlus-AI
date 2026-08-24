import React from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Toaster } from 'sonner'
import { AuthProvider } from './context/AuthContext'
import { ThemeProvider } from './components/ThemeProvider'
import { RequireAuth } from './components/RequireAuth'
import { Landing } from './pages/Landing'
import { Login } from './pages/Login'
import { Register } from './pages/Register'
import { PatientDashboard } from './pages/patient/PatientDashboard'
import { DoctorSearch } from './pages/patient/DoctorSearch'
import { BookAppointment } from './pages/patient/BookAppointment'
import { Appointments } from './pages/patient/Appointments'
import { AppointmentDetail } from './pages/patient/AppointmentDetail'
import { PatientSettings } from './pages/patient/Settings'
import { DoctorDashboard } from './pages/doctor/DoctorDashboard'
import { DoctorSettings } from './pages/doctor/Settings'
import { DoctorAnalytics } from './pages/doctor/Analytics'
import { AdminDashboard } from './pages/admin/AdminDashboard'
import { DoctorManagement } from './pages/admin/DoctorManagement'
import { DoctorDetail } from './pages/admin/DoctorDetail'
import { DoctorPerformance } from './pages/admin/DoctorPerformance'
import { LeaveManager } from './pages/admin/LeaveManager'
import { AuditLogPage } from './pages/admin/AuditLog'
import { Appointments as AdminAppointments } from './pages/admin/Appointments'
import { Patients as AdminPatients } from './pages/admin/Patients'

export const App: React.FC = () => {
  return (
    <ThemeProvider>
      <Toaster position="top-right" richColors />
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            {/* SaaS Landing Page */}
            <Route path="/" element={<Landing />} />

            {/* Public Auth Routes */}
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />

            {/* Patient Routes */}
            <Route
              path="/patient/dashboard"
              element={
                <RequireAuth allowedRoles={['PATIENT']}>
                  <PatientDashboard />
                </RequireAuth>
              }
            />
            <Route
              path="/patient/doctors"
              element={
                <RequireAuth allowedRoles={['PATIENT']}>
                  <DoctorSearch />
                </RequireAuth>
              }
            />
            <Route
              path="/patient/book/:doctorId"
              element={
                <RequireAuth allowedRoles={['PATIENT']}>
                  <BookAppointment />
                </RequireAuth>
              }
            />
            <Route
              path="/patient/doctors/:doctorId/book"
              element={
                <RequireAuth allowedRoles={['PATIENT']}>
                  <BookAppointment />
                </RequireAuth>
              }
            />
            <Route
              path="/patient/appointments"
              element={
                <RequireAuth allowedRoles={['PATIENT']}>
                  <Appointments />
                </RequireAuth>
              }
            />
            <Route
              path="/patient/appointments/:id"
              element={
                <RequireAuth allowedRoles={['PATIENT']}>
                  <AppointmentDetail />
                </RequireAuth>
              }
            />
            <Route
              path="/patient/settings"
              element={
                <RequireAuth allowedRoles={['PATIENT']}>
                  <PatientSettings />
                </RequireAuth>
              }
            />

            {/* Doctor Routes */}
            <Route
              path="/doctor/dashboard"
              element={
                <RequireAuth allowedRoles={['DOCTOR']}>
                  <DoctorDashboard />
                </RequireAuth>
              }
            />
            <Route
              path="/doctor/analytics"
              element={
                <RequireAuth allowedRoles={['DOCTOR']}>
                  <DoctorAnalytics />
                </RequireAuth>
              }
            />
            <Route
              path="/doctor/settings"
              element={
                <RequireAuth allowedRoles={['DOCTOR']}>
                  <DoctorSettings />
                </RequireAuth>
              }
            />

            {/* Admin Routes */}
            <Route
              path="/admin/dashboard"
              element={
                <RequireAuth allowedRoles={['ADMIN']}>
                  <AdminDashboard />
                </RequireAuth>
              }
            />
            <Route
              path="/admin/doctors"
              element={
                <RequireAuth allowedRoles={['ADMIN']}>
                  <DoctorManagement />
                </RequireAuth>
              }
            />
            <Route
              path="/admin/doctors/:id"
              element={
                <RequireAuth allowedRoles={['ADMIN']}>
                  <DoctorDetail />
                </RequireAuth>
              }
            />
            <Route
              path="/admin/doctors/:id/performance"
              element={
                <RequireAuth allowedRoles={['ADMIN']}>
                  <DoctorPerformance />
                </RequireAuth>
              }
            />
            <Route
              path="/admin/leave"
              element={
                <RequireAuth allowedRoles={['ADMIN']}>
                  <LeaveManager />
                </RequireAuth>
              }
            />
            <Route
              path="/admin/audit"
              element={
                <RequireAuth allowedRoles={['ADMIN']}>
                  <AuditLogPage />
                </RequireAuth>
              }
            />
            <Route
              path="/admin/appointments"
              element={
                <RequireAuth allowedRoles={['ADMIN']}>
                  <AdminAppointments />
                </RequireAuth>
              }
            />
            <Route
              path="/admin/patients"
              element={
                <RequireAuth allowedRoles={['ADMIN']}>
                  <AdminPatients />
                </RequireAuth>
              }
            />

            {/* Fallback Redirect */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </ThemeProvider>
  )
}

export default App
