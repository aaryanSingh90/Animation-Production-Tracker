import { useState, useEffect } from 'react'
import { Film, Mail, Lock, Eye, EyeOff, AlertCircle, LogIn, Loader2 } from 'lucide-react'
import { useAuthStore } from '../store/authStore'

export function LoginPage() {
  const login       = useAuthStore(s => s.login)
  const loginError  = useAuthStore(s => s.loginError)
  const loggingIn   = useAuthStore(s => s.loggingIn)
  const clearError  = useAuthStore(s => s.clearError)

  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [showPw, setShowPw]     = useState(false)
  const [hint, setHint]         = useState(false)

  // Clear server-side error when user starts typing again
  useEffect(() => {
    if (loginError) clearError()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [email, password])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!email.trim() || !password || loggingIn) return
    await login(email, password)
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0b0f19] px-4">
      <div className="bg-[#0c1221] border border-[#1b253b] rounded-2xl shadow-2xl shadow-black/60 p-8 w-full max-w-sm">
        {/* Logo */}
        <div className="flex items-center gap-3 mb-7">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-indigo-700 flex items-center justify-center shadow-lg shadow-indigo-950/50">
            <Film className="w-5 h-5 text-white" />
          </div>
          <div>
            <div className="text-base font-black text-white uppercase tracking-wide">ShotHub</div>
            <div className="text-[10px] font-bold text-indigo-400 uppercase tracking-wider">Studio Tracking</div>
          </div>
        </div>

        <h2 className="text-lg font-black text-white uppercase tracking-wide mb-1">Sign in</h2>
        <p className="text-xs text-slate-400 font-bold uppercase tracking-wider mb-6">
          Use your studio email to continue
        </p>

        <form onSubmit={handleSubmit} className="space-y-3">
          {/* Email */}
          <label className="block">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Email</span>
            <div className="relative mt-1">
              <Mail className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="you@studio.local"
                autoComplete="email"
                autoFocus
                className="w-full pl-9 pr-3 py-2.5 text-sm rounded-lg bg-[#0a0f1b] border border-[#1b253b] text-slate-200 placeholder-slate-600 focus:outline-none focus:border-indigo-500/60 transition-colors"
              />
            </div>
          </label>

          {/* Password */}
          <label className="block">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Password</span>
            <div className="relative mt-1">
              <Lock className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type={showPw ? 'text' : 'password'}
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
                autoComplete="current-password"
                className="w-full pl-9 pr-10 py-2.5 text-sm rounded-lg bg-[#0a0f1b] border border-[#1b253b] text-slate-200 placeholder-slate-600 focus:outline-none focus:border-indigo-500/60 transition-colors"
              />
              <button
                type="button"
                onClick={() => setShowPw(p => !p)}
                tabIndex={-1}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-slate-500 hover:text-slate-300 transition-colors"
              >
                {showPw ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              </button>
            </div>
          </label>

          {/* Error */}
          {loginError && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-rose-500/10 border border-rose-500/30 text-xs font-bold text-rose-400">
              <AlertCircle className="w-3.5 h-3.5 shrink-0" />
              {loginError}
            </div>
          )}

          {/* Submit */}
          <button
            type="submit"
            disabled={!email.trim() || !password || loggingIn}
            className="w-full flex items-center justify-center gap-2 mt-2 px-4 py-2.5 text-xs font-black uppercase tracking-wider text-white bg-gradient-to-r from-indigo-600 to-indigo-500 hover:from-indigo-500 hover:to-indigo-400 rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed shadow-lg shadow-indigo-950/40"
          >
            {loggingIn
              ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
              : <LogIn className="w-3.5 h-3.5" />}
            {loggingIn ? 'Signing in…' : 'Sign In'}
          </button>
        </form>

        {/* Default-credentials hint — dev-only, never visible in production builds */}
        {import.meta.env.DEV && (
          <div className="mt-6 pt-5 border-t border-[#1b253b]">
            <button
              type="button"
              onClick={() => setHint(h => !h)}
              className="text-[10px] font-bold text-slate-500 hover:text-indigo-400 uppercase tracking-wider transition-colors"
            >
              {hint ? '— Hide dev logins' : '+ Show dev logins'}
            </button>
            {hint && (
              <div className="mt-3 text-[10px] text-slate-400 leading-relaxed font-mono space-y-1">
                <div><span className="text-indigo-400">Admin:</span> admin@studio.local · <span className="text-amber-400">admin123</span></div>
                <div><span className="text-violet-400">Artist:</span> firstname@studio.local · <span className="text-amber-400">studio123</span></div>
                <div className="text-slate-600 mt-2 font-sans">
                  e.g. <span className="text-slate-400">sneha@studio.local</span> · <span className="text-amber-400">studio123</span>
                </div>
                <p className="text-slate-600 italic font-sans pt-1.5">Visible in dev mode only. Admin changes passwords from Team.</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
