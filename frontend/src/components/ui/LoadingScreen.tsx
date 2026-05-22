import { Film } from 'lucide-react'

export function LoadingScreen() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-slate-900 gap-4">
      <div className="w-12 h-12 rounded-2xl bg-indigo-600 flex items-center justify-center animate-pulse">
        <Film className="w-6 h-6 text-white" />
      </div>
      <p className="text-slate-400 text-sm">Loading pipeline…</p>
    </div>
  )
}
