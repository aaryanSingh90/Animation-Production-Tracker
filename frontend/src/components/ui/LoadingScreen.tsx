import { Film } from 'lucide-react'

export function LoadingScreen() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-[#0b0f19] gap-4">
      <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-indigo-500 to-indigo-700 flex items-center justify-center shadow-lg shadow-indigo-950/50 animate-pulse">
        <Film className="w-6 h-6 text-white" />
      </div>
      <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">Loading pipeline…</p>
    </div>
  )
}
