import { useState } from 'react'
import { Users, Plus, Pencil, X, Check, Power } from 'lucide-react'
import { useEmployeeStore } from '../store/employeeStore'
import { usePipelineStore } from '../store/pipelineStore'
import { StatusPill } from '../components/ui/StatusPill'
import type { Employee, EmployeeDepartment, EmployeeRole } from '../types'
import { clsx } from 'clsx'

function newId() { return `emp-${Date.now()}` }

const DEPT_OPTIONS: EmployeeDepartment[] = [
  'Animation', 'Rigging', 'Lighting', 'FX', 'Compositing', 'Modelling', 'Audio', 'Editing',
]
const ROLE_OPTIONS: EmployeeRole[] = ['MANAGER', 'LEAD', 'ARTIST']

const AVATAR_COLORS = [
  '#6366f1', '#ec4899', '#f59e0b', '#10b981', '#3b82f6',
  '#f97316', '#8b5cf6', '#14b8a6',
]

const BLANK: Omit<Employee, 'id'> = {
  name: '',
  email: '',
  role: 'ARTIST',
  department: 'Animation',
  specialization: '',
  active: true,
  avatarColor: AVATAR_COLORS[0],
}

function getInitials(name: string) {
  return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)
}

export function Team() {
  const { employees, addEmployee, updateEmployee, deactivateEmployee } = useEmployeeStore()
  const tasks = usePipelineStore(s => s.tasks)
  const [showForm, setShowForm] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [form, setForm] = useState<Omit<Employee, 'id'>>(BLANK)
  const [deptFilter, setDeptFilter] = useState<EmployeeDepartment | 'ALL'>('ALL')
  const [roleFilter, setRoleFilter] = useState<EmployeeRole | 'ALL'>('ALL')
  const [activeFilter, setActiveFilter] = useState<'ALL' | 'ACTIVE' | 'INACTIVE'>('ALL')

  const filtered = employees.filter(e => {
    if (deptFilter !== 'ALL' && e.department !== deptFilter) return false
    if (roleFilter !== 'ALL' && e.role !== roleFilter) return false
    if (activeFilter === 'ACTIVE' && !e.active) return false
    if (activeFilter === 'INACTIVE' && e.active) return false
    return true
  })

  function startEdit(emp: Employee) {
    setEditId(emp.id)
    setForm({ name: emp.name, email: emp.email, role: emp.role, department: emp.department, specialization: emp.specialization ?? '', active: emp.active, avatarColor: emp.avatarColor ?? AVATAR_COLORS[0] })
    setShowForm(false)
  }

  function saveNew() {
    if (!form.name.trim()) return
    addEmployee({
      id: newId(),
      ...form,
      avatarColor: AVATAR_COLORS[employees.length % AVATAR_COLORS.length],
    })
    setForm(BLANK)
    setShowForm(false)
  }

  function saveEdit() {
    if (!editId || !form.name.trim()) return
    updateEmployee(editId, form)
    setEditId(null)
  }

  const inputCls = 'px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500'

  function FormRow({ onSave, onCancel }: { onSave: () => void; onCancel: () => void }) {
    return (
      <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-4 mb-4 space-y-3">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <input placeholder="Full name *" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} className={inputCls} />
          <input placeholder="Email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} className={inputCls} />
          <select value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value as EmployeeRole }))} className={inputCls}>
            {ROLE_OPTIONS.map(r => <option key={r}>{r}</option>)}
          </select>
          <select value={form.department} onChange={e => setForm(f => ({ ...f, department: e.target.value as EmployeeDepartment }))} className={inputCls}>
            {DEPT_OPTIONS.map(d => <option key={d}>{d}</option>)}
          </select>
        </div>
        <input placeholder="Specialization (optional)" value={form.specialization} onChange={e => setForm(f => ({ ...f, specialization: e.target.value }))} className={`${inputCls} w-64`} />
        <div className="flex gap-2">
          <button onClick={onSave} className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg">Save</button>
          <button onClick={onCancel} className="px-4 py-2 text-sm text-gray-600 hover:bg-white rounded-lg">Cancel</button>
        </div>
      </div>
    )
  }

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Team</h1>
          <p className="text-sm text-gray-500 mt-1">{employees.filter(e => e.active).length} active members</p>
        </div>
        <button
          onClick={() => { setShowForm(v => !v); setEditId(null); setForm(BLANK) }}
          className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg"
        >
          <Plus className="w-4 h-4" /> Add Employee
        </button>
      </div>

      {showForm && <FormRow onSave={saveNew} onCancel={() => setShowForm(false)} />}

      {/* Filters */}
      <div className="flex gap-2 mb-4 flex-wrap">
        <select value={deptFilter} onChange={e => setDeptFilter(e.target.value as any)} className={`${inputCls} text-xs`}>
          <option value="ALL">All Departments</option>
          {DEPT_OPTIONS.map(d => <option key={d}>{d}</option>)}
        </select>
        <select value={roleFilter} onChange={e => setRoleFilter(e.target.value as any)} className={`${inputCls} text-xs`}>
          <option value="ALL">All Roles</option>
          {ROLE_OPTIONS.map(r => <option key={r}>{r}</option>)}
        </select>
        <select value={activeFilter} onChange={e => setActiveFilter(e.target.value as any)} className={`${inputCls} text-xs`}>
          <option value="ALL">All</option>
          <option value="ACTIVE">Active</option>
          <option value="INACTIVE">Inactive</option>
        </select>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Employee</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Role</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Department</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Active Tasks</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Issues</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-12 text-center text-sm text-gray-400">
                  <Users className="w-8 h-8 mx-auto mb-2 opacity-30" />
                  No employees found.
                </td>
              </tr>
            ) : (
              filtered.map(emp => {
                const empTasks = tasks.filter(t => t.assignedArtistId === emp.id)
                const activeTasks = empTasks.filter(t => t.status === 'IN_PROGRESS' || t.status === 'REVIEW').length
                const issueTasks = empTasks.filter(t => t.status === 'ISSUE' || t.status === 'EXTENDED').length
                return (
                  <tr key={emp.id} className={clsx('border-b border-gray-100', !emp.active && 'opacity-50')}>
                    {editId === emp.id ? (
                      <td colSpan={6} className="p-0">
                        <div className="p-4">
                          <FormRow onSave={saveEdit} onCancel={() => setEditId(null)} />
                        </div>
                      </td>
                    ) : (
                      <>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            <span
                              className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-semibold shrink-0"
                              style={{ backgroundColor: emp.avatarColor ?? '#6366f1' }}
                            >
                              {getInitials(emp.name)}
                            </span>
                            <div>
                              <div className="font-medium text-gray-900">{emp.name}</div>
                              <div className="text-xs text-gray-400">{emp.email}</div>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`text-xs px-2 py-0.5 rounded font-medium ${
                            emp.role === 'MANAGER' ? 'bg-purple-50 text-purple-700'
                              : emp.role === 'LEAD' ? 'bg-blue-50 text-blue-700'
                              : 'bg-gray-100 text-gray-600'
                          }`}>
                            {emp.role}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-gray-600 text-xs">
                          <div>{emp.department}</div>
                          {emp.specialization && <div className="text-gray-400">{emp.specialization}</div>}
                        </td>
                        <td className="px-4 py-3">
                          {activeTasks > 0 ? (
                            <span className="text-xs bg-amber-50 text-amber-700 px-2 py-0.5 rounded-full font-medium">{activeTasks} active</span>
                          ) : <span className="text-xs text-gray-400">—</span>}
                        </td>
                        <td className="px-4 py-3">
                          {issueTasks > 0 ? (
                            <span className="text-xs bg-red-50 text-red-700 px-2 py-0.5 rounded-full font-medium">{issueTasks} issue</span>
                          ) : <span className="text-xs text-gray-400">—</span>}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1">
                            <button onClick={() => startEdit(emp)} className="p-1.5 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-600">
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => deactivateEmployee(emp.id)}
                              className={`p-1.5 rounded hover:bg-gray-100 ${emp.active ? 'text-gray-400 hover:text-amber-600' : 'text-gray-300'}`}
                              title={emp.active ? 'Deactivate' : 'Already inactive'}
                            >
                              <Power className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </>
                    )}
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
