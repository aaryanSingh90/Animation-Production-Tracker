import { useState } from 'react'
import { Film, LayoutDashboard, Palette, ArrowLeft } from 'lucide-react'
import { useEmployeeStore } from '../store/employeeStore'
import { useAuthStore } from '../store/authStore'
import type { Employee } from '../types'

type Step = 'role' | 'manager' | 'team'

function EmployeeList({ employees, onSelect }: { employees: Employee[]; onSelect: (e: Employee) => void }) {
  return (
    <div className="space-y-2">
      {employees.map(emp => {
        const initials = emp.name.split(' ').map(n => n[0]).join('')
        return (
          <button
            key={emp.id}
            onClick={() => onSelect(emp)}
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
              <div className="text-xs text-gray-400">{emp.department}</div>
            </div>
          </button>
        )
      })}
      {employees.length === 0 && (
        <p className="text-sm text-gray-400 text-center py-6">No users found.</p>
      )}
    </div>
  )
}

export function LoginPage() {
  const [step, setStep] = useState<Step>('role')
  const employees = useEmployeeStore(s => s.employees).filter(e => e.active)
  const login = useAuthStore(s => s.login)

  const managers = employees.filter(e => e.role === 'MANAGER')
  const teamMembers = employees.filter(e => e.role !== 'MANAGER')

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-900 px-4">
      <div className="bg-white rounded-2xl shadow-2xl p-8 w-full max-w-sm">
        {/* Logo */}
        <div className="flex items-center gap-3 mb-7">
          <div className="w-10 h-10 rounded-xl bg-indigo-600 flex items-center justify-center">
            <Film className="w-5 h-5 text-white" />
          </div>
          <div>
            <div className="text-lg font-bold text-gray-900">PipelineTracker</div>
            <div className="text-xs text-gray-400">Animation Studio</div>
          </div>
        </div>

        {/* Step 1: choose role type */}
        {step === 'role' && (
          <>
            <h2 className="text-xl font-semibold text-gray-900 mb-1">Welcome back</h2>
            <p className="text-sm text-gray-500 mb-6">How do you want to sign in?</p>
            <div className="space-y-3">
              <button
                onClick={() => setStep('manager')}
                className="w-full flex items-center gap-4 px-5 py-4 rounded-xl border-2 border-indigo-200 hover:border-indigo-500 hover:bg-indigo-50 transition-colors text-left group"
              >
                <div className="w-10 h-10 rounded-lg bg-indigo-100 group-hover:bg-indigo-200 flex items-center justify-center shrink-0">
                  <LayoutDashboard className="w-5 h-5 text-indigo-600" />
                </div>
                <div>
                  <div className="text-sm font-semibold text-gray-900">Admin / Manager</div>
                  <div className="text-xs text-gray-500 mt-0.5">Full project & team oversight</div>
                </div>
              </button>

              <button
                onClick={() => setStep('team')}
                className="w-full flex items-center gap-4 px-5 py-4 rounded-xl border-2 border-gray-200 hover:border-violet-400 hover:bg-violet-50 transition-colors text-left group"
              >
                <div className="w-10 h-10 rounded-lg bg-violet-100 group-hover:bg-violet-200 flex items-center justify-center shrink-0">
                  <Palette className="w-5 h-5 text-violet-600" />
                </div>
                <div>
                  <div className="text-sm font-semibold text-gray-900">Team Member</div>
                  <div className="text-xs text-gray-500 mt-0.5">My projects & assignments only</div>
                </div>
              </button>
            </div>
          </>
        )}

        {/* Step 2: pick person */}
        {(step === 'manager' || step === 'team') && (
          <>
            <button
              onClick={() => setStep('role')}
              className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 mb-5 -mt-1"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              Back
            </button>
            <h2 className="text-lg font-semibold text-gray-900 mb-1">
              {step === 'manager' ? 'Select manager' : 'Select your profile'}
            </h2>
            <p className="text-sm text-gray-500 mb-5">
              {step === 'manager' ? 'Admin / Manager accounts' : 'Artist & Lead accounts'}
            </p>
            <EmployeeList
              employees={step === 'manager' ? managers : teamMembers}
              onSelect={login}
            />
          </>
        )}
      </div>
    </div>
  )
}
