import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Plus, Search, Users, X } from "lucide-react";
import { getDepartmentLabel, initials } from "../utils/format";
import {
  buildDepartmentOptions,
  countUsersByDepartment,
  filterUsersByDepartment,
  getEmploymentBadgeClasses,
  getEmploymentLabel,
  normalizeAssignmentList,
  sortUsersBySmartAvailability
} from "../utils/assignments";
import useEmployeeAvailabilitySummaries from "../hooks/useEmployeeAvailabilitySummaries";
import { EmployeeAvailabilityHoverCard } from "./EmployeeAvailabilityHoverCard";
import { formatEmployeeAvailabilityLabel, getEmployeeAvailabilityMeta, getOverloadWarning } from "../utils/employeeAvailability";

function coerceAssignments(assignments, users) {
  const usersById = new Map((users || []).map((user) => [user.id, user]));
  return normalizeAssignmentList(assignments).map((assignment) => ({
    ...assignment,
    employee: assignment.employee || usersById.get(assignment.employeeId) || null
  }));
}

function ensureSingleLead(nextAssignments) {
  let sawLead = false;
  return nextAssignments.map((assignment, index) => {
    const wantsLead = assignment.roleType === "LEAD";
    if (!sawLead && (wantsLead || index === 0)) {
      sawLead = true;
      return { ...assignment, roleType: "LEAD" };
    }
    return { ...assignment, roleType: "SUPPORT" };
  });
}

