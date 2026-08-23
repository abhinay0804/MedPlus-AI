import React from 'react'
import { SymptomForm, PostVisitNote } from '../types'
import { Sparkles, AlertTriangle, FileText, CheckCircle2, Clock } from 'lucide-react'

interface PreVisitSummaryProps {
  symptomForm: SymptomForm
}

export const PreVisitSummaryCard: React.FC<PreVisitSummaryProps> = ({ symptomForm }) => {
  const summary = symptomForm.pre_visit_summary
  const isPending = symptomForm.llm_status === 'PENDING' || symptomForm.llm_status === 'PROCESSING'

  if (isPending) {
    return (
      <div className="bg-white dark:bg-slate-900/40 border border-slate-200 dark:border-slate-700/60 rounded-2xl p-6 relative overflow-hidden shadow-sm">
        <div className="flex items-center space-x-3 text-teal-600 dark:text-teal-400 mb-3">
          <Sparkles className="w-5 h-5 animate-pulse" />
          <h4 className="font-semibold text-sm">AI Triage Summary Processing...</h4>
        </div>
        <div className="space-y-3">
          <div className="h-4 bg-slate-100 dark:bg-slate-700/50 rounded animate-pulse w-3/4" />
          <div className="h-4 bg-slate-100 dark:bg-slate-700/50 rounded animate-pulse w-1/2" />
        </div>
      </div>
    )
  }

  if (!summary) return null

  const urgencyColors = {
    LOW: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30',
    MEDIUM: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30',
    HIGH: 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/30',
  }

  const urgency = summary.urgency_level || 'MEDIUM'

  return (
    <div className="bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-700/80 rounded-2xl p-6 shadow-sm space-y-4">
      <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
        <div className="flex items-center space-x-2 text-purple-600 dark:text-purple-400">
          <Sparkles className="w-5 h-5" />
          <h4 className="font-bold text-base text-slate-900 dark:text-white">AI Pre-Visit Triage Summary</h4>
        </div>
        <span
          className={`px-3 py-1 rounded-full text-xs font-extrabold border ${urgencyColors[urgency]} flex items-center space-x-1.5`}
        >
          <span className="w-2 h-2 rounded-full bg-current animate-ping" />
          <span>{urgency} URGENCY</span>
        </span>
      </div>

      {summary.chief_complaint && (
        <div>
          <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block mb-1">
            Chief Complaint
          </span>
          <p className="text-sm font-medium text-slate-800 dark:text-slate-200 bg-slate-50 dark:bg-slate-800/60 p-3 rounded-xl border border-slate-200 dark:border-slate-700/50">
            {summary.chief_complaint}
          </p>
        </div>
      )}

      {summary.key_symptoms && summary.key_symptoms.length > 0 && (
        <div>
          <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block mb-1.5">
            Key Symptoms Identified
          </span>
          <div className="flex flex-wrap gap-2">
            {summary.key_symptoms.map((s, idx) => (
              <span
                key={idx}
                className="px-2.5 py-1 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-lg text-xs border border-slate-200 dark:border-slate-700 font-medium"
              >
                {s}
              </span>
            ))}
          </div>
        </div>
      )}

      {summary.intake_answers ? (
        <div className="pt-2 border-t border-slate-200 dark:border-slate-800">
          <div className="flex items-center space-x-1.5 mb-2 text-teal-600 dark:text-teal-400">
            <span className="text-xs font-bold uppercase tracking-wider">Doctor's Pre-Consultation Intake Questionnaire</span>
            <span className="px-2 py-0.5 rounded-full bg-teal-500/10 text-teal-600 dark:text-teal-400 font-extrabold text-[10px] border border-teal-500/20">
              ✨ AI Auto-Filled
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            {Object.entries(summary.intake_answers).map(([question, answer], index) => (
              <div key={index} className="bg-slate-50 dark:bg-slate-800/60 p-2.5 rounded-xl border border-slate-200 dark:border-slate-700/50">
                <span className="text-slate-400 dark:text-slate-500 font-medium block">{index + 1}. {question}:</span>
                <span className="font-bold text-slate-800 dark:text-slate-200 mt-0.5 block">{String(answer || 'Not specified')}</span>
              </div>
            ))}
          </div>
        </div>
      ) : summary.suggested_questions && summary.suggested_questions.length > 0 ? (
        <div>
          <span className="text-xs font-bold text-teal-600 dark:text-teal-400 uppercase tracking-wider block mb-1.5">
            Pre-Consultation Intake Notes
          </span>
          <ul className="space-y-1.5">
            {summary.suggested_questions.map((q, idx) => (
              <li key={idx} className="text-xs text-slate-700 dark:text-slate-300 flex items-start space-x-2">
                <span className="text-teal-500 font-bold">•</span>
                <span>{q}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  )
}

interface PostVisitNoteProps {
  note: PostVisitNote
}

export const PostVisitSummaryCard: React.FC<PostVisitNoteProps> = ({ note }) => {
  return (
    <div className="bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-700/80 rounded-2xl p-6 shadow-sm space-y-4">
      <div className="flex items-center space-x-2 text-emerald-600 dark:text-emerald-400 border-b border-slate-200 dark:border-slate-800 pb-3">
        <FileText className="w-5 h-5" />
        <h4 className="font-bold text-base text-slate-900 dark:text-white">Post-Consultation Summary & Prescription</h4>
      </div>

      <div>
        <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block mb-1">
          Doctor Notes
        </span>
        <p className="text-sm text-slate-800 dark:text-slate-200 bg-slate-50 dark:bg-slate-800/60 p-3 rounded-xl border border-slate-200 dark:border-slate-700/50 whitespace-pre-line">
          {note.doctor_notes}
        </p>
      </div>

      {note.prescription_text && (
        <div>
          <span className="text-xs font-bold text-teal-600 dark:text-teal-400 uppercase tracking-wider block mb-1">
            Prescription & Instructions
          </span>
          <p className="text-sm text-teal-900 dark:text-teal-200 bg-teal-50 dark:bg-teal-950/40 p-3 rounded-xl border border-teal-200 dark:border-teal-800/40 font-mono whitespace-pre-line">
            {note.prescription_text}
          </p>
        </div>
      )}

      {note.patient_summary && (
        <div>
          <span className="text-xs font-bold text-purple-600 dark:text-purple-400 uppercase tracking-wider block mb-1">
            Patient-Friendly Explanation (AI)
          </span>
          <p className="text-sm text-slate-800 dark:text-slate-300 bg-purple-50 dark:bg-purple-950/30 p-3 rounded-xl border border-purple-200 dark:border-purple-800/30 whitespace-pre-line">
            {note.patient_summary}
          </p>
        </div>
      )}
    </div>
  )
}
