import { useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../lib/api";
import { useAuthStore } from "../store/authStore";
import { useToastStore } from "../store/toastStore";

export default function LoginPage() {
  const navigate = useNavigate();
  const setAuth = useAuthStore((state) => state.setAuth);
  const showToast = useToastStore((state) => state.showToast);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError("");
    setLoading(true);

    try {
      const { data } = await api.post("/auth/login", { email, password });
      setAuth({ token: data.token, user: data.user });
      showToast("success", "Logged in successfully.");
      if (data.user.role === "EMPLOYEE") {
        navigate("/my-tasks", { replace: true });
      } else {
        navigate("/dashboard", { replace: true });
      }
    } catch (err) {
      const message = err.userMessage || err.response?.data?.message || "Invalid credentials";
      setError(message);
      showToast("error", message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-slate-900 p-6">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,_#0f766e,_#0f172a_55%)]" />
      <div className="relative w-full max-w-md rounded-3xl border border-slate-700 bg-slate-900/85 p-8 shadow-2xl backdrop-blur">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-500 font-bold text-slate-900">
            ST
          </div>
          <h1 className="text-2xl font-bold text-white">Animation Tracker</h1>
          <p className="mt-1 text-sm text-slate-300">Production pipeline control center</p>
        </div>

        <form className="space-y-4" onSubmit={handleSubmit}>
          <div>
            <label className="mb-1 block text-sm font-semibold text-slate-200">Email</label>
            <input
              type="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="w-full rounded-xl border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-white placeholder:text-slate-400"
              placeholder="manager@studio.com"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-semibold text-slate-200">Password</label>
            <input
              type="password"
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="w-full rounded-xl border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-white placeholder:text-slate-400"
              placeholder="••••••••"
            />
          </div>

          {error && <p className="rounded-xl bg-red-500/20 px-3 py-2 text-sm text-red-200">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-xl bg-emerald-500 px-4 py-2.5 text-sm font-bold text-slate-900 hover:bg-emerald-400 disabled:opacity-60"
          >
            {loading ? "Signing in..." : "Sign In"}
          </button>
        </form>
      </div>
    </div>
  );
}
