"use client";
import { useEffect, useState, useCallback, useRef } from "react";
import { useSelector } from "react-redux";
import {
  FaHeadset, FaBox, FaUser, FaPhone, FaChevronDown, FaChevronUp,
  FaTicketAlt, FaClipboardList, FaSave, FaUserPlus, FaEdit, FaTrash,
} from "react-icons/fa";
import Axios from "@/lib/axios";
import api from "@/lib/api";
import { displayPrice, axiosToastError, isSuperAdmin } from "@/lib/utils";
import toast from "react-hot-toast";

const ORDER_STATUSES = ["All","Pending","Confirmed","On-Hold","On the way","Delivered","Cancelled","Return","Refunded"];
const STATUS_COLOR = {
  Pending:"bg-yellow-100 text-yellow-700",
  Confirmed:"bg-blue-100 text-blue-700",
  "On-Hold":"bg-indigo-100 text-indigo-700",
  "On the way":"bg-purple-100 text-purple-700",
  Delivered:"bg-green-100 text-green-700",
  Cancelled:"bg-red-100 text-red-700",
  Return:"bg-orange-100 text-orange-700",
  Refunded:"bg-purple-100 text-purple-700",
};
const TICKET_STATUSES = ["All","Open","In Progress","Resolved","Closed"];
const TICKET_STATUS_COLOR = {
  Open:"bg-red-100 text-red-700",
  "In Progress":"bg-blue-100 text-blue-700",
  Resolved:"bg-green-100 text-green-700",
  Closed:"bg-gray-100 text-gray-600",
};

