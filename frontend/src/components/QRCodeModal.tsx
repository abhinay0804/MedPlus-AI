import React from 'react'
import { QrCode, X, ShieldCheck } from 'lucide-react'

interface QRCodeModalProps {
  appointmentId: string
  patientName: string
  doctorName: string
  slotStart: string
  onClose: () => void
}

export const QRCodeModal: React.FC<QRCodeModalProps> = ({
  appointmentId,
  patientName,
  doctorName,
  slotStart,
  onClose,
}) => {
  // Construct verification URL payload dynamically based on host location
  const qrPayload = `${window.location.origin}/patient/appointments/${appointmentId}`

  return (
    <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 w-full max-w-sm text-center space-y-4 shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center space-x-2 text-teal-400">
            <QrCode className="w-5 h-5" />
            <h3 className="font-bold text-white text-base">Appointment QR Verification</h3>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* QR Code Container */}
        <div className="bg-white p-6 rounded-2xl mx-auto inline-block border-4 border-teal-500/30 shadow-inner">
          <img
            src={`https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(qrPayload)}`}
            alt="Appointment Verification QR Code"
            className="w-44 h-44 mx-auto"
          />
        </div>

        <div className="text-xs text-slate-400 space-y-1">
          <p className="font-bold text-white">{patientName}</p>
          <p>Consultation with {doctorName}</p>
          <p className="font-mono text-[10px] text-slate-500">ID: {appointmentId}</p>
        </div>

        <div className="pt-3 border-t border-slate-800 flex items-center justify-center space-x-1.5 text-emerald-400 text-xs font-bold">
          <ShieldCheck className="w-4 h-4" />
          <span>Verified Digital Medical Record</span>
        </div>
      </div>
    </div>
  )
}
