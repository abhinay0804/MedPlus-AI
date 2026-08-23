import React from 'react'

export const SkeletonCard: React.FC = () => (
  <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6 space-y-4 animate-pulse">
    <div className="flex items-center space-x-4">
      <div className="w-14 h-14 rounded-2xl bg-slate-800" />
      <div className="space-y-2 flex-1">
        <div className="h-4 bg-slate-800 rounded w-3/4" />
        <div className="h-3 bg-slate-800/60 rounded w-1/2" />
      </div>
    </div>
    <div className="h-10 bg-slate-800/40 rounded-xl" />
    <div className="h-9 bg-slate-800/60 rounded-xl" />
  </div>
)

export const SkeletonRow: React.FC = () => (
  <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5 flex items-center justify-between animate-pulse">
    <div className="flex items-center space-x-4">
      <div className="w-12 h-12 rounded-xl bg-slate-800 shrink-0" />
      <div className="space-y-2">
        <div className="h-4 bg-slate-800 rounded w-48" />
        <div className="h-3 bg-slate-800/60 rounded w-32" />
      </div>
    </div>
    <div className="h-8 bg-slate-800 rounded-xl w-28" />
  </div>
)

export const SkeletonSlotGrid: React.FC = () => (
  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 animate-pulse">
    {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
      <div key={i} className="h-12 bg-slate-800/60 rounded-xl border border-slate-700/40" />
    ))}
  </div>
)
