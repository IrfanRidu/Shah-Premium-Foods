"use client";
import { useEffect, useState } from "react";
import Axios from "@/lib/axios";
import { displayPrice, axiosToastError } from "@/lib/utils";
import { FaTimes } from "react-icons/fa";
import OrderTimeline from "@/modules/callcenter/components/OrderTimeline";

const TABS = [
  { key: "all", label: "All Orders" },
  { key: "mine", label: "My Orders", scope: "mine" },
  { key: "pending", label: "Pending" },
  { key: "completed", label: "Completed" },
  { key: "follow-up", label: "Follow-up" },
  { key: "cancelled", label: "Cancelled" },
];

// Spec: "Agents can view: All Orders, My Orders, Pending, Completed,
// Follow-up, Cancelled." "My Orders" is a SCOPE (assignedAgent = me),
// the other 5 are TABS filtering on order_status/followUp — kept as one
// unified tab bar since that's how the spec lists them, with "mine"
// internally mapped to scope=mine + tab=all.
export default function CrmOrdersPage() {
  const [activeTab, setActiveTab] = useState("all");
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedOrderId, setSelectedOrderId] = useState(null);

  useEffect(() => {
    setLoading(true);
    const tabConfig = TABS.find((t) => t.key === activeTab);
    const scope = tabConfig?.scope || "all";
    const tab = tabConfig?.scope ? "all" : activeTab;

    Axios.get("/api/callcenter/orders", { params: { scope, tab, limit: 50 } })
      .then(({ data }) => setOrders(data?.data?.orders || []))
      .catch(axiosToastError)
      .finally(() => setLoading(false));
  }, [activeTab]);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="section-heading text-2xl">Orders</h1>
        <p className="text-sm text-theme-muted mt-1">Assignment, follow-up, and full timeline for every order.</p>
      </div>

      <div className="flex flex-wrap gap-2">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setActiveTab(t.key)}
            className={`text-xs font-semibold px-3 py-1.5 rounded-full border transition-colors ${
              activeTab === t.key ? "bg-theme-primary text-white border-theme-primary" : "border-theme text-theme-muted hover:text-theme"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="text-sm text-theme-muted p-8 text-center">Loading orders…</p>
      ) : orders.length === 0 ? (
        <div className="bg-[var(--color-surface)] border border-theme rounded-2xl p-8 text-center text-sm text-theme-muted">
          No orders in this view.
        </div>
      ) : (
        <div className="bg-[var(--color-surface)] border border-theme rounded-2xl divide-y divide-[var(--color-border)] overflow-hidden">
          {orders.map((o) => (
            <button
              key={o._id}
              onClick={() => setSelectedOrderId(o._id)}
              className="w-full flex items-center gap-3 p-3 text-left hover:bg-[var(--color-border)]/30 transition-colors"
            >
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold truncate">#{o.orderId} · {o.userId?.name || o.customerSnapshot?.name || "Customer"}</p>
                <p className="text-xs text-theme-muted truncate">
                  {o.order_status} {o.assignedAgent?.name ? `· Assigned to ${o.assignedAgent.name}` : "· Unassigned"}
                  {o.followUp?.scheduled ? " · Follow-up scheduled" : ""}
                </p>
              </div>
              <p className="text-sm font-bold shrink-0">{displayPrice(o.totalAmt ?? 0)}</p>
            </button>
          ))}
        </div>
      )}

      {selectedOrderId && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/50" onClick={() => setSelectedOrderId(null)}>
          <div className="w-full max-w-md h-full bg-[var(--color-surface)] border-l border-theme p-5 overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold">Order Timeline</h2>
              <button onClick={() => setSelectedOrderId(null)} className="icon-btn"><FaTimes size={14} /></button>
            </div>
            <OrderTimeline orderId={selectedOrderId} />
          </div>
        </div>
      )}
    </div>
  );
}
