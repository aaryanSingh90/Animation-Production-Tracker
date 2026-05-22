import { NavLink, Link } from 'react-router-dom'
import { LayoutDashboard, Users, Briefcase, Grid3X3, Settings, Film, LogOut, ListChecks } from 'lucide-react'
import { clsx } from 'clsx'
import { useAuthStore } from '../../store/authStore'
import { usePipelineStore } from '../../store/pipelineStore'

const MANAGER_NAV = [
  { to: '/',         icon: LayoutDashboard, label: 'Dashboard',   notifyKey: 'review' as const },
  { to: '/clients',  icon: Briefcase,       label: 'Clients',     notifyKey: null },
  { to: '/team',     icon: Users,           label: 'Team',        notifyKey: null },
  { to: '/shots',    icon: Grid3X3,         label: 'Shot Matrix', notifyKey: null },
  { to: '/settings', icon: Settings,        label: 'Settings',    notifyKey: null },
]

const LEAD_NAV = [
  { to: '/',        icon: LayoutDashboard, label: 'Dashboard',   notifyKey: 'review' as const },
  { to: '/my-work', icon: ListChecks,      label: 'My Work',     notifyKey: 'retake' as const },
  { to: '/clients', icon: Briefcase,       label: 'Projects',    notifyKey: null },
  { to: '/shots',   icon: Grid3X3,         label: 'Shot Matrix', notifyKey: null },
]

const ARTIST_NAV = [
  { to: '/',        icon: LayoutDashboard, label: 'My Desk',     notifyKey: 'retake' as const },
  { to: '/my-work', icon: ListChecks,      label: 'My Work',     notifyKey: 'retake' as const },
]

export function Sidebar() {
  const currentUser = useAuthStore(s => s.currentUser)
  const logout = useAuthStore(s => s.logout)
  const allTasks = usePipelineStore(s => s.tasks)

  const role = currentUser?.role
  const isManager = role === 'MANAGER'
  const isLead    = role === 'LEAD'
  const isArtist  = role === 'ARTIST'
  const navItems  = isManager ? MANAGER_NAV : isLead ? LEAD_NAV : ARTIST_NAV
  const initials  = currentUser?.name.split(' ').map(n => n[0]).join('') ?? '?'

  // Notification counts
  const myTasks = isArtist
    ? allTasks.filter(t => t.assignedArtistId === currentUser?.id)
    : isLead
      ? allTasks.filter(t => {
          const leadProjects = new Set(
            allTasks.filter(x => x.assignedArtistId === currentUser?.id).map(x => x.projectId)
          )
          return leadProjects.has(t.projectId)
        })
      : allTasks

  // Artist: tasks they need to redo. Lead: team tasks currently in retake.
  const retakeCount = (isArtist || isLead)
    ? myTasks.filter(t => t.status === 'LEAD_RETAKE').length
    : 0
  const reviewCount = (isManager || isLead)
    ? myTasks.filter(t => t.status === 'LEAD_APPROVAL').length
    : 0

  function getBadge(key: 'retake' | 'review' | null): number {
    if (key === 'retake') return retakeCount
    if (key === 'review') return reviewCount
    return 0
  }

  function getBadgeColor(key: 'retake' | 'review' | null): string {
    if (key === 'retake') return 'bg-rose-500 text-white'
    if (key === 'review') return 'bg-sky-500 text-white'
    return ''
  }

  return (
    <aside className="w-56 shrink-0 flex flex-col bg-[#080d1a] border-r border-[#1a263e] min-h-screen">
      <div className="flex items-center gap-3 px-5 py-5 border-b border-[#1a263e]">
        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-indigo-700 flex items-center justify-center shadow-lg shadow-indigo-950/50 animate-pulse-ring">
          <Film className="w-4 h-4 text-white" />
        </div>
        <div>
          <div className="text-sm font-bold text-white tracking-wide uppercase">ShotHub</div>
          <div className="text-[10px] font-semibold text-indigo-400 tracking-wider uppercase mt-0.5">Studio Tracking</div>
        </div>
      </div>

      <nav className="flex-1 p-3 space-y-1">
        {navItems.map(({ to, icon: Icon, label, notifyKey }) => {
          const badgeCount = getBadge(notifyKey)
          const badgeColor = getBadgeColor(notifyKey)
          return (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              className={({ isActive }) =>
                clsx(
                  'flex items-center gap-3 px-3 py-2 rounded-lg text-xs font-semibold tracking-wide uppercase transition-all duration-200',
                  isActive
                    ? 'bg-gradient-to-r from-indigo-600 to-indigo-500 text-white shadow-md shadow-indigo-950/40 border border-indigo-400/20'
                    : 'text-slate-400 hover:bg-[#131b2e] hover:text-slate-100 border border-transparent'
                )
              }
            >
              <Icon className="w-3.5 h-3.5 shrink-0" />
              <span className="flex-1">{label}</span>
              {badgeCount > 0 && (
                <span className={clsx(
                  'min-w-[18px] h-[18px] px-1 rounded-full flex items-center justify-center text-[9px] font-black shrink-0',
                  badgeColor,
                  notifyKey === 'retake' && 'animate-pulse'
                )}>
                  {badgeCount > 9 ? '9+' : badgeCount}
                </span>
              )}
            </NavLink>
          )
        })}
      </nav>

      {/* Role badge */}
      <div className="px-4 pb-3">
        <div className={clsx(
          'text-[10px] font-bold tracking-wider uppercase px-2.5 py-1 rounded-md text-center border',
          isManager ? 'bg-[#101b35] text-indigo-400 border-indigo-500/20'
          : isLead  ? 'bg-[#0f1a2e] text-sky-400 border-sky-500/20'
                    : 'bg-[#16122d] text-violet-400 border-violet-500/20'
        )}>
          {isManager ? 'Manager' : isLead ? 'Lead' : 'Artist'}
        </div>
      </div>

      <div className="p-3 border-t border-[#1a263e] bg-[#050810]">
        <div className="flex items-center gap-2.5 px-2 py-1.5 rounded-lg">
          <Link
            to="/account"
            title="My account"
            className="flex items-center gap-2.5 flex-1 min-w-0 rounded-md hover:bg-[#131b2e] px-1.5 py-1 -mx-1.5 -my-1 transition-colors group"
          >
            <div
              className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-black text-white shrink-0 border border-white/10 shadow-inner"
              style={{ backgroundColor: currentUser?.avatarColor ?? '#6366f1' }}
            >
              {initials}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-xs font-bold text-slate-100 truncate group-hover:text-indigo-300">{currentUser?.name ?? 'Unknown'}</div>
              <div className="text-[9px] font-bold text-slate-400 tracking-wider uppercase mt-0.5 truncate">{currentUser?.department ?? currentUser?.role}</div>
            </div>
          </Link>
          <button
            onClick={logout}
            title="Sign out"
            className="p-1.5 rounded-md text-slate-500 hover:text-slate-100 hover:bg-[#131b2e] transition-colors border border-transparent hover:border-[#1a263e]"
          >
            <LogOut className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </aside>
  )
}
