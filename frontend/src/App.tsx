import { useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate, useNavigate } from 'react-router-dom'
import { useInitializeApp } from './hooks/useInitializeApp'
import { useAuthStore } from './store/authStore'
import { Layout } from './components/layout/Layout'
import { LoadingScreen } from './components/ui/LoadingScreen'
import { LoginPage } from './pages/LoginPage'
import { Dashboard } from './pages/Dashboard'
import { Clients } from './pages/Clients'
import { ClientDetail } from './pages/ClientDetail'
import { ProjectHub } from './pages/ProjectHub'
import { WorkspacePage } from './pages/WorkspacePage'
import { Team } from './pages/Team'
import { ShotMatrix } from './pages/ShotMatrix'
import { Settings } from './pages/Settings'
import { MyWorkPage } from './pages/MyWorkPage'
import { AccountPage } from './pages/AccountPage'
import { AccessDenied } from './pages/AccessDenied'

function ManagerOnly({ children }: { children: React.ReactNode }) {
  const role = useAuthStore(s => s.currentUser?.role)
  if (role !== 'MANAGER') return <Navigate to="/" replace />
  return <>{children}</>
}

/**
 * Listens for the `shothub:no-access` event that the API client dispatches
 * when the server returns 403 + code=NO_ACCESS (an artist trying to open a
 * client / project they have no tasks in). Routes to /access-denied so the
 * page renders a friendly card instead of crashing on undefined data.
 *
 * Lives inside <BrowserRouter> so `useNavigate` is available.
 */
function NoAccessRedirector() {
  const navigate = useNavigate()
  useEffect(() => {
    function onNoAccess() {
      navigate('/access-denied', { replace: true })
    }
    window.addEventListener('shothub:no-access', onNoAccess)
    return () => window.removeEventListener('shothub:no-access', onNoAccess)
  }, [navigate])
  return null
}

function AppInner() {
  const ready              = useInitializeApp()
  const currentUser        = useAuthStore(s => s.currentUser)
  const mustChangePassword = useAuthStore(s => s.mustChangePassword)

  if (!ready) return <LoadingScreen />
  if (!currentUser) return <LoginPage />

  // Force-change-password: signed in but the admin handed out a temp password.
  // Lock the entire app down to /account until they pick their own.
  if (mustChangePassword) {
    return (
      <>
        <NoAccessRedirector />
        <Routes>
          <Route element={<Layout />}>
            <Route path="/account" element={<AccountPage />} />
            <Route path="*"        element={<Navigate to="/account" replace />} />
          </Route>
        </Routes>
      </>
    )
  }

  return (
    <>
      <NoAccessRedirector />
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/clients" element={<Clients />} />
          <Route path="/clients/:clientId" element={<ClientDetail />} />
          <Route path="/clients/:clientId/projects/:projectId" element={<ProjectHub />} />
          <Route
            path="/clients/:clientId/projects/:projectId/pipeline/:stageSlug/:subStageSlug"
            element={<WorkspacePage />}
          />
          <Route
            path="/clients/:clientId/projects/:projectId/pipeline/:stageSlug"
            element={<WorkspacePage />}
          />
          <Route path="/team"     element={<ManagerOnly><Team /></ManagerOnly>} />
          <Route path="/shots"    element={<ShotMatrix />} />
          <Route path="/my-work"  element={<MyWorkPage />} />
          <Route path="/account"  element={<AccountPage />} />
          <Route path="/settings" element={<ManagerOnly><Settings /></ManagerOnly>} />
          <Route path="/access-denied" element={<AccessDenied />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <AppInner />
    </BrowserRouter>
  )
}
