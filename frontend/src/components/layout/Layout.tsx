import { Outlet } from 'react-router-dom'
import { Sidebar } from './Sidebar'
import { ToastHost } from '../ui/ToastHost'
import { useNotifications } from '../../hooks/useNotifications'

export function Layout() {
  useNotifications()
  // flex-col stacks the mobile top bar above the page; lg:flex-row puts the
  // desktop sidebar to the left of the main area. The Sidebar component
  // handles which of its sub-views (top bar / aside / drawer) is actually
  // visible at each breakpoint, so this layout works for both modes.
  return (
    <div className="flex flex-col lg:flex-row min-h-screen bg-[#0b0f19] text-slate-100">
      <Sidebar />
      <main className="flex-1 min-w-0 overflow-auto">
        <Outlet />
      </main>
      <ToastHost />
    </div>
  )
}
