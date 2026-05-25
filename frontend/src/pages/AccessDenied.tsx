import { Link } from 'react-router-dom'
import { ShieldX, ArrowLeft, ListChecks } from 'lucide-react'
import { useAuthStore } from '../store/authStore'

/**
 * Rendered when an artist tries to open a client / project they have no tasks
 * in. The API returns 403 NO_ACCESS, the router catches that via the
 * 'shothub:no-access' event and routes here.
 *
 * Friendly copy + a clear path back to /my-work so they don't feel stuck.
 */
export function AccessDenied() {
  const isManager = useAuthStore(s => s.currentUser?.role === 'MANAGER')

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0b0f19] p-6 text-slate-100">
      <div className="max-w-md w-full text-center">
        <div className="w-16 h-16 mx-auto rounded-2xl bg-rose-500/10 border border-rose-500/30 flex items-center justify-center mb-5">
          <ShieldX className="w-8 h-8 text-rose-400" />
        </div>
        <h1 className="text-2xl font-black uppercase tracking-wide">Access denied</h1>
        <p className="text-sm text-slate-400 mt-3 leading-relaxed">
          This client or project isn't part of your assignments. If you think
          this is a mistake, ask your manager to assign you a task in it —
          you'll see it on your desk the moment they do.
        </p>

        <div className="mt-7 flex items-center justify-center gap-2 flex-wrap">
          {isManager ? (
            <Link
              to="/"
              className="inline-flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white font-bold px-4 py-2.5 rounded-lg transition-colors text-xs uppercase tracking-wider"
            >
              <ArrowLeft className="w-4 h-4" />
              Dashboard
            </Link>
          ) : (
            <Link
              to="/my-work"
              className="inline-flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white font-bold px-4 py-2.5 rounded-lg transition-colors text-xs uppercase tracking-wider"
            >
              <ListChecks className="w-4 h-4" />
              Open My Work
            </Link>
          )}
        </div>
      </div>
    </div>
  )
}
