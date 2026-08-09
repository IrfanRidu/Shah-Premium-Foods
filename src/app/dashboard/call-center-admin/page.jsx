"use client";
import { useEffect, useState } from "react";
import Axios from "@/lib/axios";
import { axiosToastError } from "@/lib/utils";
import { useSocket } from "@/modules/callcenter/hooks/useSocket";
import { CRM_EVENTS } from "@/modules/callcenter/socket/events.js";
import { FaCircle } from "react-icons/fa";

const STATUS_META = {
  available: { label: "Available", color: "#22c55e" },
  busy:      { label: "Busy",      color: "#ef4444" },
  on_call:   { label: "On Call",   color: "#3b82f6" },
  ringing:   { label: "Ringing",   color: "#8b5cf6" },
  away:      { label: "Away",      color: "#f59e0b" },
  break:     { label: "On Break",  color: "#f59e0b" },
  offline:   { label: "Offline",   color: "#6b7280" },
};

// Spec: "Super Admin: Monitor every active call, Monitor all agents."
export default function LiveMonitorPage() {
  const [agents, setAgents] = useState([]);
  const [loading, setLoading] = useState(true);
  const { socket } = useSocket();

  const load = () => {
    Axios.get("/api/callcenter/agent-status/all")
      .then(({ data }) => setAgents(data?.data || []))
      .catch(axiosToastError)
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  useEffect(() => {
    if (!socket) return;
    const onChanged = (updated) => {
      setAgents((prev) => {
        const idx = prev.findIndex((a) => String(a.agentId?._id) === String(updated.agentId?._id));
        if (idx === -1) return [...prev, updated];
        const next = [...prev];
        next[idx] = updated;
        return next;
      });
    };
    socket.on(CRM_EVENTS.AGENT_STATUS_CHANGED, onChanged);
    return () => socket.off(CRM_EVENTS.AGENT_STATUS_CHANGED, onChanged);
  }, [socket]);

  const counts = agents.reduce((acc, a) => { acc[a.status] = (acc[a.status] || 0) + 1; return acc; }, {});

  if (loading) return <div className="p-8 text-center text-theme-muted text-sm">Loading agent statuses…</div>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="section-heading text-2xl">Live Agent Monitor</h1>
        <p className="text-sm text-theme-muted mt-1">Real-time status for every call center agent. Updates instantly.</p>
      </div>

      <div className="flex flex-wrap gap-3">
        {Object.entries(STATUS_META).map(([key, meta]) => (
          <div key={key} className="flex items-center gap-2 px-3 py-1.5 rounded-full border border-theme text-xs">
            <FaCircle size={7} style={{ color: meta.color }} />
            {meta.label}: <span className="font-bold">{counts[key] || 0}</span>
          </div>
        ))}
      </div>

      {agents.length === 0 ? (
        <div className="bg-[var(--color-surface)] border border-theme rounded-2xl p-8 text-center text-sm text-theme-muted">
          No call center agents provisioned yet.
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {agents.map((a) => {
            const meta = STATUS_META[a.status] || STATUS_META.offline;
            return (
              <div key={a._id} className="bg-[var(--color-surface)] border border-theme rounded-2xl p-4 flex items-center gap-3">
                <div className="w-10 h-10 rounded-full flex items-center justify-center shrink-0" style={{ backgroundColor: `${meta.color}22`, color: meta.color }}>
                  <FaCircle size={10} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold truncate">{a.agentId?.name || "Unknown agent"}</p>
                  <p className="text-xs truncate" style={{ color: meta.color }}>{meta.label}</p>
                </div>
                <p className="text-xs text-theme-muted shrink-0">{new Date(a.lastChangedAt).toLocaleTimeString()}</p>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
