"use client";
import { Fragment, useEffect, useState } from "react";
import { useSelector } from "react-redux";
import { FaHistory, FaSearch } from "react-icons/fa";
import Axios from "@/lib/axios";
import api from "@/lib/api";
import { axiosToastError, isSuperAdmin } from "@/lib/utils";

// Section 13 (Admin Panel Security) — dashboard viewer for the persisted
// audit trail (see server/models/auditLog.model.js /
// apiObservability.js's logAuditEvent). Client-rendered like every other
// dashboard page in this app (see Section 9's own scope decision to keep
// the whole /dashboard tree client-side, unlike the storefront's
// product/category pages) — this is an internal admin tool, not something
// search engines or first-paint performance matter for the way they do on
// public pages, so there's no reason to break from the established
// dashboard pattern here specifically.
const METHOD_COLORS = {
  POST: "bg-green-100 text-green-700",
  PUT: "bg-blue-100 text-blue-700",
  PATCH: "bg-blue-100 text-blue-700",
  DELETE: "bg-red-100 text-red-700",
};

export default function AuditLogPage() {
  const user = useSelector((s) => s.user);
  const [logs, setLogs] = useState(null); // null = loading
  const [pagination, setPagination] = useState({ page: 1, totalPages: 1, total: 0 });
  const [filters, setFilters] = useState({ path: "", method: "", from: "", to: "" });
  const [expandedId, setExpandedId] = useState(null);

  const load = async (page = 1) => {
    setLogs(null);
    try {
      const params = { page, limit: 25 };
      if (filters.path) params.path = filters.path;
      if (filters.method) params.method = filters.method;
      if (filters.from) params.from = filters.from;
      if (filters.to) params.to = filters.to;
      const r = await Axios({ ...api.getAuditLogs, params });
      if (r.data?.success) {
        setLogs(r.data.data || []);
        setPagination(r.data.pagination || { page: 1, totalPages: 1, total: 0 });
      }
    } catch (err) {
      axiosToastError(err);
      setLogs([]);
    }
  };

  useEffect(() => { load(1); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  // This page is only reachable via the ADMIN_LINKS entry in
  // dashboard/layout.jsx, which already hides it from non-SUPERADMIN
  // accounts — this is defense-in-depth in case someone lands here
  // directly by URL, matching the real enforcement that already happens
  // server-side (superAdminOnly on the API route itself; this client
  // check alone could never be relied on for actual security).
  if (!isSuperAdmin(user.role)) {
    return <p className="text-sm text-theme-muted p-6">Super Admin access only.</p>;
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2">
        <FaHistory className="text-theme-primary" />
        <h1 className="font-display text-2xl font-bold">Audit Log</h1>
      </div>
      <p className="text-sm text-theme-muted">
        A record of every admin action that changed data — who, what, and when.
        Kept for 365 days.
      </p>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 items-end bg-[var(--color-surface)] border border-theme rounded-2xl p-4">
        <div>
          <label className="block text-xs text-theme-muted mb-1">Path contains</label>
          <input value={filters.path} onChange={(e) => setFilters((f) => ({ ...f, path: e.target.value }))}
            placeholder="/api/product" className="input-field text-sm w-48" />
        </div>
        <div>
          <label className="block text-xs text-theme-muted mb-1">Method</label>
          <select value={filters.method} onChange={(e) => setFilters((f) => ({ ...f, method: e.target.value }))} className="input-field text-sm">
            <option value="">All</option>
            <option value="POST">POST</option>
            <option value="PUT">PUT</option>
            <option value="PATCH">PATCH</option>
            <option value="DELETE">DELETE</option>
          </select>
        </div>
        <div>
          <label className="block text-xs text-theme-muted mb-1">From</label>
          <input type="date" value={filters.from} onChange={(e) => setFilters((f) => ({ ...f, from: e.target.value }))} className="input-field text-sm" />
        </div>
        <div>
          <label className="block text-xs text-theme-muted mb-1">To</label>
          <input type="date" value={filters.to} onChange={(e) => setFilters((f) => ({ ...f, to: e.target.value }))} className="input-field text-sm" />
        </div>
        <button onClick={() => load(1)} className="btn-primary px-4 py-2 text-sm flex items-center gap-2">
          <FaSearch size={12} /> Filter
        </button>
      </div>

      {/* Table */}
      <div className="bg-[var(--color-surface)] border border-theme rounded-2xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-[var(--color-bg)] text-left text-xs uppercase tracking-wider text-theme-muted">
            <tr>
              <th className="px-4 py-3">When</th>
              <th className="px-4 py-3">Admin</th>
              <th className="px-4 py-3">Action</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">IP</th>
            </tr>
          </thead>
          <tbody>
            {logs === null && (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-theme-muted">Loading…</td></tr>
            )}
            {logs?.length === 0 && (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-theme-muted">No matching audit entries.</td></tr>
            )}
            {logs?.map((log) => (
              <Fragment key={log._id}>
                <tr onClick={() => setExpandedId(expandedId === log._id ? null : log._id)}
                  className="border-t border-theme hover:bg-[var(--color-bg)] cursor-pointer">
                  <td className="px-4 py-3 whitespace-nowrap text-theme-muted">{new Date(log.createdAt).toLocaleString()}</td>
                  <td className="px-4 py-3">
                    <p className="font-medium">{log.userId?.name || "Unknown"}</p>
                    <p className="text-xs text-theme-muted">{log.userId?.email}</p>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full mr-2 ${METHOD_COLORS[log.method] || "bg-gray-100 text-gray-700"}`}>{log.method}</span>
                    <span className="font-mono text-xs">{log.path}</span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={log.status < 300 ? "text-green-600" : "text-red-600"}>{log.status}</span>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-theme-muted">{log.ip}</td>
                </tr>
                {expandedId === log._id && log.body && (
                  <tr className="border-t border-theme bg-[var(--color-bg)]">
                    <td colSpan={5} className="px-4 py-3">
                      <pre className="text-xs overflow-x-auto whitespace-pre-wrap">{JSON.stringify(log.body, null, 2)}</pre>
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {pagination.totalPages > 1 && (
        <div className="flex items-center justify-center gap-3 text-sm">
          <button disabled={pagination.page <= 1} onClick={() => load(pagination.page - 1)} className="btn-outline px-3 py-1.5 disabled:opacity-40">Previous</button>
          <span className="text-theme-muted">Page {pagination.page} of {pagination.totalPages} ({pagination.total} entries)</span>
          <button disabled={pagination.page >= pagination.totalPages} onClick={() => load(pagination.page + 1)} className="btn-outline px-3 py-1.5 disabled:opacity-40">Next</button>
        </div>
      )}
    </div>
  );
}
