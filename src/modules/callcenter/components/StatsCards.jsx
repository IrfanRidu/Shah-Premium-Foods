"use client";
import { FaPhoneAlt, FaPhoneSlash, FaPhoneVolume, FaClock, FaClipboardCheck, FaBoxOpen, FaHourglassHalf } from "react-icons/fa";
import { formatCallDuration } from "../utils/phoneUtils";

const CARDS = [
  { key: "incoming", label: "Incoming Today", icon: FaPhoneVolume, color: "#3b82f6" },
  { key: "outgoing", label: "Outgoing Today", icon: FaPhoneAlt, color: "#22c55e" },
  { key: "missed", label: "Missed Today", icon: FaPhoneSlash, color: "#ef4444" },
  { key: "answered", label: "Answered", icon: FaClipboardCheck, color: "#22c55e" },
];

const ORDER_CARDS = [
  { key: "assignedOrders", label: "Assigned Orders", icon: FaBoxOpen, color: "#3b82f6" },
  { key: "completedOrders", label: "Completed", icon: FaClipboardCheck, color: "#22c55e" },
  { key: "pendingOrders", label: "Pending", icon: FaHourglassHalf, color: "#f59e0b" },
];

function Card({ label, value, icon: Icon, color }) {
  return (
    <div className="bg-[var(--color-surface)] border border-theme rounded-2xl p-4 flex items-center gap-3">
      <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ backgroundColor: `${color}22`, color }}>
        <Icon size={16} />
      </div>
      <div className="min-w-0">
        <p className="text-xl font-bold leading-tight">{value}</p>
        <p className="text-xs text-theme-muted truncate">{label}</p>
      </div>
    </div>
  );
}

export default function StatsCards({ stats }) {
  if (!stats) return null;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {CARDS.map((c) => <Card key={c.key} label={c.label} value={stats[c.key] ?? 0} icon={c.icon} color={c.color} />)}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="bg-[var(--color-surface)] border border-theme rounded-2xl p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 bg-emerald-500/15 text-emerald-400">
            <FaClock size={16} />
          </div>
          <div className="min-w-0">
            <p className="text-xl font-bold leading-tight">{formatCallDuration(stats.totalTalkTimeSeconds)}</p>
            <p className="text-xs text-theme-muted truncate">Total Talk Time</p>
          </div>
        </div>
        <div className="bg-[var(--color-surface)] border border-theme rounded-2xl p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 bg-blue-500/15 text-blue-400">
            <FaClock size={16} />
          </div>
          <div className="min-w-0">
            <p className="text-xl font-bold leading-tight">{formatCallDuration(stats.averageCallTimeSeconds)}</p>
            <p className="text-xs text-theme-muted truncate">Average Call Time</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {ORDER_CARDS.map((c) => <Card key={c.key} label={c.label} value={stats[c.key] ?? 0} icon={c.icon} color={c.color} />)}
      </div>
    </div>
  );
}
