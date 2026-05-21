import { NavLink } from 'react-router-dom'
import { LayoutDashboard, Users, Briefcase, Grid3X3, Settings, Film } from 'lucide-react'
import { clsx } from 'clsx'

const NAV_ITEMS = [
  { to: '/',        icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/clients', icon: Briefcase,       label: 'Clients' },
  { to: '/team',    icon: Users,           label: 'Team' },
  { to: '/shots',   icon: Grid3X3,         label: 'Shot Matrix' },
  { to: '/settings',icon: Settings,        label: 'Settings' },
]

export function Sidebar() {
  return (
    <aside className="w-56 shrink-0 flex flex-col bg-slate-900 min-h-screen">
      <div className="flex items-center gap-3 px-5 py-5 border-b border-slate-700">
        <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center">
          <Film className="w-4 h-4 text-white" />
        </div>
        <div>
          <div className="text-sm font-semibold text-white leading-none">PipelineTracker</div>
          <div className="text-xs text-slate-400 mt-0.5">Animation Studio</div>
        </div>
      </div>

      <nav className="flex-1 p-3 space-y-0.5">
        {NAV_ITEMS.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) =>
              clsx(
                'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors',
                isActive
                  ? 'bg-indigo-600 text-white font-medium'
                  : 'text-slate-300 hover:bg-slate-800 hover:text-white'
              )
            }
          >
            <Icon className="w-4 h-4 shrink-0" />
            {label}
          </NavLink>
        ))}
      </nav>

      <div className="p-3 border-t border-slate-700">
        <div className="flex items-center gap-2 px-3 py-2">
          <div className="w-7 h-7 rounded-full bg-indigo-600 flex items-center justify-center text-xs font-bold text-white">
            M
          </div>
          <div>
            <div className="text-xs font-medium text-white">Manager</div>
            <div className="text-xs text-slate-400">Admin</div>
          </div>
        </div>
      </div>
    </aside>
  )
}
