"use client";
import { FaPhoneAlt, FaPhoneVolume, FaPlayCircle } from "react-icons/fa";
import { formatCallDuration } from "../utils/phoneUtils";

const STATUS_STYLE = {
  answered: { label: "Answered", color: "#22c55e" },
  completed: { label: "Completed", color: "#22c55e" },
  missed: { label: "Missed", color: "#ef4444" },
  rejected: { label: "Rejected", color: "#ef4444" },
  abandoned: { label: "Abandoned", color: "#f59e0b" },
  ringing: { label: "Ringing", color: "#3b82f6" },
  queued: { label: "Queued", color: "#f59e0b" },
};

export default function RecentCalls({ calls }) {
  if (!calls?.length) {
    return (
      <div className="bg-[var(--color-surface)] border border-theme rounded-2xl p-6 text-center text-sm text-theme-muted">
        No calls yet.
      </div>
    );
  }

  return (
    <div className="bg-[var(--color-surface)] border border-theme rounded-2xl divide-y divide-[var(--color-border)] overflow-hidden">
      {calls.map((call) => {
        const status = STATUS_STYLE[call.status] || STATUS_STYLE[call.outcome === "Confirmed" ? "answered" : "missed"] || { label: call.status || "Logged", color: "#6b7280" };
        const DirIcon = call.direction === "inbound" ? FaPhoneVolume : FaPhoneAlt;

        return (
          <div key={call._id} className="flex items-center gap-3 p-3">
            <div className="w-9 h-9 rounded-full flex items-center justify-center shrink-0" style={{ backgroundColor: `${status.color}22`, color: status.color }}>
              <DirIcon size={13} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold truncate">{call.customerName || call.customerPhone || "Unknown"}</p>
              <p className="text-xs text-theme-muted truncate">
                {new Date(call.createdAt).toLocaleString()} {call.orderId?.orderId ? `· #${call.orderId.orderId}` : ""}
              </p>
            </div>
            <div className="text-right shrink-0">
              <p className="text-xs font-semibold" style={{ color: status.color }}>{status.label}</p>
              {call.durationSeconds > 0 && <p className="text-xs text-theme-muted">{formatCallDuration(call.durationSeconds)}</p>}
            </div>
            {call.recording?.fileUrl && (
              <a href={call.recording.fileUrl} target="_blank" rel="noopener noreferrer" title="Play recording" className="icon-btn shrink-0">
                <FaPlayCircle size={15} />
              </a>
            )}
          </div>
        );
      })}
    </div>
  );
}
