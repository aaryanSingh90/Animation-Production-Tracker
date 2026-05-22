import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { X, AlertTriangle, CheckCircle, Clock, Info, AlertCircle } from 'lucide-react'
import { clsx } from 'clsx'
import { useToastStore, type Toast, type ToastKind } from '../../store/toastStore'

const KIND_STYLE: Record<ToastKind, { border: string; bg: string; icon: typeof Info }> = {
  retake:   { border: 'border-rose-500/40',    bg: 'bg-rose-500/10',    icon: AlertTriangle },
  approval: { border: 'border-emerald-500/40', bg: 'bg-emerald-500/10', icon: CheckCircle },
  review:   { border: 'border-sky-500/40',     bg: 'bg-sky-500/10',     icon: Clock },
  info:     { border: 'border-indigo-500/40',  bg: 'bg-indigo-500/10',  icon: Info },
  error:    { border: 'border-rose-500/40',    bg: 'bg-rose-500/10',    icon: AlertCircle },
}

const KIND_ACCENT: Record<ToastKind, string> = {
  retake:   'text-rose-400',
  approval: 'text-emerald-400',
  review:   'text-sky-400',
  info:     'text-indigo-400',
  error:    'text-rose-400',
}

export function ToastHost() {
  const toasts = useToastStore(s => s.toasts)
  return (
    <div className="fixed top-4 right-4 z-[100] flex flex-col gap-2 max-w-sm pointer-events-none">
      {toasts.slice(-4).map(t => (
        <ToastItem key={t.id} toast={t} />
      ))}
    </div>
  )
}

function ToastItem({ toast }: { toast: Toast }) {
  const dismiss = useToastStore(s => s.dismiss)
  const navigate = useNavigate()
  const style = KIND_STYLE[toast.kind]
  const Icon = style.icon

  // Auto-dismiss
  useEffect(() => {
    const ttl = toast.ttl ?? 6500
    if (!ttl) return
    const id = setTimeout(() => dismiss(toast.id), ttl)
    return () => clearTimeout(id)
  }, [toast.id, toast.ttl, dismiss])

  function handleView() {
    if (toast.projectHref) {
      const sep = toast.projectHref.includes('?') ? '&' : '?'
      navigate(toast.taskId ? `${toast.projectHref}${sep}open=${toast.taskId}` : toast.projectHref)
    } else if (toast.taskId) {
      // Best-effort: route to MyWork so artist can find it. The link in MyWork has ?open.
      navigate('/my-work')
    }
    dismiss(toast.id)
  }

  return (
    <div
      role="status"
      className={clsx(
        'pointer-events-auto flex items-start gap-3 px-3.5 py-3 rounded-lg border shadow-2xl shadow-black/60 backdrop-blur-md',
        'bg-[#0c1221]/95 text-slate-100 animate-in slide-in-from-right-5 duration-200',
        style.border,
      )}
    >
      <div className={clsx('w-7 h-7 rounded-md flex items-center justify-center shrink-0', style.bg)}>
        <Icon className={clsx('w-4 h-4', KIND_ACCENT[toast.kind])} />
      </div>
      <div className="flex-1 min-w-0">
        <div className={clsx('text-[11px] font-black uppercase tracking-wider', KIND_ACCENT[toast.kind])}>
          {toast.title}
        </div>
        {toast.body && (
          <div className="text-xs text-slate-300 mt-1 leading-relaxed line-clamp-3">
            {toast.body}
          </div>
        )}
        {(toast.taskId || toast.projectHref) && (
          <button
            onClick={handleView}
            className="mt-2 text-[10px] font-black uppercase tracking-wider text-indigo-400 hover:text-indigo-300 transition-colors"
          >
            View task →
          </button>
        )}
      </div>
      <button
        onClick={() => dismiss(toast.id)}
        className="p-1 -mr-1 rounded text-slate-500 hover:text-slate-200 hover:bg-[#162035] transition-colors shrink-0"
        aria-label="Dismiss"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  )
}