function CandidateCard({ user, summary, assigned, disabled, onAssign }) {
  const meta = getEmployeeAvailabilityMeta(summary?.liveStatus || user.availabilityStatus || "AVAILABLE");

  return (
    <EmployeeAvailabilityHoverCard user={user} summary={summary} roleLabel="Artist" className="block">
      <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm transition hover:-translate-y-0.5 hover:border-slate-300">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-900 text-sm font-bold text-white">
            {initials(user.name)}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-slate-900">{user.name}</p>
                <p className="truncate text-xs text-slate-500">{getDepartmentLabel(user)}</p>
              </div>
              <span className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${meta.tone}`}>
                <span className={`h-1.5 w-1.5 rounded-full ${meta.dot}`} />
                {formatEmployeeAvailabilityLabel(summary?.liveStatus || user.availabilityStatus || "AVAILABLE")}
              </span>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <span className={`rounded-full border px-2 py-1 text-[10px] font-semibold ${getEmploymentBadgeClasses(user.employmentType)}`}>
                {user.employmentType === "FREELANCE" ? "FREELANCE" : "IN-HOUSE"}
              </span>
              <span className="text-[11px] text-slate-500">
                {summary?.activeTasks ?? 0} active · {summary?.workloadPercent ?? 0}% load
              </span>
            </div>
          </div>
        </div>
        <button
          type="button"
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            onAssign(user);
          }}
          disabled={disabled || assigned}
          className={`mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold transition ${
            assigned
              ? "border border-emerald-200 bg-emerald-50 text-emerald-700"
              : "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
          } disabled:opacity-60`}
        >
          <Plus className="h-4 w-4" />
          {assigned ? "Assigned" : "Assign"}
        </button>
      </div>
    </EmployeeAvailabilityHoverCard>
  );
}

export default function FlexibleAssignmentField({
  users = [],
  recommendedDepartment = "",
  assignments = [],
  onChange,
  disabled = false,
  allowMultiple = true,
  className = ""
}) {
  const normalizedAssignments = useMemo(() => coerceAssignments(assignments, users), [assignments, users]);
  const departmentOptions = useMemo(() => buildDepartmentOptions(users, recommendedDepartment), [users, recommendedDepartment]);
  const assignedDepartment = useMemo(
    () => (normalizedAssignments[0]?.employee ? getDepartmentLabel(normalizedAssignments[0].employee) : ""),
    [normalizedAssignments]
  );
  const recommendedDepartmentCount = useMemo(
    () => countUsersByDepartment(users, recommendedDepartment),
    [users, recommendedDepartment]
  );
  const defaultDepartment = assignedDepartment || (recommendedDepartmentCount > 0 ? recommendedDepartment : "");

  const [selectedDepartment, setSelectedDepartment] = useState(defaultDepartment);
  const [search, setSearch] = useState("");
  const [candidateId, setCandidateId] = useState("");
  const summariesByUserId = useEmployeeAvailabilitySummaries(users);

  useEffect(() => {
    if (!selectedDepartment && defaultDepartment) {
      setSelectedDepartment(defaultDepartment);
      return;
    }

    if (selectedDepartment === recommendedDepartment && !recommendedDepartmentCount && !assignedDepartment) {
      setSelectedDepartment("");
    }
  }, [assignedDepartment, defaultDepartment, recommendedDepartment, recommendedDepartmentCount, selectedDepartment]);

  const filteredUsers = useMemo(() => {
    const byDepartment = filterUsersByDepartment(users, selectedDepartment);
    const query = search.trim().toLowerCase();
    const scoped = !query
      ? byDepartment
      : byDepartment.filter((user) => {
          const haystack = [
            user.name,
            user.email,
            getDepartmentLabel(user),
            user.employmentType === "FREELANCE" ? "freelance" : "in-house",
            user.role
          ]
            .filter(Boolean)
            .join(" ")
            .toLowerCase();
          return haystack.includes(query);
        });

    return sortUsersBySmartAvailability(scoped, summariesByUserId, selectedDepartment || recommendedDepartment);
  }, [users, selectedDepartment, search, summariesByUserId, recommendedDepartment]);

  const highlightedUsers = useMemo(() => filteredUsers.slice(0, 6), [filteredUsers]);
  const candidateWarning = useMemo(() => {
    const selected = filteredUsers.find((user) => String(user.id) === String(candidateId));
    if (!selected) return "";
    return getOverloadWarning(summariesByUserId[Number(selected.id)]);
  }, [candidateId, filteredUsers, summariesByUserId]);

  const assignmentWarnings = useMemo(
    () =>
      normalizedAssignments
        .map((assignment) => {
          const user = assignment.employee || users.find((item) => Number(item.id) === Number(assignment.employeeId));
          const summary = summariesByUserId[Number(assignment.employeeId)];
          const warning = getOverloadWarning(summary);
          if (!user || !warning) return null;
          return `${user.name}: ${warning}`;
        })
        .filter(Boolean),
    [normalizedAssignments, users, summariesByUserId]
  );

  function commit(nextAssignments) {
    onChange?.(ensureSingleLead(nextAssignments));
  }

  function handleAddEmployee(user) {
    const employeeId = Number(user.id || 0);
    if (!employeeId) return;

    const existing = normalizedAssignments.some((assignment) => assignment.employeeId === employeeId);
    if (existing) {
      setCandidateId("");
      return;
    }

    if (!allowMultiple) {
      commit([
        {
          employeeId,
          roleType: "LEAD",
          departmentId: user.departmentId || null,
          employee: user,
          department: user.department || user.departmentInfo || null
        }
      ]);
      setCandidateId("");
      return;
    }

    commit([
      ...normalizedAssignments,
      {
        employeeId,
        roleType: normalizedAssignments.length ? "SUPPORT" : "LEAD",
        departmentId: user.departmentId || null,
        employee: user,
        department: user.department || user.departmentInfo || null
      }
    ]);
    setCandidateId("");
  }

  function handleAdd() {
    const employeeId = Number(candidateId || 0);
    if (!employeeId) return;
    const user = users.find((item) => item.id === employeeId);
    if (!user) return;
    handleAddEmployee(user);
  }

  function handleRoleChange(employeeId, roleType) {
    commit(
      normalizedAssignments.map((assignment) => ({
        ...assignment,
        roleType: assignment.employeeId === employeeId ? roleType : assignment.roleType
      }))
    );
  }

  function handleRemove(employeeId) {
    commit(normalizedAssignments.filter((assignment) => assignment.employeeId !== employeeId));
  }

  return (
    <div className={`space-y-3 ${className}`}>
      <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] font-medium text-slate-500">
        <span>
          {selectedDepartment || "All departments"} · {filteredUsers.length} available employee{filteredUsers.length === 1 ? "" : "s"}
        </span>
        {recommendedDepartment && !recommendedDepartmentCount ? (
          <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-amber-700">
            {recommendedDepartment} has no active staff
          </span>
        ) : null}
      </div>

      <div className="grid gap-2 md:grid-cols-[minmax(0,180px)_minmax(0,1fr)_auto]">
        <label className="space-y-1">
          <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Department</span>
          <select
            value={selectedDepartment}
            onChange={(event) => {
              setSelectedDepartment(event.target.value);
              setCandidateId("");
            }}
            className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
            disabled={disabled}
          >
            <option value="">All departments</option>
            {departmentOptions.map((department) => (
              <option key={department} value={department}>
                {department}{department === recommendedDepartment ? " · Recommended" : ""}
              </option>
            ))}
          </select>
        </label>

        <div className="space-y-2">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Artist Search</p>
          <label className="relative block">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search by name, department, email, type"
              className="w-full rounded-xl border border-slate-300 px-10 py-2 text-sm"
              disabled={disabled}
            />
          </label>
          <select
            value={candidateId}
            onChange={(event) => setCandidateId(event.target.value)}
            className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
            disabled={disabled || !filteredUsers.length}
          >
            <option value="">Select artist</option>
            {filteredUsers.map((user) => {
              const summary = summariesByUserId[Number(user.id)];
              return (
                <option key={user.id} value={user.id}>
                  {user.name} · {getDepartmentLabel(user)} · {formatEmployeeAvailabilityLabel(summary?.liveStatus || user.availabilityStatus || "AVAILABLE")} · {summary?.activeTasks ?? 0} active
                </option>
              );
            })}
          </select>
        </div>

        <button
          type="button"
          onClick={handleAdd}
          disabled={disabled || !candidateId}
          className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 disabled:opacity-50"
        >
          <Plus className="h-4 w-4" /> Add
        </button>
      </div>

      {candidateWarning ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          <div className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{candidateWarning}</span>
          </div>
        </div>
      ) : null}

      {highlightedUsers.length ? (
        <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
          {highlightedUsers.map((user) => (
            <CandidateCard
              key={user.id}
              user={user}
              summary={summariesByUserId[Number(user.id)]}
              assigned={normalizedAssignments.some((assignment) => assignment.employeeId === Number(user.id))}
              disabled={disabled}
              onAssign={handleAddEmployee}
            />
          ))}
        </div>
      ) : null}

      {!filteredUsers.length && (
        <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-3 py-2 text-xs text-slate-500">
          <p>No employees found in this department.</p>
          {!selectedDepartment && recommendedDepartment && !recommendedDepartmentCount ? (
            <p className="mt-1 text-[11px] text-slate-500">
              The recommended department does not currently have active employees, so we&apos;re showing all available staff.
            </p>
          ) : null}
          <button
            type="button"
            onClick={() => setSelectedDepartment("")}
            disabled={disabled}
            className="mt-1 font-semibold text-slate-700 underline-offset-2 hover:underline disabled:opacity-50"
          >
            Select Another Department
          </button>
        </div>
      )}

      <div className="space-y-2">
        {normalizedAssignments.length ? (
          normalizedAssignments.map((assignment) => {
            const employee = assignment.employee || users.find((user) => user.id === assignment.employeeId) || null;
            if (!employee) return null;
            const summary = summariesByUserId[Number(assignment.employeeId)];
            return (
              <EmployeeAvailabilityHoverCard key={assignment.employeeId} user={employee} summary={summary} roleLabel={assignment.roleType === "LEAD" ? "Lead Artist" : "Support Artist"} className="block">
                <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-900 text-[11px] font-semibold text-white">
                    {initials(employee.name)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-slate-900">{employee.name}</p>
                    <p className="truncate text-[11px] text-slate-500">{getDepartmentLabel(employee)} · {getEmploymentLabel(employee.employmentType)}</p>
                  </div>
                  <span className={`rounded-full border px-2 py-1 text-[11px] font-semibold ${getEmploymentBadgeClasses(employee.employmentType)}`}>
                    {employee.employmentType === "FREELANCE" ? "FREELANCE" : "IN-HOUSE"}
                  </span>
                  <span className={`rounded-full border px-2 py-1 text-[10px] font-semibold ${getEmployeeAvailabilityMeta(summary?.liveStatus || employee.availabilityStatus || "AVAILABLE").tone}`}>
                    {formatEmployeeAvailabilityLabel(summary?.liveStatus || employee.availabilityStatus || "AVAILABLE")}
                  </span>
                  <select
                    value={assignment.roleType || "SUPPORT"}
                    onChange={(event) => {
                      event.stopPropagation();
                      handleRoleChange(assignment.employeeId, event.target.value);
                    }}
                    className="rounded-lg border border-slate-300 px-2 py-1.5 text-xs font-semibold"
                    disabled={disabled}
                  >
                    <option value="LEAD">Lead Artist</option>
                    <option value="SUPPORT">Support Artist</option>
                  </select>
                  <button
                    type="button"
                    onClick={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      handleRemove(assignment.employeeId);
                    }}
                    className="rounded-lg border border-slate-300 p-1.5 text-slate-500 hover:text-slate-900"
                    disabled={disabled}
                    aria-label={`Remove ${employee.name}`}
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </EmployeeAvailabilityHoverCard>
            );
          })
        ) : (
          <div className="flex items-center gap-2 rounded-2xl border border-dashed border-slate-300 bg-white px-3 py-2 text-xs text-slate-500">
            <Users className="h-4 w-4" />
            <span>No artists assigned yet</span>
          </div>
        )}
      </div>

      {assignmentWarnings.length ? (
        <div className="space-y-1 rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-800">
          {assignmentWarnings.map((warning) => (
            <p key={warning}>{warning}</p>
          ))}
        </div>
      ) : null}
    </div>
  );
}
