import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Layout } from './components/layout/Layout'
import { Dashboard } from './pages/Dashboard'
import { Clients } from './pages/Clients'
import { ClientDetail } from './pages/ClientDetail'
import { ProjectHub } from './pages/ProjectHub'
import { WorkspacePage } from './pages/WorkspacePage'
import { Team } from './pages/Team'
import { ShotMatrix } from './pages/ShotMatrix'
import { Settings } from './pages/Settings'

export default function App() {
  return (
    <BrowserRouter>
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
          <Route path="/team" element={<Team />} />
          <Route path="/shots" element={<ShotMatrix />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
