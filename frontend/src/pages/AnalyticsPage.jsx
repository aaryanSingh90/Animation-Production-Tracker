import { useEffect, useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AlertCircle, GaugeCircle, TrendingUp } from "lucide-react";
import api from "../lib/api";
import Loader from "../components/Loader";
import EmptyState from "../components/EmptyState";

const HEALTH_COLOR = {
  healthy: "#10B981",
  watch: "#F59E0B",
  critical: "#EF4444"
};

export default function AnalyticsPage() {
  const [loading, setLoading] = useState(true);
  const [overview, setOverview] = useState(null);
  const [heatmap, setHeatmap] = useState({ departments: [], teams: [] });
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;

    async function run() {
      setLoading(true);
      setError("");
      try {
        const [overviewRes, heatmapRes] = await Promise.all([api.get("/reports/overview"), api.get("/workforce/heatmap")]);
        if (!active) return;
        setOverview(overviewRes.data);
        setHeatmap(heatmapRes.data || { departments: [], teams: [] });
      } catch (err) {
        if (active) {
          setError(err.userMessage || err.response?.data?.message || "Failed to load analytics dashboard");
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    run();

    return () => {
      active = false;
    };
  }, []);

  const teamCapacity = useMemo(() => {
    return (heatmap.teams || []).map((team) => ({
      name: team.name,
      capacity: team.capacityPercent
    }));
  }, [heatmap]);

  if (loading) return <Loader label="Loading analytics..." />;

  return (
    <div className="space-y-6">
      {error ? (
        <div className="flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
          <AlertCircle size={16} />
          {error}
        </div>
      ) : null}

      <section className="grid gap-4 md:grid-cols-3">
        <InsightCard title="Total Projects" value={overview?.totals?.totalProjects || 0} caption="Active production slate" icon={TrendingUp} tone="emerald" />
        <InsightCard title="Pending Approvals" value={overview?.totals?.pendingApprovals || 0} caption="Needs manager review" icon={AlertCircle} tone="amber" />
        <InsightCard title="On Track" value={`${overview?.totals?.onTrackPercent || 0}%`} caption="Portfolio delivery health" icon={GaugeCircle} tone="blue" />
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <h3 className="mb-3 text-lg font-bold text-slate-900">Department Workload Heatmap</h3>
          {!heatmap.departments?.length ? (
            <EmptyState title="No department heatmap" description="Department workload analytics will appear here." compact />
          ) : (
            <div className="space-y-2">
              {heatmap.departments.map((department) => (
                <div key={department.id} className="rounded-xl border border-slate-200 p-3">
                  <div className="mb-2 flex items-center justify-between">
                    <p className="text-sm font-semibold text-slate-900">{department.name}</p>
                    <span className="rounded-full px-2 py-0.5 text-[11px] font-semibold text-white" style={{ backgroundColor: HEALTH_COLOR[department.health] || "#334155" }}>
                      {department.health}
                    </span>
                  </div>
                  <div className="mb-1 h-2 rounded-full bg-slate-200">
                    <div className="h-2 rounded-full" style={{ width: `${Math.max(3, department.utilizationPercent || 0)}%`, backgroundColor: department.color || "#10B981" }} />
                  </div>
                  <p className="text-xs text-slate-600">{department.utilizationPercent}% utilization · {department.delayedTasks} delayed · {department.overloadedMembers} overloaded</p>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <h3 className="mb-3 text-lg font-bold text-slate-900">Team Capacity</h3>
          {!teamCapacity.length ? (
            <EmptyState title="No team capacity" description="Team utilization data will appear here." compact />
          ) : (
            <ResponsiveContainer width="100%" height={320}>
              <BarChart data={teamCapacity} layout="vertical" margin={{ left: 40 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" domain={[0, 100]} />
                <YAxis type="category" dataKey="name" width={140} tick={{ fontSize: 11 }} />
                <Tooltip />
                <Bar dataKey="capacity" radius={[0, 8, 8, 0]}>
                  {teamCapacity.map((entry) => (
                    <Cell key={entry.name} fill={entry.capacity >= 85 ? "#EF4444" : entry.capacity >= 65 ? "#F59E0B" : "#10B981"} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <h3 className="mb-3 text-lg font-bold text-slate-900">Project Status Mix</h3>
          {!overview?.projectStatusBreakdown?.length ? (
            <EmptyState title="No project status mix" description="Project status distribution will appear here." compact />
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie data={overview.projectStatusBreakdown} dataKey="value" nameKey="name" outerRadius={110}>
                  {overview.projectStatusBreakdown.map((entry) => (
                    <Cell key={entry.name} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <h3 className="mb-3 text-lg font-bold text-slate-900">Upcoming Deadlines</h3>
          {!overview?.upcomingDeadlines?.length ? (
            <EmptyState title="No upcoming deadlines" description="No stage deadlines in the next 7 days." compact />
          ) : (
            <div className="max-h-[300px] overflow-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-slate-500">
                    <th className="py-2">Project</th>
                    <th className="py-2">Stage</th>
                    <th className="py-2">Assigned</th>
                  </tr>
                </thead>
                <tbody>
                  {overview.upcomingDeadlines.map((deadline, index) => (
                    <tr key={`${deadline.projectName}-${deadline.stageName}-${index}`} className="border-b border-slate-100">
                      <td className="py-2.5 font-semibold text-slate-800">{deadline.projectName}</td>
                      <td className="py-2.5 text-slate-700">{deadline.stageDisplayName || deadline.stageName}</td>
                      <td className="py-2.5 text-slate-600">{deadline.assignedTo || "Unassigned"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

function InsightCard({ title, value, caption, icon: Icon, tone = "emerald" }) {
  const toneStyles = {
    emerald: "from-emerald-600 to-emerald-500",
    amber: "from-amber-600 to-amber-500",
    blue: "from-blue-600 to-blue-500"
  };

  return (
    <article className={`rounded-2xl bg-gradient-to-br ${toneStyles[tone]} p-4 text-white shadow-lg`}>
      <div className="mb-4 flex items-center justify-between">
        <p className="text-sm font-medium text-white/85">{title}</p>
        <Icon size={16} />
      </div>
      <p className="text-3xl font-bold">{value}</p>
      <p className="mt-1 text-xs text-white/80">{caption}</p>
    </article>
  );
}
