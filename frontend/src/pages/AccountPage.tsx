import { useState } from 'react'
import { Lock, AlertCircle, CheckCircle, User, Eye, EyeOff } from 'lucide-react'
import { useAuthStore } from '../store/authStore'
import { Auth } from '../api/endpoints'
import { ApiError } from '../api/client'

export function AccountPage() {
  const currentUser = useAuthStore(s => s.currentUser)

  const [currentPw, setCurrentPw] = useState('')
  const [newPw, setNewPw]         = useState('')
  const [confirmPw, setConfirmPw] = useState('')
  const [showPw, setShowPw]       = useState(false)
  const [saving, setSaving]       = useState(false)
  const [error, setError]         = useState<string | null>(null)
  const [success, setSuccess]     = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSuccess(false)

    if (newPw.length < 6) {
      setError('New password must be at least 6 characters.')
      return
    }
    if (newPw !== confirmPw) {
      setError('New passwords do not match.')
      return
    }
    if (newPw === currentPw) {
      setError('New password must be different from current.')
      return
    }

    setSaving(true)
    try {
      await Auth.changePassword(currentPw, newPw)
      setSuccess(true)
      setCurrentPw(''); setNewPw(''); setConfirmPw('')
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to change password.')
    } finally {
      setSaving(false)
    }
  }

  const initials = currentUser?.name.split(' ').map(n => n[0]).join('') ?? '?'

  return (
    <div className="min-h-screen bg-[#0b0f19] text-slate-100">
      <div className="max-w-2xl mx-auto px-6 py-8 space-y-6">

        {/* Header */}
        <div className="border-b border-[#1a263e] pb-5">
          <h1 className="text-xl font-black tracking-wide text-white uppercase flex items-center gap-2">
            <User className="w-5 h-5 text-indigo-400" /> My Account
          </h1>
          <p className="text-xs text-slate-400 font-bold uppercase tracking-wider mt-1">
            Profile details &amp; password
          </p>
        </div>

        {/* Profile card */}
        <div className="bg-[#0c1221] rounded-xl border border-[#1b253b] p-5">
          <div className="flex items-center gap-4">
            <div
              className="w-14 h-14 rounded-full flex items-center justify-center text-white text-lg font-black shrink-0 border border-white/10 shadow"
              style={{ backgroundColor: currentUser?.avatarColor ?? '#6366f1' }}
            >
              {initials}
            </div>
            <div>
              <div className="text-base font-black text-white tracking-wide">{currentUser?.name}</div>
              <div className="text-xs text-slate-400 mt-0.5">{currentUser?.email}</div>
              <div className="flex items-center gap-2 mt-1.5">
                <span className="text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded border bg-indigo-500/15 text-indigo-400 border-indigo-500/30">
                  {currentUser?.role}
                </span>
                <span className="text-[9px] font-bold text-slate-500 uppercase tracking-wider">
                  · {currentUser?.department}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Change password */}
        <div className="bg-[#0c1221] rounded-xl border border-[#1b253b] p-5">
          <div className="flex items-center gap-2 mb-4">
            <Lock className="w-4 h-4 text-slate-400" />
            <h2 className="text-sm font-black text-white uppercase tracking-wide">Change Password</h2>
          </div>

          <form onSubmit={submit} className="space-y-3 max-w-sm">
            <label className="block">
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Current password</span>
              <input
                type={showPw ? 'text' : 'password'}
                value={currentPw}
                onChange={e => setCurrentPw(e.target.value)}
                autoComplete="current-password"
                className="mt-1 w-full px-3 py-2 text-sm rounded-lg bg-[#0a0f1b] border border-[#1b253b] text-slate-200 focus:outline-none focus:border-indigo-500/60 transition-colors"
              />
            </label>
            <label className="block">
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">New password</span>
              <div className="relative mt-1">
                <input
                  type={showPw ? 'text' : 'password'}
                  value={newPw}
                  onChange={e => setNewPw(e.target.value)}
                  autoComplete="new-password"
                  className="w-full px-3 pr-10 py-2 text-sm rounded-lg bg-[#0a0f1b] border border-[#1b253b] text-slate-200 focus:outline-none focus:border-indigo-500/60 transition-colors"
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
              <span className="text-[9px] text-slate-600 mt-1 block">Must be at least 6 characters.</span>
            </label>
            <label className="block">
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Confirm new password</span>
              <input
                type={showPw ? 'text' : 'password'}
                value={confirmPw}
                onChange={e => setConfirmPw(e.target.value)}
                autoComplete="new-password"
                className="mt-1 w-full px-3 py-2 text-sm rounded-lg bg-[#0a0f1b] border border-[#1b253b] text-slate-200 focus:outline-none focus:border-indigo-500/60 transition-colors"
              />
            </label>

            {error && (
              <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-rose-500/10 border border-rose-500/30 text-xs font-bold text-rose-400">
                <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                {error}
              </div>
            )}
            {success && (
              <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-xs font-bold text-emerald-400">
                <CheckCircle className="w-3.5 h-3.5 shrink-0" />
                Password updated.
              </div>
            )}

            <button
              type="submit"
              disabled={!currentPw || !newPw || !confirmPw || saving}
              className="w-full mt-2 px-4 py-2.5 text-xs font-black uppercase tracking-wider text-white bg-indigo-600 hover:bg-indigo-500 rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed shadow-md shadow-indigo-950/40"
            >
              {saving ? 'Saving…' : 'Update Password'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
