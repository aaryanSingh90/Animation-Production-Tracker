import { ANY_STATUS_CONFIG } from '../../types'
import { clsx } from 'clsx'

interface Props {
  status: string
  size?: 'sm' | 'md' | 'full'
}

const DARK_STATUS_MAP: Record<string, { label: string; text: string; bg: string; border: string; dot: string }> = {
  // Task statuses
  YET_TO_START:   { label: 'Yet to Start',   text: 'text-slate-400',    bg: 'bg-slate-500/10',      border: 'border-slate-600/40',     dot: 'bg-slate-500' },
  IN_PROGRESS:    { label: 'In Progress',    text: 'text-amber-400',    bg: 'bg-amber-500/10',      border: 'border-amber-500/30',     dot: 'bg-amber-400 shadow-[0_0_8px_rgba(245,158,11,0.5)]' },
  LEAD_APPROVAL:  { label: 'Pending Approval', text: 'text-sky-400',   bg: 'bg-sky-500/10',        border: 'border-sky-500/30',       dot: 'bg-sky-400 shadow-[0_0_8px_rgba(56,189,248,0.5)] animate-pulse' },
  LEAD_RETAKE:    { label: 'Retake',           text: 'text-rose-400',  bg: 'bg-rose-500/15',       border: 'border-rose-500/40',      dot: 'bg-rose-400 shadow-[0_0_8px_rgba(244,63,94,0.5)] animate-pulse' },
  DONE:           { label: 'Done',           text: 'text-teal-400',     bg: 'bg-teal-500/15',       border: 'border-teal-500/40',      dot: 'bg-teal-400' },
  FINAL_APPROVAL: { label: 'Final Approval', text: 'text-green-400',    bg: 'bg-green-500/20',      border: 'border-green-500/50',     dot: 'bg-green-400 shadow-[0_0_10px_rgba(34,197,94,0.6)]' },

  // Audio statuses
  RECEIVED:         { label: 'Audio Received',  text: 'text-blue-400',     bg: 'bg-blue-500/10',       border: 'border-blue-500/30',      dot: 'bg-blue-400' },
  RETAKE:           { label: 'Retake',           text: 'text-rose-400',     bg: 'bg-rose-500/15',       border: 'border-rose-500/40',      dot: 'bg-rose-400 animate-pulse' },
  DONE_INHOUSE:     { label: 'Done Inhouse',     text: 'text-teal-400',     bg: 'bg-teal-500/15',       border: 'border-teal-500/40',      dot: 'bg-teal-400' },
  WIP_INHOUSE:      { label: 'WIP Inhouse',      text: 'text-fuchsia-400',  bg: 'bg-fuchsia-500/10',    border: 'border-fuchsia-500/30',   dot: 'bg-fuchsia-400' },
  APPROVED_INHOUSE: { label: 'Approved Inhouse', text: 'text-indigo-400',   bg: 'bg-indigo-500/15',     border: 'border-indigo-500/40',    dot: 'bg-indigo-400' },
}

export function StatusPill({ status, size = 'md' }: Props) {
  const fallback = ANY_STATUS_CONFIG[status] ?? { label: status, color: 'text-slate-400', bg: 'bg-slate-800' }
  const cfg = DARK_STATUS_MAP[status] ?? {
    label: fallback.label,
    text: 'text-slate-400',
    bg: 'bg-slate-800/40',
    border: 'border-slate-700/50',
    dot: 'bg-slate-500',
  }

  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1.5 rounded border font-semibold tracking-wide uppercase transition-all duration-150',
        cfg.bg, cfg.text, cfg.border,
        size === 'sm'   ? 'px-2 py-0.5 text-[9px]' :
        size === 'full' ? 'w-full justify-center py-1.5 text-[10px] rounded-none border-0' :
                          'px-2.5 py-1 text-[10px]'
      )}
    >
      <span className={clsx('w-1.5 h-1.5 rounded-full shrink-0', cfg.dot)} />
      {cfg.label}
    </span>
  )
}
