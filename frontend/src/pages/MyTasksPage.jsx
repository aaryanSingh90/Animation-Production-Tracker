import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import api from "../lib/api";
import Loader from "../components/Loader";
import EmptyState from "../components/EmptyState";
import StatusBadge from "../components/StatusBadge";
import IssueModal from "../components/IssueModal";
import StageCommentThread from "../components/StageCommentThread";
import { formatDate } from "../utils/format";
import { stageDepartmentFromCode } from "../utils/stageDepartmentMap";
import { isApprovedStatus, isLateStatus, isPendingReviewStatus, isRetakeStatus, normalizeStatus } from "../utils/constants";
import { useToastStore } from "../store/toastStore";
import { useAuthStore } from "../store/authStore";
import { useNotificationStore } from "../store/notificationStore";

function endpointForTask(task) {
  if (task.trackingType === "SHOT") return `/shot-stages/${task.id}`;
  if (task.trackingType === "ASSET") return `/asset-stages/${task.id}`;
  return `/stages/${task.id}`;
}

function issueSupported(task) {
  return task.trackingType === "PROJECT";
}

export default function MyTasksPage() {
  const showToast = useToastStore((state) => state.showToast);
  const user = useAuthStore((state) => state.user);
  const realtimeNotifications = useNotificationStore((state) => state.notifications);
  const [searchParams, setSearchParams] = useSearchParams();

  const [loading, setLoading] = useState(true);
  const [tasks, setTasks] = useState([]);
  const [summary, setSummary] = useState({
    total: 0,
    overdue: 0,
    inProgress: 0,
    submitted: 0,
    approved: 0,
    rejected: 0
  });
  const [notifications, setNotifications] = useState([]);
  const [issueTask, setIssueTask] = useState(null);
  const [openCommentsByStage, setOpenCommentsByStage] = useState({});
  const [stageCommentCounts, setStageCommentCounts] = useState({});

  const projectIdFilter = searchParams.get("projectId") || "";
  const stageIdHighlight = searchParams.get("stageId") || "";

  async function fetchData() {
    setLoading(true);
    try {
      const [tasksRes, notificationsRes] = await Promise.all([
        api.get("/projects/my-tasks", {
          params: {
            ...(projectIdFilter ? { projectId: Number(projectIdFilter) } : {})
          }
        }),
        api.get("/notifications")
      ]);

      const rows = tasksRes.data?.tasks || [];
      setTasks(rows);
      setSummary(tasksRes.data?.summary || {});

      const counts = {};
      for (const task of rows) {
        counts[`${task.resource}:${task.id}`] = task.commentCount || 0;
      }
      setStageCommentCounts(counts);

      setNotifications((notificationsRes.data || []).slice(0, 12));
    } catch (error) {
      showToast("error", error.userMessage || error.response?.data?.message || "Failed to load your tasks");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchData();
    const timer = setInterval(fetchData, 30000);
    return () => clearInterval(timer);
  }, [projectIdFilter]);

  useEffect(() => {
    if (!realtimeNotifications.length) return;
    fetchData();
  }, [realtimeNotifications[0]?.id]);

  const taskStats = useMemo(() => {
    const now = new Date();
    const todayKey = now.toISOString().slice(0, 10);

    const todaysTasks = tasks.filter((task) => {
      if (!task.deadline) return false;
      return new Date(task.deadline).toISOString().slice(0, 10) === todayKey;
    }).length;

    const pendingReviews = tasks.filter((task) => isPendingReviewStatus(task.status)).length;
    const completed = tasks.filter((task) => isApprovedStatus(task.status)).length;
    const overdue = tasks.filter((task) => isLateStatus(task.status, task.deadline)).length;

    return {
      todaysTasks,
      pendingReviews,
      completed,
      overdue
    };
  }, [tasks]);

  const startWork = async (task) => {
    try {
      await api.put(endpointForTask(task), { status: "IP" });
      showToast("success", "Task moved to in progress");
      await fetchData();
    } catch (error) {
      showToast("error", error.userMessage || error.response?.data?.message || "Unable to start work");
    }
  };

  const submitTask = async (task) => {
    if (!window.confirm("Send this task as a test shot for review?")) return;

    try {
      if (task.trackingType === "PROJECT") {
        await api.post(`/stages/${task.id}/submit`);
      } else {
        await api.put(endpointForTask(task), { status: "TEST" });
      }
      showToast("success", "Test shot sent for review");
      await fetchData();
    } catch (error) {
      showToast("error", error.userMessage || error.response?.data?.message || "Unable to submit");
    }
  };

  const submitIssue = async (payload) => {
    if (!issueTask) return;

    try {
      await api.post(`/stages/${issueTask.id}/issue`, payload);
      showToast("success", "Issue reported");
      setIssueTask(null);
      await fetchData();
    } catch (error) {
      showToast("error", error.userMessage || error.response?.data?.message || "Unable to report issue");
    }
  };

  const openNotificationTarget = async (notification) => {
    try {
      if (!notification.isRead) {
        await api.put(`/notifications/${notification.id}/read`);
        setNotifications((prev) => prev.map((item) => (item.id === notification.id ? { ...item, isRead: true } : item)));
      }

      const next = new URLSearchParams(searchParams);
      if (notification.relatedProjectId) {
        next.set("projectId", String(notification.relatedProjectId));
      }
      if (notification.relatedStageId) {
        next.set("stageId", String(notification.relatedStageId));
      } else {
        next.delete("stageId");
      }
      setSearchParams(next);
    } catch {
      // ignore mark-read errors in list panel
    }
  };

  if (loading) return <Loader label="Loading your assignments..." />;

  return (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
      <section className="space-y-4 xl:col-span-2">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard label="Assigned Tasks" value={summary.total || 0} tone="text-slate-900" />
          <MetricCard label="Today" value={taskStats.todaysTasks} tone="text-sky-700" />
          <MetricCard label="Pending Review" value={taskStats.pendingReviews} tone="text-amber-700" />
          <MetricCard label="Overdue" value={taskStats.overdue} tone="text-rose-700" />
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-xl font-bold text-slate-900">My Assigned Tasks</h3>
              <p className="text-xs text-slate-500">Project + Shot + Asset assignments are synchronized here.</p>
            </div>
            {projectIdFilter ? (
              <button
                onClick={() => {
                  const next = new URLSearchParams(searchParams);
                  next.delete("projectId");
                  next.delete("stageId");
                  setSearchParams(next);
                }}
                className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700"
              >
                Clear Project Filter
              </button>
            ) : null}
          </div>

          {!tasks.length ? (
            <EmptyState title="No assigned tasks" description="You currently do not have stage, shot, or asset assignments." />
          ) : (
            <div className="space-y-3">
              {tasks.map((task) => {
                const key = `${task.resource}:${task.id}`;
                const isHighlighted = stageIdHighlight && String(task.id) === String(stageIdHighlight);
                const normalizedStatus = normalizeStatus(task.status);
                const isOverdue = isLateStatus(normalizedStatus, task.deadline);
                const canStart = ["YTS", "RTK", "LATE"].includes(normalizedStatus);
                const canSubmit = ["IP", "RTK", "LATE"].includes(normalizedStatus);
                const taskDepartment = task.departmentName || stageDepartmentFromCode(task.stageCode) || "General";

                return (
                  <article
                    key={key}
                    className={`rounded-xl border p-3 ${
                      isHighlighted ? "border-sky-300 bg-sky-50/40" : "border-slate-200 bg-white"
                    }`}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="space-y-1">
                        <p className="text-sm font-semibold text-slate-900">{task.projectName}</p>
                        <p className="text-xs text-slate-600">
                          {task.stageName} · {task.trackingType}
                        </p>
                        <div className="flex flex-wrap gap-2 text-[11px] text-slate-600">
                          {task.shotCode ? <span className="rounded-md bg-slate-100 px-2 py-0.5">Shot: {task.shotCode}</span> : null}
                          {task.sequence ? <span className="rounded-md bg-slate-100 px-2 py-0.5">Sequence: {task.sequence}</span> : null}
                          {task.assetName ? <span className="rounded-md bg-slate-100 px-2 py-0.5">Asset: {task.assetName}</span> : null}
                          <span className="rounded-md bg-slate-100 px-2 py-0.5">Department: {taskDepartment}</span>
                          <span className="rounded-md bg-slate-100 px-2 py-0.5">Priority: {task.projectPriority || 0}</span>
                        </div>
                      </div>
                      <StatusBadge status={task.status} />
                    </div>

                    <div className="mt-2 grid gap-2 text-xs text-slate-600 sm:grid-cols-2 lg:grid-cols-4">
                      <span className={isOverdue ? "font-semibold text-rose-600" : ""}>Deadline: {formatDate(task.deadline)}</span>
                      <span>Assigned: {formatDate(task.assignedAt)}</span>
                      <span>Review Sent: {formatDate(task.submittedAt)}</span>
                      <span>Approved: {formatDate(task.approvedAt)}</span>
                    </div>

                    <div className="mt-3 flex flex-wrap gap-2">
                      <button
                        onClick={() => startWork(task)}
                        disabled={!canStart}
                        className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs font-semibold text-slate-700 disabled:opacity-50"
                      >
                        Start Work
                      </button>
                      <button
                        onClick={() => submitTask(task)}
                        disabled={!canSubmit}
                        className="rounded-lg bg-sky-600 px-2.5 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
                      >
                        Send Test Shot
                      </button>
                      {issueSupported(task) ? (
                        <button
                          onClick={() => setIssueTask(task)}
                          className="rounded-lg bg-amber-500 px-2.5 py-1.5 text-xs font-semibold text-white"
                        >
                          Report Issue
                        </button>
                      ) : null}
                      <button
                        onClick={() =>
                          setOpenCommentsByStage((prev) => ({
                            ...prev,
                            [key]: !prev[key]
                          }))
                        }
                        className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs font-semibold text-slate-700"
                      >
                        {(stageCommentCounts[key] ?? task.commentCount ?? 0) > 0
                          ? `${stageCommentCounts[key] ?? task.commentCount} comments`
                          : "Comment"}
                      </button>
                    </div>

                    {task.feedback ? <p className="mt-2 rounded-lg bg-rose-50 px-2 py-1 text-xs text-rose-700">Feedback: {task.feedback}</p> : null}

                    {openCommentsByStage[key] ? (
                      <div className="mt-3">
                        <StageCommentThread
                          stageId={task.id}
                          currentUser={user}
                          isManager={false}
                          resource={task.resource}
                          onCountChange={(count) =>
                            setStageCommentCounts((prev) => ({
                              ...prev,
                              [key]: count
                            }))
                          }
                        />
                      </div>
                    ) : null}
                  </article>
                );
              })}
            </div>
          )}
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-4">
        <h3 className="mb-3 text-lg font-bold text-slate-900">Recent Notifications</h3>
        <div className="space-y-2">
          {notifications.map((notification) => (
            <button
              key={notification.id}
              onClick={() => openNotificationTarget(notification)}
              className={`w-full rounded-xl border px-3 py-2 text-left text-sm ${
                notification.isRead ? "border-slate-200 bg-white" : "border-sky-200 bg-sky-50"
              }`}
            >
              <p className="text-slate-800">{notification.message}</p>
              <p className="mt-1 text-xs text-slate-500">{formatDate(notification.createdAt)}</p>
            </button>
          ))}
          {!notifications.length && <p className="text-sm text-slate-500">No notifications yet.</p>}
        </div>
      </section>

      <IssueModal
        open={Boolean(issueTask)}
        onClose={() => setIssueTask(null)}
        onSubmit={submitIssue}
        stageDeadline={issueTask?.deadline ? String(issueTask.deadline).slice(0, 10) : ""}
      />
    </div>
  );
}

function MetricCard({ label, value, tone }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-3 py-2">
      <p className="text-[11px] uppercase tracking-wide text-slate-500">{label}</p>
      <p className={`mt-1 text-lg font-bold ${tone}`}>{value}</p>
    </div>
  );
}
