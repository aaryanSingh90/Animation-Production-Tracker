import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { ChevronDown } from 'lucide-react'
import {
  STATUS_CONFIG, AUDIO_STATUS_CONFIG,
  type TaskStatus, type AudioStatus,
} from '../../types'
import { StatusPill } from './StatusPill'

interface TaskProps {
  mode?: 'task'
  value: TaskStatus
  onChange: (v: TaskStatus) => void
  compact?: boolean
}

interface AudioProps {
  mode: 'audio'
  value: AudioStatus
  onChange: (v: AudioStatus) => void
  compact?: boolean
}

type Props = TaskProps | AudioProps

export function StatusDropdown({ mode, value, onChange, compact }: Props) {
  const isAudio = mode === 'audio'
  const entries = isAudio
    ? (Object.entries(AUDIO_STATUS_CONFIG) as [AudioStatus, { label: string; color: string; bg: string }][])
    : (Object.entries(STATUS_CONFIG) as [TaskStatus, { label: string; color: string; bg: string }][])

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button className="flex items-center justify-between gap-1 w-full rounded border border-[#1b253b] hover:border-indigo-500/50 bg-[#0d1424] hover:bg-[#131d33] px-2.5 py-1 text-left transition-colors focus:outline-none focus:ring-1 focus:ring-indigo-500">
          <StatusPill status={value} size={compact ? 'sm' : 'md'} />
          <ChevronDown className="w-3 h-3 text-slate-400 shrink-0" />
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          className="z-50 min-w-[200px] rounded-lg border border-[#1b253b] bg-[#0c1221] shadow-2xl p-1 animate-in fade-in slide-in-from-top-1 duration-100"
          sideOffset={4}
        >
          {entries.map(([key, cfg]) => (
            <DropdownMenu.Item
              key={key}
              onSelect={() => (onChange as (v: string) => void)(key)}
              className="flex items-center gap-2.5 px-3 py-1.5 text-xs font-semibold text-slate-300 rounded-md cursor-pointer hover:bg-[#151f33] hover:text-white focus:bg-[#151f33] focus:text-white focus:outline-none transition-colors"
            >
              <span className={`w-2 h-2 rounded-full shrink-0 ${cfg.bg.replace('bg-', 'bg-').replace('-100', '-500')}`} />
              <span className="flex-1">{cfg.label}</span>
              {value === key && <span className="text-indigo-400 text-xs font-bold">✓</span>}
            </DropdownMenu.Item>
          ))}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  )
}
