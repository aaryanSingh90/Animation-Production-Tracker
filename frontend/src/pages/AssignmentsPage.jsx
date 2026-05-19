import { useEffect, useMemo, useState } from "react";
import { AlertCircle, ArrowRightLeft, Briefcase, Sparkles, Users } from "lucide-react";
import api from "../lib/api";
import Loader from "../components/Loader";
import EmptyState from "../components/EmptyState";
import { formatDate, labelize } from "../utils/format";
import { STATUS_COLORS } from "../utils/constants";
import { useToastStore } from "../store/toastStore";

export default function AssignmentsPage() {
  const showToast = useToastStore((state) => state.showToast);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [board, setBoard] = useState([]);
  const [teams, setTeams] = useState([]);

  const [projectFilter, setProjectFilter] = useState("");
  const [onlyUnassigned, setOnlyUnassigned] = useState(false);

  const [selectedStage, setSelectedStage] = useState(null);
  const [recommendations, setRecommendations] = useState([]);
  const [recommendationLoading, setRecommendationLoading] = useState(false);
  const [assigning, setAssigning] = useState(false);
  const [teamToAssign, setTeamToAssign] = useState("");

  async function loadBoard() {
    setLoading(true);
    setError("");

    try {
      const { data } = await api.get("/assignments/board");
      setBoard(data.projects || []);
      setTeams(data.teams || []);
    } catch (err) {
      setError(err.userMessage || err.response?.data?.message || "Failed to load assignment board");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadBoard();
  }, []);

  async function loadRecommendations(stage) {
    setSelectedStage(stage);
    setRecommendationLoading(true);
    setTeamToAssign("");

    try {
      const { data } = await api.get(`/assignments/recommendations/${stage.id}`);
      setRecommendations(data.recommendations || []);
    } catch (err) {
      showToast("error", err.userMessage || err.response?.data?.message || "Failed to load recommendations");
      setRecommendations([]);
    } finally {
      setRecommendationLoading(false);
    }
  }

  async function assignArtist(userId) {
    if (!selectedStage) return;
    setAssigning(true);

    try {
      await api.post("/assignments/smart-assign", {
        projectStageId: selectedStage.id,
        userId
      });
      showToast("success", "Artist assigned successfully");
      await loadBoard();
      await loadRecommendations(selectedStage);
    } catch (err) {
      showToast("error", err.userMessage || err.response?.data?.message || "Unable to assign artist");
    } finally {
      setAssigning(false);
    }
  }

  async function assignTeam() {
    if (!selectedStage || !teamToAssign) return;
    setAssigning(true);

    try {
      await api.post("/assignments/smart-assign", {
        projectStageId: selectedStage.id,
        teamId: teamToAssign
      });
      showToast("success", "Team assigned successfully");
      await loadBoard();
      await loadRecommendations(selectedStage);
    } catch (err) {
      showToast("error", err.userMessage || err.response?.data?.message || "Unable to assign team");
    } finally {
      setAssigning(false);
    }
  }

  const filteredProjects = useMemo(() => {
    return board
      .filter((project) => (projectFilter ? String(project.id) === projectFilter : true))
      .map((project) => {
        const stages = onlyUnassigned ? project.stages.filter((stage) => stage.isUnassigned) : project.stages;
        return {
          ...project,
          stages
        };
      })
      .filter((project) => project.stages.length > 0);
  }, [board, projectFilter, onlyUnassigned]);

  if (loading) return <Loader label="Loading assignment board..." />;

  return (
    <div className="grid gap-6 xl:grid-cols-[1.4fr_1fr]">
      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <header className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-lg font-bold text-slate-900">Project Staffing Board</h3>
            <p className="text-sm text-slate-500">Track stage staffing and quickly assign available artists.</p>
          </div>
          <div className="flex items-center gap-2">
            <select value={projectFilter} onChange={(event) => setProjectFilter(event.target.value)} className="rounded-xl border border-slate-300 px-3 py-2 text-sm">
              <option value="">All Projects</option>
              {board.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name}
                </option>
              ))}
            </select>
            <label className="flex items-center gap-2 text-xs text-slate-600">
              <input type="checkbox" checked={onlyUnassigned} onChange={(event) => setOnlyUnassigned(event.target.checked)} />
              Show unassigned only
            </label>
          </div>
        </header>

        {error ? (
          <div className="flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
            <AlertCircle size={16} />
            {error}
          </div>
        ) : !filteredProjects.length ? (
          <EmptyState title="No matching stages" description="All stages are staffed or filters are too strict." />
        ) : (
          <div className="space-y-4">
            {filteredProjects.map((project) => (
              <article key={project.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                <header className="mb-2 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-bold text-slate-900">{project.name}</p>
                    <p className="text-xs text-slate-500">Priority {project.priority} · {project.progressPercent}% complete</p>
                  </div>
                  <span className="rounded-full bg-slate-200 px-2 py-1 text-[11px] font-semibold text-slate-700">{project.stages.length} stages</span>
                </header>
                <div className="space-y-2">
                  {project.stages.map((stage) => (
                    <button
                      key={stage.id}
                      onClick={() => loadRecommendations(stage)}
                      className={`w-full rounded-xl border px-3 py-2 text-left transition ${
                        selectedStage?.id === stage.id ? "border-emerald-300 bg-emerald-50" : "border-slate-200 bg-white hover:border-slate-300"
                      }`}
                    >
                      <div className="mb-1 flex items-center justify-between gap-3">
                        <p className="text-sm font-semibold text-slate-900">{stage.stageDisplayName}</p>
                        <span className="rounded-full px-2 py-0.5 text-[11px] font-semibold text-white" style={{ backgroundColor: STATUS_COLORS[stage.status] || "#64748B" }}>
                          {labelize(stage.status)}
                        </span>
                      </div>
                      <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-600">
                        <span>{stage.departmentName || "No department"}</span>
                        <span>Deadline: {formatDate(stage.deadline)}</span>
                        <span>{stage.assignmentCount} assigned</span>
                        <span>{stage.assignedUser?.name || "Lead not set"}</span>
                      </div>
                    </button>
                  ))}
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        {!selectedStage ? (
          <EmptyState title="Pick a stage" description="Select any stage to see smart assignment recommendations." />
        ) : recommendationLoading ? (
          <Loader label="Loading recommendations..." />
        ) : (
          <div className="space-y-4">
            <div className="rounded-2xl bg-slate-900 p-4 text-white">
              <p className="text-xs uppercase tracking-[0.2em] text-white/70">Smart Assignment</p>
              <h4 className="mt-1 text-lg font-bold">{selectedStage.stageDisplayName}</h4>
              <p className="mt-1 text-xs text-white/80">{selectedStage.departmentName || "No department"} · Due {formatDate(selectedStage.deadline)}</p>
            </div>

            <div className="rounded-xl border border-slate-200 p-3">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Assign Entire Team</p>
              <div className="flex gap-2">
                <select value={teamToAssign} onChange={(event) => setTeamToAssign(event.target.value)} className="flex-1 rounded-xl border border-slate-300 px-2 py-1.5 text-sm">
                  <option value="">Choose team</option>
                  {teams.map((team) => (
                    <option key={team.id} value={team.id}>
                      {team.name} ({team.members?.length || 0})
                    </option>
                  ))}
                </select>
                <button onClick={assignTeam} disabled={!teamToAssign || assigning} className="rounded-xl bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60">
                  <ArrowRightLeft size={14} className="mr-1 inline" /> Assign Team
                </button>
              </div>
            </div>

            <div>
              <p className="mb-2 flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
                <Sparkles size={13} /> Recommended Artists
              </p>
              <div className="max-h-[520px] space-y-2 overflow-auto pr-1">
                {recommendations.map((artist) => (
                  <article key={artist.id} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                    <div className="mb-2 flex items-start justify-between gap-2">
                      <div>
                        <p className="text-sm font-semibold text-slate-900">{artist.name}</p>
                        <p className="text-[11px] text-slate-500">{artist.team?.name || "No team"} · {artist.department?.name || "No department"}</p>
                      </div>
                      <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">Score {artist.score}</span>
                    </div>
                    <div className="mb-2 flex flex-wrap gap-1">
                      <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${artist.employmentType === "FREELANCE" ? "bg-blue-100 text-blue-700" : "bg-emerald-100 text-emerald-700"}`}>
                        {artist.employmentType === "FREELANCE" ? "Freelance" : "In-house"}
                      </span>
                      <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[11px] font-semibold text-slate-700">{labelize(artist.availabilityStatus)}</span>
                      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-700">{artist.utilization}% load</span>
                    </div>
                    <p className="text-[11px] text-slate-600">{artist.reason.join(" · ") || "General assignment candidate"}</p>
                    <button onClick={() => assignArtist(artist.id)} disabled={assigning} className="mt-2 rounded-lg bg-slate-900 px-2.5 py-1 text-[11px] font-semibold text-white disabled:opacity-60">
                      <Users size={12} className="mr-1 inline" /> Assign Artist
                    </button>
                  </article>
                ))}
                {!recommendations.length && <EmptyState title="No recommendations" description="No artists available for this stage currently." compact />}
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
              <p className="mb-1 flex items-center gap-1 font-semibold text-slate-800"><Briefcase size={13} /> Assignment Signals</p>
              <ul className="space-y-1">
                <li>Recommendations prioritize department match and lower workload.</li>
                <li>Team assignment adds all active members to this stage at once.</li>
                <li>Lead artist is set automatically if stage had no lead assigned.</li>
              </ul>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
