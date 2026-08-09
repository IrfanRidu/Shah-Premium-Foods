"use client";
import { useEffect, useState, useRef } from "react";
import Axios from "@/lib/axios";
import { useSocket } from "../hooks/useSocket";
import { CRM_EVENTS } from "../socket/events.js";

// Only the 5 statuses an agent sets themselves — "ringing" and "on_call"
// are automatic, driven by actual call activity (see useSipClient.js),
// never shown as a manual option here.
const STATUS_OPTIONS = [
  { value: "available", label: "Available", color: "#22c55e" },
  { value: "busy",      label: "Busy",      color: "#ef4444" },
  { value: "away",      label: "Away",      color: "#f59e0b" },
  { value: "break",     label: "On Break",  color: "#3b82f6" },
  { value: "offline",   label: "Offline",   color: "#6b7280" },
];

export default function AgentStatusToggle() {
  const { socket, connected } = useSocket();
  const [status, setStatus] = useState("offline");
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const myAgentId = useRef(null);

  useEffect(() => {
    Axios.get("/api/callcenter/agent-status/me")
      .then(({ data }) => {
        if (data?.data?.status) setStatus(data.data.status);
        if (data?.data?.agentId?._id) myAgentId.current = String(data.data.agentId._id);
      })
      .catch(() => {}) // not a provisioned agent on this account — toggle just won't do anything useful, harmless
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!socket) return;
    const onChanged = (updated) => {
      // This event is also broadcast to super admins monitoring every
      // agent — only react if it's genuinely THIS agent (e.g. changed
      // from another browser tab, or forced by a super admin), so the
      // toggle reflects reality instead of a stale optimistic value.
      if (!myAgentId.current || !updated?.agentId?._id) return;
      if (String(updated.agentId._id) === myAgentId.current && updated.status) {
        setStatus(updated.status);
      }
    };
    socket.on(CRM_EVENTS.AGENT_STATUS_CHANGED, onChanged);
    return () => socket.off(CRM_EVENTS.AGENT_STATUS_CHANGED, onChanged);
  }, [socket]);

  const changeStatus = (next) => {
    setStatus(next); // optimistic
    setOpen(false);
    if (socket && connected) {
      socket.emit(CRM_EVENTS.AGENT_STATUS_UPDATE, next, (ack) => {
        if (!ack?.success) Axios.put("/api/callcenter/agent-status/me", { status: next }).catch(() => {});
      });
    } else {
      Axios.put("/api/callcenter/agent-status/me", { status: next }).catch(() => {});
    }
  };

  const current = STATUS_OPTIONS.find((s) => s.value === status) || STATUS_OPTIONS[STATUS_OPTIONS.length - 1];

  if (loading) return null;

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 px-3 py-1.5 rounded-full border border-theme text-xs font-semibold hover:bg-[var(--color-border)] transition-colors"
      >
        <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: current.color }} />
        {current.label}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 mt-2 w-40 rounded-xl border border-theme bg-[var(--color-surface)] shadow-lg z-20 py-1.5 overflow-hidden">
            {STATUS_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => changeStatus(opt.value)}
                className="w-full flex items-center gap-2 px-3 py-2 text-xs hover:bg-[var(--color-border)] text-left transition-colors"
              >
                <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: opt.color }} />
                {opt.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
