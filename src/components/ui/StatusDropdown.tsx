import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { ChevronDown } from 'lucide-react'
import { STATUS_CONFIG, type TaskStatus } from '../../types'
import { StatusPill } from './StatusPill'

const ALL_STATUSES = Object.keys(STATUS_CONFIG) as TaskStatus[]

const DOT_COLORS: Record<string, string> = {
  gray:   'bg-gray-400',
  amber:  'bg-amber-500',
  blue:   'bg-blue-500',
  green:  'bg-green-500',
  red:    'bg-red-500',
  purple: 'bg-purple-500',
}

interface Props {
  value: TaskStatus
  onChange: (v: TaskStatus) => void
  compact?: boolean
}

export function StatusDropdown({ value, onChange, compact }: Props) {
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button className="flex items-center gap-1 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500">
          <StatusPill status={value} size={compact ? 'sm' : 'md'} />
          <ChevronDown className="w-3 h-3 text-gray-400 shrink-0" />
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          className="z-50 min-w-[180px] rounded-lg border border-gray-200 bg-white shadow-lg p-1"
          sideOffset={4}
        >
          {ALL_STATUSES.map(s => {
            const cfg = STATUS_CONFIG[s]
            return (
              <DropdownMenu.Item
                key={s}
                onSelect={() => onChange(s)}
                className="flex items-center gap-2 px-3 py-2 text-sm rounded-md cursor-pointer hover:bg-gray-50 focus:bg-gray-50 focus:outline-none"
              >
                <span className={`w-2 h-2 rounded-full shrink-0 ${DOT_COLORS[cfg.color]}`} />
                {cfg.label}
                {value === s && <span className="ml-auto text-indigo-600">✓</span>}
              </DropdownMenu.Item>
            )
          })}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  )
}
