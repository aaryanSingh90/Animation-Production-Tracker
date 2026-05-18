import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import api from "../lib/api";
import Loader from "../components/Loader";
import EmptyState from "../components/EmptyState";
import StatusBadge from "../components/StatusBadge";
import { formatDate, labelize } from "../utils/format";
import { useToastStore } from "../store/toastStore";

export default function CharacterDetailPage() {
  const { id } = useParams();
  const showToast = useToastStore((state) => state.showToast);

  const [loading, setLoading] = useState(true);
  const [character, setCharacter] = useState(null);
  const [issues, setIssues] = useState([]);

  useEffect(() => {
    let cancelled = false;

    async function fetchData() {
      setLoading(true);
      try {
        const [characterRes, issuesRes] = await Promise.all([api.get(`/characters/${id}`), api.get("/issues")]);
        if (!cancelled) {
          setCharacter(characterRes.data);
          setIssues(issuesRes.data);
        }
      } catch (error) {
        if (!cancelled) {
          showToast("error", error.userMessage || error.response?.data?.message || "Failed to load character");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchData();
    return () => {
      cancelled = true;
    };
  }, [id, showToast]);

  const relevantIssues = useMemo(() => {
    if (!character) return [];
    const projectIds = new Set((character.projectLinks || []).map((entry) => entry.project.id));
    return issues.filter((issue) => projectIds.has(issue.projectStage?.project?.id));
  }, [character, issues]);

  if (loading) return <Loader label="Loading character..." />;
  if (!character) return <EmptyState title="Character not found" description="This character may have been removed." />;

  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-slate-200 bg-white p-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-xl font-bold text-slate-900">{character.name}</h3>
            <p className="text-sm text-slate-500">Character production stage breakdown</p>
          </div>
          <Link to="/characters" className="rounded-xl border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700">
            Back To Characters
          </Link>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-4">
        <h4 className="mb-3 text-lg font-bold text-slate-900">Stage Breakdown</h4>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-slate-500">
                <th className="py-2">Stage</th>
                <th className="py-2">Status</th>
                <th className="py-2">Deadline</th>
                <th className="py-2">Assigned Artist</th>
                <th className="py-2">Notes</th>
              </tr>
            </thead>
            <tbody>
              {character.stages.map((stage) => (
                <tr key={stage.id} className="border-b border-slate-100">
                  <td className="py-3 font-semibold text-slate-800">{labelize(stage.stageName)}</td>
                  <td className="py-3"><StatusBadge status={stage.status} /></td>
                  <td className="py-3">{formatDate(stage.deadline)}</td>
                  <td className="py-3">{stage.assignedUser?.name || "Unassigned"}</td>
                  <td className="py-3">{stage.notes || "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-4">
        <h4 className="mb-3 text-lg font-bold text-slate-900">Used In Projects</h4>
        {!character.projectLinks?.length ? (
          <p className="text-sm text-slate-500">This character is not linked to any project.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {character.projectLinks.map((entry) => (
              <Link key={entry.id} to={`/projects/${entry.project.id}`} className="rounded-full bg-slate-100 px-3 py-1 text-sm text-slate-700 hover:bg-slate-200">
                {entry.project.name}
              </Link>
            ))}
          </div>
        )}
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-4">
        <h4 className="mb-3 text-lg font-bold text-slate-900">Issue History</h4>
        {!relevantIssues.length ? (
          <p className="text-sm text-slate-500">No issue history found for linked projects.</p>
        ) : (
          <div className="space-y-2">
            {relevantIssues.slice(0, 20).map((issue) => (
              <div key={issue.id} className="rounded-xl border border-slate-200 p-3">
                <p className="text-sm font-semibold text-slate-800">{labelize(issue.issueType)} · {issue.projectStage?.project?.name}</p>
                <p className="mt-1 text-sm text-slate-600">{issue.description}</p>
                <p className="mt-1 text-xs text-slate-500">Logged by {issue.loggedBy?.name || "-"} on {formatDate(issue.createdAt)}</p>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
