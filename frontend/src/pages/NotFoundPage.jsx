import { Link } from "react-router-dom";

export default function NotFoundPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100 p-6">
      <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center shadow-sm">
        <h1 className="text-3xl font-bold text-slate-900">404</h1>
        <p className="mt-2 text-sm text-slate-600">The page you requested was not found.</p>
        <Link to="/" className="mt-4 inline-flex rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white">
          Go Home
        </Link>
      </div>
    </div>
  );
}
