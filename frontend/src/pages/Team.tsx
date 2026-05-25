import { useState } from 'react'
import { Plus, Pencil, Power, Users, ChevronDown, AlertCircle } from 'lucide-react'
import { useEmployeeStore } from '../store/employeeStore'
import { usePipelineStore } from '../store/pipelineStore'
import type { Employee, EmployeeDepartment, EmployeeRole } from '../types'
import { ApiError } from '../api/client'
import { clsx } from 'clsx'

const DEPT_OPTIONS: EmployeeDepartment[] = [
  'Animation', 'Rigging', 'Lighting', 'FX', 'Compositing', 'Modelling', 'Texturing', 'Audio', 'Editing',
]
// Two-tier role model: MANAGER + ARTIST + FREELANCE assignable from UI.
// LEAD is kept in the enum for backwards compat with legacy data but is no
// longer assignable.
const ROLE_OPTIONS: EmployeeRole[] = ['MANAGER', 'ARTIST', 'FREELANCE']

const AVATAR_COLORS = [
  '#6366f1', '#ec4899', '#f59e0b', '#10b981', '#3b82f6',
  '#f97316', '#8b5cf6', '#14b8a6',
]

interface EmployeeForm {
  name:           string
  email:          string
  password:       string
  role:           EmployeeRole
  department:     EmployeeDepartment
  specialization: string
  active:         boolean
  avatarColor:    string
}

const BLANK: EmployeeForm = {
  name: '', email: '', password: 'studio123', role: 'ARTIST', department: 'Animation',
  specialization: '', active: true, avatarColor: AVATAR_COLORS[0],
}

function getInitials(name: string) {
  return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)
}

const ROLE_STYLE: Record<EmployeeRole, string> = {
  MANAGER:   'bg-violet-500/15  text-violet-400  border-violet-500/30',
  LEAD:      'bg-sky-500/15     text-sky-400     border-sky-500/30',
  ARTIST:    'bg-slate-500/15   text-slate-300   border-slate-600/30',
  FREELANCE: 'bg-orange-500/15  text-orange-400  border-orange-500/30',
}

// ── FormRow lives outside Team so React never remounts it on parent re-renders ─

const inputCls = 'px-3 py-2 text-xs bg-[#0d1424] border border-[#1b253b] rounded-lg text-slate-200 placeholder-slate-600 focus:outline-none focus:border-indigo-500 transition-colors'

interface FormRowProps {
  form:      EmployeeForm
  setForm:   React.Dispatch<React.SetStateAction<EmployeeForm>>
  editId:    string | null
  saving:    boolean
  formError: string | null
  onSave:    () => void
  onCancel:  () => void
}

