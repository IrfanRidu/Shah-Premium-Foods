"use client";
import { useEffect, useState } from "react";
import Axios from "@/lib/axios";
import { axiosToastError } from "@/lib/utils";
import StatsCards from "@/modules/callcenter/components/StatsCards";
import RecentCalls from "@/modules/callcenter/components/RecentCalls";
import AgentStatusToggle from "@/modules/callcenter/components/AgentStatusToggle";

export default function AgentDashboardPage() {
  const [stats, setStats] = useState(null);
  const [calls, setCalls] = useState([]);
  const [loading, setLoading] = useState(true);
  const [notAgent, setNotAgent] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [statsRes, callsRes] = await Promise.all([
          Axios.get("/api/callcenter/dashboard/my-stats"),
          Axios.get("/api/callcenter/dashboard/my-recent-calls"),
        ]);
        if (cancelled) return;
        setStats(statsRes.data?.data || null);
        setCalls(callsRes.data?.data || []);
      } catch (err) {
        if (err?.response?.status === 403) setNotAgent(true);
        else axiosToastError(err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  if (loading) {
    return <div className="p-8 text-center text-theme-muted text-sm">Loading your dashboard…</div>;
  }

  if (notAgent) {
    return (
      <div className="p-8 text-center">
        <p className="text-theme-muted text-sm">
          This dashboard is for provisioned call center agents. Ask a Super Admin to add you under
          Customer Care and Call Center → Agents.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="section-heading text-2xl">Agent Dashboard</h1>
          <p className="text-sm text-theme-muted mt-1">Today's activity and your recent calls.</p>
        </div>
        <AgentStatusToggle />
      </div>

      <StatsCards stats={stats} />

      <div>
        <h2 className="text-sm font-semibold uppercase tracking-widest text-theme-muted mb-3">Recent Calls</h2>
        <RecentCalls calls={calls} />
      </div>
    </div>
  );
}
