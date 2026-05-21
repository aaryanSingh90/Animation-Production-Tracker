import { NavLink } from 'react-router-dom'
import { LayoutDashboard, Users, Briefcase, Grid3X3, Settings, Film, LogOut } from 'lucide-react'
import { clsx } from 'clsx'
import { useAuthStore } from '../../store/authStore'

const MANAGER_NAV = [
  { to: '/',         icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/clients',  icon: Briefcase,       label: 'Clients' },
  { to: '/team',     icon: Users,           label: 'Team' },
  { to: '/shots',    icon: Grid3X3,         label: 'Shot Matrix' },
  { to: '/settings', icon: Settings,        label: 'Settings' },
]

const TEAM_NAV = [
  { to: '/',        icon: LayoutDashboard, label: 'My Dashboard' },
  { to: '/clients', icon: Briefcase,       label: 'My Projects' },
  { to: '/shots',   icon: Grid3X3,         label: 'Shot Matrix' },
]

export function Sidebar() {
  const currentUser = useAuthStore(s => s.currentUser)
  const logout = useAuthStore(s => s.logout)

  const isManager = currentUser?.role === 'MANAGER'
  const navItems = isManager ? MANAGER_NAV : TEAM_NAV
  const initials = currentUser?.name.split(' ').map(n => n[0]).join('') ?? '?'

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
        {navItems.map(({ to, icon: Icon, label }) => (
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

      {/* Role badge */}
      <div className="px-4 pb-2">
        <div className={clsx(
          'text-xs font-medium px-2 py-1 rounded-full text-center',
          isManager ? 'bg-indigo-900 text-indigo-300' : 'bg-violet-900 text-violet-300'
        )}>
          {isManager ? 'Admin / Manager' : 'Team Member'}
        </div>
      </div>

      <div className="p-3 border-t border-slate-700">
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg">
          <div
            className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0"
            style={{ backgroundColor: currentUser?.avatarColor ?? '#6366f1' }}
          >
            {initials}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-xs font-medium text-white truncate">{currentUser?.name ?? 'Unknown'}</div>
            <div className="text-xs text-slate-400 truncate">{currentUser?.role}</div>
          </div>
          <button
            onClick={logout}
            title="Switch user"
            className="p-1 rounded text-slate-500 hover:text-white hover:bg-slate-700 transition-colors"
          >
            <LogOut className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </aside>
  )
}
