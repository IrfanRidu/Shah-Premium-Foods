"use client";
import { useEffect, useRef, useState } from "react";
import { FaPhone, FaPrint } from "react-icons/fa";
import Axios from "@/lib/axios";
import api from "@/lib/api";
import { displayPrice, axiosToastError } from "@/lib/utils";
import { useSelector } from "react-redux";
import InvoiceModal from "@/components/InvoiceModal";
import toast from "react-hot-toast";

const STATUSES = ["All","Pending","Confirmed","On-Hold","On the way","Delivered","Cancelled","Return","Refunded"];
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

const POLL_MS = 30_000; // auto-refresh every 30 seconds

export default function AdminOrdersPage() {
  const currency = useSelector((s) => s.currency.baseCurrency); // item 7: admin reporting always shows the official base currency, not any personal storefront override
  const rates    = useSelector((s) => s.currency.rates);

  const [orders,       setOrders]       = useState([]);
  const [statusCounts, setStatusCounts] = useState({});
  const [activeTab,    setActiveTab]    = useState("All");
  const [loading,      setLoading]      = useState(true);
  const [expanded,     setExpanded]     = useState(null);
  const [invoicing,    setInvoicing]    = useState(null);
  const [newCount,     setNewCount]     = useState(0);
  const [refundingOrder, setRefundingOrder] = useState(null);
  const [refundNoteDraft, setRefundNoteDraft] = useState("");
  const [refunding,      setRefunding]      = useState(false);

  // Refs so the polling interval always reads the latest values without
  // needing to be re-created every time they change.
  const activeTabRef   = useRef("All");
  const prevPendingRef = useRef(-1); // -1 means "first load, don't notify yet"

  const load = async (status = "All", { silent = false } = {}) => {
    try {
      if (!silent) setLoading(true);
      const r = await Axios({ ...api.getAllOrders, params: { status, limit: 200 } });
      const fetchedOrders = r.data?.data || [];
      const counts        = r.data?.statusCounts || {};
      const pendingNow    = counts["Pending"] || 0;

      setOrders(fetchedOrders);
      setStatusCounts(counts);

      // Notify about genuinely new Pending orders (skip the very first load)
      if (silent && prevPendingRef.current >= 0 && pendingNow > prevPendingRef.current) {
        const diff = pendingNow - prevPendingRef.current;
        setNewCount((c) => c + diff);
        toast.success(`🛒 ${diff} new order${diff > 1 ? "s" : ""} arrived`, { duration: 5000 });
      }
      prevPendingRef.current = pendingNow;
    } catch (err) {
      if (!silent) axiosToastError(err);
    } finally {
      if (!silent) setLoading(false);
    }
  };

  // Initial load + background polling
  useEffect(() => {
    load("All");
    const intervalId = setInterval(
      () => load(activeTabRef.current, { silent: true }),
      POLL_MS
    );
    return () => clearInterval(intervalId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleTabChange = (tab) => {
    setActiveTab(tab);
    activeTabRef.current = tab;
    load(tab);
  };

  const updateStatus = async (orderId, newStatus, note = "") => {
    try {
      const r = await Axios({ ...api.updateOrderStatus, data: { orderId, order_status: newStatus, note } });
      if (r.data?.success) {
        setOrders((prev) => prev.map((o) => o._id === orderId
          ? { ...o, order_status: newStatus, ...(newStatus === "Refunded" ? { refundNote: note, refundedAt: new Date().toISOString() } : {}) }
          : o));
        toast.success(newStatus === "Refunded" ? "Order marked as refunded" : "Status updated");
      }
    } catch (err) { axiosToastError(err); }
  };

  const handleStatusSelect = (order, newStatus) => {
    if (newStatus === "Refunded") {
      // Refund needs a confirmation step + optional note before it's applied
      setRefundingOrder(order);
      setRefundNoteDraft("");
      return;
    }
    updateStatus(order._id, newStatus);
  };

  const confirmRefund = async () => {
    if (!refundingOrder) return;
    try {
      setRefunding(true);
      await updateStatus(refundingOrder._id, "Refunded", refundNoteDraft.trim());
      setRefundingOrder(null);
      setRefundNoteDraft("");
    } finally {
      setRefunding(false);
    }
  };

  const call = (phone) => {
    if (phone) window.location.href = `tel:${phone}`;
    else toast.error("No phone number available");
  };

  const totalCount = Object.values(statusCounts).reduce((s, v) => s + v, 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="section-heading text-2xl">All Orders</h1>
          <p className="text-sm text-theme-muted">
            {totalCount} orders total • Auto-refreshes every 30 s
          </p>
        </div>
        {newCount > 0 && (
          <button
            onClick={() => { load(activeTab); setNewCount(0); }}
            className="flex items-center gap-2 px-4 py-2 bg-green-500 text-white rounded-full text-sm font-semibold animate-pulse"
          >
            🔔 {newCount} new order{newCount > 1 ? "s" : ""} — Click to refresh
          </button>
        )}
      </div>

      {/* Status tabs */}
      <div className="flex gap-1 overflow-x-auto pb-1" style={{ scrollbarWidth:"none" }}>
        {STATUSES.map((s) => {
          const count = s === "All" ? totalCount : (statusCounts[s] || 0);
          return (
            <button
              key={s}
              onClick={() => handleTabChange(s)}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-all shrink-0
                ${activeTab === s
                  ? "bg-theme-primary text-white"
                  : "bg-[var(--color-surface)] border border-theme hover:border-theme-primary"}`}
            >
              {s}
              {count > 0 && (
                <span className={`text-xs font-bold px-1.5 py-0.5 rounded-full
                  ${activeTab === s ? "bg-white/30 text-white" : "bg-[var(--color-border)]"}`}>
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Orders list */}
      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="skeleton h-20 rounded-2xl" />
          ))}
        </div>
      ) : orders.length === 0 ? (
        <div className="text-center py-16 text-theme-muted">
          No {activeTab !== "All" ? activeTab : ""} orders found
        </div>
      ) : (
        <div className="space-y-3">
          {orders.map((order) => (
            <div key={order._id} className="bg-[var(--color-surface)] border border-theme rounded-2xl overflow-hidden">
              <div
                className="flex flex-wrap items-center gap-3 p-4 cursor-pointer"
                onClick={() => setExpanded(expanded === order._id ? null : order._id)}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-mono text-xs text-theme-muted">{order.orderId}</p>
                    <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${STATUS_COLOR[order.order_status] || "bg-gray-100 text-gray-700"}`}>
                      {order.order_status}
                    </span>
                  </div>
                  <p className="font-semibold text-sm mt-0.5 truncate">
                    {order.userId?.name || order.customerSnapshot?.name || "Customer"}
                    <span className="text-theme-muted font-normal ml-2 text-xs">
                      {order.userId?.email || order.customerSnapshot?.email}
                    </span>
                  </p>
                  <p className="text-xs text-theme-muted">{new Date(order.createdAt).toLocaleString()}</p>
                </div>

                <div className="action-group">
                  <span className="font-bold text-theme-primary">
                    {displayPrice(order.totalAmt, currency, rates)}
                  </span>

                  {/* Invoice / Shipping Label */}
                  <button
                    onClick={(e) => { e.stopPropagation(); setInvoicing(order); }}
                    title="Print Invoice / Shipping Label"
                    className="icon-btn-info"
                  >
                    <FaPrint size={13} />
                  </button>

                  {/* Call button */}
                  <button
                    onClick={(e) => { e.stopPropagation(); call(order.userId?.mobile || order.customerSnapshot?.mobile); }}
                    title="Call Customer"
                    className="icon-btn-call"
                  >
                    <FaPhone size={13} />
                  </button>

                  {/* Status selector — fixed h-9 (2.25rem) to match icon-btn siblings */}
                  <select
                    value={order.order_status}
                    onClick={(e) => e.stopPropagation()}
                    onChange={(e) => handleStatusSelect(order, e.target.value)}
                    className={`h-9 inline-flex items-center text-xs font-semibold rounded-full px-3 border-none outline-none cursor-pointer leading-none ${STATUS_COLOR[order.order_status] || "bg-gray-100 text-gray-700"}`}
                  >
                    {STATUSES.slice(1).map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
              </div>

              {/* Expanded details */}
              {expanded === order._id && (
                <div className="border-t border-theme p-4 bg-[var(--color-bg)] space-y-4">
                  <div className="grid sm:grid-cols-2 gap-4 text-sm">
                    <div>
                      <p className="font-semibold mb-1">Delivery Address</p>
                      {order.delivery_address
                        ? <p className="text-theme-muted">
                            {[order.delivery_address.address_line, order.delivery_address.city,
                              order.delivery_address.state, order.delivery_address.country]
                              .filter(Boolean).join(", ")}
                          </p>
                        : <p className="text-theme-muted">Not available</p>
                      }
                    </div>
                    <div>
                      <p className="font-semibold mb-1">Payment</p>
                      <p className="text-theme-muted">{order.payment_status}</p>
                      {order.couponCode && (
                        <p className="text-green-600 text-xs font-semibold mt-0.5">
                          Coupon: {order.couponCode} (saved {displayPrice(order.discountAmt, currency, rates)})
                        </p>
                      )}
                      <p className="text-xs text-theme-muted mt-0.5">
                        Subtotal {displayPrice(order.subTotalAmt, currency, rates)} + Delivery {displayPrice(order.deliveryCharge || 0, currency, rates)}
                        {order.deliveryZoneName ? ` (${order.deliveryZoneName})` : ""}
                      </p>
                      {order.deliveryChargePaidOnline && (
                        <p className="text-xs font-semibold text-blue-600 mt-1">
                          Cash to collect on delivery: {displayPrice(Math.max(0, order.totalAmt - order.deliveryCharge), currency, rates)}
                          <span className="font-normal text-theme-muted"> (delivery charge already paid online)</span>
                        </p>
                      )}
                    </div>
                  </div>

                  {order.order_status === "Refunded" && (
                    <div className="bg-purple-50 border border-purple-200 rounded-xl p-3 text-sm">
                      <p className="font-semibold text-purple-700">Refunded{order.refundedAt ? ` — ${new Date(order.refundedAt).toLocaleString()}` : ""}</p>
                      {order.refundNote && <p className="text-purple-600 text-xs mt-1">{order.refundNote}</p>}
                    </div>
                  )}

                  <div>
                    <p className="font-semibold mb-2 text-sm">Items ({order.productDetails?.length})</p>
                    <div className="space-y-2">
                      {order.productDetails?.map((item, i) => (
                        <div key={i} className="flex items-center gap-3">
                          {item.image?.[0] && (
                            <img src={item.image[0]} alt="" className="h-10 w-10 rounded-lg object-cover shrink-0" />
                          )}
                          <div className="flex-1 text-sm">
                            <p className="font-medium">{item.name}</p>
                            <p className="text-theme-muted text-xs">x{item.quantity} @ ৳{item.price}</p>
                          </div>
                          <p className="font-semibold text-sm">
                            {displayPrice(item.price * item.quantity, currency, rates)}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Status history */}
                  {order.statusHistory?.length > 0 && (
                    <div>
                      <p className="font-semibold mb-2 text-sm">Status History</p>
                      <div className="flex gap-2 overflow-x-auto pb-1">
                        {order.statusHistory.map((h, i) => (
                          <div key={i} className="shrink-0 flex flex-col items-center text-center">
                            <div className={`h-2.5 w-2.5 rounded-full mb-1 ${STATUS_COLOR[h.status]?.includes("green") ? "bg-green-500" : "bg-theme-muted"}`} />
                            <p className="text-[10px] font-semibold">{h.status}</p>
                            <p className="text-[9px] text-theme-muted">{new Date(h.changedAt).toLocaleDateString()}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {invoicing && (
        <InvoiceModal
          order={invoicing}
          currency={currency}
          rates={rates}
          onClose={() => setInvoicing(null)}
        />
      )}

      {refundingOrder && (
        <div className="modal-overlay" onClick={() => !refunding && setRefundingOrder(null)}>
          <div className="modal-box max-w-sm" onClick={(e) => e.stopPropagation()}>
            <h2 className="font-display text-lg font-bold mb-2">Mark order as Refunded?</h2>
            <p className="text-sm text-theme-muted mb-4">
              Order <span className="font-mono">{refundingOrder.orderId}</span> — {displayPrice(refundingOrder.totalAmt, currency, rates)}.
              This records the refund on the order. It does not automatically process a payment gateway refund.
            </p>
            <label className="block text-sm font-medium mb-1.5">Refund note (optional)</label>
            <textarea
              value={refundNoteDraft}
              onChange={(e) => setRefundNoteDraft(e.target.value)}
              rows={3}
              placeholder="e.g. Refunded via bKash, reason: damaged item"
              className="input-field resize-none mb-4"
            />
            <div className="flex gap-3 justify-end">
              <button onClick={() => setRefundingOrder(null)} disabled={refunding} className="btn-outline px-5 py-2">Cancel</button>
              <button onClick={confirmRefund} disabled={refunding} className="btn-primary px-5 py-2 bg-purple-600 hover:bg-purple-700">
                {refunding ? "Marking…" : "Mark as Refunded"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