// ─────────────────────────────────────────────────────────────────
// Orders tab — shows exactly what was asked for: the products, their
// quantity, their value, and the rest of the order details, sortable
// by status, with an inline control to update the order's status.
// ─────────────────────────────────────────────────────────────────
function OrdersTab() {
  const currency = useSelector((s) => s.currency.baseCurrency); // item 7: admin reporting always shows the official base currency, not any personal storefront override
  const rates    = useSelector((s) => s.currency.rates);

  const [orders,       setOrders]       = useState([]);
  const [statusCounts, setStatusCounts] = useState({});
  const [activeStatus, setActiveStatus] = useState("All");
  const [loading,      setLoading]      = useState(true);
  const [expanded,     setExpanded]     = useState(null);
  const [savingId,     setSavingId]     = useState(null);
  const activeStatusRef = useRef("All");

  const load = useCallback(async (status, { silent = false } = {}) => {
    try {
      if (!silent) setLoading(true);
      const r = await Axios({ ...api.getCareOrders, params: { status, limit: 200 } });
      setOrders(r.data?.data || []);
      setStatusCounts(r.data?.statusCounts || {});
    } catch (err) {
      if (!silent) axiosToastError(err);
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => { activeStatusRef.current = activeStatus; load(activeStatus); }, [activeStatus, load]);

  // Fix 3: background refresh every 30s so newly-placed orders and status
  // changes made elsewhere (e.g. from /dashboard/admin-orders) show up here
  // without the agent needing to manually reload the page.
  useEffect(() => {
    const intervalId = setInterval(() => load(activeStatusRef.current, { silent: true }), 30_000);
    return () => clearInterval(intervalId);
  }, [load]);

  // Fix 12: auto-log the instant a call is placed (reliable — it's just a
  // click). Duration/outcome can't be captured automatically from a tel:
  // link (the browser gets no callback once the device's phone app takes
  // over), so immediately after, offer a one-tap way to log what happened.
  const [pendingCallLog, setPendingCallLog] = useState(null);
  const handleCall = (order) => {
    const phone = order.userId?.mobile || order.customerSnapshot?.mobile;
    Axios({
      ...api.logCallInitiated,
      data: {
        orderId: order._id,
        customerName: order.userId?.name || order.customerSnapshot?.name || "",
        customerPhone: phone,
      },
    }).then((r) => {
      if (r.data?.data?._id) setPendingCallLog({ _id: r.data.data._id, customerName: order.userId?.name || order.customerSnapshot?.name });
    }).catch(() => {});
    // tel: navigation happens via the link's own href — this just logs alongside it
  };

  const handleStatusChange = async (order, newStatus) => {
    if (newStatus === order.order_status) return;
    try {
      setSavingId(order._id);
      const r = await Axios({
        ...api.updateCareOrderStatus,
        data: { orderId: order._id, order_status: newStatus },
      });
      if (r.data?.success) {
        toast.success(`Order marked ${newStatus}`);
        setOrders((prev) => prev.map((o) => o._id === order._id ? { ...o, order_status: newStatus } : o));
      }
    } catch (err) {
      axiosToastError(err);
    } finally {
      setSavingId(null);
    }
  };

  return (
    <div>
      {/* Status filter / sort pills — doubles as "sort by status" */}
      <div className="flex flex-wrap gap-2 mb-5">
        {ORDER_STATUSES.map((s) => (
          <button key={s} onClick={() => setActiveStatus(s)}
            className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-all ${
              activeStatus === s ? "bg-theme-primary text-white shadow-sm" : "bg-[var(--color-surface)] border border-theme hover:border-theme-primary/50"
            }`}>
            {s}
            {s !== "All" && statusCounts[s] > 0 && (
              <span className={`text-[10px] font-bold px-1.5 rounded-full ${activeStatus === s ? "bg-white/25" : "bg-[var(--color-border)]"}`}>
                {statusCounts[s]}
              </span>
            )}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-center py-16 text-theme-muted">Loading orders…</div>
      ) : orders.length === 0 ? (
        <div className="text-center py-16 text-theme-muted">No orders in this status.</div>
      ) : (
        <div className="space-y-3">
          {orders.map((order) => {
            const isOpen = expanded === order._id;
            const addr = order.delivery_address;
            return (
              <div key={order._id} className="bg-[var(--color-surface)] border border-theme rounded-2xl overflow-hidden">
                <button
                  onClick={() => setExpanded(isOpen ? null : order._id)}
                  className="w-full flex flex-wrap items-center gap-3 p-4 text-left"
                >
                  <span className={`text-xs font-bold px-2.5 py-1 rounded-full shrink-0 ${STATUS_COLOR[order.order_status] || "bg-gray-100 text-gray-600"}`}>
                    {order.order_status}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold truncate">
                      #{order.orderId} — {order.userId?.name || order.customerSnapshot?.name || "Guest"}
                    </p>
                    <p className="text-xs text-theme-muted">
                      {order.productDetails?.length || 0} item(s) · {new Date(order.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                  <span className="font-bold text-theme-primary shrink-0">{displayPrice(order.totalAmt, currency, rates)}</span>
                  {(order.userId?.mobile || order.customerSnapshot?.mobile) && (
                    <a
                      href={`tel:${order.userId?.mobile || order.customerSnapshot?.mobile}`}
                      onClick={(e) => { e.stopPropagation(); handleCall(order); }}
                      title="Call customer"
                      className="icon-btn shrink-0 text-theme-primary"
                    >
                      <FaPhone size={13} />
                    </a>
                  )}
                  {isOpen ? <FaChevronUp className="shrink-0 text-theme-muted" /> : <FaChevronDown className="shrink-0 text-theme-muted" />}
                </button>

                {isOpen && (
                  <div className="px-4 pb-4 border-t border-theme pt-4 space-y-4">
                    {/* Customer + contact */}
                    <div className="flex flex-wrap items-center gap-4 text-sm">
                      <span className="flex items-center gap-1.5 text-theme-muted"><FaUser size={12} /> {order.userId?.name || order.customerSnapshot?.name || "Guest"}</span>
                      {(order.userId?.mobile || order.customerSnapshot?.mobile) && (
                        <a
                          href={`tel:${order.userId?.mobile || order.customerSnapshot?.mobile}`}
                          onClick={() => handleCall(order)}
                          className="flex items-center gap-1.5 text-theme-primary hover:underline font-medium"
                        >
                          <FaPhone size={12} /> {order.userId?.mobile || order.customerSnapshot?.mobile}
                        </a>
                      )}
                      {addr && (
                        <span className="text-theme-muted">
                          {[addr.address_line, addr.city, addr.state].filter(Boolean).join(", ")}
                        </span>
                      )}
                      {(order.userId?.mobile || order.customerSnapshot?.mobile) && (
                        <a
                          href={`tel:${order.userId?.mobile || order.customerSnapshot?.mobile}`}
                          onClick={() => handleCall(order)}
                          className="ml-auto flex items-center gap-2 bg-theme-primary text-white text-xs font-bold px-3 py-1.5 rounded-full hover:opacity-90 transition-opacity shrink-0"
                        >
                          <FaPhone size={11} /> Call Customer
                        </a>
                      )}
                    </div>

                    {/* Products — name, quantity, value */}
                    <div className="space-y-2">
                      {order.productDetails?.map((item, i) => (
                        <div key={i} className="flex items-center gap-3 text-sm">
                          {item.image?.[0] && <img src={item.image[0]} alt="" className="h-10 w-10 rounded-lg object-cover shrink-0" />}
                          <span className="flex-1 min-w-0 truncate">{item.name}</span>
                          <span className="text-theme-muted shrink-0">Qty: {item.quantity}</span>
                          <span className="font-semibold shrink-0 w-20 text-right">{displayPrice(item.price * item.quantity, currency, rates)}</span>
                        </div>
                      ))}
                    </div>

                    <div className="flex justify-between text-sm pt-2 border-t border-theme">
                      <span className="text-theme-muted">Delivery charge</span>
                      <span>{displayPrice(order.deliveryCharge || 0, currency, rates)}</span>
                    </div>
                    <div className="flex justify-between text-sm font-bold">
                      <span>Total</span>
                      <span className="text-theme-primary">{displayPrice(order.totalAmt, currency, rates)}</span>
                    </div>

                    {/* Status update */}
                    <div className="flex items-center gap-2 pt-2">
                      <label className="text-sm font-medium text-theme-muted shrink-0">Update status:</label>
                      <select
                        value={order.order_status}
                        disabled={savingId === order._id}
                        onChange={(e) => handleStatusChange(order, e.target.value)}
                        className="input-field py-1.5 text-sm max-w-[180px]"
                      >
                        {ORDER_STATUSES.filter((s) => s !== "All").map((s) => <option key={s} value={s}>{s}</option>)}
                      </select>
                      {savingId === order._id && <span className="text-xs text-theme-muted">Saving…</span>}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {pendingCallLog && (
        <CallOutcomeModal log={pendingCallLog} onClose={() => setPendingCallLog(null)} />
      )}
    </div>
  );
}

// Fix 12: quick post-call log — this is the only part of duration/outcome
// tracking that can exist without a real telephony backend (see model file
// comment). Skippable; unlogged calls still count toward total call count,
// just without a duration.
const OUTCOMES = ["Confirmed", "No Answer", "Rescheduled", "Cancelled", "Other"];
function CallOutcomeModal({ log, onClose }) {
  const [outcome, setOutcome] = useState("Confirmed");
  const [minutes, setMinutes] = useState("");
  const [seconds, setSeconds] = useState("");
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    try {
      setSaving(true);
      const durationSeconds = (Number(minutes) || 0) * 60 + (Number(seconds) || 0);
      await Axios({ ...api.logCallOutcome, data: { _id: log._id, outcome, durationSeconds } });
      toast.success("Call logged");
      onClose();
    } catch (err) { axiosToastError(err); }
    finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
      <div className="bg-[var(--color-surface)] rounded-2xl w-full max-w-sm p-6">
        <h2 className="font-display text-lg font-semibold mb-1">Log this call</h2>
        <p className="text-sm text-theme-muted mb-4">
          {log.customerName ? `Call with ${log.customerName}` : "Quick outcome for that call"} — how did it go?
        </p>
        <div className="grid grid-cols-2 gap-2 mb-4">
          {OUTCOMES.map((o) => (
            <button key={o} onClick={() => setOutcome(o)}
              className={`text-sm font-medium px-3 py-2 rounded-lg border transition-all ${outcome === o ? "border-theme-primary bg-[color-mix(in_srgb,var(--color-primary)_10%,transparent)] text-theme-primary" : "border-theme hover:border-theme-primary/50"}`}>
              {o}
            </button>
          ))}
        </div>
        <label className="block text-sm font-medium mb-1.5">Call duration</label>
        <div className="flex items-center gap-2 mb-5">
          <input type="number" min="0" value={minutes} onChange={(e) => setMinutes(e.target.value)} placeholder="0" className="input-field text-sm w-20" />
          <span className="text-sm text-theme-muted">min</span>
          <input type="number" min="0" max="59" value={seconds} onChange={(e) => setSeconds(e.target.value)} placeholder="0" className="input-field text-sm w-20" />
          <span className="text-sm text-theme-muted">sec</span>
        </div>
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="btn-outline px-4 py-2 text-sm">Skip</button>
          <button onClick={handleSave} disabled={saving} className="btn-primary px-4 py-2 text-sm disabled:opacity-60">
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// Support Tickets tab
// ─────────────────────────────────────────────────────────────────
function TicketsTab() {
  const [tickets, setTickets]       = useState([]);
  const [counts,  setCounts]        = useState({});
  const [active,  setActive]        = useState("All");
  const [loading, setLoading]       = useState(true);
  const [expanded, setExpanded]     = useState(null);
  const [noteDraft, setNoteDraft]   = useState("");
  const [saving, setSaving]         = useState(false);

  const load = useCallback(async (status) => {
    try {
      setLoading(true);
      const r = await Axios({ ...api.getTickets, params: { status, limit: 100 } });
      setTickets(r.data?.data?.tickets || []);
      setCounts(r.data?.data?.statusCounts || {});
    } catch (err) {
      axiosToastError(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(active); }, [active, load]);

  const updateTicket = async (ticket, patch) => {
    try {
      setSaving(true);
      const r = await Axios({ ...api.updateTicket, data: { _id: ticket._id, ...patch } });
      if (r.data?.success) {
        toast.success("Ticket updated");
        setTickets((prev) => prev.map((t) => t._id === ticket._id ? r.data.data : t));
        setNoteDraft("");
      }
    } catch (err) {
      axiosToastError(err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <div className="flex flex-wrap gap-2 mb-5">
        {TICKET_STATUSES.map((s) => (
          <button key={s} onClick={() => setActive(s)}
            className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-all ${
              active === s ? "bg-theme-primary text-white shadow-sm" : "bg-[var(--color-surface)] border border-theme hover:border-theme-primary/50"
            }`}>
            {s}
            {s !== "All" && counts[s] > 0 && (
              <span className={`text-[10px] font-bold px-1.5 rounded-full ${active === s ? "bg-white/25" : "bg-[var(--color-border)]"}`}>
                {counts[s]}
              </span>
            )}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-center py-16 text-theme-muted">Loading tickets…</div>
      ) : tickets.length === 0 ? (
        <div className="text-center py-16 text-theme-muted">
          <FaTicketAlt className="mx-auto mb-2 text-2xl opacity-40" />
          No support tickets in this status.
        </div>
      ) : (
        <div className="space-y-3">
          {tickets.map((ticket) => {
            const isOpen = expanded === ticket._id;
            return (
              <div key={ticket._id} className="bg-[var(--color-surface)] border border-theme rounded-2xl overflow-hidden">
                <button onClick={() => setExpanded(isOpen ? null : ticket._id)}
                  className="w-full flex flex-wrap items-center gap-3 p-4 text-left">
                  <span className={`text-xs font-bold px-2.5 py-1 rounded-full shrink-0 ${TICKET_STATUS_COLOR[ticket.status] || "bg-gray-100 text-gray-600"}`}>
                    {ticket.status}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold truncate">{ticket.subject}</p>
                    <p className="text-xs text-theme-muted truncate">
                      {ticket.customerName || ticket.userId?.name || "Guest"} · {new Date(ticket.createdAt).toLocaleDateString()}
                      {ticket.orderId?.orderId && ` · Order #${ticket.orderId.orderId}`}
                    </p>
                  </div>
                  {isOpen ? <FaChevronUp className="shrink-0 text-theme-muted" /> : <FaChevronDown className="shrink-0 text-theme-muted" />}
                </button>

                {isOpen && (
                  <div className="px-4 pb-4 border-t border-theme pt-4 space-y-3 text-sm">
                    {ticket.message && <p className="text-theme-muted whitespace-pre-wrap">{ticket.message}</p>}
                    {(ticket.customerEmail || ticket.customerPhone) && (
                      <p className="text-xs text-theme-muted">
                        {ticket.customerEmail} {ticket.customerPhone && `· ${ticket.customerPhone}`}
                      </p>
                    )}

                    {ticket.notes?.length > 0 && (
                      <div className="space-y-1.5 bg-[var(--color-bg)] rounded-xl p-3">
                        {ticket.notes.map((n, i) => (
                          <p key={i} className="text-xs text-theme-muted">
                            <span className="font-medium text-theme">{new Date(n.addedAt).toLocaleString()}:</span> {n.note}
                          </p>
                        ))}
                      </div>
                    )}

                    <div className="flex flex-wrap items-center gap-2">
                      <select value={ticket.status} disabled={saving}
                        onChange={(e) => updateTicket(ticket, { status: e.target.value })}
                        className="input-field py-1.5 text-sm max-w-[160px]">
                        {TICKET_STATUSES.filter((s) => s !== "All").map((s) => <option key={s} value={s}>{s}</option>)}
                      </select>
                      <select value={ticket.priority || "Normal"} disabled={saving}
                        onChange={(e) => updateTicket(ticket, { priority: e.target.value })}
                        className="input-field py-1.5 text-sm max-w-[140px]">
                        {["Low","Normal","High","Urgent"].map((p) => <option key={p} value={p}>{p}</option>)}
                      </select>
                    </div>

                    <div className="flex gap-2">
                      <input value={noteDraft} onChange={(e) => setNoteDraft(e.target.value)}
                        placeholder="Add an internal note…" className="input-field text-sm flex-1" />
                      <button onClick={() => noteDraft.trim() && updateTicket(ticket, { note: noteDraft.trim() })}
                        disabled={saving || !noteDraft.trim()}
                        className="btn-outline px-3 py-1.5 text-sm flex items-center gap-1.5 shrink-0 disabled:opacity-50">
                        <FaSave size={11} /> Add note
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// Call Center tab — agents are Employees flagged isCallCenterAgent.
// Adding an agent can optionally create them a dashboard login scoped to
// the CALL_CENTER_AGENT role, which only ever grants Customer Care access
// (see callCenterAgent.controller.js's ensureAgentRole + the existing
// generic permission system — no special-casing needed in the sidebar).
// ─────────────────────────────────────────────────────────────────
const emptyAgentForm = { _id: null, name: "", email: "", phone: "", createLogin: false, password: "" };

function AgentModal({ initial, onClose, onSaved }) {
  const [form, setForm] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [createdCreds, setCreatedCreds] = useState(null);
  const isEdit = !!initial._id;

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const handleSave = async () => {
    if (!form.name.trim()) { toast.error("Name is required"); return; }
    if (form.createLogin && !form.email.trim()) { toast.error("Email is required to create a login"); return; }
    try {
      setSaving(true);
      if (isEdit) {
        const r = await Axios({ ...api.updateCallCenterAgent, data: { _id: form._id, name: form.name, email: form.email, phone: form.phone } });
        if (r.data?.success) { toast.success("Agent updated"); onSaved(); onClose(); }
      } else {
        const r = await Axios({ ...api.createCallCenterAgent, data: form });
        if (r.data?.success) {
          onSaved();
          if (r.data.tempPassword) {
            setCreatedCreds({ email: form.email, password: r.data.tempPassword });
          } else {
            toast.success("Agent added");
            onClose();
          }
        }
      }
    } catch (err) { axiosToastError(err); }
    finally { setSaving(false); }
  };

  // After creating a login, show the one-time temp password before closing —
  // it's never retrievable again after this.
  if (createdCreds) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
        <div className="bg-[var(--color-surface)] rounded-2xl w-full max-w-sm p-6 text-center">
          <h2 className="font-display text-lg font-semibold mb-2">Agent login created</h2>
          <p className="text-sm text-theme-muted mb-4">Share these with the agent now — the password won't be shown again.</p>
          <div className="bg-[var(--color-bg)] rounded-xl p-4 text-left text-sm space-y-1 mb-5">
            <p><span className="text-theme-muted">Email:</span> <strong>{createdCreds.email}</strong></p>
            <p><span className="text-theme-muted">Temp password:</span> <strong>{createdCreds.password}</strong></p>
          </div>
          <button onClick={onClose} className="btn-primary w-full py-2">Done</button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
      <div className="bg-[var(--color-surface)] rounded-2xl w-full max-w-md p-6">
        <h2 className="font-display text-lg font-semibold mb-4">{isEdit ? "Edit Agent" : "Add Call Center Agent"}</h2>
        <div className="space-y-3">
          <div>
            <label className="block text-sm font-medium mb-1.5">Full Name *</label>
            <input value={form.name} onChange={(e) => set("name", e.target.value)} className="input-field" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5">Email{form.createLogin ? " *" : ""}</label>
            <input value={form.email} onChange={(e) => set("email", e.target.value)} type="email" className="input-field" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5">Phone</label>
            <input value={form.phone} onChange={(e) => set("phone", e.target.value)} className="input-field" />
          </div>
          {!isEdit && (
            <div className="flex items-start gap-2 bg-[var(--color-bg)] rounded-xl p-3">
              <input type="checkbox" id="createLogin" checked={form.createLogin}
                onChange={(e) => set("createLogin", e.target.checked)}
                className="mt-0.5 accent-[var(--color-primary)]" />
              <label htmlFor="createLogin" className="text-sm cursor-pointer">
                Create a dashboard login for this agent
                <span className="block text-xs text-theme-muted mt-0.5">
                  They'll only be able to access the Customer Care dashboard — nothing else in admin.
                </span>
              </label>
            </div>
          )}
        </div>
        <div className="flex justify-end gap-2 mt-5">
          <button onClick={onClose} className="btn-outline px-4 py-2 text-sm">Cancel</button>
          <button onClick={handleSave} disabled={saving} className="btn-primary px-4 py-2 text-sm disabled:opacity-60">
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}

function CallCenterTab() {
  const [agents, setAgents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null);
  const [deleting, setDeleting] = useState(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const r = await Axios({ ...api.getCallCenterAgents });
      if (r.data?.success) setAgents(r.data.data || []);
    } catch (err) { axiosToastError(err); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const handleDelete = async () => {
    try {
      const r = await Axios({ ...api.deleteCallCenterAgent, data: { _id: deleting } });
      if (r.data?.success) { toast.success("Agent removed"); setDeleting(null); load(); }
    } catch (err) { axiosToastError(err); }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <p className="text-sm text-theme-muted max-w-md">
          Agents added here can see and update every order's status from this page.
          Give them a login and they'll only ever see Customer Care in their dashboard — nothing else.
        </p>
        <button onClick={() => setModal(emptyAgentForm)} className="btn-primary flex items-center gap-2 px-4 py-2 text-sm shrink-0">
          <FaUserPlus size={12} /> Add Agent
        </button>
      </div>

      {loading ? (
        <div className="text-center py-16 text-theme-muted">Loading agents…</div>
      ) : agents.length === 0 ? (
        <div className="text-center py-16 text-theme-muted">No call center agents yet.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-theme-muted border-b border-theme">
                <th className="py-2 pr-3 font-medium">Name</th>
                <th className="py-2 pr-3 font-medium">Email</th>
                <th className="py-2 pr-3 font-medium">Phone</th>
                <th className="py-2 pr-3 font-medium">Dashboard Login</th>
                <th className="py-2 pr-3 font-medium">Status</th>
                <th className="py-2 pr-3 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {agents.map((a) => (
                <tr key={a._id} className="border-b border-theme last:border-0">
                  <td className="py-2.5 pr-3 font-medium">{a.name}</td>
                  <td className="py-2.5 pr-3 text-theme-muted">{a.email || "—"}</td>
                  <td className="py-2.5 pr-3 text-theme-muted">
                    {a.phone ? <a href={`tel:${a.phone}`} className="text-theme-primary hover:underline">{a.phone}</a> : "—"}
                  </td>
                  <td className="py-2.5 pr-3">
                    {a.userId
                      ? <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-green-100 text-green-700">Customer Care only</span>
                      : <span className="text-xs text-theme-muted">No login</span>}
                  </td>
                  <td className="py-2.5 pr-3">
                    <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${a.status === "Active" ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-600"}`}>{a.status}</span>
                  </td>
                  <td className="py-2.5 pr-3">
                    <div className="action-group justify-end">
                      <button onClick={() => setModal(a)} className="icon-btn"><FaEdit size={13} /></button>
                      <button onClick={() => setDeleting(a._id)} className="icon-btn icon-btn-danger"><FaTrash size={13} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {modal && (
        <AgentModal
          initial={modal._id ? { _id: modal._id, name: modal.name, email: modal.email, phone: modal.phone } : emptyAgentForm}
          onClose={() => setModal(null)}
          onSaved={load}
        />
      )}

      {deleting && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
          <div className="bg-[var(--color-surface)] rounded-2xl w-full max-w-sm p-6 text-center">
            <p className="mb-5">Remove this agent? Their dashboard login (if any) will be suspended.</p>
            <div className="flex justify-center gap-3">
              <button onClick={() => setDeleting(null)} className="btn-outline px-4 py-2 text-sm">Cancel</button>
              <button onClick={handleDelete} className="px-4 py-2 text-sm rounded-xl bg-red-500 text-white hover:bg-red-600">Remove</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function CallHistoryTab() {
  const currency = useSelector((s) => s.currency.baseCurrency); // item 7: admin reporting always shows the official base currency, not any personal storefront override
  const rates    = useSelector((s) => s.currency.rates);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [from, setFrom] = useState(() => { const d = new Date(); d.setDate(d.getDate() - 30); return d.toISOString().slice(0, 10); });
  const [to, setTo] = useState(new Date().toISOString().slice(0, 10));

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        const r = await Axios({ ...api.getCallHistory, params: { from, to } });
        if (r.data?.success) setData(r.data.data);
      } catch (err) { axiosToastError(err); } finally { setLoading(false); }
    })();
  }, [from, to]);

  const fmtDuration = (secs) => {
    if (!secs) return "—";
    const m = Math.floor(secs / 60), s = Math.round(secs % 60);
    return `${m}m ${s}s`;
  };

  if (loading) return <div className="text-center py-16 text-theme-muted">Loading call history…</div>;
  if (!data) return null;

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div className="flex items-center gap-2">
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="input-field py-1.5 text-sm w-auto" />
          <span className="text-theme-muted text-sm">to</span>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="input-field py-1.5 text-sm w-auto" />
        </div>
        <span className="text-sm text-theme-muted">{data.totalCalls} total calls in this period</span>
      </div>

      <div className="bg-[var(--color-surface)] border border-theme rounded-2xl p-5 mb-6">
        <h2 className="font-display text-lg font-semibold mb-4">Per-Agent Summary</h2>
        {data.perAgent.length === 0 ? (
          <p className="text-sm text-theme-muted">No calls logged in this period yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-theme-muted border-b border-theme">
                  <th className="py-2 pr-3 font-medium">Agent</th>
                  <th className="py-2 pr-3 font-medium">Total Calls</th>
                  <th className="py-2 pr-3 font-medium">Confirmed</th>
                  <th className="py-2 pr-3 font-medium">No Answer</th>
                  <th className="py-2 pr-3 font-medium">Avg Duration</th>
                  <th className="py-2 pr-3 font-medium">Total Duration</th>
                </tr>
              </thead>
              <tbody>
                {data.perAgent.map((a) => (
                  <tr key={a._id} className="border-b border-theme last:border-0">
                    <td className="py-2.5 pr-3 font-medium">{a.agentName || "Unknown agent"}</td>
                    <td className="py-2.5 pr-3">{a.totalCalls}</td>
                    <td className="py-2.5 pr-3 text-green-600">{a.confirmed}</td>
                    <td className="py-2.5 pr-3 text-amber-600">{a.noAnswer}</td>
                    <td className="py-2.5 pr-3">{fmtDuration(a.avgDurationSeconds)}</td>
                    <td className="py-2.5 pr-3">{fmtDuration(a.totalDurationSeconds)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="bg-[var(--color-surface)] border border-theme rounded-2xl p-5">
        <h2 className="font-display text-lg font-semibold mb-4">Recent Calls</h2>
        {data.recentLogs.length === 0 ? (
          <p className="text-sm text-theme-muted">No calls yet.</p>
        ) : (
          <div className="overflow-x-auto max-h-96 overflow-y-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-theme-muted border-b border-theme sticky top-0 bg-[var(--color-surface)]">
                  <th className="py-2 pr-3 font-medium">When</th>
                  <th className="py-2 pr-3 font-medium">Agent</th>
                  <th className="py-2 pr-3 font-medium">Customer</th>
                  <th className="py-2 pr-3 font-medium">Order</th>
                  <th className="py-2 pr-3 font-medium">Outcome</th>
                  <th className="py-2 pr-3 font-medium">Duration</th>
                </tr>
              </thead>
              <tbody>
                {data.recentLogs.map((log) => (
                  <tr key={log._id} className="border-b border-theme last:border-0">
                    <td className="py-2 pr-3 text-theme-muted whitespace-nowrap">{new Date(log.createdAt).toLocaleString()}</td>
                    <td className="py-2 pr-3">{log.agentId?.name || "—"}</td>
                    <td className="py-2 pr-3">{log.customerName || "—"}</td>
                    <td className="py-2 pr-3">{log.orderId?.orderId || "—"}</td>
                    <td className="py-2 pr-3">
                      {log.outcomeLogged
                        ? <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${log.outcome === "Confirmed" ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-600"}`}>{log.outcome}</span>
                        : <span className="text-xs text-amber-600">Not logged</span>}
                    </td>
                    <td className="py-2 pr-3">{fmtDuration(log.durationSeconds)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

export default function CustomerCarePage() {
  const [tab, setTab] = useState("orders");
  const user = useSelector((s) => s.user);
  const permissions = useSelector((s) => s.permissions.permissions);
  // Fix 12: call history is cross-agent reporting, gated like the sidebar's
  // Analytics link — visible to super admin, legacy full-access admins, or
  // anyone explicitly granted analytics view, not to a restricted
  // customerCare-only call center agent.
  const canSeeCallHistory = isSuperAdmin(user.role) || (user.role === "ADMIN" && !permissions?.analytics) || !!permissions?.analytics?.view;

  return (
    <div>
      <div className="flex items-center gap-2 mb-6">
        <FaHeadset className="text-2xl text-theme-primary" />
        <h1 className="section-heading text-2xl">Customer Care</h1>
      </div>

      <div className="flex gap-2 mb-6 border-b border-theme overflow-x-auto">
        <button onClick={() => setTab("orders")}
          className={`flex items-center gap-2 px-4 py-2.5 text-sm font-semibold border-b-2 transition-colors shrink-0 ${tab === "orders" ? "border-theme-primary text-theme-primary" : "border-transparent text-theme-muted hover:text-theme"}`}>
          <FaClipboardList size={13} /> Orders
        </button>
        <button onClick={() => setTab("tickets")}
          className={`flex items-center gap-2 px-4 py-2.5 text-sm font-semibold border-b-2 transition-colors shrink-0 ${tab === "tickets" ? "border-theme-primary text-theme-primary" : "border-transparent text-theme-muted hover:text-theme"}`}>
          <FaTicketAlt size={13} /> Support Tickets
        </button>
        <button onClick={() => setTab("callcenter")}
          className={`flex items-center gap-2 px-4 py-2.5 text-sm font-semibold border-b-2 transition-colors shrink-0 ${tab === "callcenter" ? "border-theme-primary text-theme-primary" : "border-transparent text-theme-muted hover:text-theme"}`}>
          <FaUserPlus size={13} /> Call Center
        </button>
        {canSeeCallHistory && (
          <button onClick={() => setTab("callhistory")}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-semibold border-b-2 transition-colors shrink-0 ${tab === "callhistory" ? "border-theme-primary text-theme-primary" : "border-transparent text-theme-muted hover:text-theme"}`}>
            <FaPhone size={13} /> Call History
          </button>
        )}
      </div>

      {tab === "orders" ? <OrdersTab />
        : tab === "tickets" ? <TicketsTab />
        : tab === "callcenter" ? <CallCenterTab />
        : <CallHistoryTab />}
    </div>
  );
}
