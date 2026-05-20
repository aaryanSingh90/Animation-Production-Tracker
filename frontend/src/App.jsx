import { Suspense, lazy } from "react";
import { Navigate, Route, Routes, useParams } from "react-router-dom";
import AppShell from "./components/AppShell";
import ProtectedRoute from "./components/ProtectedRoute";
import PageSkeleton from "./components/PageSkeleton";
import ToastViewport from "./components/ToastViewport";
import { useAuthBootstrap } from "./hooks/useAuthBootstrap";
import { useAuthStore } from "./store/authStore";
import { MANAGER_ROLES } from "./utils/constants";
import { buildStageWorkspacePath } from "./utils/stageRouting";

const LoginPage = lazy(() => import("./pages/LoginPage"));
const ManagerDashboardPage = lazy(() => import("./pages/ManagerDashboardPage"));
const ClientsPage = lazy(() => import("./pages/ClientsPage"));
const ClientDetailPage = lazy(() => import("./pages/ClientDetailPage"));
const ProjectDetailPage = lazy(() => import("./pages/ProjectDetailPage"));
const ProjectStageWorkspacePage = lazy(() => import("./pages/ProjectStageWorkspacePage"));
const CharactersPage = lazy(() => import("./pages/CharactersPage"));
const CharacterDetailPage = lazy(() => import("./pages/CharacterDetailPage"));
const ApprovalsPage = lazy(() => import("./pages/ApprovalsPage"));
const EmployeesPage = lazy(() => import("./pages/EmployeesPage"));
const WorkforcePage = lazy(() => import("./pages/WorkforcePage"));
const TeamsPage = lazy(() => import("./pages/TeamsPage"));
const AssignmentsPage = lazy(() => import("./pages/AssignmentsPage"));
const AnalyticsPage = lazy(() => import("./pages/AnalyticsPage"));
const SearchPage = lazy(() => import("./pages/SearchPage"));
const DepartmentsPage = lazy(() => import("./pages/DepartmentsPage"));
const ReportsPage = lazy(() => import("./pages/ReportsPage"));
const MyTasksPage = lazy(() => import("./pages/MyTasksPage"));
const NotFoundPage = lazy(() => import("./pages/NotFoundPage"));

function HomeRedirect() {
  const user = useAuthStore((state) => state.user);
  const token = useAuthStore((state) => state.token);

  if (!token) return <Navigate to="/login" replace />;
  if (user?.role === "EMPLOYEE") return <Navigate to="/my-tasks" replace />;
  return <Navigate to="/dashboard" replace />;
}

function ManagerLayout({ children }) {
  return (
    <ProtectedRoute roles={MANAGER_ROLES}>
      <AppShell>{children}</AppShell>
    </ProtectedRoute>
  );
}

function EmployeeLayout({ children }) {
  return (
    <ProtectedRoute roles={["EMPLOYEE"]}>
      <AppShell>{children}</AppShell>
    </ProtectedRoute>
  );
}

function LegacyWorkspaceRedirect() {
  const { projectId, stageSlug } = useParams();
  return <Navigate to={buildStageWorkspacePath(projectId, stageSlug)} replace />;
}

export default function App() {
  useAuthBootstrap();

  return (
    <>
      <Suspense
        fallback={
          <div className="p-8">
            <PageSkeleton />
          </div>
        }
      >
        <Routes>
          <Route path="/" element={<HomeRedirect />} />
          <Route path="/login" element={<LoginPage />} />

          <Route
            path="/dashboard"
            element={
              <ManagerLayout>
                <ManagerDashboardPage />
              </ManagerLayout>
            }
          />
          <Route
            path="/clients"
            element={
              <ManagerLayout>
                <ClientsPage />
              </ManagerLayout>
            }
          />
          <Route
            path="/clients/:id"
            element={
              <ManagerLayout>
                <ClientDetailPage />
              </ManagerLayout>
            }
          />
          <Route
            path="/projects"
            element={
              <ManagerLayout>
                <Navigate to="/clients" replace />
              </ManagerLayout>
            }
          />
          <Route
            path="/projects/:projectId"
            element={
              <ManagerLayout>
                <ProjectDetailPage />
              </ManagerLayout>
            }
          />
          <Route
            path="/projects/:projectId/workspace/:stageSlug"
            element={
              <ManagerLayout>
                <ProjectStageWorkspacePage />
              </ManagerLayout>
            }
          />
          <Route
            path="/projects/:projectId/modelling/:categorySlug"
            element={
              <ManagerLayout>
                <ProjectStageWorkspacePage />
              </ManagerLayout>
            }
          />
          <Route
            path="/projects/:projectId/:stageSlug/:categorySlug"
            element={
              <ManagerLayout>
                <ProjectStageWorkspacePage />
              </ManagerLayout>
            }
          />
          <Route
            path="/projects/:projectId/:stageSlug"
            element={
              <ManagerLayout>
                <LegacyWorkspaceRedirect />
              </ManagerLayout>
            }
          />
          <Route
            path="/characters"
            element={
              <ManagerLayout>
                <CharactersPage />
              </ManagerLayout>
            }
          />
          <Route
            path="/characters/:id"
            element={
              <ManagerLayout>
                <CharacterDetailPage />
              </ManagerLayout>
            }
          />
          <Route
            path="/approvals"
            element={
              <ManagerLayout>
                <ApprovalsPage />
              </ManagerLayout>
            }
          />
          <Route
            path="/employees"
            element={
              <ManagerLayout>
                <EmployeesPage />
              </ManagerLayout>
            }
          />
          <Route
            path="/workforce"
            element={
              <ManagerLayout>
                <WorkforcePage />
              </ManagerLayout>
            }
          />
          <Route
            path="/teams"
            element={
              <ManagerLayout>
                <TeamsPage />
              </ManagerLayout>
            }
          />
          <Route
            path="/assignments"
            element={
              <ManagerLayout>
                <AssignmentsPage />
              </ManagerLayout>
            }
          />
          <Route
            path="/departments"
            element={
              <ManagerLayout>
                <DepartmentsPage />
              </ManagerLayout>
            }
          />
          <Route
            path="/reports"
            element={
              <ManagerLayout>
                <ReportsPage />
              </ManagerLayout>
            }
          />
          <Route
            path="/analytics"
            element={
              <ManagerLayout>
                <AnalyticsPage />
              </ManagerLayout>
            }
          />
          <Route
            path="/search"
            element={
              <ManagerLayout>
                <SearchPage />
              </ManagerLayout>
            }
          />

          <Route
            path="/my-tasks"
            element={
              <EmployeeLayout>
                <MyTasksPage />
              </EmployeeLayout>
            }
          />

          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </Suspense>
      <ToastViewport />
    </>
  );
}
