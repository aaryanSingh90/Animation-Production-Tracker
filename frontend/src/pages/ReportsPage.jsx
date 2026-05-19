import { useEffect, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import api from "../lib/api";
import Loader from "../components/Loader";
import EmptyState from "../components/EmptyState";
import { formatDate, labelize } from "../utils/format";
import { STATUS_COLORS } from "../utils/constants";

const PIE_COLORS = ["#10B981", "#EF4444", "#0EA5E9", "#F59E0B", "#334155", "#8B5CF6"];

export default function ReportsPage() {
  const [loading, setLoading] = useState(true);
  const [overview, setOverview] = useState(null);
  const [deadlines, setDeadlines] = useState([]);
  const [issues, setIssues] = useState({ grouped: [], detailed: [] });
  const [workload, setWorkload] = useState([]);
  const [teamComposition, setTeamComposition] = useState({ inhouse: 0, freelance: 0, byDepartment: [] });

  useEffect(() => {
    let cancelled = false;

    async function fetchData() {
      setLoading(true);
      try {
        const [overviewRes, deadlinesRes, issuesRes, workloadRes, teamRes] = await Promise.all([
          api.get("/reports/overview"),
          api.get("/reports/deadlines"),
          api.get("/reports/issues"),
          api.get("/reports/workload"),
          api.get("/reports/team-composition")
        ]);

        if (!cancelled) {
          setOverview(overviewRes.data);
          setDeadlines(deadlinesRes.data);
          setIssues(issuesRes.data);
          setWorkload(workloadRes.data);
          setTeamComposition(teamRes.data);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchData();
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) return <Loader label="Loading reports..." />;

  const workloadChart = (overview?.workloadPerArtist || workload
    .filter((item) => item.role === "EMPLOYEE")
    .map((item) => ({ name: item.name, activeTasks: item.activeTaskCount })))
    .map((item) => ({ name: item.name, tasks: item.activeTasks }))
    .sort((a, b) => b.tasks - a.tasks);

  const projectStatusBreakdown = overview?.projectStatusBreakdown || (overview?.statusBreakdown || []).map((entry, index) => ({
    ...entry,
    color: PIE_COLORS[index % PIE_COLORS.length]
  }));

  const approvalsOverTime = overview?.approvalsOverTime || (overview?.approvalTrend || []).map((entry) => ({
    date: entry.date,
    count: entry.approvals
  }));

  const completionPerProject = overview?.completionPerProject || (overview?.completionByProject || []).map((entry) => ({
    name: entry.name,
    completion: entry.progressPercent
  }));

  const issuesByType = overview?.issuesByType || (issues.grouped || []).map((item) => ({
    name: labelize(item.issueType),
    value: item.count
  }));

  const upcomingDeadlines = overview?.upcomingDeadlines || deadlines;
  const teamCompositionData = [
    { name: "In-house", value: teamComposition.inhouse, color: "#10B981" },
    { name: "Freelance", value: teamComposition.freelance, color: "#3B82F6" }
  ];

  return (
    <div className="space-y-6">
      <section className="grid grid-cols-2 gap-4">
        <ChartCard title="Project Status Overview">
          {projectStatusBreakdown?.length ? (
            <ResponsiveContainer width="100%" height={240}>
              <PieChart>
                <Pie data={projectStatusBreakdown} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80}>
                  {projectStatusBreakdown.map((entry, index) => (
                    <Cell key={entry.name} fill={entry.color || PIE_COLORS[index % PIE_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <EmptyState title="No status data" description="Project status data will appear here." />
          )}
        </ChartCard>

        <ChartCard title="Approvals Over 30 Days">
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={approvalsOverTime}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" hide />
              <YAxis allowDecimals={false} />
              <Tooltip />
              <Line type="monotone" dataKey="count" stroke="#0EA5E9" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>
      </section>

      <section className="grid grid-cols-2 gap-4">
        <ChartCard title="Completion % Per Project">
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={completionPerProject}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" tick={{ fontSize: 10 }} interval={0} angle={-15} height={60} textAnchor="end" />
              <YAxis domain={[0, 100]} />
              <Tooltip />
              <Bar dataKey="completion" fill="#10B981" />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Issues Breakdown">
          <ResponsiveContainer width="100%" height={260}>
            <PieChart>
              <Pie data={issuesByType} dataKey="value" nameKey="name" outerRadius={90}>
                {issuesByType.map((entry, index) => (
                  <Cell key={entry.name} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                ))}
              </Pie>
              <Tooltip />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-4">
        <h3 className="mb-4 text-lg font-bold text-slate-900">Deadlines This Week</h3>
        {!upcomingDeadlines.length ? (
          <EmptyState title="No upcoming deadlines" description="No stages due in the next 7 days." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-slate-500">
                  <th className="py-2">Project</th>
                  <th className="py-2">Stage</th>
                  <th className="py-2">Assigned Artist</th>
                  <th className="py-2">Status</th>
                  <th className="py-2">Deadline</th>
                </tr>
              </thead>
              <tbody>
                {upcomingDeadlines.map((stage, index) => (
                  <tr key={stage.id || `${stage.projectName}-${stage.stageName}-${index}`} className="border-b border-slate-100">
                    <td className="py-3 font-semibold text-slate-800">{stage.project?.name || stage.projectName}</td>
                    <td className="py-3">{stage.stageDisplayName || labelize(stage.stageName)}</td>
                    <td className="py-3">{stage.assignedUser?.name || stage.assignedTo || "Unassigned"}</td>
                    <td className="py-3">
                      {stage.status ? (
                        <span
                          className="rounded-full px-2.5 py-1 text-xs font-semibold text-white"
                          style={{ backgroundColor: STATUS_COLORS[stage.status] || "#334155" }}
                        >
                          {labelize(stage.status)}
                        </span>
                      ) : (
                        "-"
                      )}
                    </td>
                    <td className="py-3">{formatDate(stage.deadline)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-4">
        <h3 className="mb-4 text-lg font-bold text-slate-900">Workload Per Artist</h3>
        {!workloadChart.length ? (
          <EmptyState title="No workload data" description="Artist assignments will appear here." />
        ) : (
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={workloadChart} layout="vertical" margin={{ left: 40 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis type="number" allowDecimals={false} />
              <YAxis type="category" dataKey="name" width={120} tick={{ fontSize: 12 }} />
              <Tooltip />
              <Bar dataKey="tasks" fill="#F59E0B" />
            </BarChart>
          </ResponsiveContainer>
        )}
      </section>

      <section className="grid grid-cols-2 gap-4">
        <ChartCard title="Team Composition">
          {!teamCompositionData.some((entry) => entry.value > 0) ? (
            <EmptyState title="No team data" description="In-house and freelance counts will appear here." />
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie data={teamCompositionData} dataKey="value" nameKey="name" outerRadius={90}>
                  {teamCompositionData.map((entry) => (
                    <Cell key={entry.name} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        <ChartCard title="Active Assignments By Type">
          {!teamComposition.byDepartment?.length ? (
            <EmptyState title="No assignment data" description="Department breakdown will appear here." />
          ) : (
            <div className="max-h-[260px] overflow-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-slate-500">
                    <th className="py-2">Department</th>
                    <th className="py-2">In-house Artists</th>
                    <th className="py-2">Freelance Artists</th>
                  </tr>
                </thead>
                <tbody>
                  {teamComposition.byDepartment.map((row) => (
                    <tr key={row.department} className="border-b border-slate-100">
                      <td className="py-2.5 font-semibold text-slate-800">{row.department}</td>
                      <td className="py-2.5">{row.inhouse}</td>
                      <td className="py-2.5">{row.freelance}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </ChartCard>
      </section>
    </div>
  );
}

function ChartCard({ title, children }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <h3 className="mb-3 text-lg font-bold text-slate-900">{title}</h3>
      {children}
    </div>
  );
}
