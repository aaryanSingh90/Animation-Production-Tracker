import { useEffect, useState } from 'react'
import { NavLink, Link, useLocation } from 'react-router-dom'
import {
  LayoutDashboard, Users, Briefcase, Grid3X3, Settings, Film, LogOut,
  ListChecks, Menu, X,
} from 'lucide-react'
import { clsx } from 'clsx'
import { useAuthStore } from '../../store/authStore'
import { usePipelineStore } from '../../store/pipelineStore'

// Two-tier nav: managers see studio-wide tools, artists see their own work.
const MANAGER_NAV = [
  { to: '/',         icon: LayoutDashboard, label: 'Dashboard',       notifyKey: 'review' as const },
  { to: '/clients',  icon: Briefcase,       label: 'Clients',         notifyKey: null },
  { to: '/team',     icon: Users,           label: 'Team',            notifyKey: null },
  { to: '/shots',    icon: Grid3X3,         label: 'Pipeline Matrix', notifyKey: null },
  { to: '/settings', icon: Settings,        label: 'Settings',        notifyKey: null },
]

const ARTIST_NAV = [
  { to: '/',        icon: LayoutDashboard, label: 'My Desk', notifyKey: 'retake' as const },
  { to: '/my-work', icon: ListChecks,      label: 'My Work', notifyKey: 'retake' as const },
]

