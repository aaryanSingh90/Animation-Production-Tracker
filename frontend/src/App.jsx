import { Navigate, Route, Routes } from "react-router-dom";
import AppShell from "./components/AppShell";
import ProtectedRoute from "./components/ProtectedRoute";
import LoginPage from "./pages/LoginPage";
import ManagerDashboardPage from "./pages/ManagerDashboardPage";
import ProjectsPage from "./pages/ProjectsPage";
import ProjectDetailPage from "./pages/ProjectDetailPage";
import CharactersPage from "./pages/CharactersPage";
import ApprovalsPage from "./pages/ApprovalsPage";
import EmployeesPage from "./pages/EmployeesPage";
import ReportsPage from "./pages/ReportsPage";
import MyTasksPage from "./pages/MyTasksPage";
import NotFoundPage from "./pages/NotFoundPage";
import { useAuthBootstrap } from "./hooks/useAuthBootstrap";
import { useAuthStore } from "./store/authStore";
import { MANAGER_ROLES } from "./utils/constants";
import ToastViewport from "./components/ToastViewport";

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
      <ToastViewport />
    </>
  );
}
