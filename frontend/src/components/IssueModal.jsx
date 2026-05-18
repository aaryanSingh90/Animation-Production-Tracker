import { useState } from "react";
import Modal from "./Modal";
import { ISSUE_TYPES } from "../utils/constants";

export default function IssueModal({ open, onClose, onSubmit, loading = false, stageDeadline }) {
  const [issueType, setIssueType] = useState("TECHNICAL");
  const [description, setDescription] = useState("");
  const [extendDeadline, setExtendDeadline] = useState(false);
  const [newDeadline, setNewDeadline] = useState("");
  const [extensionReason, setExtensionReason] = useState("");

  const reset = () => {
    setIssueType("TECHNICAL");
    setDescription("");
    setExtendDeadline(false);
    setNewDeadline("");
    setExtensionReason("");
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    await onSubmit({
      issueType,
      description,
      extendDeadline,
      newDeadline: extendDeadline ? newDeadline : null,
      extensionReason: extendDeadline ? extensionReason : null
    });

    reset();
  };

  return (
    <Modal open={open} onClose={handleClose} title="Log Issue">
      <form className="space-y-4" onSubmit={handleSubmit}>
        <div>
          <label className="mb-1 block text-sm font-semibold text-slate-700">Issue Type</label>
          <select
            value={issueType}
            onChange={(event) => setIssueType(event.target.value)}
            className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
          >
            {ISSUE_TYPES.map((item) => (
              <option key={item} value={item}>
                {item.replaceAll("_", " ")}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="mb-1 block text-sm font-semibold text-slate-700">Description</label>
          <textarea
            value={description}
            required
            onChange={(event) => setDescription(event.target.value)}
            rows={4}
            className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
            placeholder="What happened?"
          />
        </div>

        <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
          <input
            type="checkbox"
            checked={extendDeadline}
            onChange={(event) => setExtendDeadline(event.target.checked)}
            className="h-4 w-4 rounded border-slate-300"
          />
          Extend deadline?
        </label>

        {extendDeadline && (
          <>
            <div>
              <label className="mb-1 block text-sm font-semibold text-slate-700">New Deadline</label>
              <input
                type="date"
                required
                min={stageDeadline || undefined}
                value={newDeadline}
                onChange={(event) => setNewDeadline(event.target.value)}
                className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-semibold text-slate-700">Reason For Extension</label>
              <textarea
                value={extensionReason}
                required
                onChange={(event) => setExtensionReason(event.target.value)}
                rows={3}
                className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
          </>
        )}

        <div className="flex justify-end gap-2">
          <button type="button" onClick={handleClose} className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700">
            Cancel
          </button>
          <button
            type="submit"
            disabled={loading}
            className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700 disabled:opacity-60"
          >
            {loading ? "Saving..." : "Submit Issue"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