function FormRow({ form, setForm, editId, saving, formError, onSave, onCancel }: FormRowProps) {
  return (
    <div className="bg-[#0d1424] border border-indigo-500/30 rounded-xl p-4 mb-4 space-y-3">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <input
          placeholder="Full name *"
          value={form.name}
          onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
          className={inputCls}
        />
        <input
          placeholder="Email"
          value={form.email}
          onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
          className={inputCls}
        />
        <select
          value={form.role}
          onChange={e => setForm(f => ({ ...f, role: e.target.value as EmployeeRole }))}
          className={`${inputCls} cursor-pointer`}
        >
          {ROLE_OPTIONS.map(r => <option key={r} className="bg-[#0d1424]">{r}</option>)}
        </select>
        <select
          value={form.department}
          onChange={e => setForm(f => ({ ...f, department: e.target.value as EmployeeDepartment }))}
          className={`${inputCls} cursor-pointer`}
        >
          {DEPT_OPTIONS.map(d => <option key={d} className="bg-[#0d1424]">{d}</option>)}
        </select>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <input
          placeholder={editId ? 'New password (leave blank to keep current)' : 'Password *'}
          type="password"
          value={form.password}
          onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
          className={inputCls}
        />
        <input
          placeholder="Specialization (optional)"
          value={form.specialization}
          onChange={e => setForm(f => ({ ...f, specialization: e.target.value }))}
          className={inputCls}
        />
      </div>
      <p className="text-[10px] text-slate-500 font-medium">
        Login is by <span className="text-indigo-400">email</span> +{' '}
        <span className="text-amber-400">password</span>. Default is <span className="font-mono text-amber-400">studio123</span> — change it before handing the account over.
      </p>
      {formError && (
        <div className="flex items-center gap-1.5 px-2.5 py-1.5 bg-rose-500/10 border border-rose-500/30 rounded-md text-[11px] font-bold text-rose-400">
          <AlertCircle className="w-3.5 h-3.5 shrink-0" /> {formError}
        </div>
      )}
      <div className="flex gap-2">
        <button
          onClick={onSave}
          disabled={saving}
          className="px-4 py-2 text-xs font-bold uppercase tracking-wider text-white bg-indigo-600 hover:bg-indigo-500 rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
        <button
          onClick={onCancel}
          className="px-4 py-2 text-xs font-bold uppercase tracking-wider text-slate-400 hover:text-slate-200 border border-[#1b253b] rounded-lg transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────

export function Team() {
  const { employees, addEmployee, updateEmployee, deactivateEmployee } = useEmployeeStore()
  const tasks = usePipelineStore(s => s.tasks)

  const [showForm, setShowForm]       = useState(false)
  const [editId, setEditId]           = useState<string | null>(null)
  const [form, setForm]               = useState<EmployeeForm>(BLANK)
  const [saving, setSaving]           = useState(false)
  const [formError, setFormError]     = useState<string | null>(null)
  const [deptFilter, setDeptFilter]   = useState<EmployeeDepartment | 'ALL'>('ALL')
  const [roleFilter, setRoleFilter]   = useState<EmployeeRole | 'ALL'>('ALL')
  const [activeFilter, setActiveFilter] = useState<'ALL' | 'ACTIVE' | 'INACTIVE'>('ALL')

  const filtered = employees.filter(e => {
    if (deptFilter  !== 'ALL' && e.department !== deptFilter)  return false
    if (roleFilter  !== 'ALL' && e.role       !== roleFilter)  return false
    if (activeFilter === 'ACTIVE'   && !e.active) return false
    if (activeFilter === 'INACTIVE' &&  e.active) return false
    return true
  })

  function startEdit(emp: Employee) {
    setEditId(emp.id)
    setForm({
      name: emp.name, email: emp.email, password: '',
      role: emp.role,
      department: emp.department, specialization: emp.specialization ?? '',
      active: emp.active, avatarColor: emp.avatarColor ?? AVATAR_COLORS[0],
    })
    setShowForm(false)
  }

  async function saveNew() {
    if (!form.name.trim() || !form.email.trim() || !form.password.trim()) {
      setFormError('Name, email, and password are required.')
      return
    }
    if (form.password.length < 6) {
      setFormError('Password must be at least 6 characters.')
      return
    }
    const normalized = form.email.trim().toLowerCase()
    if (employees.some(e => e.email.toLowerCase() === normalized)) {
      setFormError('An employee with that email already exists.')
      return
    }
    setSaving(true)
    setFormError(null)
    try {
      await addEmployee({
        name:           form.name.trim(),
        email:          normalized,
        password:       form.password,
        role:           form.role,
        department:     form.department,
        specialization: form.specialization || undefined,
        avatarColor:    AVATAR_COLORS[employees.length % AVATAR_COLORS.length],
      })
      setForm(BLANK)
      setShowForm(false)
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : 'Failed to create employee.')
    } finally {
      setSaving(false)
    }
  }

  async function saveEdit() {
    if (!editId || !form.name.trim() || !form.email.trim()) {
      setFormError('Name and email are required.')
      return
    }
    if (form.password.trim() && form.password.length < 6) {
      setFormError('New password must be at least 6 characters.')
      return
    }
    const normalized = form.email.trim().toLowerCase()
    if (employees.some(e => e.id !== editId && e.email.toLowerCase() === normalized)) {
      setFormError('Another employee already uses that email.')
      return
    }
    setSaving(true)
    setFormError(null)
    try {
      await updateEmployee(editId, {
        name:           form.name.trim(),
        email:          normalized,
        ...(form.password.trim() ? { password: form.password } : {}),
        role:           form.role,
        department:     form.department,
        specialization: form.specialization || undefined,
        avatarColor:    form.avatarColor,
        active:         form.active,
      })
      setEditId(null)
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : 'Failed to update employee.')
    } finally {
      setSaving(false)
    }
  }

  const selectCls = `flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold uppercase tracking-wider bg-[#0d1424] border border-[#1b253b] rounded-md text-slate-400 hover:border-slate-600 hover:text-slate-300 focus:outline-none focus:border-indigo-500 transition-colors cursor-pointer appearance-none`

  return (
    <div className="min-h-screen bg-[#0b0f19] text-slate-100">
      <div className="max-w-6xl mx-auto px-6 py-8">

        {/* Header */}
        <div className="flex items-center justify-between border-b border-[#1a263e] pb-5 mb-6">
          <div>
            <h1 className="text-xl font-black tracking-wide text-white uppercase flex items-center gap-2">
              <Users className="w-5 h-5 text-indigo-400" /> Team
            </h1>
            <p className="text-xs text-slate-400 font-bold uppercase tracking-wider mt-1">
              {employees.filter(e => e.active).length} active members · {employees.length} total
            </p>
          </div>
          <button
            onClick={() => { setShowForm(v => !v); setEditId(null); setForm(BLANK) }}
            className="flex items-center gap-2 px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-white bg-indigo-600 hover:bg-indigo-500 rounded-lg transition-colors shadow-md shadow-indigo-950/50"
          >
            <Plus className="w-3.5 h-3.5" /> Add Employee
          </button>
        </div>

        {/* Add form */}
        {showForm && (
          <FormRow
            form={form}
            setForm={setForm}
            editId={editId}
            saving={saving}
            formError={formError}
            onSave={saveNew}
            onCancel={() => { setShowForm(false); setFormError(null) }}
          />
        )}

        {/* Filters */}
        <div className="flex gap-2 mb-4 flex-wrap">
          <div className="relative">
            <select
              value={deptFilter}
              onChange={e => setDeptFilter(e.target.value as any)}
              className={selectCls}
            >
              <option value="ALL" className="bg-[#0d1424]">All Departments</option>
              {DEPT_OPTIONS.map(d => <option key={d} value={d} className="bg-[#0d1424]">{d}</option>)}
            </select>
            <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-500" />
          </div>
          <div className="relative">
            <select
              value={roleFilter}
              onChange={e => setRoleFilter(e.target.value as any)}
              className={selectCls}
            >
              <option value="ALL" className="bg-[#0d1424]">All Roles</option>
              {ROLE_OPTIONS.map(r => <option key={r} value={r} className="bg-[#0d1424]">{r}</option>)}
            </select>
            <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-500" />
          </div>
          <div className="relative">
            <select
              value={activeFilter}
              onChange={e => setActiveFilter(e.target.value as any)}
              className={selectCls}
            >
              <option value="ALL"      className="bg-[#0d1424]">All</option>
              <option value="ACTIVE"   className="bg-[#0d1424]">Active</option>
              <option value="INACTIVE" className="bg-[#0d1424]">Inactive</option>
            </select>
            <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-500" />
          </div>
        </div>

        {/* Table */}
        <div className="bg-[#0c1221] rounded-xl border border-[#1b253b] overflow-x-auto">
          <table className="w-full text-sm min-w-[920px]">
            <thead>
              <tr className="bg-[#111929] border-b border-[#1b253b]">
                <th className="px-4 py-3 text-left text-[10px] font-black text-slate-400 uppercase tracking-wider">Employee</th>
                <th className="px-4 py-3 text-left text-[10px] font-black text-slate-400 uppercase tracking-wider">Role</th>
                <th className="px-4 py-3 text-left text-[10px] font-black text-slate-400 uppercase tracking-wider">Department</th>
                <th className="px-4 py-3 text-left text-[10px] font-black text-slate-400 uppercase tracking-wider">In Progress</th>
                <th className="px-4 py-3 text-left text-[10px] font-black text-slate-400 uppercase tracking-wider">In Review</th>
                <th className="px-4 py-3 text-left text-[10px] font-black text-slate-400 uppercase tracking-wider">Retake</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-16 text-center">
                    <Users className="w-8 h-8 mx-auto mb-2 text-slate-700" />
                    <p className="text-xs text-slate-500 font-bold uppercase tracking-wider">No employees found</p>
                  </td>
                </tr>
              ) : (
                filtered.map(emp => {
                  const empTasks   = tasks.filter(t => t.assignedArtistId === emp.id)
                  const inProgress = empTasks.filter(t => t.status === 'IN_PROGRESS').length
                  const inReview   = empTasks.filter(t => t.status === 'DONE' || t.status === 'LEAD_APPROVAL').length
                  const retake     = empTasks.filter(t => t.status === 'LEAD_RETAKE').length
                  return (
                    <tr
                      key={emp.id}
                      className={clsx(
                        'border-b border-[#141d2f] hover:bg-[#0f1829] transition-colors',
                        !emp.active && 'opacity-40'
                      )}
                    >
                      {editId === emp.id ? (
                        <td colSpan={7} className="p-4">
                          <FormRow
                            form={form}
                            setForm={setForm}
                            editId={editId}
                            saving={saving}
                            formError={formError}
                            onSave={saveEdit}
                            onCancel={() => { setEditId(null); setFormError(null) }}
                          />
                        </td>
                      ) : (
                        <>
                          {/* Employee */}
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-3">
                              <span
                                className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-black shrink-0"
                                style={{ backgroundColor: emp.avatarColor ?? '#6366f1' }}
                              >
                                {getInitials(emp.name)}
                              </span>
                              <div>
                                <div className="text-sm font-semibold text-slate-100">{emp.name}</div>
                                <div className="text-[10px] text-slate-500">{emp.email}</div>
                              </div>
                            </div>
                          </td>

                          {/* Role */}
                          <td className="px-4 py-3">
                            <span className={`text-[10px] px-2 py-0.5 rounded border font-black uppercase tracking-wider ${ROLE_STYLE[emp.role] ?? ROLE_STYLE.ARTIST}`}>
                              {emp.role}
                            </span>
                          </td>

                          {/* Department */}
                          <td className="px-4 py-3">
                            <div className="text-xs text-slate-300 font-medium">{emp.department}</div>
                            {emp.specialization && (
                              <div className="text-[10px] text-slate-500 mt-0.5">{emp.specialization}</div>
                            )}
                          </td>

                          {/* In Progress */}
                          <td className="px-4 py-3">
                            {inProgress > 0 ? (
                              <span className="text-[10px] font-black bg-amber-500/15 text-amber-400 border border-amber-500/30 px-2 py-0.5 rounded uppercase tracking-wider">
                                {inProgress} active
                              </span>
                            ) : (
                              <span className="text-xs text-slate-700">—</span>
                            )}
                          </td>

                          {/* In Review */}
                          <td className="px-4 py-3">
                            {inReview > 0 ? (
                              <span className="text-[10px] font-black bg-teal-500/15 text-teal-400 border border-teal-500/30 px-2 py-0.5 rounded uppercase tracking-wider">
                                {inReview} review
                              </span>
                            ) : (
                              <span className="text-xs text-slate-700">—</span>
                            )}
                          </td>

                          {/* Retake */}
                          <td className="px-4 py-3">
                            {retake > 0 ? (
                              <span className="text-[10px] font-black bg-rose-500/15 text-rose-400 border border-rose-500/30 px-2 py-0.5 rounded uppercase tracking-wider animate-pulse">
                                {retake} retake
                              </span>
                            ) : (
                              <span className="text-xs text-slate-700">—</span>
                            )}
                          </td>

                          {/* Actions */}
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-1">
                              <button
                                onClick={() => startEdit(emp)}
                                className="p-1.5 rounded-md hover:bg-[#1b2a40] text-slate-600 hover:text-slate-300 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/40"
                                title="Edit"
                                aria-label={`Edit ${emp.name}`}
                              >
                                <Pencil className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => deactivateEmployee(emp.id)}
                                className={`p-1.5 rounded-md hover:bg-[#1b2a40] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/40 ${
                                  emp.active ? 'text-slate-600 hover:text-amber-400' : 'text-slate-800 cursor-not-allowed'
                                }`}
                                title={emp.active ? 'Deactivate' : 'Already inactive'}
                                aria-label={emp.active ? `Deactivate ${emp.name}` : `${emp.name} is already inactive`}
                                disabled={!emp.active}
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

        {/* Footer count */}
        <p className="text-[10px] font-bold text-slate-600 uppercase tracking-wider mt-3 text-right">
          {filtered.length} of {employees.length} employees
        </p>
      </div>
    </div>
  )
}
