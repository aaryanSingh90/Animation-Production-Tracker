import { Suspense, lazy } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import AppShell from "./components/AppShell";
import ProtectedRoute from "./components/ProtectedRoute";
import PageSkeleton from "./components/PageSkeleton";
import ToastViewport from "./components/ToastViewport";
import { useAuthBootstrap } from "./hooks/useAuthBootstrap";
import { useAuthStore } from "./store/authStore";
import { MANAGER_ROLES } from "./utils/constants";

const LoginPage = lazy(() => import("./pages/LoginPage"));
const ManagerDashboardPage = lazy(() => import("./pages/ManagerDashboardPage"));
const ProjectsPage = lazy(() => import("./pages/ProjectsPage"));
const ProjectDetailPage = lazy(() => import("./pages/ProjectDetailPage"));
const CharactersPage = lazy(() => import("./pages/CharactersPage"));
const CharacterDetailPage = lazy(() => import("./pages/CharacterDetailPage"));
const ApprovalsPage = lazy(() => import("./pages/ApprovalsPage"));
const EmployeesPage = lazy(() => import("./pages/EmployeesPage"));
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
            path="/projects"
            element={
              <ManagerLayout>
                <ProjectsPage />
              </ManagerLayout>
            }
          />
          <Route
            path="/projects/:id"
            element={
              <ManagerLayout>
                <ProjectDetailPage />
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
            path="/reports"
            element={
              <ManagerLayout>
                <ReportsPage />
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
