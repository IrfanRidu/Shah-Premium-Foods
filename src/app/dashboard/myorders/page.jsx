"use client";
import { useState, useEffect } from "react";
import { useSelector, useDispatch } from "react-redux";
import Axios from "@/lib/axios";
import api from "@/lib/api";
import { displayPrice, axiosToastError } from "@/lib/utils";
import { setOrder } from "@/store/orderSlice";
import { useGlobalContext } from "@/providers/GlobalProvider";
import NoData from "@/components/NoData";
import ConfirmBox from "@/components/ConfirmBox";
import InvoiceModal from "@/components/InvoiceModal";
import toast from "react-hot-toast";

const STATUS_COLOR = {
  Pending:    "bg-yellow-100 text-yellow-700",
  Confirmed:  "bg-blue-100 text-blue-700",
  "On-Hold": "bg-indigo-100 text-indigo-700",
  "On the way": "bg-purple-100 text-purple-700",
  Delivered:  "bg-green-100 text-green-700",
  Cancelled:  "bg-red-100 text-red-700",
  Return:     "bg-orange-100 text-orange-700",
  Refunded:   "bg-purple-100 text-purple-700",
};

const FLOW = ["Pending", "Confirmed", "On-Hold", "On the way", "Delivered"];

export default function MyOrdersPage() {
  const orders   = useSelector((s) => s.order.order);
  const currency = useSelector((s) => s.currency.selected);
  const rates    = useSelector((s) => s.currency.rates);
  const dispatch = useDispatch();
  const { fetchOrders } = useGlobalContext();
  const [cancelling, setCancelling] = useState(null);
  const [invoicing,  setInvoicing]  = useState(null);
  const [refreshing, setRefreshing] = useState(true);

  // Always pull the freshest order list when this page is opened, regardless
  // of how the shopper navigated here (don't rely solely on the one-time
  // fetch GlobalProvider does at app boot).
  useEffect(() => {
    fetchOrders().finally(() => setRefreshing(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleCancel = async () => {
    try {
      const r = await Axios({ ...api.cancelOwnOrder, data: { orderId: cancelling } });
      if (r.data?.success) {
        dispatch(setOrder(orders.map((o) => o._id === cancelling ? r.data.data : o)));
        toast.success("Order cancelled");
      }
    } catch (err) { axiosToastError(err); }
    finally { setCancelling(null); }
  };

  if (refreshing && orders.length === 0) return (
    <div>
      <h1 className="section-heading text-2xl mb-6">My Orders</h1>
      <div className="space-y-3">{Array.from({ length: 3 }).map((_, i) => <div key={i} className="skeleton h-32 rounded-2xl" />)}</div>
    </div>
  );

  if (orders.length === 0) return (
    <div>
      <h1 className="section-heading text-2xl mb-6">My Orders</h1>
      <NoData message="No orders yet" description="Place your first order to see it here" />
    </div>
  );

  return (
    <div>
      <h1 className="section-heading text-2xl mb-6">My Orders ({orders.length})</h1>
      <div className="space-y-4">
        {orders.map((order) => {
          const canCancel = ["Pending", "Confirmed"].includes(order.order_status);
          const flowIdx = FLOW.indexOf(order.order_status);
          const isTerminalBad = ["Cancelled", "Return", "Refunded"].includes(order.order_status);

          return (
            <div key={order._id} className="bg-[var(--color-surface)] border border-theme rounded-2xl p-5">
              <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
                <div>
                  <p className="text-xs text-theme-muted mb-0.5">Order ID</p>
                  <p className="font-mono text-sm font-semibold">{order.orderId || order._id}</p>
                </div>
                <span className={`px-3 py-1 rounded-full text-xs font-semibold ${STATUS_COLOR[order.order_status] || "bg-gray-100 text-gray-700"}`}>
                  {order.order_status}
                </span>
              </div>

              {/* Progress timeline (only for active, non-cancelled orders) */}
              {!isTerminalBad && (
                <div className="flex items-center mb-4 px-1">
                  {FLOW.map((step, i) => (
                    <div key={step} className="flex items-center flex-1 last:flex-none">
                      <div className="flex flex-col items-center gap-1">
                        <div className={`h-3 w-3 rounded-full ${i <= flowIdx ? "bg-theme-primary" : "bg-[var(--color-border)]"}`} />
                        <span className={`text-[10px] whitespace-nowrap ${i <= flowIdx ? "text-theme font-medium" : "text-theme-muted"}`}>{step}</span>
                      </div>
                      {i < FLOW.length - 1 && <div className={`flex-1 h-0.5 mb-4 ${i < flowIdx ? "bg-theme-primary" : "bg-[var(--color-border)]"}`} />}
                    </div>
                  ))}
                </div>
              )}

              {/* Items */}
              <div className="flex gap-3 overflow-x-auto pb-1 mb-4">
                {order.productDetails?.map?.((item, i) => (
                  <div key={i} className="shrink-0 flex items-center gap-2 bg-[var(--color-bg)] border border-theme rounded-xl p-2 min-w-[160px]">
                    {item.image?.[0] && <img src={item.image[0]} alt={item.name} className="h-12 w-12 rounded-lg object-cover" />}
                    <div className="min-w-0">
                      <p className="text-xs font-medium truncate">{item.name}</p>
                      <p className="text-xs text-theme-muted">x{item.quantity}</p>
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex justify-between items-center text-sm">
                <span className="text-theme-muted">{new Date(order.createdAt).toLocaleDateString("en-BD", { dateStyle: "medium" })}</span>
                <div className="flex items-center gap-3">
                  {order.couponCode && <span className="text-xs text-green-600 font-semibold">Coupon: {order.couponCode}</span>}
                  <span className="font-bold text-theme-primary">{displayPrice(order.totalAmt, currency, rates)}</span>
                </div>
              </div>
              {order.deliveryCharge > 0 && (
                <p className="text-xs text-theme-muted mt-1">Includes {displayPrice(order.deliveryCharge, currency, rates)} delivery charge{order.deliveryZoneName ? ` (${order.deliveryZoneName})` : ""}</p>
              )}

              {order.deliveryChargePaidOnline && (
                <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 mt-2 text-xs">
                  <p className="text-blue-700 font-semibold">Delivery charge already paid online ✓</p>
                  <p className="text-blue-600 mt-0.5">Cash due on delivery: {displayPrice(Math.max(0, order.totalAmt - order.deliveryCharge), currency, rates)}</p>
                </div>
              )}

              {order.order_status === "Refunded" && (
                <div className="bg-purple-50 border border-purple-200 rounded-xl p-3 mt-3 text-sm">
                  <p className="font-semibold text-purple-700">
                    Refunded{order.refundedAt ? ` on ${new Date(order.refundedAt).toLocaleDateString()}` : ""}
                  </p>
                  {order.refundNote && <p className="text-purple-600 text-xs mt-1">{order.refundNote}</p>}
                </div>
              )}

              <div className="flex items-center gap-4 mt-3">
                {canCancel && (
                  <button onClick={() => setCancelling(order._id)}
                    className="text-xs font-semibold text-red-500 hover:underline">
                    Cancel this order
                  </button>
                )}
                <button onClick={() => setInvoicing(order)} className="text-xs font-semibold text-theme-primary hover:underline">
                  View Invoice
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {cancelling && (
        <ConfirmBox
          title="Cancel this order?"
          message="Your items will be restocked and this action cannot be undone."
          danger confirmLabel="Cancel Order"
          onConfirm={handleCancel}
          onCancel={() => setCancelling(null)}
        />
      )}

      {invoicing && (
        <InvoiceModal order={invoicing} currency={currency} rates={rates} onClose={() => setInvoicing(null)} />
      )}
    </div>
  );
}
