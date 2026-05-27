import { Outlet } from 'react-router-dom'
import { WifiOff } from 'lucide-react'
import { Sidebar } from './Sidebar'
import { ToastHost } from '../ui/ToastHost'
import { useNotifications } from '../../hooks/useNotifications'
import { useSseStore } from '../../api/sse'

export function Layout() {
  useNotifications()
  // BUG-14: Show a sticky banner when the SSE connection drops so users know
  // live updates are paused. Banner hides automatically on reconnect.
  const sseConnected = useSseStore(s => s.connected)

  // flex-col stacks the mobile top bar above the page; lg:flex-row puts the
  // desktop sidebar to the left of the main area. The Sidebar component
  // handles which of its sub-views (top bar / aside / drawer) is actually
  // visible at each breakpoint, so this layout works for both modes.
  return (
    <div className="flex flex-col lg:flex-row min-h-screen bg-[#0b0f19] text-slate-100">
      <Sidebar />
      <main className="flex-1 min-w-0 overflow-auto">
        {sseConnected === false && (
          <div className="sticky top-0 z-30 flex items-center gap-2 px-4 py-2 bg-amber-500/10 border-b border-amber-500/20 text-xs font-bold text-amber-400 backdrop-blur-sm">
            <WifiOff className="w-3.5 h-3.5 shrink-0" />
            Reconnecting — live updates paused
          </div>
        )}
        <Outlet />
      </main>
      <ToastHost />
    </div>
  )
}
