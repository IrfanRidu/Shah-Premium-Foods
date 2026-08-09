"use client";
import { useEffect, useState } from "react";
import Axios from "@/lib/axios";
import { axiosToastError } from "@/lib/utils";
import toast from "react-hot-toast";
import { FaUndo, FaCheckCircle } from "react-icons/fa";

const ACTION_LABELS = {
  status_change: "Status changed",
  note_add: "Note added",
  assign: "Assigned",
  reassign: "Reassigned",
  follow_up_update: "Follow-up updated",
  field_update: "Field updated",
};

function formatValue(v) {
  if (v === null || v === undefined) return "—";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

// Spec: "View audit logs. Undo any agent action... restore previous
// values with one click." Deliberately a separate page/concept from the
// pre-existing generic Audit Log page (request-level security trail) —
// this is the CRM's own field-level change history.
export default function ChangeLogPage() {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [undoingId, setUndoingId] = useState(null);

  const load = () => {
    setLoading(true);
    Axios.get("/api/callcenter/change-log")
      .then(({ data }) => setEntries(data?.data || []))
      .catch(axiosToastError)
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const handleUndo = async (entry) => {
    if (!confirm(`Undo this ${ACTION_LABELS[entry.action] || entry.action}? This will restore the previous value.`)) return;
    setUndoingId(entry._id);
    try {
      await Axios.post("/api/callcenter/change-log/undo", { changeLogId: entry._id });
      toast.success("Change undone");
      load();
    } catch (err) {
      axiosToastError(err);
    } finally {
      setUndoingId(null);
    }
  };

  if (loading) return <div className="p-8 text-center text-theme-muted text-sm">Loading change history…</div>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="section-heading text-2xl">CRM Change History</h1>
        <p className="text-sm text-theme-muted mt-1">
          Every order status change, assignment, and follow-up update made through the call center CRM. Nothing here is ever deleted.
        </p>
      </div>

      {entries.length === 0 ? (
        <div className="bg-[var(--color-surface)] border border-theme rounded-2xl p-8 text-center text-sm text-theme-muted">
          No changes recorded yet.
        </div>
      ) : (
        <div className="bg-[var(--color-surface)] border border-theme rounded-2xl divide-y divide-[var(--color-border)] overflow-hidden">
          {entries.map((entry) => (
            <div key={entry._id} className="p-4 flex items-start gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold">
                  {ACTION_LABELS[entry.action] || entry.action}
                  <span className="text-theme-muted font-normal"> on {entry.entityType} · field: {entry.field || "—"}</span>
                </p>
                <p className="text-xs text-theme-muted mt-1">
                  {formatValue(entry.previousValue)} <span className="mx-1">→</span> {formatValue(entry.newValue)}
                </p>
                <p className="text-xs text-theme-muted mt-1">
                  {entry.performedBy?.name || entry.performedBy?.email || "System"} · {new Date(entry.createdAt).toLocaleString()}
                </p>
              </div>
              {entry.isUndone ? (
                <span className="flex items-center gap-1.5 text-xs text-theme-muted shrink-0">
                  <FaCheckCircle size={12} /> Undone
                </span>
              ) : entry.field ? (
                <button
                  onClick={() => handleUndo(entry)}
                  disabled={undoingId === entry._id}
                  className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full border border-theme hover:bg-[var(--color-border)] transition-colors shrink-0 disabled:opacity-50"
                >
                  <FaUndo size={11} /> {undoingId === entry._id ? "Undoing…" : "Undo"}
                </button>
              ) : null}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
