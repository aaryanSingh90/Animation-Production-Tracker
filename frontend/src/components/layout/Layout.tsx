import { Outlet } from 'react-router-dom'
import { Sidebar } from './Sidebar'
import { ToastHost } from '../ui/ToastHost'
import { useNotifications } from '../../hooks/useNotifications'

export function Layout() {
  useNotifications()
  return (
    <div className="flex min-h-screen bg-[#0b0f19] text-slate-100">
      <Sidebar />
      <main className="flex-1 min-w-0 overflow-auto">
        <Outlet />
      </main>
      <ToastHost />
    </div>
  )
}
