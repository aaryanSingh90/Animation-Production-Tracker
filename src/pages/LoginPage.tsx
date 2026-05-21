import { Film } from 'lucide-react'
import { useEmployeeStore } from '../store/employeeStore'
import { useAuthStore } from '../store/authStore'

export function LoginPage() {
  const employees = useEmployeeStore(s => s.employees).filter(e => e.active)
  const login = useAuthStore(s => s.login)

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-900">
      <div className="bg-white rounded-2xl shadow-2xl p-8 w-96">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-xl bg-indigo-600 flex items-center justify-center">
            <Film className="w-5 h-5 text-white" />
          </div>
          <div>
            <div className="text-lg font-bold text-gray-900">PipelineTracker</div>
            <div className="text-xs text-gray-400">Animation Studio</div>
          </div>
        </div>

        <h2 className="text-xl font-semibold text-gray-900 mb-1">Welcome back</h2>
        <p className="text-sm text-gray-500 mb-5">Select your profile to continue</p>

        <div className="space-y-2">
          {employees.map(emp => {
            const initials = emp.name.split(' ').map(n => n[0]).join('')
            return (
              <button
                key={emp.id}
                onClick={() => login(emp)}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-xl border border-gray-200 hover:border-indigo-400 hover:bg-indigo-50 transition-colors text-left group"
              >
                <div
                  className="w-9 h-9 rounded-full flex items-center justify-center text-white text-sm font-semibold shrink-0"
                  style={{ backgroundColor: emp.avatarColor }}
                >
                  {initials}
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-medium text-gray-900 group-hover:text-indigo-700">{emp.name}</div>
                  <div className="text-xs text-gray-400">{emp.role} · {emp.department}</div>
                </div>
              </button>
            )
          })}
        </div>

        {employees.length === 0 && (
          <p className="text-sm text-gray-400 text-center py-4">No team members found.</p>
        )}
      </div>
    </div>
  )
}
