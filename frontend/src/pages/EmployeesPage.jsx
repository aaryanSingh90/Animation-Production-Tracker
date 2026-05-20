import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import api from "../lib/api";
import Loader from "../components/Loader";
import EmptyState from "../components/EmptyState";
import Modal from "../components/Modal";
import StatusBadge from "../components/StatusBadge";
import { formatDate, getDepartmentLabel, getStageDisplayName, initials, labelize } from "../utils/format";
import { isApprovedStatus } from "../utils/constants";
import { isDepartmentMatch, stageDepartmentFromCode } from "../utils/stageDepartmentMap";
import { useToastStore } from "../store/toastStore";

const ACTIVE_FILTERS = [
  { label: "All statuses", value: "ALL" },
  { label: "Active only", value: "ACTIVE" },
  { label: "Inactive only", value: "INACTIVE" }
];

const ROLE_FILTERS = [
  { label: "All roles", value: "ALL" },
  { label: "EMPLOYEE", value: "EMPLOYEE" },
  { label: "COORDINATOR", value: "COORDINATOR" }
];

const AVAILABILITY_OPTIONS = ["AVAILABLE", "BUSY", "ON_LEAVE", "OVERLOADED"];

export default function EmployeesPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const showToast = useToastStore((state) => state.showToast);

  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState([]);
  const [projects, setProjects] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [teams, setTeams] = useState([]);
  const [selectedUserId, setSelectedUserId] = useState(null);
  const [selectedUser, setSelectedUser] = useState(null);

  const [sortBy, setSortBy] = useState("name");
  const [sortDir, setSortDir] = useState("asc");
  const [filters, setFilters] = useState({
    search: "",
    departmentId: "ALL",
    teamId: "ALL",
    role: "ALL",
    active: "ALL",
    projectId: "ALL"
  });

  const [addOpen, setAddOpen] = useState(false);
  const [addForm, setAddForm] = useState({
    name: "",
    email: "",
    phone: "",
    password: "",
    role: "EMPLOYEE",
    departmentId: "",
    teamId: "",
    employmentType: "INHOUSE",
    availabilityStatus: "AVAILABLE"
  });

  const [editOpen, setEditOpen] = useState(false);
  const [editForm, setEditForm] = useState({
    name: "",
    email: "",
    phone: "",
    role: "EMPLOYEE",
    departmentId: "",
    teamId: "",
    password: "",
    employmentType: "INHOUSE",
    availabilityStatus: "AVAILABLE"
  });

  const [resetOpen, setResetOpen] = useState(false);
  const [resetForm, setResetForm] = useState({
    newPassword: "",
    confirmPassword: "",
    forcePasswordChange: false
  });

  const [assignment, setAssignment] = useState({ projectId: "", projectStageId: "" });

  async function fetchUsersAndProjects({ withLoader = true } = {}) {
    if (withLoader) setLoading(true);
    try {
      const [usersRes, projectsRes, departmentsRes, teamsRes] = await Promise.all([
        api.get("/employees"),
        api.get("/projects"),
        api.get("/departments"),
        api.get("/teams")
      ]);
      setUsers(usersRes.data);
      setProjects(projectsRes.data);
      setDepartments(departmentsRes.data);
      setTeams(teamsRes.data || []);

      if (selectedUserId) {
        const detail = await api.get(`/employees/${selectedUserId}`);
        setSelectedUser(detail.data);
      }
    } catch (error) {
      showToast("error", error.userMessage || error.response?.data?.message || "Failed to fetch employees");
    } finally {
      if (withLoader) setLoading(false);
    }
  }

  useEffect(() => {
    fetchUsersAndProjects();
  }, []);

  useEffect(() => {
    if (loading) return;
    const userIdFromQuery = Number(searchParams.get("userId"));
    if (!userIdFromQuery || Number.isNaN(userIdFromQuery) || selectedUserId === userIdFromQuery) return;

    const exists = users.some((user) => user.id === userIdFromQuery);
    if (exists) {
      openUserProfile(userIdFromQuery);
    }
  }, [loading, searchParams, selectedUserId, users]);

  const employees = useMemo(
    () => users.filter((user) => user.role === "EMPLOYEE" || user.role === "COORDINATOR"),
    [users]
  );

  const filtered = useMemo(() => {
    const search = filters.search.trim().toLowerCase();

    return employees.filter((user) => {
      if (search) {
        const haystack = `${user.name} ${user.email}`.toLowerCase();
        if (!haystack.includes(search)) return false;
      }

      if (filters.departmentId !== "ALL" && String(user.departmentId || "") !== String(filters.departmentId)) {
        return false;
      }

      if (filters.teamId !== "ALL" && String(user.teamId || "") !== String(filters.teamId)) {
        return false;
      }

      if (filters.role !== "ALL" && user.role !== filters.role) {
        return false;
      }

      if (filters.active === "ACTIVE" && !user.isActive) return false;
      if (filters.active === "INACTIVE" && user.isActive) return false;

      if (filters.projectId !== "ALL") {
        const projectId = Number(filters.projectId);
        const assignedIds = Array.isArray(user.assignedProjectIds) ? user.assignedProjectIds : [];
        if (!assignedIds.includes(projectId)) return false;
      }

      return true;
    });
  }, [employees, filters]);

  const sorted = useMemo(() => {
    const copy = [...filtered];

    const sorters = {
      name: (a, b) => a.name.localeCompare(b.name),
      role: (a, b) => a.role.localeCompare(b.role),
      department: (a, b) => getDepartmentLabel(a).localeCompare(getDepartmentLabel(b)),
      team: (a, b) => (a.teamName || "").localeCompare(b.teamName || ""),
      active: (a, b) => Number(a.isActive) - Number(b.isActive),
      projects: (a, b) => (a.assignedProjectCount || 0) - (b.assignedProjectCount || 0)
    };

    copy.sort(sorters[sortBy] || sorters.name);
    if (sortDir === "desc") copy.reverse();

    return copy;
  }, [filtered, sortBy, sortDir]);

  const availableStages = useMemo(() => {
    const project = projects.find((item) => String(item.id) === String(assignment.projectId));
    return project?.stages || [];
  }, [projects, assignment.projectId]);

  const assignmentStages = useMemo(() => {
    if (!selectedUser) return availableStages;

    const employeeDepartment = getDepartmentLabel(selectedUser);

    return availableStages.filter((stage) => {
      const code = stage?.stageDefinition?.code || stage?.stageName;
      const expectedDepartment = stageDepartmentFromCode(code);

      if (!expectedDepartment) return true;
      if (!employeeDepartment || employeeDepartment === "-") return true;

      return isDepartmentMatch(expectedDepartment, employeeDepartment);
    });
  }, [availableStages, selectedUser]);

  const dashboardMetrics = useMemo(() => {
    const total = employees.length;
    const active = employees.filter((user) => user.isActive).length;
    const inactive = total - active;
    const freelancers = employees.filter((user) => user.employmentType === "FREELANCE").length;

    return { total, active, inactive, freelancers };
  }, [employees]);

  async function openUserProfile(userId) {
    setSelectedUserId(userId);
    try {
      const { data } = await api.get(`/employees/${userId}`);
      setSelectedUser(data);
    } catch (error) {
      showToast("error", error.userMessage || error.response?.data?.message || "Failed to load employee profile");
    }
  }

  async function addEmployee(event) {
    event.preventDefault();

    const name = addForm.name.trim();
    const email = addForm.email.trim().toLowerCase();
    const phone = addForm.phone.trim();
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
      name,
      email,
      password,
      role: addForm.role,
      phone: phone || "",
      departmentId: addForm.departmentId || "",
      teamId: addForm.teamId || "",
      employmentType: addForm.employmentType,
      availabilityStatus: addForm.availabilityStatus
    };

    try {
      await api.post("/employees", payload);
      showToast("success", "Employee created");
      setAddOpen(false);
      setAddForm({
        name: "",
        email: "",
        phone: "",
        password: "",
        role: "EMPLOYEE",
        departmentId: "",
        teamId: "",
        employmentType: "INHOUSE",
        availabilityStatus: "AVAILABLE"
      });
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
      phone: selectedUser.phone || "",
      role: selectedUser.role || "EMPLOYEE",
      departmentId: selectedUser.departmentId || "",
      teamId: selectedUser.teamId || "",
      password: "",
      employmentType: selectedUser.employmentType || "INHOUSE",
      availabilityStatus: selectedUser.availabilityStatus || "AVAILABLE"
    });
    setEditOpen(true);
  }

  async function saveEdit(event) {
    event.preventDefault();
    if (!selectedUserId) return;

    try {
      const payload = {
        name: editForm.name.trim(),
        email: editForm.email.trim().toLowerCase(),
        phone: editForm.phone.trim(),
        role: editForm.role,
        departmentId: editForm.departmentId,
        teamId: editForm.teamId,
        employmentType: editForm.employmentType,
        availabilityStatus: editForm.availabilityStatus
      };
      if (editForm.password.trim()) payload.password = editForm.password.trim();

      await api.put(`/employees/${selectedUserId}`, payload);
      showToast("success", "Employee updated");
      setEditOpen(false);
      await openUserProfile(selectedUserId);
      await fetchUsersAndProjects({ withLoader: false });
    } catch (error) {
      showToast("error", error.userMessage || error.response?.data?.message || "Unable to update employee");
    }
  }

  async function assignUser() {
    if (!selectedUserId || !assignment.projectStageId) return;
    try {
      await api.post(`/employees/${selectedUserId}/assign`, { projectStageId: Number(assignment.projectStageId) });
      showToast("success", "Assigned successfully");
      setAssignment({ projectId: "", projectStageId: "" });
      await openUserProfile(selectedUserId);
      await fetchUsersAndProjects({ withLoader: false });
    } catch (error) {
      showToast("error", error.userMessage || error.response?.data?.message || "Unable to assign employee");
    }
  }

  async function updateActiveStatus(userId, name, isActive) {
    if (!isActive) {
      const confirmed = window.confirm(`Deactivate ${name}? They will lose access immediately.`);
      if (!confirmed) return;
    }

    try {
      await api.post("/employees/deactivate", { userId, isActive });
      showToast("success", isActive ? "Employee reactivated" : "Employee deactivated");
      if (selectedUserId === userId) {
        await openUserProfile(userId);
      }
      await fetchUsersAndProjects({ withLoader: false });
    } catch (error) {
      showToast("error", error.userMessage || error.response?.data?.message || "Unable to update user status");
    }
  }

  function openResetModal() {
    if (!selectedUser) return;
    setResetForm({ newPassword: "", confirmPassword: "", forcePasswordChange: false });
    setResetOpen(true);
  }

  async function resetPassword(event) {
    event.preventDefault();
    if (!selectedUser) return;

    const newPassword = resetForm.newPassword.trim();
    const confirmPassword = resetForm.confirmPassword.trim();

    if (!newPassword || newPassword.length < 8) {
      showToast("error", "Password must be at least 8 characters");
      return;
    }

    if (newPassword !== confirmPassword) {
      showToast("error", "Passwords do not match");
      return;
    }

    try {
      await api.post("/employees/reset-password", {
        userId: selectedUser.id,
        newPassword,
        forcePasswordChange: resetForm.forcePasswordChange
      });
      showToast("success", "Password reset successfully");
      setResetOpen(false);
    } catch (error) {
      showToast("error", error.userMessage || error.response?.data?.message || "Unable to reset password");
    }
  }

  function openDepartmentFromRow(departmentId) {
    if (!departmentId) return;
    navigate(`/departments?departmentId=${departmentId}`);
  }

  const combinedAssignments = useMemo(() => {
    if (!selectedUser) return [];

    const projectStages = (selectedUser.assignedProjectStages || []).map((stage) => ({
      id: `project-${stage.id}`,
      title: stage.project?.name || "Project",
      stageName: getStageDisplayName(stage),
      trackingMode: "PROJECT",
      deadline: stage.deadline,
      status: stage.status
    }));

    const shotStages = (selectedUser.assignedShotStages || []).map((stage) => ({
      id: `shot-${stage.id}`,
      title: stage.project?.name || "Project",
      stageName: stage.stageName,
      trackingMode: "SHOT",
      deadline: stage.deadline,
      status: stage.status
    }));

    const assetStages = (selectedUser.assignedAssetStages || []).map((stage) => ({
      id: `asset-${stage.id}`,
      title: stage.project?.name || "Project",
      stageName: stage.stageName,
      trackingMode: "ASSET",
      deadline: stage.deadline,
      status: stage.status
    }));

    return [...projectStages, ...shotStages, ...assetStages];
  }, [selectedUser]);

  if (loading) return <Loader label="Loading employees..." />;

  return (
    <div className="space-y-5">
      <section className="rounded-[32px] border border-slate-200/80 bg-[radial-gradient(circle_at_top_left,rgba(14,165,233,0.12),transparent_30%),linear-gradient(180deg,rgba(255,255,255,0.96),rgba(248,250,252,0.94))] p-5 shadow-sm shadow-slate-200/45">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">Studio staffing</p>
            <h2 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">Employee command center</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
              Track staffing, workload, department fit, and active assignments from one cleaner production surface.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <MetricCard label="Total Employees" value={dashboardMetrics.total} />
            <MetricCard label="Active" value={dashboardMetrics.active} tone="green" />
            <MetricCard label="Inactive" value={dashboardMetrics.inactive} tone="slate" />
            <MetricCard label="Freelancers" value={dashboardMetrics.freelancers} tone="blue" />
          </div>
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(320px,1fr)]">
        <section className="rounded-[30px] border border-slate-200/80 bg-white/90 p-4 shadow-sm shadow-slate-200/35 backdrop-blur">
          <div className="mb-4 flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            <div className="flex flex-wrap gap-2">
              <select value={sortBy} onChange={(event) => setSortBy(event.target.value)} className="h-11 rounded-2xl border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm outline-none transition focus:border-slate-400">
                <option value="name">Sort by name</option>
                <option value="role">Sort by role</option>
                <option value="department">Sort by department</option>
                <option value="team">Sort by team</option>
                <option value="projects">Sort by assigned projects</option>
                <option value="active">Sort by active status</option>
              </select>
              <button
                onClick={() => setSortDir((prev) => (prev === "asc" ? "desc" : "asc"))}
                className="h-11 rounded-2xl border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
              >
                {sortDir.toUpperCase()}
              </button>
            </div>
            <button onClick={() => setAddOpen(true)} className="inline-flex h-11 items-center justify-center rounded-2xl bg-slate-950 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800">
              Add Employee
            </button>
          </div>

          <div className="mb-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            <input
              value={filters.search}
              onChange={(event) => setFilters((prev) => ({ ...prev, search: event.target.value }))}
              placeholder="Search by name or email"
              className="h-11 rounded-2xl border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm outline-none transition placeholder:text-slate-400 focus:border-slate-400"
            />
            <select
              value={filters.departmentId}
              onChange={(event) => setFilters((prev) => ({ ...prev, departmentId: event.target.value }))}
              className="h-11 rounded-2xl border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm outline-none transition focus:border-slate-400"
            >
              <option value="ALL">All departments</option>
              {departments.map((department) => (
                <option key={department.id} value={department.id}>
                  {department.name}
                </option>
              ))}
            </select>
            <select
              value={filters.teamId}
              onChange={(event) => setFilters((prev) => ({ ...prev, teamId: event.target.value }))}
              className="h-11 rounded-2xl border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm outline-none transition focus:border-slate-400"
            >
              <option value="ALL">All teams</option>
              {teams.map((team) => (
                <option key={team.id} value={team.id}>
                  {team.name}
                </option>
              ))}
            </select>
            <select
              value={filters.role}
              onChange={(event) => setFilters((prev) => ({ ...prev, role: event.target.value }))}
              className="h-11 rounded-2xl border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm outline-none transition focus:border-slate-400"
            >
              {ROLE_FILTERS.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
            <select
              value={filters.active}
              onChange={(event) => setFilters((prev) => ({ ...prev, active: event.target.value }))}
              className="h-11 rounded-2xl border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm outline-none transition focus:border-slate-400"
            >
              {ACTIVE_FILTERS.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
            <select
              value={filters.projectId}
              onChange={(event) => setFilters((prev) => ({ ...prev, projectId: event.target.value }))}
              className="h-11 rounded-2xl border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm outline-none transition focus:border-slate-400"
            >
              <option value="ALL">All assigned projects</option>
              {projects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name}
                </option>
              ))}
            </select>
          </div>

          {!sorted.length ? (
            <EmptyState title="No employees found" description="Try changing filters or add a new employee." />
          ) : (
            <div className="overflow-hidden rounded-[24px] border border-slate-200/80">
              <div className="overflow-x-auto">
              <table className="w-full min-w-[1040px] text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-950 text-left text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-200">
                    <th className="px-3 py-3">Name</th>
                    <th className="px-3 py-3">Email</th>
                    <th className="px-3 py-3">Role</th>
                    <th className="px-3 py-3">Department</th>
                    <th className="px-3 py-3">Team</th>
                    <th className="px-3 py-3">Type</th>
                    <th className="px-3 py-3">Availability</th>
                    <th className="px-3 py-3">Status</th>
                    <th className="px-3 py-3">Assigned Projects</th>
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((user) => (
                    <tr
                      key={user.id}
                      className={`cursor-pointer border-b border-slate-100 transition hover:bg-slate-50/90 ${selectedUserId === user.id ? "bg-slate-50" : ""} ${!user.isActive ? "opacity-55" : ""}`}
                      onClick={() => openUserProfile(user.id)}
                    >
                      <td className="px-3 py-3 font-semibold text-slate-900">{user.name}</td>
                      <td className="px-3 py-3">{user.email}</td>
                      <td className="px-3 py-3">{labelize(user.role)}</td>
                      <td className="px-3 py-3">
                        {user.departmentId ? (
                          <button
                            onClick={(event) => {
                              event.stopPropagation();
                              openDepartmentFromRow(user.departmentId);
                            }}
                            className="rounded-xl px-2 py-1 text-left text-sky-700 hover:bg-sky-50"
                          >
                            {getDepartmentLabel(user)}
                          </button>
                        ) : (
                          getDepartmentLabel(user)
                        )}
                      </td>
                      <td className="px-3 py-3">{user.teamName || "-"}</td>
                      <td className="px-3 py-3">
                        <span
                          className={`rounded-full border px-2 py-1 text-xs font-semibold ${
                            user.employmentType === "FREELANCE" ? "bg-blue-100 text-blue-700" : "bg-emerald-100 text-emerald-700"
                          }`}
                        >
                          {user.employmentType === "FREELANCE" ? "Freelance" : "In-house"}
                        </span>
                      </td>
                      <td className="px-3 py-3">{labelize(user.availabilityStatus || "AVAILABLE")}</td>
                      <td className="px-3 py-3">
                        <span
                          className={`rounded-full border px-2 py-1 text-xs font-semibold ${
                            user.isActive ? "bg-emerald-50 text-emerald-700" : "bg-slate-200 text-slate-600"
                          }`}
                        >
                          {user.isActive ? "Active" : "Inactive"}
                        </span>
                      </td>
                      <td className="px-3 py-3">{user.assignedProjectCount || user._count?.assignedProjectStages || 0}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
            </div>
          )}
        </section>

        <section className="rounded-[30px] border border-slate-200/80 bg-white/90 p-4 shadow-sm shadow-slate-200/35 backdrop-blur">
          {!selectedUser ? (
            <EmptyState title="Select an employee" description="Click an employee row to view profile and workload." />
          ) : (
            <div className="space-y-4">
              <div className="rounded-[24px] border border-slate-200/80 bg-slate-50/70 p-4">
                <div className="mb-2 flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <span className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-slate-950 text-sm font-bold text-white">
                      {initials(selectedUser.name)}
                    </span>
                    <div>
                      <p className="text-sm font-bold text-slate-900">{selectedUser.name}</p>
                      <p className="text-xs text-slate-500">{selectedUser.email}</p>
                      <p className="text-xs text-slate-500">
                        {labelize(selectedUser.role)} · {getDepartmentLabel(selectedUser)}
                        {selectedUser.teamName ? ` · ${selectedUser.teamName}` : ""}
                      </p>
                      <p className="text-xs text-slate-500">{selectedUser.phone || "No phone"}</p>
                    </div>
                  </div>
                  <span
                    className={`rounded-full border px-2 py-1 text-[11px] font-semibold ${
                      selectedUser.isActive ? "bg-emerald-50 text-emerald-700" : "bg-slate-200 text-slate-600"
                    }`}
                  >
                    {selectedUser.isActive ? "Active" : "Inactive"}
                  </span>
                </div>

                <div className="flex flex-wrap gap-2">
                  <button onClick={openEditModal} className="rounded-xl border border-slate-300 px-2.5 py-1.5 text-xs font-semibold text-slate-700">
                    Edit
                  </button>
                  <button onClick={openResetModal} className="rounded-xl border border-amber-300 px-2.5 py-1.5 text-xs font-semibold text-amber-700">
                    Reset Password
                  </button>
                  <button
                    onClick={() => updateActiveStatus(selectedUser.id, selectedUser.name, !selectedUser.isActive)}
                    className={`rounded-xl px-2.5 py-1.5 text-xs font-semibold text-white ${
                      selectedUser.isActive ? "bg-rose-500" : "bg-emerald-600"
                    }`}
                  >
                    {selectedUser.isActive ? "Deactivate" : "Reactivate"}
                  </button>
                </div>
              </div>

              <div className="space-y-2 rounded-[24px] border border-slate-200/80 bg-white/88 p-4">
                <h4 className="text-sm font-bold text-slate-800">Current Workload</h4>
                <p className="text-xs text-slate-500">{selectedUser.stats?.activeStages || 0} active tasks</p>
                <div className="space-y-2">
                  {combinedAssignments
                    .filter((stage) => !isApprovedStatus(stage.status))
                    .slice(0, 6)
                    .map((stage) => (
                      <div key={stage.id} className="rounded-2xl border border-slate-200/80 bg-slate-50/90 p-2.5">
                        <p className="text-xs font-semibold text-slate-800">
                          {stage.title} → {stage.stageName}
                        </p>
                        <p className="mt-1 text-[11px] text-slate-500">
                          {stage.trackingMode} · Deadline: {formatDate(stage.deadline)}
                        </p>
                      </div>
                    ))}
                  {!combinedAssignments.filter((stage) => !isApprovedStatus(stage.status)).length && (
                    <p className="text-xs text-slate-500">No active stages.</p>
                  )}
                </div>
              </div>

              <div className="space-y-2 rounded-[24px] border border-slate-200/80 bg-white/88 p-4">
                <h4 className="text-sm font-bold text-slate-800">Assign To Stage</h4>
                <select
                  value={assignment.projectId}
                  onChange={(event) => setAssignment({ projectId: event.target.value, projectStageId: "" })}
                  className="w-full rounded-2xl border border-slate-300 px-3 py-2 text-sm"
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
                  className="w-full rounded-2xl border border-slate-300 px-3 py-2 text-sm"
                >
                  <option value="">Select stage</option>
                  {assignmentStages.map((stage) => {
                    const stageDepartment = stageDepartmentFromCode(stage?.stageDefinition?.code || stage?.stageName);
                    return (
                      <option key={stage.id} value={stage.id}>
                        {getStageDisplayName(stage)} ({labelize(stage.status)}){stageDepartment ? ` · ${stageDepartment}` : ""}
                      </option>
                    );
                  })}
                </select>
                {assignment.projectId && !assignmentStages.length && (
                  <p className="text-xs font-medium text-amber-700">No compatible stages for this employee&apos;s department.</p>
                )}
                <button onClick={assignUser} className="w-full rounded-2xl bg-slate-950 px-3 py-2.5 text-xs font-semibold text-white">
                  Assign
                </button>
              </div>

              <div className="rounded-[24px] border border-slate-200/80 bg-white/88 p-4">
                <h4 className="text-sm font-bold text-slate-800">History</h4>
                <p className="mt-1 text-xs text-slate-600">{selectedUser.stats?.submittedCount || 0} total submissions</p>
                <p className="text-xs text-slate-600">
                  {selectedUser.stats?.approvedCount || 0} approved · {(selectedUser.stats?.submittedCount || 0) - (selectedUser.stats?.approvedCount || 0)} rejected
                </p>
                <p className="text-xs text-slate-600">Approval rate: {selectedUser.stats?.approvalRate || 0}%</p>
                <p className="text-xs text-slate-600">Delayed: {selectedUser.stats?.delayedCount || 0}</p>
              </div>

              <div>
                <h4 className="mb-2 text-sm font-bold text-slate-800">All Assigned Stages</h4>
                <div className="max-h-[220px] space-y-2 overflow-auto">
                  {combinedAssignments.map((stage) => (
                    <div key={stage.id} className="rounded-2xl border border-slate-200/80 bg-white/88 p-2.5">
                      <p className="text-sm font-semibold text-slate-900">{stage.title}</p>
                      <p className="text-xs text-slate-600">
                        {stage.stageName} · {stage.trackingMode} · {formatDate(stage.deadline)}
                      </p>
                      <div className="mt-1">
                        <StatusBadge status={stage.status} />
                      </div>
                    </div>
                  ))}
                  {!combinedAssignments.length && <p className="text-xs text-slate-500">No assigned stages yet.</p>}
                </div>
              </div>
            </div>
          )}
        </section>
      </div>

      <Modal open={addOpen} onClose={() => setAddOpen(false)} title="Add Employee">
        <form className="space-y-4" onSubmit={addEmployee}>
          <Input label="Full Name" value={addForm.name} onChange={(value) => setAddForm((prev) => ({ ...prev, name: value }))} required />
          <Input label="Email Address" type="email" value={addForm.email} onChange={(value) => setAddForm((prev) => ({ ...prev, email: value }))} required />
          <Input label="Phone" value={addForm.phone} onChange={(value) => setAddForm((prev) => ({ ...prev, phone: value }))} />
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
              className="w-full rounded-2xl border border-slate-300 bg-white px-3 py-2.5 text-sm"
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
              className="w-full rounded-2xl border border-slate-300 bg-white px-3 py-2.5 text-sm"
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
            <label className="mb-1 block text-sm font-semibold text-slate-700">Team</label>
            <select
              value={addForm.teamId}
              onChange={(event) => setAddForm((prev) => ({ ...prev, teamId: event.target.value }))}
              className="w-full rounded-2xl border border-slate-300 bg-white px-3 py-2.5 text-sm"
            >
              <option value="">No Team</option>
              {teams.map((team) => (
                <option key={team.id} value={team.id}>
                  {team.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm font-semibold text-slate-700">Availability</label>
            <select
              value={addForm.availabilityStatus}
              onChange={(event) => setAddForm((prev) => ({ ...prev, availabilityStatus: event.target.value }))}
              className="w-full rounded-2xl border border-slate-300 bg-white px-3 py-2.5 text-sm"
            >
              {AVAILABILITY_OPTIONS.map((status) => (
                <option key={status} value={status}>
                  {labelize(status)}
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
            <button type="button" onClick={() => setAddOpen(false)} className="rounded-2xl border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700">
              Cancel
            </button>
            <button type="submit" className="rounded-2xl bg-slate-950 px-3 py-2 text-sm font-semibold text-white">
              Create Employee
            </button>
          </div>
        </form>
      </Modal>

      <Modal open={editOpen} onClose={() => setEditOpen(false)} title="Edit Employee">
        <form className="space-y-4" onSubmit={saveEdit}>
          <Input label="Full Name" value={editForm.name} onChange={(value) => setEditForm((prev) => ({ ...prev, name: value }))} required />
          <Input label="Email Address" type="email" value={editForm.email} onChange={(value) => setEditForm((prev) => ({ ...prev, email: value }))} required />
          <Input label="Phone" value={editForm.phone} onChange={(value) => setEditForm((prev) => ({ ...prev, phone: value }))} />
          <div>
            <label className="mb-1 block text-sm font-semibold text-slate-700">Role</label>
            <select value={editForm.role} onChange={(event) => setEditForm((prev) => ({ ...prev, role: event.target.value }))} className="w-full rounded-2xl border border-slate-300 bg-white px-3 py-2.5 text-sm">
              <option value="EMPLOYEE">EMPLOYEE</option>
              <option value="COORDINATOR">COORDINATOR</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm font-semibold text-slate-700">Department</label>
            <select
              value={editForm.departmentId}
              onChange={(event) => setEditForm((prev) => ({ ...prev, departmentId: event.target.value }))}
              className="w-full rounded-2xl border border-slate-300 bg-white px-3 py-2.5 text-sm"
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
            <label className="mb-1 block text-sm font-semibold text-slate-700">Team</label>
            <select
              value={editForm.teamId}
              onChange={(event) => setEditForm((prev) => ({ ...prev, teamId: event.target.value }))}
              className="w-full rounded-2xl border border-slate-300 bg-white px-3 py-2.5 text-sm"
            >
              <option value="">No Team</option>
              {teams.map((team) => (
                <option key={team.id} value={team.id}>
                  {team.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm font-semibold text-slate-700">Availability</label>
            <select
              value={editForm.availabilityStatus}
              onChange={(event) => setEditForm((prev) => ({ ...prev, availabilityStatus: event.target.value }))}
              className="w-full rounded-2xl border border-slate-300 bg-white px-3 py-2.5 text-sm"
            >
              {AVAILABILITY_OPTIONS.map((status) => (
                <option key={status} value={status}>
                  {labelize(status)}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm font-semibold text-slate-700">Employment Type</label>
            <select
              value={editForm.employmentType}
              onChange={(event) => setEditForm((prev) => ({ ...prev, employmentType: event.target.value }))}
              className="w-full rounded-2xl border border-slate-300 bg-white px-3 py-2.5 text-sm"
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
            <button type="button" onClick={() => setEditOpen(false)} className="rounded-2xl border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700">
              Cancel
            </button>
            <button type="submit" className="rounded-2xl bg-slate-950 px-3 py-2 text-sm font-semibold text-white">
              Save
            </button>
          </div>
        </form>
      </Modal>

      <Modal open={resetOpen} onClose={() => setResetOpen(false)} title="Reset Employee Password" size="max-w-md">
        <form className="space-y-4" onSubmit={resetPassword}>
          <Input
            label="New Password"
            type="password"
            value={resetForm.newPassword}
            onChange={(value) => setResetForm((prev) => ({ ...prev, newPassword: value }))}
            required
            minLength={8}
          />
          <Input
            label="Confirm Password"
            type="password"
            value={resetForm.confirmPassword}
            onChange={(value) => setResetForm((prev) => ({ ...prev, confirmPassword: value }))}
            required
            minLength={8}
          />
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={resetForm.forcePasswordChange}
              onChange={(event) => setResetForm((prev) => ({ ...prev, forcePasswordChange: event.target.checked }))}
            />
            Force password change on next login (compatibility flag)
          </label>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setResetOpen(false)} className="rounded-2xl border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700">
              Cancel
            </button>
            <button type="submit" className="rounded-2xl bg-slate-950 px-3 py-2 text-sm font-semibold text-white">
              Reset Password
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

function MetricCard({ label, value, tone = "default" }) {
  const toneClass = {
    default: "border-slate-200/80 bg-white/88 text-slate-900",
    green: "border-emerald-200 bg-emerald-50/90 text-emerald-900",
    blue: "border-blue-200 bg-blue-50/90 text-blue-900",
    slate: "border-slate-200/80 bg-slate-50/90 text-slate-900"
  };

  return (
    <article className={`rounded-3xl border p-4 shadow-sm shadow-slate-200/30 backdrop-blur ${toneClass[tone] || toneClass.default}`}>
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em]">{label}</p>
      <p className="mt-2 text-2xl font-semibold tracking-tight">{value}</p>
    </article>
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
        className="w-full rounded-2xl border border-slate-300 bg-white px-3 py-2.5 text-sm"
      />
    </div>
  );
}
