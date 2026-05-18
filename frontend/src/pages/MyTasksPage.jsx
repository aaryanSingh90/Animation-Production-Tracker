import { useEffect, useMemo, useState } from "react";
import api from "../utils/api";
import Loader from "../components/Loader";
import EmptyState from "../components/EmptyState";
import StatusBadge from "../components/StatusBadge";
import IssueModal from "../components/IssueModal";
import { formatDate, labelize } from "../utils/format";
import { useToastStore } from "../store/toastStore";

export default function MyTasksPage() {
  const showToast = useToastStore((state) => state.showToast);

  const [loading, setLoading] = useState(true);
  const [projects, setProjects] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [issueStage, setIssueStage] = useState(null);

  async function fetchData() {
    setLoading(true);
    try {
      const [projectsRes, notificationsRes] = await Promise.all([api.get("/projects/my"), api.get("/notifications")]);
      setProjects(projectsRes.data);
      setNotifications(notificationsRes.data.slice(0, 12));
    } catch (error) {
      showToast("error", error.response?.data?.message || "Failed to load your tasks");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchData();
  }, []);

  const tasks = useMemo(() => {
    return projects.flatMap((project) =>
      project.stages.map((stage) => ({
        ...stage,
        projectName: project.name,
        projectId: project.id
      }))
    );
  }, [projects]);

  const startWork = async (stageId) => {
    try {
      await api.put(`/stages/${stageId}`, { status: "IN_PROGRESS" });
      showToast("success", "Stage moved to in progress");
      await fetchData();
    } catch (error) {
      showToast("error", error.response?.data?.message || "Unable to start work");
    }
  };

  const submitStage = async (stageId) => {
    if (!window.confirm("Submit this stage for approval?")) return;

    try {
      await api.post(`/stages/${stageId}/submit`);
      showToast("success", "Submitted for approval");
      await fetchData();
    } catch (error) {
      showToast("error", error.response?.data?.message || "Unable to submit");
    }
  };

  const submitIssue = async (payload) => {
    if (!issueStage) return;
    try {
      await api.post(`/stages/${issueStage.id}/issue`, payload);
      showToast("success", "Issue reported");
      setIssueStage(null);
      await fetchData();
    } catch (error) {
      showToast("error", error.response?.data?.message || "Unable to report issue");
    }
  };

  if (loading) return <Loader label="Loading your assignments..." />;

  return (
    <div className="grid grid-cols-3 gap-6">
      <section className="col-span-2 space-y-4 rounded-2xl border border-slate-200 bg-white p-4">
        <h3 className="text-xl font-bold text-slate-900">My Assigned Stages</h3>

        {!tasks.length ? (
          <EmptyState title="No assigned tasks" description="You currently do not have stage assignments." />
        ) : (
          <div className="space-y-3">
            {tasks.map((task) => (
              <div key={task.id} className="rounded-xl border border-slate-200 p-3">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">{task.projectName}</p>
                    <p className="text-xs text-slate-600">{labelize(task.stageName)}</p>
                  </div>
                  <StatusBadge status={task.status} />
                </div>

                <div className="mt-2 flex items-center gap-4 text-xs text-slate-600">
                  <span className={task.isDeadlineMissed ? "font-semibold text-red-600" : ""}>Deadline: {formatDate(task.deadline)}</span>
                  {task.feedback && <span className="rounded-lg bg-red-50 px-2 py-1 text-red-700">Feedback: {task.feedback}</span>}
                </div>

                <div className="mt-3 flex gap-2">
                  <button
                    onClick={() => startWork(task.id)}
                    disabled={task.status === "IN_PROGRESS" || task.status === "SUBMITTED" || task.status === "APPROVED"}
                    className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs font-semibold text-slate-700 disabled:opacity-50"
                  >
                    Start Work
                  </button>
                  <button
                    onClick={() => submitStage(task.id)}
                    disabled={task.status !== "IN_PROGRESS" && task.status !== "REJECTED"}
                    className="rounded-lg bg-sky-600 px-2.5 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
                  >
                    Submit for Approval
                  </button>
                  <button
                    onClick={() => setIssueStage(task)}
                    className="rounded-lg bg-amber-500 px-2.5 py-1.5 text-xs font-semibold text-white"
                  >
                    Report Issue
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-4">
        <h3 className="mb-3 text-lg font-bold text-slate-900">Recent Notifications</h3>
        <div className="space-y-2">
          {notifications.map((notification) => (
            <div key={notification.id} className={`rounded-xl border px-3 py-2 text-sm ${notification.isRead ? "border-slate-200 bg-white" : "border-sky-200 bg-sky-50"}`}>
              <p className="text-slate-800">{notification.message}</p>
              <p className="mt-1 text-xs text-slate-500">{formatDate(notification.createdAt)}</p>
            </div>
          ))}
          {!notifications.length && <p className="text-sm text-slate-500">No notifications yet.</p>}
        </div>
      </section>

      <IssueModal
        open={Boolean(issueStage)}
        onClose={() => setIssueStage(null)}
        onSubmit={submitIssue}
        stageDeadline={issueStage?.deadline ? issueStage.deadline.slice(0, 10) : ""}
      />
    </div>
  );
}
