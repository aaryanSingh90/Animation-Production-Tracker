import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Building2, FolderKanban, Package, Clapperboard, Plus } from "lucide-react";
import api from "../lib/api";
import Loader from "../components/Loader";
import EmptyState from "../components/EmptyState";
import Modal from "../components/Modal";
import { useToastStore } from "../store/toastStore";
import { formatDate, initials } from "../utils/format";

const INITIAL_FORM = {
  name: "",
  companyName: "",
  email: "",
  phone: "",
  address: "",
  notes: ""
};

function colorFromName(name = "") {
  const palette = ["#3B82F6", "#10B981", "#F59E0B", "#EF4444", "#8B5CF6", "#14B8A6", "#EC4899", "#6366F1"];
  const hash = name
    .split("")
    .reduce((acc, char) => acc + char.charCodeAt(0), 0);
  return palette[hash % palette.length];
}

function MetricCard({ label, value, icon: Icon }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-xs uppercase tracking-wide text-slate-500">{label}</p>
      <div className="mt-2 flex items-center justify-between">
        <p className="text-2xl font-bold text-slate-900">{value}</p>
        {Icon ? <Icon size={18} className="text-slate-400" /> : null}
      </div>
    </div>
  );
}

export default function ClientsPage() {
  const navigate = useNavigate();
  const showToast = useToastStore((state) => state.showToast);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [clients, setClients] = useState([]);
  const [unassignedProjects, setUnassignedProjects] = useState([]);
  const [query, setQuery] = useState("");

  const [createOpen, setCreateOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(INITIAL_FORM);

  async function fetchData() {
    setLoading(true);
    setError("");
    try {
      const [clientsRes, projectsRes] = await Promise.all([api.get("/clients"), api.get("/projects")]);
      setClients(clientsRes.data || []);
      setUnassignedProjects((projectsRes.data || []).filter((project) => !project.clientId));
    } catch (fetchError) {
      setError(fetchError.userMessage || fetchError.response?.data?.message || "Failed to load clients.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchData();
  }, []);

  const filteredClients = useMemo(() => {
    const search = query.trim().toLowerCase();
    if (!search) return clients;

    return clients.filter((client) => {
      const haystack = `${client.name || ""} ${client.companyName || ""} ${client.email || ""}`.toLowerCase();
      return haystack.includes(search);
    });
  }, [clients, query]);

  const metrics = useMemo(() => {
    return clients.reduce(
      (acc, client) => {
        acc.totalClients += 1;
        acc.activeProjects += client.stats?.activeProjects || 0;
        acc.totalProjects += client.stats?.totalProjects || 0;
        acc.totalShots += client.stats?.totalShots || 0;
        acc.totalAssets += client.stats?.totalAssets || 0;
        return acc;
      },
      {
        totalClients: 0,
        activeProjects: 0,
        totalProjects: 0,
        totalShots: 0,
        totalAssets: 0
      }
    );
  }, [clients]);

  async function createClient(event) {
    event.preventDefault();
    const name = form.name.trim();

    if (!name) {
      showToast("error", "Client name is required");
      return;
    }

    setSaving(true);
    try {
      await api.post("/clients", {
        name,
        companyName: form.companyName.trim(),
        email: form.email.trim(),
        phone: form.phone.trim(),
        address: form.address.trim(),
        notes: form.notes.trim()
      });
      showToast("success", "Client created successfully");
      setCreateOpen(false);
      setForm(INITIAL_FORM);
      await fetchData();
    } catch (createError) {
      showToast("error", createError.userMessage || createError.response?.data?.message || "Unable to create client");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <Loader label="Loading clients..." />;
  }

  if (error) {
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50 px-6 py-8 text-center">
        <p className="text-sm font-medium text-red-700">{error}</p>
        <button onClick={fetchData} className="mt-3 rounded-lg border border-red-300 px-3 py-1.5 text-xs font-semibold text-red-700">
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <MetricCard label="Total Clients" value={metrics.totalClients} icon={Building2} />
        <MetricCard label="Total Projects" value={metrics.totalProjects} icon={FolderKanban} />
        <MetricCard label="Active Projects" value={metrics.activeProjects} icon={FolderKanban} />
        <MetricCard label="Total Shots" value={metrics.totalShots} icon={Clapperboard} />
        <MetricCard label="Total Assets" value={metrics.totalAssets} icon={Package} />
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-4">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-[280px] flex-1">
            <h3 className="text-lg font-bold text-slate-900">Clients</h3>
            <p className="text-sm text-slate-500">Organize projects under studio clients for a cleaner production hierarchy.</p>
          </div>
          <div className="flex w-full gap-2 md:w-auto">
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search client, company, email"
              className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm md:w-[280px]"
            />
            <button
              onClick={() => setCreateOpen(true)}
              className="inline-flex items-center gap-1 rounded-xl bg-slate-900 px-3 py-2 text-sm font-semibold text-white"
            >
              <Plus size={14} /> New Client
            </button>
          </div>
        </div>

        {!filteredClients.length ? (
          <EmptyState title="No clients found" description="Create your first client to start grouping projects by studio account." />
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {filteredClients.map((client) => {
              const tint = colorFromName(client.name);
              return (
                <button
                  key={client.id}
                  onClick={() =>
                    navigate(`/clients/${client.id}`, {
                      state: {
                        breadcrumbClientName: client.name
                      }
                    })
                  }
                  className="rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
                >
                  <div className="mb-3 flex items-start justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <span
                        className="inline-flex h-10 w-10 items-center justify-center rounded-xl text-sm font-bold text-white"
                        style={{ backgroundColor: tint }}
                      >
                        {initials(client.name || "CL")}
                      </span>
                      <div>
                        <p className="text-sm font-bold text-slate-900">{client.name}</p>
                        <p className="text-xs text-slate-500">{client.companyName || "Independent"}</p>
                      </div>
                    </div>
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600">
                      {client.stats?.totalProjects || 0} projects
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-xs text-slate-600">
                    <p>Active: <span className="font-semibold text-slate-800">{client.stats?.activeProjects || 0}</span></p>
                    <p>Shots: <span className="font-semibold text-slate-800">{client.stats?.totalShots || 0}</span></p>
                    <p>Assets: <span className="font-semibold text-slate-800">{client.stats?.totalAssets || 0}</span></p>
                    <p>Progress: <span className="font-semibold text-slate-800">{client.stats?.avgProgress || 0}%</span></p>
                  </div>

                  <p className="mt-3 text-[11px] text-slate-400">Updated {formatDate(client.updatedAt)}</p>
                </button>
              );
            })}
          </div>
        )}
      </section>

      {unassignedProjects.length > 0 && (
        <section className="rounded-2xl border border-amber-200 bg-amber-50/40 p-4">
          <div className="mb-3">
            <h3 className="text-sm font-bold text-amber-900">Projects Without Client</h3>
            <p className="text-xs text-amber-700">Legacy projects are still available. Open them and attach to a client when needed.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {unassignedProjects.slice(0, 12).map((project) => (
              <button
                key={project.id}
                onClick={() => navigate(`/projects/${project.id}`)}
                className="rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-xs font-semibold text-amber-900"
              >
                {project.name}
              </button>
            ))}
          </div>
        </section>
      )}

      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="Create Client" size="max-w-2xl">
        <form onSubmit={createClient} className="space-y-3">
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-600">Client Name *</label>
            <input
              value={form.name}
              onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
              className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
              placeholder="Disney"
            />
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-600">Company</label>
              <input
                value={form.companyName}
                onChange={(event) => setForm((prev) => ({ ...prev, companyName: event.target.value }))}
                className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-600">Email</label>
              <input
                type="email"
                value={form.email}
                onChange={(event) => setForm((prev) => ({ ...prev, email: event.target.value }))}
                className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-600">Phone</label>
              <input
                value={form.phone}
                onChange={(event) => setForm((prev) => ({ ...prev, phone: event.target.value }))}
                className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-600">Address</label>
              <input
                value={form.address}
                onChange={(event) => setForm((prev) => ({ ...prev, address: event.target.value }))}
                className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-600">Notes</label>
            <textarea
              rows={3}
              value={form.notes}
              onChange={(event) => setForm((prev) => ({ ...prev, notes: event.target.value }))}
              className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
            />
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={() => setCreateOpen(false)} className="rounded-xl border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700">
              Cancel
            </button>
            <button type="submit" disabled={saving} className="rounded-xl bg-slate-900 px-3 py-2 text-sm font-semibold text-white disabled:opacity-60">
              {saving ? "Creating..." : "Create Client"}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
