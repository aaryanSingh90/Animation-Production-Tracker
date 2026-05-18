import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import api from "../lib/api";
import Loader from "../components/Loader";
import EmptyState from "../components/EmptyState";
import StatusBadge from "../components/StatusBadge";
import Modal from "../components/Modal";
import { CHARACTER_STAGES, STAGE_STATUSES } from "../utils/constants";
import { formatDate, formatDateInput, labelize } from "../utils/format";
import { useToastStore } from "../store/toastStore";

export default function CharactersPage() {
  const showToast = useToastStore((state) => state.showToast);

  const [loading, setLoading] = useState(true);
  const [characters, setCharacters] = useState([]);
  const [users, setUsers] = useState([]);
  const [sortBy, setSortBy] = useState("name");
  const [sortDir, setSortDir] = useState("asc");

  const [addOpen, setAddOpen] = useState(false);
  const [newCharacterName, setNewCharacterName] = useState("");

  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ status: "NOT_STARTED", deadline: "", assignedUserId: "", notes: "" });

  async function fetchData() {
    setLoading(true);
    try {
      const [charRes, userRes] = await Promise.all([api.get("/characters"), api.get("/users")]);
      setCharacters(charRes.data);
      setUsers(userRes.data.filter((item) => item.role === "EMPLOYEE"));
    } catch (error) {
      showToast("error", error.userMessage || error.response?.data?.message || "Failed to load characters");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchData();
  }, []);

  const sorted = useMemo(() => {
    const copy = [...characters];
    copy.sort((a, b) => {
      if (sortBy === "name") return a.name.localeCompare(b.name);
      if (sortBy === "projects") return a.projectLinks.length - b.projectLinks.length;
      return a.name.localeCompare(b.name);
    });
    if (sortDir === "desc") copy.reverse();
    return copy;
  }, [characters, sortBy, sortDir]);

  const handleAddCharacter = async (event) => {
    event.preventDefault();
    try {
      await api.post("/characters", { name: newCharacterName });
      setAddOpen(false);
      setNewCharacterName("");
      showToast("success", "Character created");
      await fetchData();
    } catch (error) {
      showToast("error", error.userMessage || error.response?.data?.message || "Unable to create character");
    }
  };

  const openEdit = (character, stage) => {
    setEditing({ characterId: character.id, stageName: stage.stageName, characterName: character.name });
    setForm({
      status: stage.status,
      deadline: formatDateInput(stage.deadline),
      assignedUserId: stage.assignedUserId || "",
      notes: stage.notes || ""
    });
  };

  const saveStage = async () => {
    if (!editing) return;
    try {
      await api.put(`/characters/${editing.characterId}/stages/${editing.stageName}`, {
        status: form.status,
        deadline: form.deadline || null,
        assignedUserId: form.assignedUserId ? Number(form.assignedUserId) : null,
        notes: form.notes
      });
      showToast("success", "Character stage updated");
      setEditing(null);
      await fetchData();
    } catch (error) {
      showToast("error", error.userMessage || error.response?.data?.message || "Unable to update character stage");
    }
  };

  if (loading) return <Loader label="Loading characters..." />;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex gap-2">
          <button
            onClick={() => {
              setSortBy("name");
              setSortDir((prev) => (prev === "asc" ? "desc" : "asc"));
            }}
            className="rounded-xl border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700"
          >
            Sort Name ({sortDir.toUpperCase()})
          </button>
          <button
            onClick={() => {
              setSortBy("projects");
              setSortDir((prev) => (prev === "asc" ? "desc" : "asc"));
            }}
            className="rounded-xl border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700"
          >
            Sort Usage
          </button>
        </div>
        <button onClick={() => setAddOpen(true)} className="rounded-xl bg-slate-900 px-3 py-2 text-sm font-semibold text-white">
          Add Character
        </button>
      </div>

      {!sorted.length ? (
        <EmptyState title="No characters yet" description="Add a character to begin stage tracking." />
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white p-4">
          <table className="w-full min-w-[1200px] text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-slate-500">
                <th className="py-2">Character</th>
                {CHARACTER_STAGES.map((stageName) => (
                  <th key={stageName} className="py-2">
                    {labelize(stageName)}
                  </th>
                ))}
                <th className="py-2">Used In Projects</th>
                <th className="py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((character) => {
                const byStage = new Map(character.stages.map((stage) => [stage.stageName, stage]));
                return (
                  <tr key={character.id} className="border-b border-slate-100 align-top">
                    <td className="py-3 font-semibold text-slate-900">{character.name}</td>
                    {CHARACTER_STAGES.map((stageName) => {
                      const stage = byStage.get(stageName);
                      if (!stage) return <td key={`${character.id}-${stageName}`} className="py-3">-</td>;
                      return (
                        <td key={`${character.id}-${stageName}`} className="py-3">
                          <button
                            onClick={() => openEdit(character, stage)}
                            className="rounded-lg border border-slate-200 p-2 text-left hover:bg-slate-50"
                          >
                            <StatusBadge status={stage.status} />
                            <p className="mt-1 text-xs text-slate-500">{formatDate(stage.deadline)}</p>
                          </button>
                        </td>
                      );
                    })}
                    <td className="py-3 text-xs text-slate-700">
                      {(character.projectLinks || []).map((link) => link.project.name).join(", ") || "-"}
                    </td>
                    <td className="py-3">
                      <Link to={`/characters/${character.id}`} className="rounded-lg border border-slate-300 px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50">
                        View Detail
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <Modal open={addOpen} onClose={() => setAddOpen(false)} title="Add Character" size="max-w-md">
        <form className="space-y-4" onSubmit={handleAddCharacter}>
          <div>
            <label className="mb-1 block text-sm font-semibold text-slate-700">Character Name</label>
            <input
              value={newCharacterName}
              onChange={(event) => setNewCharacterName(event.target.value)}
              required
              className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setAddOpen(false)} className="rounded-xl border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700">
              Cancel
            </button>
            <button type="submit" className="rounded-xl bg-slate-900 px-3 py-2 text-sm font-semibold text-white">
              Save
            </button>
          </div>
        </form>
      </Modal>

      <Modal open={Boolean(editing)} onClose={() => setEditing(null)} title="Update Character Stage">
        <div className="space-y-4">
          <p className="text-sm text-slate-600">
            {editing?.characterName} · {labelize(editing?.stageName || "")}
          </p>

          <div>
            <label className="mb-1 block text-sm font-semibold text-slate-700">Status</label>
            <select
              value={form.status}
              onChange={(event) => setForm((prev) => ({ ...prev, status: event.target.value }))}
              className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
            >
              {STAGE_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {labelize(status)}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-sm font-semibold text-slate-700">Deadline</label>
            <input
              type="date"
              value={form.deadline}
              onChange={(event) => setForm((prev) => ({ ...prev, deadline: event.target.value }))}
              className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-semibold text-slate-700">Assigned Artist</label>
            <select
              value={form.assignedUserId}
              onChange={(event) => setForm((prev) => ({ ...prev, assignedUserId: event.target.value }))}
              className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
            >
              <option value="">Unassigned</option>
              {users.map((user) => (
                <option key={user.id} value={user.id}>
                  {user.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-sm font-semibold text-slate-700">Notes</label>
            <textarea
              rows={3}
              value={form.notes}
              onChange={(event) => setForm((prev) => ({ ...prev, notes: event.target.value }))}
              className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
            />
          </div>

          <div className="flex justify-end gap-2">
            <button onClick={() => setEditing(null)} className="rounded-xl border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700">
              Cancel
            </button>
            <button onClick={saveStage} className="rounded-xl bg-slate-900 px-3 py-2 text-sm font-semibold text-white">
              Save
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