export function Sidebar() {
  const currentUser = useAuthStore(s => s.currentUser)
  const logout = useAuthStore(s => s.logout)
  const allTasks = usePipelineStore(s => s.tasks)
  const location = useLocation()

  const isManager = currentUser?.role === 'MANAGER'
  const navItems  = isManager ? MANAGER_NAV : ARTIST_NAV
  const initials  = currentUser?.name.split(' ').map(n => n[0]).join('') ?? '?'

  // Mobile drawer — open/close state. Closed by default, also closes whenever
  // the route changes so navigating doesn't leave a stale overlay on screen.
  const [mobileOpen, setMobileOpen] = useState(false)
  useEffect(() => { setMobileOpen(false) }, [location.pathname])
  // Lock body scroll while the drawer is open so the page underneath stays put.
  useEffect(() => {
    if (!mobileOpen) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [mobileOpen])
  // Escape closes the drawer.
  useEffect(() => {
    if (!mobileOpen) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setMobileOpen(false) }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [mobileOpen])

  // Notification counts:
  //   Artist  → tasks they own that have come back as retakes
  //   Manager → tasks anywhere in the studio waiting for approval
  const myRetakes = !isManager
    ? allTasks.filter(t => t.assignedArtistId === currentUser?.id && t.status === 'LEAD_RETAKE').length
    : 0
  const pendingReview = isManager
    ? allTasks.filter(t => t.status === 'LEAD_APPROVAL').length
    : 0

  function getBadge(key: 'retake' | 'review' | null): number {
    if (key === 'retake') return myRetakes
    if (key === 'review') return pendingReview
    return 0
  }
  function getBadgeColor(key: 'retake' | 'review' | null): string {
    if (key === 'retake') return 'bg-rose-500 text-white'
    if (key === 'review') return 'bg-sky-500 text-white'
    return ''
  }

  // Total badge count surfaced on the mobile hamburger so a manager doesn't
  // miss a pending review just because the sidebar is collapsed off-screen.
  const totalBadge = myRetakes + pendingReview

  const sidebarBody = (
    <>
      <div className="flex items-center justify-between gap-3 px-5 py-5 border-b border-[#1a263e]">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-indigo-700 flex items-center justify-center shadow-lg shadow-indigo-950/50 animate-pulse-ring shrink-0">
            <Film className="w-4 h-4 text-white" />
          </div>
          <div className="min-w-0">
            <div className="text-sm font-bold text-white tracking-wide uppercase">ShotHub</div>
            <div className="text-[10px] font-semibold text-indigo-400 tracking-wider uppercase mt-0.5">Studio Tracking</div>
          </div>
        </div>
        {/* Close button — visible only on mobile drawer */}
        <button
          onClick={() => setMobileOpen(false)}
          aria-label="Close menu"
          className="lg:hidden p-1.5 rounded-md text-slate-400 hover:text-white hover:bg-[#131b2e] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/40"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
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
                  'flex items-center gap-3 px-3 py-2 rounded-lg text-xs font-semibold tracking-wide uppercase transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/40',
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
          isManager
            ? 'bg-[#101b35] text-indigo-400 border-indigo-500/20'
            : 'bg-[#16122d] text-violet-400 border-violet-500/20',
        )}>
          {isManager ? 'Manager' : 'Artist'}
        </div>
      </div>

      <div className="p-3 border-t border-[#1a263e] bg-[#050810]">
        <div className="flex items-center gap-2.5 px-2 py-1.5 rounded-lg">
          <Link
            to="/account"
            title="My account"
            className="flex items-center gap-2.5 flex-1 min-w-0 rounded-md hover:bg-[#131b2e] px-1.5 py-1 -mx-1.5 -my-1 transition-colors group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/40"
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
            aria-label="Sign out"
            className="p-1.5 rounded-md text-slate-500 hover:text-slate-100 hover:bg-[#131b2e] transition-colors border border-transparent hover:border-[#1a263e] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/40"
          >
            <LogOut className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </>
  )

  return (
    <>
      {/* ── Mobile top bar (<lg) ──────────────────────────────────────────── */}
      <div className="lg:hidden sticky top-0 z-30 flex items-center justify-between gap-3 px-4 h-12 bg-[#080d1a] border-b border-[#1a263e]">
        <button
          onClick={() => setMobileOpen(true)}
          aria-label="Open menu"
          className="relative p-1.5 rounded-md text-slate-300 hover:text-white hover:bg-[#131b2e] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/40"
        >
          <Menu className="w-5 h-5" />
          {totalBadge > 0 && (
            <span className="absolute -top-0.5 -right-0.5 min-w-[14px] h-[14px] px-1 rounded-full flex items-center justify-center text-[8px] font-black bg-rose-500 text-white">
              {totalBadge > 9 ? '9+' : totalBadge}
            </span>
          )}
        </button>
        <Link to="/" className="flex items-center gap-2 min-w-0">
          <div className="w-6 h-6 rounded-md bg-gradient-to-br from-indigo-500 to-indigo-700 flex items-center justify-center shadow shadow-indigo-950/50 shrink-0">
            <Film className="w-3 h-3 text-white" />
          </div>
          <span className="text-xs font-black text-white tracking-wide uppercase truncate">ShotHub</span>
        </Link>
        <Link
          to="/account"
          aria-label="My account"
          className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-black text-white shrink-0 border border-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/40"
          style={{ backgroundColor: currentUser?.avatarColor ?? '#6366f1' }}
        >
          {initials}
        </Link>
      </div>

      {/* ── Desktop sidebar (lg+) ────────────────────────────────────────── */}
      <aside className="hidden lg:flex w-56 shrink-0 flex-col bg-[#080d1a] border-r border-[#1a263e] min-h-screen">
        {sidebarBody}
      </aside>

      {/* ── Mobile drawer overlay (<lg) ──────────────────────────────────── */}
      {mobileOpen && (
        <>
          <div
            onClick={() => setMobileOpen(false)}
            className="lg:hidden fixed inset-0 z-40 bg-black/60 backdrop-blur-sm animate-in fade-in duration-150"
            aria-hidden
          />
          <aside
            role="dialog"
            aria-label="Main menu"
            className="lg:hidden fixed inset-y-0 left-0 z-50 w-64 max-w-[85vw] flex flex-col bg-[#080d1a] border-r border-[#1a263e] shadow-2xl shadow-black/60 animate-in slide-in-from-left duration-200"
          >
            {sidebarBody}
          </aside>
        </>
      )}
    </>
  )
}
