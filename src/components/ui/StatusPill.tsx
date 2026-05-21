import { STATUS_CONFIG, type TaskStatus } from '../../types'
import { clsx } from 'clsx'

const COLOR_CLASSES: Record<string, string> = {
  gray:   'bg-gray-100 text-gray-700 border-gray-200',
  amber:  'bg-amber-100 text-amber-800 border-amber-200',
  blue:   'bg-blue-100 text-blue-800 border-blue-200',
  green:  'bg-green-100 text-green-800 border-green-200',
  red:    'bg-red-100 text-red-800 border-red-200',
  purple: 'bg-purple-100 text-purple-800 border-purple-200',
}

interface Props {
  status: TaskStatus
  size?: 'sm' | 'md'
}

export function StatusPill({ status, size = 'md' }: Props) {
  const cfg = STATUS_CONFIG[status]
  return (
    <span
      className={clsx(
        'inline-flex items-center rounded-full border font-medium transition-colors duration-150',
        COLOR_CLASSES[cfg.color],
        size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-2.5 py-1 text-xs'
      )}
    >
      {cfg.label}
    </span>
  )
}
