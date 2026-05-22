import * as Dialog from '@radix-ui/react-dialog'
import { AlertTriangle } from 'lucide-react'

interface Props {
  open: boolean
  onOpenChange: (v: boolean) => void
  title: string
  description: string
  confirmLabel?: string
  onConfirm: () => void
  destructive?: boolean
}

export function ConfirmDialog({
  open, onOpenChange, title, description, confirmLabel = 'Confirm', onConfirm, destructive,
}: Props) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/60 z-50 backdrop-blur-sm" />
        <Dialog.Content className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-full max-w-md bg-[#0c1221] border border-[#1b253b] rounded-xl shadow-2xl shadow-black/60 p-6 focus:outline-none">
          <div className="flex items-start gap-4">
            <div className={`shrink-0 w-10 h-10 rounded-full flex items-center justify-center ${destructive ? 'bg-rose-500/15' : 'bg-amber-500/15'}`}>
              <AlertTriangle className={`w-5 h-5 ${destructive ? 'text-rose-400' : 'text-amber-400'}`} />
            </div>
            <div className="flex-1">
              <Dialog.Title className="text-sm font-black uppercase tracking-wide text-slate-100">{title}</Dialog.Title>
              <Dialog.Description className="mt-1.5 text-xs text-slate-400 leading-relaxed">{description}</Dialog.Description>
            </div>
          </div>
          <div className="mt-6 flex justify-end gap-3">
            <button
              onClick={() => onOpenChange(false)}
              className="px-4 py-2 text-xs font-bold uppercase tracking-wider text-slate-400 bg-transparent border border-[#1b253b] rounded-lg hover:bg-[#131b2e] hover:text-slate-200 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={() => { onConfirm(); onOpenChange(false) }}
              className={`px-4 py-2 text-xs font-bold uppercase tracking-wider text-white rounded-lg transition-colors ${destructive ? 'bg-rose-600 hover:bg-rose-500' : 'bg-indigo-600 hover:bg-indigo-500'}`}
            >
              {confirmLabel}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
