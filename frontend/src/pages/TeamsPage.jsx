import { useEffect, useMemo, useState } from "react";
import { AlertCircle, Archive, CheckCircle2, Layers3, Plus, Users, X } from "lucide-react";
import api from "../lib/api";
import Loader from "../components/Loader";
import EmptyState from "../components/EmptyState";
import Modal from "../components/Modal";
import { formatDate, initials, labelize } from "../utils/format";
import { useToastStore } from "../store/toastStore";

const TEAM_FORM = {
  name: "",
  description: "",
  color: "#3B82F6",
  departmentId: "",
  leadId: ""
};

export default function TeamsPage() {
  const showToast = useToastStore((state) => state.showToast);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [teams, setTeams] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [users, setUsers] = useState([]);
  const [projects, setProjects] = useState([]);

  const [selectedTeamId, setSelectedTeamId] = useState(null);
  const [selectedTeam, setSelectedTeam] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const [modalOpen, setModalOpen] = useState(false);
  const [editingTeam, setEditingTeam] = useState(null);
  const [form, setForm] = useState(TEAM_FORM);
  const [saving, setSaving] = useState(false);

  const [memberToAdd, setMemberToAdd] = useState("");
  const [projectToAssign, setProjectToAssign] = useState("");

  async function loadBaseData() {
    setLoading(true);
    setError("");

    try {
      const [teamsRes, departmentsRes, usersRes, projectsRes] = await Promise.all([
        api.get("/teams"),
        api.get("/departments"),
        api.get("/users"),
        api.get("/projects")
      ]);

      const nextTeams = teamsRes.data || [];
      setTeams(nextTeams);
      setDepartments(departmentsRes.data || []);
      setUsers((usersRes.data || []).filter((user) => user.isActive));
      setProjects(projectsRes.data || []);

      const targetId = selectedTeamId || nextTeams[0]?.id || null;
      if (targetId) {
        await openTeam(targetId);
      } else {
        setSelectedTeam(null);
      }
    } catch (err) {
      setError(err.userMessage || err.response?.data?.message || "Failed to load teams dashboard");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadBaseData();
  }, []);

  async function openTeam(teamId) {
    setSelectedTeamId(teamId);
    setDetailLoading(true);
    try {
      const { data } = await api.get(`/teams/${teamId}`);
      setSelectedTeam(data);
    } catch (err) {
      showToast("error", err.userMessage || err.response?.data?.message || "Failed to load team details");
    } finally {
      setDetailLoading(false);
    }
  }

  function openCreateModal() {
    setEditingTeam(null);
    setForm(TEAM_FORM);
    setModalOpen(true);
  }

  function openEditModal(team) {
    setEditingTeam(team);
    setForm({
      name: team.name || "",
      description: team.description || "",
      color: team.color || "#3B82F6",
      departmentId: team.department?.id || "",
      leadId: team.lead?.id ? String(team.lead.id) : ""
    });
    setModalOpen(true);
  }

  async function saveTeam(event) {
    event.preventDefault();
    setSaving(true);

    const payload = {
      name: form.name,
      description: form.description,
      color: form.color,
      departmentId: form.departmentId || null,
      leadId: form.leadId ? Number(form.leadId) : null
    };

    try {
      if (editingTeam) {
        await api.put(`/teams/${editingTeam.id}`, payload);
        showToast("success", "Team updated successfully");
      } else {
        await api.post("/teams", payload);
        showToast("success", "Team created successfully");
      }

      setModalOpen(false);
      setEditingTeam(null);
      setForm(TEAM_FORM);
      await loadBaseData();
    } catch (err) {
      showToast("error", err.userMessage || err.response?.data?.message || "Unable to save team");
    } finally {
      setSaving(false);
    }
  }

  async function addMember() {
    if (!selectedTeam || !memberToAdd) return;

    try {
      await api.post(`/teams/${selectedTeam.id}/members`, { userId: Number(memberToAdd) });
      showToast("success", "Member added");
      setMemberToAdd("");
      await openTeam(selectedTeam.id);
      await loadBaseData();
    } catch (err) {
      showToast("error", err.userMessage || err.response?.data?.message || "Unable to add member");
    }
  }

  async function removeMember(member) {
    if (!selectedTeam) return;
    if (!window.confirm(`Remove ${member.name} from ${selectedTeam.name}?`)) return;

    try {
      await api.delete(`/teams/${selectedTeam.id}/members/${member.id}`);
      showToast("success", "Member removed");
      await openTeam(selectedTeam.id);
      await loadBaseData();
    } catch (err) {
      showToast("error", err.userMessage || err.response?.data?.message || "Unable to remove member");
    }
  }

  async function setLead(leadId) {
    if (!selectedTeam) return;
    try {
      await api.post(`/teams/${selectedTeam.id}/lead`, { leadId: leadId ? Number(leadId) : null });
      showToast("success", leadId ? "Team lead updated" : "Team lead cleared");
      await openTeam(selectedTeam.id);
      await loadBaseData();
    } catch (err) {
      showToast("error", err.userMessage || err.response?.data?.message || "Unable to update team lead");
    }
  }

  async function assignProject() {
    if (!selectedTeam || !projectToAssign) return;

    try {
      await api.post(`/teams/${selectedTeam.id}/projects`, { projectId: Number(projectToAssign) });
      showToast("success", "Team assigned to project");
      setProjectToAssign("");
      await openTeam(selectedTeam.id);
      await loadBaseData();
    } catch (err) {
      showToast("error", err.userMessage || err.response?.data?.message || "Unable to assign project");
    }
  }

  async function unassignProject(projectId) {
    if (!selectedTeam) return;

    try {
      await api.delete(`/teams/${selectedTeam.id}/projects/${projectId}`);
      showToast("success", "Project removed from team");
      await openTeam(selectedTeam.id);
      await loadBaseData();
    } catch (err) {
      showToast("error", err.userMessage || err.response?.data?.message || "Unable to remove project");
    }
  }

  async function archiveTeam(team) {
    if (!window.confirm(`Archive ${team.name}? Members will be detached from this team.`)) return;

    try {
      await api.delete(`/teams/${team.id}`);
      showToast("success", "Team archived");
      setSelectedTeam(null);
      setSelectedTeamId(null);
      await loadBaseData();
    } catch (err) {
      showToast("error", err.userMessage || err.response?.data?.message || "Unable to archive team");
    }
  }

  const availableMembers = useMemo(() => {
    if (!selectedTeam) return [];
    const selectedIds = new Set((selectedTeam.members || []).map((member) => member.id));
    return users.filter((user) => !selectedIds.has(user.id));
  }, [users, selectedTeam]);

  const availableProjects = useMemo(() => {
    if (!selectedTeam) return projects;
    const linked = new Set((selectedTeam.projects || []).map((project) => project.id));
    return projects.filter((project) => !linked.has(project.id));
  }, [projects, selectedTeam]);

  if (loading) return <Loader label="Loading teams..." />;

  return (
    <div className="grid gap-6 xl:grid-cols-[320px_1fr]">
      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <h3 className="text-lg font-bold text-slate-900">Teams</h3>
            <p className="text-xs text-slate-500">Production squads and staffing units</p>
          </div>
          <button onClick={openCreateModal} className="rounded-lg bg-slate-900 px-2.5 py-1.5 text-xs font-semibold text-white">
            <Plus size={14} className="mr-1 inline" /> New
          </button>
        </div>

        {error ? (
          <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
            <p>{error}</p>
          </div>
        ) : !teams.length ? (
          <EmptyState title="No teams yet" description="Create your first team to organize artists and project staffing." compact />
        ) : (
          <div className="space-y-2">
            {teams.map((team) => (
              <button
                key={team.id}
                onClick={() => openTeam(team.id)}
                className={`w-full rounded-xl border px-3 py-2 text-left transition ${
                  selectedTeamId === team.id ? "border-emerald-300 bg-emerald-50" : "border-slate-200 hover:border-slate-300"
                }`}
              >
                <p className="text-sm font-semibold text-slate-900">{team.name}</p>
                <p className="text-xs text-slate-500">{team.memberCount} members · {team.projectCount} projects</p>
                <div className="mt-2 h-1.5 rounded-full bg-slate-200">
                  <div className="h-1.5 rounded-full bg-emerald-500" style={{ width: `${Math.max(3, team.capacityPercent || 0)}%` }} />
                </div>
              </button>
            ))}
          </div>
        )}
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        {detailLoading ? (
          <Loader label="Loading team detail..." />
        ) : !selectedTeam ? (
          <EmptyState title="Select a team" description="Choose a team from the left list to manage members and project staffing." />
        ) : (
          <div className="space-y-5">
            <header className="flex flex-wrap items-start justify-between gap-3 rounded-2xl bg-slate-900 p-4 text-white">
              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-white/70">Team Dashboard</p>
                <h2 className="text-xl font-bold">{selectedTeam.name}</h2>
                <p className="mt-1 text-sm text-white/80">{selectedTeam.description || "No description"}</p>
                <p className="mt-2 text-xs text-white/70">Department: {selectedTeam.department?.name || "Not mapped"}</p>
              </div>
              <div className="flex gap-2">
                <button onClick={() => openEditModal(selectedTeam)} className="rounded-lg bg-white/15 px-3 py-1.5 text-xs font-semibold hover:bg-white/20">
                  Edit Team
                </button>
                <button onClick={() => archiveTeam(selectedTeam)} className="rounded-lg border border-rose-300 bg-rose-500/20 px-3 py-1.5 text-xs font-semibold text-rose-100 hover:bg-rose-500/30">
                  <Archive size={12} className="mr-1 inline" /> Archive
                </button>
              </div>
            </header>

            <section className="grid gap-3 md:grid-cols-4">
              <MetricTile label="Members" value={selectedTeam.memberCount} icon={Users} />
              <MetricTile label="In-house" value={selectedTeam.inhouseCount} icon={CheckCircle2} />
              <MetricTile label="Freelance" value={selectedTeam.freelanceCount} icon={Layers3} />
              <MetricTile label="Completion Rate" value={`${selectedTeam.completionRate || 0}%`} icon={AlertCircle} />
            </section>

            <section className="rounded-2xl border border-slate-200 p-4">
              <div className="mb-2 flex items-center justify-between">
                <h4 className="text-sm font-bold text-slate-900">Team Lead</h4>
                {selectedTeam.lead && (
                  <button onClick={() => setLead(null)} className="rounded-lg border border-slate-300 px-2 py-1 text-xs font-semibold text-slate-600">
                    Clear
                  </button>
                )}
              </div>
              <select
                value={selectedTeam.lead?.id ? String(selectedTeam.lead.id) : ""}
                onChange={(event) => setLead(event.target.value)}
                className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
              >
                <option value="">No lead</option>
                {(selectedTeam.members || []).map((member) => (
                  <option key={member.id} value={member.id}>
                    {member.name}
                  </option>
                ))}
              </select>
            </section>

            <section className="grid gap-4 lg:grid-cols-2">
              <div className="rounded-2xl border border-slate-200 p-4">
                <h4 className="mb-3 text-sm font-bold text-slate-900">Team Members</h4>
                <div className="max-h-[360px] space-y-2 overflow-auto pr-1">
                  {(selectedTeam.members || []).map((member) => (
                    <article key={member.id} className="rounded-xl border border-slate-200 bg-slate-50 p-2.5">
                      <div className="mb-1 flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-slate-900 text-xs font-bold text-white">{initials(member.name)}</span>
                          <div>
                            <p className="text-sm font-semibold text-slate-900">{member.name}</p>
                            <p className="text-[11px] text-slate-500">{labelize(member.role)}</p>
                          </div>
                        </div>
                        <button onClick={() => removeMember(member)} className="rounded-lg border border-rose-300 px-2 py-1 text-[11px] font-semibold text-rose-600">
                          Remove
                        </button>
                      </div>
                      <p className="text-[11px] text-slate-600">{member.workload?.activeTasks || 0} active tasks · {member.workload?.capacityPercent || 0}% capacity</p>
                    </article>
                  ))}
                  {!selectedTeam.members?.length && <p className="text-xs text-slate-500">No members in team.</p>}
                </div>

                <div className="mt-3 flex gap-2">
                  <select value={memberToAdd} onChange={(event) => setMemberToAdd(event.target.value)} className="flex-1 rounded-xl border border-slate-300 px-2 py-1.5 text-sm">
                    <option value="">Add member...</option>
                    {availableMembers.map((member) => (
                      <option key={member.id} value={member.id}>
                        {member.name} · {labelize(member.role)}
                      </option>
                    ))}
                  </select>
                  <button onClick={addMember} disabled={!memberToAdd} className="rounded-xl bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60">
                    Add
                  </button>
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 p-4">
                <h4 className="mb-3 text-sm font-bold text-slate-900">Assigned Projects</h4>
                <div className="max-h-[360px] space-y-2 overflow-auto pr-1">
                  {(selectedTeam.projects || []).map((project) => (
                    <article key={project.id} className="rounded-xl border border-slate-200 bg-slate-50 p-2.5">
                      <div className="mb-1 flex items-start justify-between gap-2">
                        <div>
                          <p className="text-sm font-semibold text-slate-900">{project.name}</p>
                          <p className="text-[11px] text-slate-500">Priority {project.priority} · Assigned {formatDate(project.assignedAt)}</p>
                        </div>
                        <button onClick={() => unassignProject(project.id)} className="rounded-lg border border-rose-300 px-2 py-1 text-[11px] font-semibold text-rose-600">
                          <X size={12} />
                        </button>
                      </div>
                      <div className="h-1.5 rounded-full bg-slate-200">
                        <div className="h-1.5 rounded-full bg-emerald-500" style={{ width: `${Math.max(3, project.progressPercent || 0)}%` }} />
                      </div>
                    </article>
                  ))}
                  {!selectedTeam.projects?.length && <p className="text-xs text-slate-500">No project assignments yet.</p>}
                </div>

                <div className="mt-3 flex gap-2">
                  <select value={projectToAssign} onChange={(event) => setProjectToAssign(event.target.value)} className="flex-1 rounded-xl border border-slate-300 px-2 py-1.5 text-sm">
                    <option value="">Assign project...</option>
                    {availableProjects.map((project) => (
                      <option key={project.id} value={project.id}>
                        {project.name}
                      </option>
                    ))}
                  </select>
                  <button onClick={assignProject} disabled={!projectToAssign} className="rounded-xl bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60">
                    Assign
                  </button>
                </div>
              </div>
            </section>
          </div>
        )}
      </section>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editingTeam ? "Edit Team" : "Create Team"}>
        <form className="space-y-4" onSubmit={saveTeam}>
          <Field label="Team Name" value={form.name} onChange={(value) => setForm((prev) => ({ ...prev, name: value }))} required />
          <div>
            <label className="mb-1 block text-sm font-semibold text-slate-700">Description</label>
            <textarea
              rows={3}
              value={form.description}
              onChange={(event) => setForm((prev) => ({ ...prev, description: event.target.value }))}
              className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-semibold text-slate-700">Department</label>
            <select
              value={form.departmentId}
              onChange={(event) => setForm((prev) => ({ ...prev, departmentId: event.target.value }))}
              className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
            >
              <option value="">No Department</option>
              {departments.map((department) => (
                <option key={department.id} value={department.id}>
                  {department.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm font-semibold text-slate-700">Team Lead</label>
            <select
              value={form.leadId}
              onChange={(event) => setForm((prev) => ({ ...prev, leadId: event.target.value }))}
              className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
            >
              <option value="">No Lead</option>
              {users.map((user) => (
                <option key={user.id} value={user.id}>
                  {user.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm font-semibold text-slate-700">Color</label>
            <input type="color" value={form.color} onChange={(event) => setForm((prev) => ({ ...prev, color: event.target.value }))} className="h-10 w-24 rounded-lg border border-slate-300" />
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setModalOpen(false)} className="rounded-xl border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700">
              Cancel
            </button>
            <button type="submit" disabled={saving} className="rounded-xl bg-slate-900 px-3 py-2 text-sm font-semibold text-white disabled:opacity-60">
              {saving ? "Saving..." : editingTeam ? "Save Team" : "Create Team"}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

function MetricTile({ label, value, icon: Icon }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
        <Icon size={14} className="text-slate-500" />
      </div>
      <p className="text-xl font-bold text-slate-900">{value}</p>
    </div>
  );
}

function Field({ label, value, onChange, required = false }) {
  return (
    <div>
      <label className="mb-1 block text-sm font-semibold text-slate-700">{label}</label>
      <input required={required} value={value} onChange={(event) => onChange(event.target.value)} className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm" />
    </div>
  );
}
