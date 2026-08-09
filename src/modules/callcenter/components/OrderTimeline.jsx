"use client";
import { useEffect, useState } from "react";
import Axios from "@/lib/axios";
import toast from "react-hot-toast";
import { FaHistory, FaPhoneAlt, FaStickyNote, FaCalendarCheck } from "react-icons/fa";
import { formatCallDuration } from "../utils/phoneUtils";

// Spec: "Every order should clearly display: Assigned Agent, Assignment
// Time, Assignment History, Customer Timeline, Call History, Notes."
export default function OrderTimeline({ orderId }) {
  const [detail, setDetail] = useState(null);
  const [history, setHistory] = useState([]);
  const [calls, setCalls] = useState([]);
  const [loading, setLoading] = useState(true);
  const [noteText, setNoteText] = useState("");
  const [savingNote, setSavingNote] = useState(false);

  const load = async () => {
    try {
      const [detailRes, historyRes, callsRes] = await Promise.all([
        Axios.get("/api/callcenter/orders/detail", { params: { orderId } }),
        Axios.get("/api/callcenter/assignments/history", { params: { orderId } }),
        Axios.get("/api/callcenter/calls", { params: { orderId, limit: 50 } }),
      ]);
      setDetail(detailRes.data?.data || null);
      setHistory(historyRes.data?.data || []);
      setCalls(callsRes.data?.data?.logs || []);
    } catch {
      toast.error("Failed to load order timeline");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [orderId]);

  const addNote = async () => {
    if (!noteText.trim()) return;
    setSavingNote(true);
    try {
      await Axios.post("/api/callcenter/orders/notes", { orderId, text: noteText.trim() });
      setNoteText("");
      await load();
      toast.success("Note added");
    } catch {
      toast.error("Failed to add note");
    } finally {
      setSavingNote(false);
    }
  };

  if (loading) return <p className="text-sm text-theme-muted p-4">Loading timeline…</p>;
  if (!detail) return <p className="text-sm text-theme-muted p-4">Order not found.</p>;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 text-sm">
        <div>
          <p className="text-xs text-theme-muted">Assigned Agent</p>
          <p className="font-semibold">{detail.assignedAgent?.name || "Unassigned"}</p>
        </div>
        <div>
          <p className="text-xs text-theme-muted">Assignment Time</p>
          <p className="font-semibold">{detail.assignedAt ? new Date(detail.assignedAt).toLocaleString() : "—"}</p>
        </div>
        {detail.followUp?.scheduled && (
          <div className="col-span-2 flex items-center gap-2 bg-amber-500/10 text-amber-500 rounded-lg px-3 py-2 text-xs">
            <FaCalendarCheck size={12} />
            Follow-up scheduled for {detail.followUp.date ? new Date(detail.followUp.date).toLocaleString() : "—"}
            {detail.followUp.note && ` — ${detail.followUp.note}`}
          </div>
        )}
      </div>

      <section>
        <h3 className="text-xs uppercase tracking-widest text-theme-muted font-semibold mb-2 flex items-center gap-1.5">
          <FaHistory size={11} /> Assignment History
        </h3>
        {history.length === 0 ? (
          <p className="text-xs text-theme-muted">No assignment history yet.</p>
        ) : (
          <div className="space-y-1.5">
            {history.map((h) => (
              <div key={h._id} className="text-xs flex items-center justify-between bg-[var(--color-border)]/30 rounded-lg px-3 py-2">
                <span>{h.agentId?.name || "Unknown"} <span className="text-theme-muted">({h.method})</span></span>
                <span className="text-theme-muted">{new Date(h.assignedAt).toLocaleString()}</span>
              </div>
            ))}
          </div>
        )}
      </section>

      <section>
        <h3 className="text-xs uppercase tracking-widest text-theme-muted font-semibold mb-2 flex items-center gap-1.5">
          <FaPhoneAlt size={11} /> Call History
        </h3>
        {calls.length === 0 ? (
          <p className="text-xs text-theme-muted">No calls linked to this order yet.</p>
        ) : (
          <div className="space-y-1.5">
            {calls.map((c) => (
              <div key={c._id} className="text-xs flex items-center justify-between bg-[var(--color-border)]/30 rounded-lg px-3 py-2">
                <span>{c.direction === "inbound" ? "Incoming" : "Outgoing"} · {c.agentId?.name || "—"}</span>
                <span className="text-theme-muted">{c.durationSeconds > 0 ? formatCallDuration(c.durationSeconds) : c.status || c.outcome} · {new Date(c.createdAt).toLocaleDateString()}</span>
              </div>
            ))}
          </div>
        )}
      </section>

      <section>
        <h3 className="text-xs uppercase tracking-widest text-theme-muted font-semibold mb-2 flex items-center gap-1.5">
          <FaStickyNote size={11} /> Notes
        </h3>
        <div className="space-y-1.5 mb-2">
          {(detail.crmNotes || []).length === 0 ? (
            <p className="text-xs text-theme-muted">No notes yet.</p>
          ) : (
            detail.crmNotes.slice().reverse().map((n, i) => (
              <div key={i} className="text-xs bg-[var(--color-border)]/30 rounded-lg px-3 py-2">
                <p>{n.text}</p>
                <p className="text-theme-muted mt-1">{n.addedBy?.name || "—"} · {new Date(n.addedAt).toLocaleString()}</p>
              </div>
            ))
          )}
        </div>
        <div className="flex gap-2">
          <input
            value={noteText}
            onChange={(e) => setNoteText(e.target.value)}
            placeholder="Add a note about this customer/order…"
            className="flex-1 text-xs bg-transparent border border-theme rounded-lg px-3 py-2"
            onKeyDown={(e) => e.key === "Enter" && addNote()}
          />
          <button onClick={addNote} disabled={savingNote || !noteText.trim()} className="text-xs font-semibold px-3 py-2 rounded-lg bg-theme-primary text-white disabled:opacity-50">
            {savingNote ? "Saving…" : "Add"}
          </button>
        </div>
      </section>
    </div>
  );
}
