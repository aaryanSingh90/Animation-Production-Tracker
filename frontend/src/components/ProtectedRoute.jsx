import { Navigate } from "react-router-dom";
import { useAuthStore } from "../store/authStore";
import Loader from "./Loader";

export default function ProtectedRoute({ roles, children }) {
  const token = useAuthStore((state) => state.token);
  const user = useAuthStore((state) => state.user);
  const ready = useAuthStore((state) => state.ready);

  if (!ready) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader label="Bootstrapping session..." />
      </div>
    );
  }

  if (!token) {
    return <Navigate to="/login" replace />;
  }

  if (!user) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader label="Loading profile..." />
      </div>
    );
  }

  if (roles && !roles.includes(user.role)) {
    return <Navigate to={user.role === "EMPLOYEE" ? "/my-tasks" : "/dashboard"} replace />;
  }

  return children;
}
