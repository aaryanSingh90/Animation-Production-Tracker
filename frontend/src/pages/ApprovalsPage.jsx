import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import api from "../lib/api";
import Loader from "../components/Loader";
import EmptyState from "../components/EmptyState";
import Modal from "../components/Modal";
import { formatDate, labelize } from "../utils/format";
import { PROJECT_STAGES } from "../utils/constants";
import { useToastStore } from "../store/toastStore";

export default function ApprovalsPage() {
  const showToast = useToastStore((state) => state.showToast);

  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState([]);
  const [projectFilter, setProjectFilter] = useState("");
  const [artistFilter, setArtistFilter] = useState("");
  const [stageFilter, setStageFilter] = useState("ALL");
  const [rejecting, setRejecting] = useState(null);
  const [feedback, setFeedback] = useState("");

  async function fetchData() {
    setLoading(true);
    try {
      const { data } = await api.get("/approvals", {
        params: {
          projectName: projectFilter || undefined,
          artistName: artistFilter || undefined,
          stageName: stageFilter !== "ALL" ? stageFilter : undefined
        }
      });
      setRows(data);
    } catch (error) {
      showToast("error", error.userMessage || error.response?.data?.message || "Failed to fetch approval queue");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchData();
  }, []);

  const filtered = useMemo(() => {
    return rows.filter((row) => {
      const byProject = !projectFilter || row.project.name.toLowerCase().includes(projectFilter.toLowerCase());
      const byArtist = !artistFilter || row.assignedUser?.name?.toLowerCase().includes(artistFilter.toLowerCase());
      const byStage = stageFilter === "ALL" || row.stageName === stageFilter;
      return byProject && byArtist && byStage;
    });
  }, [rows, projectFilter, artistFilter, stageFilter]);

  const removeRow = (stageId) => {
    setRows((prev) => prev.filter((row) => row.id !== stageId));
  };

  const approve = async (stage) => {
    const confirmed = window.confirm(`Approve ${labelize(stage.stageName)} for ${stage.project.name}?`);
    if (!confirmed) return;

    try {
      await api.post(`/stages/${stage.id}/approve`);
      removeRow(stage.id);
      showToast("success", "Stage approved");
    } catch (error) {
      showToast("error", error.userMessage || error.response?.data?.message || "Unable to approve");
    }
  };

  const reject = async () => {
    if (!rejecting) return;
    try {
      await api.post(`/stages/${rejecting.id}/reject`, { feedback });
      removeRow(rejecting.id);
      showToast("success", "Stage rejected");
      setRejecting(null);
      setFeedback("");
    } catch (error) {
      showToast("error", error.userMessage || error.response?.data?.message || "Unable to reject");
    }
  };

  if (loading) return <Loader label="Loading approvals..." />;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3 rounded-2xl border border-slate-200 bg-white p-4">
        <input
          value={projectFilter}
          onChange={(event) => setProjectFilter(event.target.value)}
          placeholder="Filter by project name"
          className="rounded-xl border border-slate-300 px-3 py-2 text-sm"
        />
        <input
          value={artistFilter}
          onChange={(event) => setArtistFilter(event.target.value)}
          placeholder="Filter by artist name"
          className="rounded-xl border border-slate-300 px-3 py-2 text-sm"
        />
        <select value={stageFilter} onChange={(event) => setStageFilter(event.target.value)} className="rounded-xl border border-slate-300 px-3 py-2 text-sm">
          <option value="ALL">All Stages</option>
          {PROJECT_STAGES.map((stage) => (
            <option key={stage} value={stage}>
              {labelize(stage)}
            </option>
          ))}
        </select>
      </div>

      {!filtered.length ? (
        <EmptyState title="No pending approvals" description="Submitted stages will appear here." />
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white p-4">
          <table className="w-full min-w-[980px] text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-slate-500">
                <th className="py-2">Project</th>
                <th className="py-2">Stage</th>
                <th className="py-2">Submitted By</th>
                <th className="py-2">Submitted Date</th>
                <th className="py-2">Deadline</th>
                <th className="py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((row) => {
                const deadlineMissed = row.deadline && new Date(row.deadline) < new Date();
                return (
                  <tr key={row.id} className="border-b border-slate-100 transition-all">
                    <td className="py-3 font-semibold text-slate-900">
                      <Link to={`/projects/${row.project.id}`} className="hover:text-emerald-600">
                        {row.project.name}
                      </Link>
                    </td>
                    <td className="py-3">{labelize(row.stageName)}</td>
                    <td className="py-3">{row.assignedUser?.name || "Unassigned"}</td>
                    <td className="py-3">{formatDate(row.submittedAt)}</td>
                    <td className={`py-3 ${deadlineMissed ? "font-semibold text-red-600" : ""}`}>{formatDate(row.deadline)}</td>
                    <td className="py-3">
                      <div className="flex gap-2">
                        <button onClick={() => approve(row)} className="rounded-lg bg-emerald-500 px-2.5 py-1 text-xs font-semibold text-white">
                          Approve
                        </button>
                        <button
                          onClick={() => {
                            setRejecting(row);
                            setFeedback("");
                          }}
                          className="rounded-lg bg-red-500 px-2.5 py-1 text-xs font-semibold text-white"
                        >
                          Reject
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <Modal open={Boolean(rejecting)} onClose={() => setRejecting(null)} title="Reject Submission" size="max-w-md">
        <div className="space-y-4">
          <p className="text-sm text-slate-600">
            Reject: {labelize(rejecting?.stageName || "")} - {rejecting?.project?.name}
          </p>
          <div>
            <label className="mb-1 block text-sm font-semibold text-slate-700">Feedback for artist</label>
            <textarea
              value={feedback}
              onChange={(event) => setFeedback(event.target.value)}
              placeholder="Write feedback for the employee"
              className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
              rows={4}
              required
            />
          </div>
          <div className="flex justify-end gap-2">
            <button onClick={() => setRejecting(null)} className="rounded-xl border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700">
              Cancel
            </button>
            <button
              onClick={reject}
              disabled={!feedback.trim()}
              className="rounded-xl bg-red-500 px-3 py-2 text-sm font-semibold text-white disabled:opacity-60"
            >
              Send Rejection
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
