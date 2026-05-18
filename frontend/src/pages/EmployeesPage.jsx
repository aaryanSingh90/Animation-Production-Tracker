import { useEffect, useMemo, useState } from "react";
import api from "../lib/api";
import Loader from "../components/Loader";
import EmptyState from "../components/EmptyState";
import Modal from "../components/Modal";
import StatusBadge from "../components/StatusBadge";
import { formatDate, labelize } from "../utils/format";
import { useToastStore } from "../store/toastStore";

export default function EmployeesPage() {
  const showToast = useToastStore((state) => state.showToast);

  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState([]);
  const [projects, setProjects] = useState([]);
  const [selectedUserId, setSelectedUserId] = useState(null);
  const [selectedUser, setSelectedUser] = useState(null);

  const [sortBy, setSortBy] = useState("name");
  const [sortDir, setSortDir] = useState("asc");

  const [addOpen, setAddOpen] = useState(false);
  const [addForm, setAddForm] = useState({
    name: "",
    email: "",
    password: "",
    role: "EMPLOYEE",
    department: ""
  });

  const [assignment, setAssignment] = useState({ projectId: "", stageId: "" });

  async function fetchUsersAndProjects() {
    setLoading(true);
    try {
      const [usersRes, projectsRes] = await Promise.all([api.get("/users"), api.get("/projects")]);
      setUsers(usersRes.data);
      setProjects(projectsRes.data);

      if (selectedUserId) {
        const detail = await api.get(`/users/${selectedUserId}`);
        setSelectedUser(detail.data);
      }
    } catch (error) {
      showToast("error", error.userMessage || error.response?.data?.message || "Failed to fetch employees");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchUsersAndProjects();
  }, []);

  const employees = useMemo(() => users.filter((user) => user.role === "EMPLOYEE" || user.role === "COORDINATOR"), [users]);

  const sorted = useMemo(() => {
    const copy = [...employees];
    copy.sort((a, b) => {
      if (sortBy === "department") return (a.department || "").localeCompare(b.department || "");
      if (sortBy === "role") return a.role.localeCompare(b.role);
      if (sortBy === "active") return Number(a.isActive) - Number(b.isActive);
      return a.name.localeCompare(b.name);
    });
    if (sortDir === "desc") copy.reverse();
    return copy;
  }, [employees, sortBy, sortDir]);

  const availableStages = useMemo(() => {
    const project = projects.find((item) => String(item.id) === String(assignment.projectId));
    return project?.stages || [];
  }, [projects, assignment.projectId]);

  const openUserProfile = async (userId) => {
    setSelectedUserId(userId);
    try {
      const { data } = await api.get(`/users/${userId}`);
      setSelectedUser(data);
    } catch (error) {
      showToast("error", error.userMessage || error.response?.data?.message || "Failed to load employee profile");
    }
  };

  const addEmployee = async (event) => {
    event.preventDefault();
    try {
      await api.post("/users", addForm);
      showToast("success", "Employee created");
      setAddOpen(false);
      setAddForm({ name: "", email: "", password: "", role: "EMPLOYEE", department: "" });
      await fetchUsersAndProjects();
    } catch (error) {
      showToast("error", error.userMessage || error.response?.data?.message || "Unable to create employee");
    }
  };

  const assignUser = async () => {
    if (!selectedUserId || !assignment.stageId) return;
    try {
      await api.post(`/users/${selectedUserId}/assign`, { stageId: Number(assignment.stageId) });
      showToast("success", "Employee assigned to stage");
      setAssignment({ projectId: "", stageId: "" });
      await openUserProfile(selectedUserId);
      await fetchUsersAndProjects();
    } catch (error) {
      showToast("error", error.userMessage || error.response?.data?.message || "Unable to assign employee");
    }
  };

  const deactivateUser = async (userId) => {
    if (!window.confirm("Deactivate this user?")) return;
    try {
      await api.delete(`/users/${userId}`);
      showToast("success", "User deactivated");
      if (selectedUserId === userId) {
        setSelectedUserId(null);
        setSelectedUser(null);
      }
      await fetchUsersAndProjects();
    } catch (error) {
      showToast("error", error.userMessage || error.response?.data?.message || "Unable to deactivate user");
    }
  };

  if (loading) return <Loader label="Loading employees..." />;

  return (
    <div className="grid grid-cols-3 gap-6">
      <section className="col-span-2 rounded-2xl border border-slate-200 bg-white p-4">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex gap-2">
            <select value={sortBy} onChange={(event) => setSortBy(event.target.value)} className="rounded-xl border border-slate-300 px-3 py-2 text-sm">
              <option value="name">Sort by name</option>
              <option value="role">Sort by role</option>
              <option value="department">Sort by department</option>
              <option value="active">Sort by active status</option>
            </select>
            <button
              onClick={() => setSortDir((prev) => (prev === "asc" ? "desc" : "asc"))}
              className="rounded-xl border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700"
            >
              {sortDir.toUpperCase()}
            </button>
          </div>
          <button onClick={() => setAddOpen(true)} className="rounded-xl bg-slate-900 px-3 py-2 text-sm font-semibold text-white">
            Add Employee
          </button>
        </div>

        {!sorted.length ? (
          <EmptyState title="No employees" description="Add employees to assign pipeline stages." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-slate-500">
                  <th className="py-2">Name</th>
                  <th className="py-2">Email</th>
                  <th className="py-2">Role</th>
                  <th className="py-2">Department</th>
                  <th className="py-2">Active</th>
                  <th className="py-2">Assigned Projects</th>
                  <th className="py-2">Action</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((user) => (
                  <tr
                    key={user.id}
                    className={`cursor-pointer border-b border-slate-100 ${selectedUserId === user.id ? "bg-slate-50" : ""}`}
                    onClick={() => openUserProfile(user.id)}
                  >
                    <td className="py-3 font-semibold text-slate-900">{user.name}</td>
                    <td className="py-3">{user.email}</td>
                    <td className="py-3">{labelize(user.role)}</td>
                    <td className="py-3">{user.department || "-"}</td>
                    <td className="py-3">{user.isActive ? "Yes" : "No"}</td>
                    <td className="py-3">{user._count?.assignedProjectStages || 0}</td>
                    <td className="py-3">
                      <button
                        onClick={(event) => {
                          event.stopPropagation();
                          deactivateUser(user.id);
                        }}
                        className="rounded-lg bg-red-500 px-2.5 py-1 text-xs font-semibold text-white"
                      >
                        Deactivate
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-4">
        {!selectedUser ? (
          <EmptyState title="Select an employee" description="Click an employee row to view profile and workload." />
        ) : (
          <div className="space-y-4">
            <div>
              <h3 className="text-lg font-bold text-slate-900">{selectedUser.name}</h3>
              <p className="text-sm text-slate-600">{selectedUser.email}</p>
              <p className="text-sm text-slate-600">{labelize(selectedUser.role)} · {selectedUser.department || "-"}</p>
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs">
              <Stat label="Submissions" value={selectedUser.stats?.submittedCount || 0} />
              <Stat label="Approved" value={selectedUser.stats?.approvedCount || 0} />
              <Stat label="Approval Rate" value={`${selectedUser.stats?.approvalRate || 0}%`} />
              <Stat label="Active Stages" value={selectedUser.stats?.activeStages || 0} />
            </div>

            <div className="space-y-2 rounded-xl border border-slate-200 p-3">
              <h4 className="text-sm font-bold text-slate-800">Assign To Stage</h4>
              <select
                value={assignment.projectId}
                onChange={(event) => setAssignment({ projectId: event.target.value, stageId: "" })}
                className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
              >
                <option value="">Select project</option>
                {projects.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.name}
                  </option>
                ))}
              </select>
              <select
                value={assignment.stageId}
                onChange={(event) => setAssignment((prev) => ({ ...prev, stageId: event.target.value }))}
                className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
              >
                <option value="">Select stage</option>
                {availableStages.map((stage) => (
                  <option key={stage.id} value={stage.id}>
                    {labelize(stage.stageName)} ({labelize(stage.status)})
                  </option>
                ))}
              </select>
              <button onClick={assignUser} className="w-full rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white">
                Assign Stage
              </button>
            </div>

            <div>
              <h4 className="mb-2 text-sm font-bold text-slate-800">Assigned Stages</h4>
              <div className="max-h-[260px] space-y-2 overflow-auto">
                {(selectedUser.assignedProjectStages || []).map((stage) => (
                  <div key={stage.id} className="rounded-xl border border-slate-200 p-2">
                    <p className="text-sm font-semibold text-slate-900">{stage.project.name}</p>
                    <p className="text-xs text-slate-600">{labelize(stage.stageName)} · {formatDate(stage.deadline)}</p>
                    <div className="mt-1">
                      <StatusBadge status={stage.status} />
                    </div>
                  </div>
                ))}
                {!selectedUser.assignedProjectStages?.length && <p className="text-xs text-slate-500">No assigned stages yet.</p>}
              </div>
            </div>
          </div>
        )}
      </section>

      <Modal open={addOpen} onClose={() => setAddOpen(false)} title="Add Employee">
        <form className="space-y-4" onSubmit={addEmployee}>
          <Input label="Full Name" value={addForm.name} onChange={(value) => setAddForm((prev) => ({ ...prev, name: value }))} required />
          <Input label="Email Address" type="email" value={addForm.email} onChange={(value) => setAddForm((prev) => ({ ...prev, email: value }))} required />
          <Input label="Password" type="password" value={addForm.password} onChange={(value) => setAddForm((prev) => ({ ...prev, password: value }))} required />
          <div>
            <label className="mb-1 block text-sm font-semibold text-slate-700">Role</label>
            <select
              value={addForm.role}
              onChange={(event) => setAddForm((prev) => ({ ...prev, role: event.target.value }))}
              className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
            >
              <option value="EMPLOYEE">EMPLOYEE</option>
              <option value="COORDINATOR">COORDINATOR</option>
            </select>
          </div>
          <Input label="Department / Speciality" value={addForm.department} onChange={(value) => setAddForm((prev) => ({ ...prev, department: value }))} required />

          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setAddOpen(false)} className="rounded-xl border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700">
              Cancel
            </button>
            <button type="submit" className="rounded-xl bg-slate-900 px-3 py-2 text-sm font-semibold text-white">
              Create Employee
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

function Stat({ label, value }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-2">
      <p className="text-[11px] uppercase tracking-wide text-slate-500">{label}</p>
      <p className="text-sm font-bold text-slate-800">{value}</p>
    </div>
  );
}

function Input({ label, value, onChange, type = "text", required = false }) {
  return (
    <div>
      <label className="mb-1 block text-sm font-semibold text-slate-700">{label}</label>
      <input
        type={type}
        required={required}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
      />
    </div>
  );
}
