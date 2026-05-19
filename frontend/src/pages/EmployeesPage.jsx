import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../lib/api";
import Loader from "../components/Loader";
import EmptyState from "../components/EmptyState";
import Modal from "../components/Modal";
import StatusBadge from "../components/StatusBadge";
import { formatDate, getDepartmentLabel, initials, labelize } from "../utils/format";
import { useToastStore } from "../store/toastStore";

export default function EmployeesPage() {
  const navigate = useNavigate();
  const showToast = useToastStore((state) => state.showToast);

  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState([]);
  const [projects, setProjects] = useState([]);
  const [departments, setDepartments] = useState([]);
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
    departmentId: "",
    employmentType: "INHOUSE"
  });

  const [editOpen, setEditOpen] = useState(false);
  const [editForm, setEditForm] = useState({
    name: "",
    email: "",
    role: "EMPLOYEE",
    departmentId: "",
    password: "",
    employmentType: "INHOUSE"
  });

  const [assignment, setAssignment] = useState({ projectId: "", projectStageId: "" });

  async function fetchUsersAndProjects() {
    setLoading(true);
    try {
      const [usersRes, projectsRes, departmentsRes] = await Promise.all([api.get("/users"), api.get("/projects"), api.get("/departments")]);
      setUsers(usersRes.data);
      setProjects(projectsRes.data);
      setDepartments(departmentsRes.data);
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
      if (sortBy === "department") return getDepartmentLabel(a).localeCompare(getDepartmentLabel(b));
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

  async function openUserProfile(userId) {
    setSelectedUserId(userId);
    try {
      const { data } = await api.get(`/users/${userId}`);
      setSelectedUser(data);
    } catch (error) {
      showToast("error", error.userMessage || error.response?.data?.message || "Failed to load employee profile");
    }
  }

  async function addEmployee(event) {
    event.preventDefault();
    const name = addForm.name.trim();
    const email = addForm.email.trim().toLowerCase();
    const password = addForm.password;

    if (!name || !email || !password) {
      showToast("error", "Name, email, and password are required");
      return;
    }

    if (password.length < 8) {
      showToast("error", "Password must be at least 8 characters");
      return;
    }

    const payload = {
      ...addForm,
      name,
      email,
      password,
      departmentId: addForm.departmentId || ""
    };

    try {
      await api.post("/users", payload);
      showToast("success", "Employee created");
      setAddOpen(false);
      setAddForm({ name: "", email: "", password: "", role: "EMPLOYEE", departmentId: "", employmentType: "INHOUSE" });
      await fetchUsersAndProjects();
    } catch (error) {
      showToast("error", error.userMessage || error.response?.data?.message || "Unable to create employee");
    }
  }

  function openEditModal() {
    if (!selectedUser) return;
    setEditForm({
      name: selectedUser.name || "",
      email: selectedUser.email || "",
      role: selectedUser.role || "EMPLOYEE",
      departmentId: selectedUser.departmentId || "",
      password: "",
      employmentType: selectedUser.employmentType || "INHOUSE"
    });
    setEditOpen(true);
  }

  async function saveEdit(event) {
    event.preventDefault();
    if (!selectedUserId) return;

    try {
      const payload = {
        name: editForm.name,
        email: editForm.email,
        role: editForm.role,
        departmentId: editForm.departmentId,
        employmentType: editForm.employmentType
      };
      if (editForm.password.trim()) payload.password = editForm.password.trim();
      await api.put(`/users/${selectedUserId}`, payload);
      showToast("success", "Employee updated");
      setEditOpen(false);
      await openUserProfile(selectedUserId);
      await fetchUsersAndProjects();
    } catch (error) {
      showToast("error", error.userMessage || error.response?.data?.message || "Unable to update employee");
    }
  }

  async function assignUser() {
    if (!selectedUserId || !assignment.projectStageId) return;
    try {
      await api.post(`/users/${selectedUserId}/assign`, { projectStageId: Number(assignment.projectStageId) });
      showToast("success", "Assigned successfully");
      setAssignment({ projectId: "", projectStageId: "" });
      await openUserProfile(selectedUserId);
      await fetchUsersAndProjects();
    } catch (error) {
      showToast("error", error.userMessage || error.response?.data?.message || "Unable to assign employee");
    }
  }

  async function deactivateUser(userId, name) {
    const confirmed = window.confirm(`Deactivate ${name}? They will lose access immediately.`);
    if (!confirmed) return;
    try {
      await api.put(`/users/${userId}`, { isActive: false });
      showToast("success", "User deactivated");
      if (selectedUserId === userId) {
        await openUserProfile(userId);
      }
      await fetchUsersAndProjects();
    } catch (error) {
      showToast("error", error.userMessage || error.response?.data?.message || "Unable to deactivate user");
    }
  }

  if (loading) return <Loader label="Loading employees..." />;

  function openDepartmentFromRow(departmentId) {
    if (!departmentId) return;
    navigate(`/departments?departmentId=${departmentId}`);
  }

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
            <button onClick={() => setSortDir((prev) => (prev === "asc" ? "desc" : "asc"))} className="rounded-xl border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700">
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
                  <th className="py-2">Type</th>
                  <th className="py-2">Status</th>
                  <th className="py-2">Assigned Projects</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((user) => (
                  <tr
                    key={user.id}
                    className={`cursor-pointer border-b border-slate-100 ${selectedUserId === user.id ? "bg-slate-50" : ""} ${!user.isActive ? "opacity-55" : ""}`}
                    onClick={() => openUserProfile(user.id)}
                  >
                    <td className="py-3 font-semibold text-slate-900">{user.name}</td>
                    <td className="py-3">{user.email}</td>
                    <td className="py-3">{labelize(user.role)}</td>
                    <td className="py-3">
                      {user.departmentId ? (
                        <button
                          onClick={(event) => {
                            event.stopPropagation();
                            openDepartmentFromRow(user.departmentId);
                          }}
                          className="rounded px-1 py-0.5 text-left text-emerald-700 hover:bg-emerald-50"
                        >
                          {getDepartmentLabel(user)}
                        </button>
                      ) : (
                        getDepartmentLabel(user)
                      )}
                    </td>
                    <td className="py-3">
                      <span
                        className={`rounded-full px-2 py-1 text-xs font-semibold ${
                          user.employmentType === "FREELANCE" ? "bg-blue-100 text-blue-700" : "bg-emerald-100 text-emerald-700"
                        }`}
                      >
                        {user.employmentType === "FREELANCE" ? "Freelance" : "In-house"}
                      </span>
                    </td>
                    <td className="py-3">
                      <span className={`rounded-full px-2 py-1 text-xs font-semibold ${user.isActive ? "bg-emerald-50 text-emerald-700" : "bg-slate-200 text-slate-600"}`}>
                        {user.isActive ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td className="py-3">{user._count?.assignedProjectStages || 0}</td>
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
            <div className="rounded-xl border border-slate-200 p-3">
              <div className="mb-2 flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <span className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-emerald-500 text-sm font-bold text-white">
                    {initials(selectedUser.name)}
                  </span>
                  <div>
                    <p className="text-sm font-bold text-slate-900">{selectedUser.name}</p>
                    <p className="text-xs text-slate-500">{selectedUser.email}</p>
                    <p className="text-xs text-slate-500">{labelize(selectedUser.role)} · {getDepartmentLabel(selectedUser)}</p>
                    <p className="mt-1">
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                          selectedUser.employmentType === "FREELANCE" ? "bg-blue-100 text-blue-700" : "bg-emerald-100 text-emerald-700"
                        }`}
                      >
                        {selectedUser.employmentType === "FREELANCE" ? "Freelance" : "In-house"}
                      </span>
                    </p>
                  </div>
                </div>
                <span className={`rounded-full px-2 py-1 text-[11px] font-semibold ${selectedUser.isActive ? "bg-emerald-50 text-emerald-700" : "bg-slate-200 text-slate-600"}`}>
                  {selectedUser.isActive ? "Active" : "Inactive"}
                </span>
              </div>
              <div className="flex gap-2">
                <button onClick={openEditModal} className="rounded-lg border border-slate-300 px-2.5 py-1 text-xs font-semibold text-slate-700">
                  Edit
                </button>
                <button onClick={() => deactivateUser(selectedUser.id, selectedUser.name)} className="rounded-lg bg-red-500 px-2.5 py-1 text-xs font-semibold text-white">
                  Deactivate
                </button>
              </div>
            </div>

            <div className="space-y-2 rounded-xl border border-slate-200 p-3">
              <h4 className="text-sm font-bold text-slate-800">Current Workload</h4>
              <p className="text-xs text-slate-500">{selectedUser.stats?.activeStages || 0} active tasks</p>
              <div className="space-y-2">
                {(selectedUser.assignedProjectStages || []).filter((stage) => stage.status !== "APPROVED").map((stage) => (
                  <div key={stage.id} className="rounded-lg bg-slate-50 p-2">
                    <p className="text-xs font-semibold text-slate-800">{stage.project.name} → {labelize(stage.stageName)}</p>
                    <p className="mt-1 text-[11px] text-slate-500">Deadline: {formatDate(stage.deadline)}</p>
                  </div>
                ))}
                {!selectedUser.assignedProjectStages?.filter((stage) => stage.status !== "APPROVED").length && (
                  <p className="text-xs text-slate-500">No active stages.</p>
                )}
              </div>
            </div>

            <div className="space-y-2 rounded-xl border border-slate-200 p-3">
              <h4 className="text-sm font-bold text-slate-800">Assign To Stage</h4>
              <select
                value={assignment.projectId}
                onChange={(event) => setAssignment({ projectId: event.target.value, projectStageId: "" })}
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
                value={assignment.projectStageId}
                onChange={(event) => setAssignment((prev) => ({ ...prev, projectStageId: event.target.value }))}
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
                Assign
              </button>
            </div>

            <div className="rounded-xl border border-slate-200 p-3">
              <h4 className="text-sm font-bold text-slate-800">History</h4>
              <p className="mt-1 text-xs text-slate-600">{selectedUser.stats?.submittedCount || 0} total submissions</p>
              <p className="text-xs text-slate-600">{selectedUser.stats?.approvedCount || 0} approved · {(selectedUser.stats?.submittedCount || 0) - (selectedUser.stats?.approvedCount || 0)} rejected</p>
              <p className="text-xs text-slate-600">Approval rate: {selectedUser.stats?.approvalRate || 0}%</p>
            </div>

            <div>
              <h4 className="mb-2 text-sm font-bold text-slate-800">All Assigned Stages</h4>
              <div className="max-h-[220px] space-y-2 overflow-auto">
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
          <Input
            label="Password"
            type="password"
            value={addForm.password}
            onChange={(value) => setAddForm((prev) => ({ ...prev, password: value }))}
            required
            minLength={8}
          />
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
          <div>
            <label className="mb-1 block text-sm font-semibold text-slate-700">Department</label>
            <select
              value={addForm.departmentId}
              onChange={(event) => setAddForm((prev) => ({ ...prev, departmentId: event.target.value }))}
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
            <label className="mb-1 block text-sm font-semibold text-slate-700">Employment Type</label>
            <div className="flex gap-4 text-sm">
              <label className="inline-flex items-center gap-2">
                <input
                  type="radio"
                  name="add-employment-type"
                  value="INHOUSE"
                  checked={addForm.employmentType === "INHOUSE"}
                  onChange={(event) => setAddForm((prev) => ({ ...prev, employmentType: event.target.value }))}
                />
                In-house
              </label>
              <label className="inline-flex items-center gap-2">
                <input
                  type="radio"
                  name="add-employment-type"
                  value="FREELANCE"
                  checked={addForm.employmentType === "FREELANCE"}
                  onChange={(event) => setAddForm((prev) => ({ ...prev, employmentType: event.target.value }))}
                />
                Freelance
              </label>
            </div>
          </div>

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

      <Modal open={editOpen} onClose={() => setEditOpen(false)} title="Edit Employee">
        <form className="space-y-4" onSubmit={saveEdit}>
          <Input label="Full Name" value={editForm.name} onChange={(value) => setEditForm((prev) => ({ ...prev, name: value }))} required />
          <Input label="Email Address" type="email" value={editForm.email} onChange={(value) => setEditForm((prev) => ({ ...prev, email: value }))} required />
          <div>
            <label className="mb-1 block text-sm font-semibold text-slate-700">Role</label>
            <select value={editForm.role} onChange={(event) => setEditForm((prev) => ({ ...prev, role: event.target.value }))} className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm">
              <option value="EMPLOYEE">EMPLOYEE</option>
              <option value="COORDINATOR">COORDINATOR</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm font-semibold text-slate-700">Department</label>
            <select
              value={editForm.departmentId}
              onChange={(event) => setEditForm((prev) => ({ ...prev, departmentId: event.target.value }))}
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
            <label className="mb-1 block text-sm font-semibold text-slate-700">Employment Type</label>
            <select
              value={editForm.employmentType}
              onChange={(event) => setEditForm((prev) => ({ ...prev, employmentType: event.target.value }))}
              className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
            >
              <option value="INHOUSE">In-house</option>
              <option value="FREELANCE">Freelance</option>
            </select>
          </div>
          <Input
            label="Password Reset (optional)"
            type="password"
            value={editForm.password}
            onChange={(value) => setEditForm((prev) => ({ ...prev, password: value }))}
            minLength={8}
          />
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setEditOpen(false)} className="rounded-xl border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700">
              Cancel
            </button>
            <button type="submit" className="rounded-xl bg-slate-900 px-3 py-2 text-sm font-semibold text-white">
              Save
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

function Input({ label, value, onChange, type = "text", required = false, minLength }) {
  return (
    <div>
      <label className="mb-1 block text-sm font-semibold text-slate-700">{label}</label>
      <input
        type={type}
        required={required}
        minLength={minLength}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
      />
    </div>
  );
}
