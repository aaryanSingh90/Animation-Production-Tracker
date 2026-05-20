import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import api from "../lib/api";
import Loader from "../components/Loader";
import EmptyState from "../components/EmptyState";
import Modal from "../components/Modal";
import { getDepartmentLabel, labelize } from "../utils/format";
import { useToastStore } from "../store/toastStore";

const INITIAL_FORM = {
  name: "",
  description: "",
  color: "#10B981"
};

export default function DepartmentsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const showToast = useToastStore((state) => state.showToast);

  const [loading, setLoading] = useState(true);
  const [departments, setDepartments] = useState([]);
  const [users, setUsers] = useState([]);
  const [selectedDepartmentId, setSelectedDepartmentId] = useState(searchParams.get("departmentId") || null);
  const [selectedDepartment, setSelectedDepartment] = useState(null);
  const [saving, setSaving] = useState(false);
  const [heatmap, setHeatmap] = useState({ departments: [], teams: [] });

  const [memberToAdd, setMemberToAdd] = useState("");

  const [formOpen, setFormOpen] = useState(false);
  const [editingDepartment, setEditingDepartment] = useState(null);
  const [form, setForm] = useState(INITIAL_FORM);

  async function fetchBaseData() {
    setLoading(true);
    try {
      const [departmentsRes, usersRes, heatmapRes] = await Promise.all([
        api.get("/departments"),
        api.get("/users"),
        api.get("/workforce/heatmap")
      ]);
      setDepartments(departmentsRes.data);
      setUsers(usersRes.data.filter((user) => user.role === "EMPLOYEE" || user.role === "COORDINATOR"));
      setHeatmap(heatmapRes.data || { departments: [], teams: [] });

      const highlightedId = searchParams.get("departmentId") || selectedDepartmentId || departmentsRes.data[0]?.id || null;
      if (highlightedId) {
        await openDepartment(highlightedId, false);
      } else {
        setSelectedDepartment(null);
      }
    } catch (error) {
      showToast("error", error.userMessage || error.response?.data?.message || "Failed to load departments");
    } finally {
      setLoading(false);
    }
  }

  async function openDepartment(departmentId, syncUrl = true) {
    setSelectedDepartmentId(departmentId);
    try {
      const { data } = await api.get(`/departments/${departmentId}`);
      setSelectedDepartment(data);
      if (syncUrl) {
        setSearchParams((prev) => {
          const next = new URLSearchParams(prev);
          next.set("departmentId", departmentId);
          return next;
        });
      }
    } catch (error) {
      showToast("error", error.userMessage || error.response?.data?.message || "Failed to load department details");
    }
  }

  useEffect(() => {
    fetchBaseData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const highlighted = searchParams.get("departmentId");
    if (highlighted && highlighted !== selectedDepartmentId) {
      openDepartment(highlighted, false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const availableMembers = useMemo(() => {
    if (!selectedDepartment) return [];
    const selectedIds = new Set((selectedDepartment.members || []).map((member) => member.id));
    return users.filter((user) => user.isActive && !selectedIds.has(user.id));
  }, [users, selectedDepartment]);

  function openCreateModal() {
    setEditingDepartment(null);
    setForm(INITIAL_FORM);
    setFormOpen(true);
  }

  function openEditModal(department) {
    setEditingDepartment(department);
    setForm({
      name: department.name || "",
      description: department.description || "",
      color: department.color || "#10B981"
    });
    setFormOpen(true);
  }

  async function submitDepartment(event) {
    event.preventDefault();
    setSaving(true);
    try {
      if (editingDepartment) {
        await api.put(`/departments/${editingDepartment.id}`, form);
        showToast("success", "Department updated");
      } else {
        await api.post("/departments", form);
        showToast("success", "Department created");
      }
      setFormOpen(false);
      setEditingDepartment(null);
      setForm(INITIAL_FORM);
      await fetchBaseData();
    } catch (error) {
      showToast("error", error.userMessage || error.response?.data?.message || "Unable to save department");
    } finally {
      setSaving(false);
    }
  }

  async function addMember() {
    if (!selectedDepartment || !memberToAdd) return;
    setSaving(true);
    try {
      await api.post(`/departments/${selectedDepartment.id}/members`, { userId: Number(memberToAdd) });
      showToast("success", "Member added to department");
      setMemberToAdd("");
      await openDepartment(selectedDepartment.id);
      await fetchBaseData();
    } catch (error) {
      showToast("error", error.userMessage || error.response?.data?.message || "Unable to add member");
    } finally {
      setSaving(false);
    }
  }

  async function removeMember(user) {
    if (!selectedDepartment) return;
    const confirmed = window.confirm(`Remove ${user.name} from ${selectedDepartment.name}?`);
    if (!confirmed) return;

    setSaving(true);
    try {
      await api.delete(`/departments/${selectedDepartment.id}/members/${user.id}`);
      showToast("success", "Member removed");
      await openDepartment(selectedDepartment.id);
      await fetchBaseData();
    } catch (error) {
      showToast("error", error.userMessage || error.response?.data?.message || "Unable to remove member");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <Loader label="Loading departments..." />;

  const utilizationRows = heatmap.departments || [];
  const overloadedDepartments = utilizationRows.filter((department) => department.health === "critical").length;
  const averageUtilization = utilizationRows.length
    ? Math.round(utilizationRows.reduce((sum, item) => sum + (item.utilizationPercent || 0), 0) / utilizationRows.length)
    : 0;
  const totalTeams = (heatmap.teams || []).length;

  return (
    <div className="space-y-5">
      <section className="rounded-[32px] border border-slate-200/80 bg-[radial-gradient(circle_at_top_left,rgba(16,185,129,0.12),transparent_30%),linear-gradient(180deg,rgba(255,255,255,0.96),rgba(248,250,252,0.94))] p-5 shadow-sm shadow-slate-200/45">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">Department operations</p>
            <h2 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">Studio structure and workload map</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
              Keep teams organized, rebalance department load, and manage members from one cleaner production surface.
            </p>
          </div>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <MetricCard label="Departments" value={departments.length} helper="Active production units" tone="emerald" />
            <MetricCard label="Overloaded Depts" value={overloadedDepartments} helper="Needs staffing support" tone="rose" />
            <MetricCard label="Avg Utilization" value={`${averageUtilization}%`} helper="Workforce capacity trend" tone="amber" />
            <MetricCard label="Active Teams" value={totalTeams} helper="Cross-functional squads" tone="blue" />
          </div>
        </div>
      </section>

      <section className="rounded-[30px] border border-slate-200/80 bg-white/90 p-4 shadow-sm shadow-slate-200/35 backdrop-blur">
        <h3 className="mb-3 text-lg font-semibold tracking-tight text-slate-950">Department Workload Map</h3>
        {!utilizationRows.length ? (
          <EmptyState title="No workload heatmap" description="Department utilization data will appear after assignments." compact />
        ) : (
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={utilizationRows}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" hide />
              <YAxis domain={[0, 100]} />
              <Tooltip />
              <Bar dataKey="utilizationPercent" radius={[6, 6, 0, 0]}>
                {utilizationRows.map((row) => (
                  <Cell key={row.id} fill={row.health === "critical" ? "#EF4444" : row.health === "watch" ? "#F59E0B" : "#10B981"} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </section>

      <div className="grid gap-6 xl:grid-cols-3">
      <section className="xl:col-span-2 rounded-[30px] border border-slate-200/80 bg-white/90 p-4 shadow-sm shadow-slate-200/35 backdrop-blur">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold tracking-tight text-slate-950">Departments</h3>
            <p className="text-sm text-slate-500">Manage studio departments and teams.</p>
          </div>
          <button onClick={openCreateModal} className="rounded-2xl bg-slate-950 px-3 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800">
            + New Dept
          </button>
        </div>

        {!departments.length ? (
          <EmptyState title="No departments" description="Create your first department to start team assignment." />
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {departments.map((department) => (
              <div
                key={department.id}
                className={`rounded-xl border p-3 transition ${
                  selectedDepartmentId === department.id ? "border-emerald-300 bg-emerald-50/40 shadow-sm" : "border-slate-200/80 bg-white/88"
                }`}
              >
                <div className="mb-3 flex items-start justify-between gap-3">
                  <div>
                    <p className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                      <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: department.color || "#10B981" }} />
                      {department.name}
                    </p>
                    <p className="text-xs text-slate-500">{department.memberCount} members</p>
                  </div>
                </div>
                <p className="text-xs text-slate-600">{department.inhouseCount} In-house · {department.freelanceCount} Freelance</p>
                <div className="mt-3 flex gap-2">
                  <button
                    onClick={() => openDepartment(department.id)}
                    className="rounded-xl border border-slate-300 px-2.5 py-1.5 text-xs font-semibold text-slate-700"
                  >
                    View Team
                  </button>
                  <button
                    onClick={() => openEditModal(department)}
                    className="rounded-xl border border-slate-300 px-2.5 py-1.5 text-xs font-semibold text-slate-700"
                  >
                    Edit
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="rounded-[30px] border border-slate-200/80 bg-white/90 p-4 shadow-sm shadow-slate-200/35 backdrop-blur">
        {!selectedDepartment ? (
          <EmptyState title="Select a department" description="Choose a department card to view team details." />
        ) : (
          <div className="space-y-4">
            <div className="rounded-[24px] border border-slate-200/80 bg-slate-50/80 p-4">
              <div className="mb-2 flex items-start justify-between gap-3">
                <div>
                  <p className="flex items-center gap-2 text-sm font-bold text-slate-900">
                    <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: selectedDepartment.color || "#10B981" }} />
                    {selectedDepartment.name}
                  </p>
                  <p className="text-xs text-slate-500">
                    {selectedDepartment.memberCount} members · {selectedDepartment.inhouseCount} In-house · {selectedDepartment.freelanceCount} Freelance
                  </p>
                </div>
                <button
                  onClick={() =>
                    openEditModal({
                      id: selectedDepartment.id,
                      name: selectedDepartment.name,
                      description: selectedDepartment.description,
                      color: selectedDepartment.color
                    })
                  }
                  className="rounded-xl border border-slate-300 px-2.5 py-1.5 text-xs font-semibold text-slate-700"
                >
                  Edit Dept
                </button>
              </div>
              {selectedDepartment.description && <p className="text-xs text-slate-600">{selectedDepartment.description}</p>}
            </div>

            <div className="rounded-[24px] border border-slate-200/80 bg-white/88 p-4">
              <h4 className="mb-2 text-sm font-bold text-slate-800">Team Members</h4>
              <div className="space-y-2">
                {(selectedDepartment.members || []).map((member) => (
                  <div key={member.id} className="rounded-2xl border border-slate-200/80 bg-slate-50/90 px-3 py-2.5">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-sm font-semibold text-slate-900">{member.name}</p>
                        <p className="text-xs text-slate-500">
                          {labelize(member.role)} · {member.activeAssignmentsCount} active tasks
                        </p>
                        <p className="mt-1 text-[11px]">
                          <span
                            className={`rounded-full px-2 py-0.5 font-semibold ${
                              member.employmentType === "FREELANCE" ? "bg-blue-100 text-blue-700" : "bg-emerald-100 text-emerald-700"
                            }`}
                          >
                            {member.employmentType === "FREELANCE" ? "Freelance" : "In-house"}
                          </span>
                        </p>
                      </div>
                      <button
                        onClick={() => removeMember(member)}
                        className="rounded-xl border border-red-300 px-2.5 py-1.5 text-[11px] font-semibold text-red-600"
                        disabled={saving}
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                ))}
                {!selectedDepartment.members?.length && <p className="text-xs text-slate-500">No members in this department.</p>}
              </div>

              <div className="mt-3 flex items-center gap-2">
                <select
                  value={memberToAdd}
                  onChange={(event) => setMemberToAdd(event.target.value)}
                  className="flex-1 rounded-2xl border border-slate-300 px-3 py-2 text-sm"
                >
                  <option value="">Select employee...</option>
                  {availableMembers.map((user) => (
                    <option key={user.id} value={user.id}>
                      {user.name} · {getDepartmentLabel(user)} · {user.employmentType === "FREELANCE" ? "Freelance" : "In-house"}
                    </option>
                  ))}
                </select>
                <button
                  onClick={addMember}
                  disabled={!memberToAdd || saving}
                  className="rounded-2xl bg-slate-950 px-3 py-2 text-xs font-semibold text-white disabled:opacity-60"
                >
                  Add Member
                </button>
              </div>
            </div>

            <div className="rounded-[24px] border border-slate-200/80 bg-white/88 p-4">
              <h4 className="mb-2 text-sm font-bold text-slate-800">Assigned To Stages</h4>
              <div className="max-h-52 space-y-1 overflow-auto">
                {(selectedDepartment.assignedStages || []).map((item) => (
                  <p key={item.id} className="text-xs text-slate-600">
                    {item.projectName} → {labelize(item.stageName)}
                  </p>
                ))}
                {!selectedDepartment.assignedStages?.length && <p className="text-xs text-slate-500">No stages assigned yet.</p>}
              </div>
            </div>

            <div className="rounded-[24px] border border-slate-200/80 bg-white/88 p-4">
              <h4 className="mb-2 text-sm font-bold text-slate-800">Active Teams</h4>
              <div className="space-y-2">
                {(selectedDepartment.teams || []).map((team) => (
                  <div key={team.id} className="rounded-2xl border border-slate-200/80 bg-slate-50/90 p-2.5">
                    <p className="text-xs font-semibold text-slate-800">{team.name}</p>
                    <p className="text-[11px] text-slate-500">
                      {team.memberCount} members · {team.projectCount} projects
                    </p>
                  </div>
                ))}
                {!selectedDepartment.teams?.length && <p className="text-xs text-slate-500">No active teams in this department.</p>}
              </div>
            </div>
          </div>
        )}
      </section>
      </div>

      <Modal open={formOpen} onClose={() => setFormOpen(false)} title={editingDepartment ? "Edit Department" : "Create Department"}>
        <form className="space-y-4" onSubmit={submitDepartment}>
          <Input
            label="Department Name"
            required
            value={form.name}
            onChange={(value) => setForm((prev) => ({ ...prev, name: value }))}
          />
          <div>
            <label className="mb-1 block text-sm font-semibold text-slate-700">Description</label>
            <textarea
              rows={3}
              value={form.description}
              onChange={(event) => setForm((prev) => ({ ...prev, description: event.target.value }))}
              className="w-full rounded-2xl border border-slate-300 bg-white px-3 py-2.5 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-semibold text-slate-700">Color</label>
            <input
              type="color"
              value={form.color}
              onChange={(event) => setForm((prev) => ({ ...prev, color: event.target.value }))}
              className="h-10 w-24 rounded-lg border border-slate-300"
            />
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setFormOpen(false)} className="rounded-2xl border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700">
              Cancel
            </button>
            <button type="submit" disabled={saving} className="rounded-2xl bg-slate-950 px-3 py-2 text-sm font-semibold text-white disabled:opacity-60">
              {saving ? "Saving..." : editingDepartment ? "Save" : "Create Dept"}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

function MetricCard({ label, value, helper, tone = "emerald" }) {
  const toneClasses = {
    emerald: "border-emerald-200 bg-emerald-50/90 text-emerald-900",
    rose: "border-rose-200 bg-rose-50/90 text-rose-900",
    amber: "border-amber-200 bg-amber-50/90 text-amber-900",
    blue: "border-blue-200 bg-blue-50/90 text-blue-900"
  };

  return (
    <article className={`rounded-3xl border p-4 shadow-sm shadow-slate-200/30 backdrop-blur ${toneClasses[tone]}`}>
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em]">{label}</p>
      <p className="mt-2 text-2xl font-semibold tracking-tight">{value}</p>
      <p className="mt-1 text-xs opacity-80">{helper}</p>
    </article>
  );
}

function Input({ label, value, onChange, required = false }) {
  return (
    <div>
      <label className="mb-1 block text-sm font-semibold text-slate-700">{label}</label>
      <input
        required={required}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-2xl border border-slate-300 bg-white px-3 py-2.5 text-sm"
      />
    </div>
  );
}
