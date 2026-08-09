"use client";
import { useEffect, useState } from "react";
import Axios from "@/lib/axios";
import { axiosToastError } from "@/lib/utils";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from "recharts";
import { formatCallDuration } from "@/modules/callcenter/utils/phoneUtils";

const STATUS_COLORS = { answered: "#22c55e", completed: "#22c55e", missed: "#ef4444", rejected: "#ef4444", abandoned: "#f59e0b", queued: "#3b82f6", ringing: "#8b5cf6" };

// Spec: "Reports — Incoming Calls, Outgoing Calls, Missed Calls, Talk
// Time, Calls Per Agent, ... Top Performing Agents. Charts should
// update in real time." (Real-time here via a refresh interval rather
// than a socket subscription — reports are inherently aggregate/
// historical views, a 30s refresh keeps them current without the
// complexity of streaming every individual call event into a chart.)
export default function CallCenterReportsPage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = () => {
    Axios.get("/api/callcenter/dashboard/company-reports")
      .then(({ data: res }) => setData(res?.data || null))
      .catch(axiosToastError)
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    const interval = setInterval(load, 30000);
    return () => clearInterval(interval);
  }, []);

  if (loading) return <div className="p-8 text-center text-theme-muted text-sm">Loading reports…</div>;
  if (!data) return null;

  const statusData = (data.byStatus || []).filter((s) => s._id).map((s) => ({ name: s._id, value: s.count }));
  const agentData = (data.topAgents || []).map((a) => ({ name: a.agentName || "Unknown", calls: a.calls, talkTime: Math.round(a.talkTimeSeconds / 60) }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="section-heading text-2xl">Call Center Reports</h1>
        <p className="text-sm text-theme-muted mt-1">Company-wide analytics, refreshing every 30 seconds.</p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-[var(--color-surface)] border border-theme rounded-2xl p-4">
          <p className="text-2xl font-bold">{data.totalCalls}</p>
          <p className="text-xs text-theme-muted">Total Calls</p>
        </div>
        <div className="bg-[var(--color-surface)] border border-theme rounded-2xl p-4">
          <p className="text-2xl font-bold">{formatCallDuration(data.totalTalkTimeSeconds)}</p>
          <p className="text-xs text-theme-muted">Total Talk Time</p>
        </div>
        <div className="bg-[var(--color-surface)] border border-theme rounded-2xl p-4">
          <p className="text-2xl font-bold">{statusData.find((s) => s.name === "missed")?.value || 0}</p>
          <p className="text-xs text-theme-muted">Missed Calls</p>
        </div>
        <div className="bg-[var(--color-surface)] border border-theme rounded-2xl p-4">
          <p className="text-2xl font-bold">{agentData.length}</p>
          <p className="text-xs text-theme-muted">Active Agents</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-[var(--color-surface)] border border-theme rounded-2xl p-4">
          <h2 className="text-sm font-semibold uppercase tracking-widest text-theme-muted mb-4">Calls by Outcome</h2>
          {statusData.length === 0 ? (
            <p className="text-sm text-theme-muted text-center py-8">No call data yet.</p>
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <PieChart>
                <Pie data={statusData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label>
                  {statusData.map((entry, i) => <Cell key={i} fill={STATUS_COLORS[entry.name] || "#6b7280"} />)}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="bg-[var(--color-surface)] border border-theme rounded-2xl p-4">
          <h2 className="text-sm font-semibold uppercase tracking-widest text-theme-muted mb-4">Top Performing Agents</h2>
          {agentData.length === 0 ? (
            <p className="text-sm text-theme-muted text-center py-8">No call data yet.</p>
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={agentData}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Bar dataKey="calls" fill="#3b82f6" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>
    </div>
  );
}
