"use client";
import { useEffect, useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { FaBell, FaShoppingBag, FaTicketAlt, FaInfoCircle } from "react-icons/fa";
import Axios from "@/lib/axios";
import api from "@/lib/api";

const ICONS = { new_order: FaShoppingBag, new_ticket: FaTicketAlt, system: FaInfoCircle };

function timeAgo(date) {
  const secs = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
  if (secs < 60) return "just now";
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
  if (secs < 86400) return `${Math.floor(secs / 3600)}h ago`;
  return `${Math.floor(secs / 86400)}d ago`;
}

export default function NotificationBell() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const ref = useRef(null);

  const load = useCallback(async () => {
    try {
      const r = await Axios({ ...api.getNotifications });
      if (r.data?.success) {
        setNotifications(r.data.data.notifications || []);
        setUnreadCount(r.data.data.unreadCount || 0);
      }
    } catch {}
  }, []);

  useEffect(() => {
    load();
    // Fix 4 / Fix 3: poll for new notifications so the badge shows up
    // without needing a manual refresh.
    const intervalId = setInterval(load, 20_000);
    return () => clearInterval(intervalId);
  }, [load]);

  useEffect(() => {
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  const handleClick = async (n) => {
    if (!n.isRead) {
      setNotifications((prev) => prev.map((x) => x._id === n._id ? { ...x, isRead: true } : x));
      setUnreadCount((c) => Math.max(0, c - 1));
      Axios({ ...api.markNotificationRead, data: { _id: n._id } }).catch(() => {});
    }
    setOpen(false);
    if (n.link) router.push(n.link);
  };

  const markAllRead = async () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
    setUnreadCount(0);
    try { await Axios({ ...api.markAllNotificationsRead }); } catch {}
  };

  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setOpen((o) => !o)} className="relative p-2 rounded-full hover:bg-[var(--color-border)] transition-colors" aria-label="Notifications">
        <FaBell size={17} />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 bg-red-500 text-white text-[10px] font-bold rounded-full h-[18px] min-w-[18px] px-1 flex items-center justify-center leading-none">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-80 max-w-[90vw] bg-[var(--color-surface)] border border-theme rounded-xl shadow-xl z-50 overflow-hidden animate-slide-up">
          <div className="flex items-center justify-between px-4 py-3 border-b border-theme">
            <span className="font-semibold text-sm">Notifications</span>
            {unreadCount > 0 && (
              <button onClick={markAllRead} className="text-xs text-theme-primary hover:underline">Mark all read</button>
            )}
          </div>
          <div className="max-h-96 overflow-y-auto">
            {notifications.length === 0 ? (
              <p className="text-center text-sm text-theme-muted py-10">No notifications yet.</p>
            ) : (
              notifications.map((n) => {
                const Icon = ICONS[n.type] || FaInfoCircle;
                return (
                  <button key={n._id} onClick={() => handleClick(n)}
                    className={`w-full flex items-start gap-3 px-4 py-3 text-left border-b border-theme last:border-0 hover:bg-[var(--color-border)] transition-colors ${!n.isRead ? "bg-[color-mix(in_srgb,var(--color-primary)_6%,transparent)]" : ""}`}>
                    <span className={`mt-0.5 shrink-0 h-7 w-7 rounded-full flex items-center justify-center ${!n.isRead ? "bg-theme-primary text-white" : "bg-[var(--color-border)] text-theme-muted"}`}>
                      <Icon size={12} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className={`block text-sm ${!n.isRead ? "font-semibold" : ""}`}>{n.title}</span>
                      {n.message && <span className="block text-xs text-theme-muted truncate">{n.message}</span>}
                      <span className="block text-[11px] text-theme-muted mt-0.5">{timeAgo(n.createdAt)}</span>
                    </span>
                    {!n.isRead && <span className="h-2 w-2 rounded-full bg-theme-primary shrink-0 mt-1.5" />}
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
