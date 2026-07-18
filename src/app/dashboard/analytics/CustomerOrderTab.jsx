"use client";
import { useEffect, useState } from "react";
import { useSelector } from "react-redux";
import { ResponsiveContainer, PieChart, Pie, Cell, Legend, Tooltip } from "recharts";
import Axios from "@/lib/axios";
import api from "@/lib/api";
import { axiosToastError, displayPrice } from "@/lib/utils";
import { MetricCard, TabSection, DateRangePicker, LoadingBlock } from "./shared";

const ORDER_COLORS = { Pending: "#eab308", Completed: "#22c55e", Cancelled: "#ef4444", Returned: "#f97316" };

export default function CustomerOrderTab() {
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
        const r = await Axios({ ...api.getCustomerOrderMetrics, params: { from, to } });
        if (r.data?.success) setData(r.data.data);
      } catch (err) { axiosToastError(err); } finally { setLoading(false); }
    })();
  }, [from, to]);

  if (loading || !data) return <LoadingBlock />;
  const { orderMetrics: o, customerMetrics: c, paymentMetrics: pay } = data;
  const dp = (v) => displayPrice(v, currency, rates);

  const pieData = [
    { name: "Pending", value: o.pendingOrders },
    { name: "Completed", value: o.ordersCompleted },
    { name: "Cancelled", value: o.ordersCancelled },
    { name: "Returned", value: o.ordersReturned },
  ].filter((d) => d.value > 0);

  return (
    <div>
      <div className="mb-6"><DateRangePicker from={from} to={to} setFrom={setFrom} setTo={setTo} /></div>

      <TabSection title="Order Metrics">
        <MetricCard label="Orders Received" value={o.ordersReceived} />
        <MetricCard label="Orders Completed" value={o.ordersCompleted} color="text-green-600" />
        <MetricCard label="Orders Cancelled" value={o.ordersCancelled} color="text-red-500" />
        <MetricCard label="Orders Returned" value={o.ordersReturned} color="text-orange-500" />
        <MetricCard label="Pending Orders" value={o.pendingOrders} />
        <MetricCard label="Processing Orders" value={o.processingOrders} />
        <MetricCard label="Delivered Orders" value={o.deliveredOrders} />
        <MetricCard label="Cancellation Rate" value={o.cancellationRate} format="percent" />
        <MetricCard label="Return Rate" value={o.returnRate} format="percent" />
        <MetricCard label="Fulfillment Rate" value={o.fulfillmentRate} format="percent" color="text-green-600" />
      </TabSection>

      {pieData.length > 0 && (
        <div className="bg-[var(--color-surface)] border border-theme rounded-2xl p-5 mb-8 max-w-md">
          <h2 className="font-display text-lg font-semibold mb-4">Order Status Split</h2>
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie data={pieData} dataKey="value" nameKey="name" innerRadius={50} outerRadius={80} paddingAngle={3}>
                {pieData.map((entry) => <Cell key={entry.name} fill={ORDER_COLORS[entry.name]} />)}
              </Pie>
              <Tooltip />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </div>
      )}

      <TabSection title="Customer Metrics">
        <MetricCard label="Total Customers" value={c.totalCustomers} />
        <MetricCard label="New Customers" value={c.newCustomers} color="text-green-600" />
        <MetricCard label="Returning Customers" value={c.returningCustomers} />
        <MetricCard label="Customer Growth" value={c.customerGrowth} />
        <MetricCard label="Active Customers" value={c.activeCustomers} />
        <MetricCard label="Inactive Customers" value={c.inactiveCustomers} />
        <MetricCard label="Repeat Purchase Rate" value={c.repeatPurchaseRate} format="percent" />
        <MetricCard label="Customer Retention Rate" value={c.retentionRate} format="percent" />
        <MetricCard label="Customer Churn Rate" value={c.churnRate} format="percent" color="text-red-500" />
        <MetricCard label="Customer Lifetime Value" value={c.clv} format="currency" currency={currency} rates={rates} displayPrice={displayPrice} />
        <MetricCard label="Customer Acquisition Cost" value={c.cac} format="currency" currency={currency} rates={rates} displayPrice={displayPrice} />
        <MetricCard label="Avg Items per Order" value={c.avgItemsPerOrder} />
        <MetricCard label="Revenue per Customer" value={c.revenuePerCustomer} format="currency" currency={currency} rates={rates} displayPrice={displayPrice} />
      </TabSection>

      <TabSection title="Payment Metrics" subtitle="This system processes Cash on Delivery + card payments only — other gateways are honestly reported as not tracked">
        <MetricCard label="Cash Sales" value={pay.cashSales} format="currency" currency={currency} rates={rates} displayPrice={displayPrice} />
        <MetricCard label="Card Sales" value={pay.cardSales} format="currency" currency={currency} rates={rates} displayPrice={displayPrice} />
        <MetricCard label="Mobile Banking Sales" value={pay.mobileBankingSales} format="currency" currency={currency} rates={rates} displayPrice={displayPrice} />
        <MetricCard label="Bank Transfer Sales" value={pay.bankTransferSales} format="currency" currency={currency} rates={rates} displayPrice={displayPrice} />
        <MetricCard label="COD Orders" value={pay.codOrders} />
        <MetricCard label="COD Success Rate" value={pay.codSuccessRate} format="percent" />
        <MetricCard label="Failed Payment Rate" value={pay.failedPaymentRate} format="percent" />
        <MetricCard label="Payment Gateway Success Rate" value={pay.paymentGatewaySuccessRate} format="percent" />
        <MetricCard label="Refund Amount" value={pay.refundAmount} format="currency" currency={currency} rates={rates} displayPrice={displayPrice} />
        <MetricCard label="Refund Rate" value={pay.refundRate} format="percent" />
      </TabSection>
    </div>
  );
}
