"use client";
import { useEffect, useState, useMemo } from "react";
import { useSelector } from "react-redux";
import {
  ResponsiveContainer, LineChart, Line, AreaChart, Area, XAxis, YAxis,
  CartesianGrid, Tooltip, PieChart, Pie, Cell, BarChart, Bar, Legend,
} from "recharts";
import Axios from "@/lib/axios";
import api from "@/lib/api";
import { axiosToastError, displayPrice } from "@/lib/utils";

const METRIC = ({ label, value, sub, change, color = "text-theme-primary" }) => (
  <div className="bg-[var(--color-surface)] border border-theme rounded-2xl p-5">
    <p className="text-xs font-semibold uppercase tracking-widest text-theme-muted mb-1">{label}</p>
    <p className={`text-2xl font-bold ${color}`}>{value}</p>
    {sub  && <p className="text-xs text-theme-muted mt-0.5">{sub}</p>}
    {change !== undefined && (
      <p className={`text-xs font-semibold mt-1 ${change >= 0 ? "text-green-600" : "text-red-500"}`}>
        {change >= 0 ? "▲" : "▼"} {Math.abs(change)}% vs prev period
      </p>
    )}
  </div>
);

const STATUS_COLOR_HEX = {
  Pending: "#eab308", Confirmed: "#3b82f6", "On-Hold": "#6366f1",
  "On the way": "#a855f7", Delivered: "#22c55e", Cancelled: "#ef4444", Return: "#f97316",
};
const STATUS_COLOR = { Pending:"bg-yellow-100 text-yellow-700", Confirmed:"bg-blue-100 text-blue-700", "On-Hold":"bg-indigo-100 text-indigo-700", "On the way":"bg-purple-100 text-purple-700", Delivered:"bg-green-100 text-green-700", Cancelled:"bg-red-100 text-red-700", Return:"bg-orange-100 text-orange-700" };

export default function DashboardTab() {
  const currency = useSelector((s) => s.currency.baseCurrency); // item 7: admin reporting always shows the official base currency, not any personal storefront override
  const rates    = useSelector((s) => s.currency.rates);

  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(true);
  const [from,    setFrom]    = useState(() => {
    const d = new Date(); d.setDate(d.getDate() - 30); return d.toISOString().slice(0,10);
  });
  const [to, setTo] = useState(new Date().toISOString().slice(0,10));

  const load = async ({ silent = false } = {}) => {
    try {
      if (!silent) setLoading(true);
      const r = await Axios({ ...api.getDashboardMetrics, params: { from, to } });
      if (r.data?.success) setData(r.data.data);
    } catch (err) { if (!silent) axiosToastError(err); } finally { if (!silent) setLoading(false); }
  };

  useEffect(() => { load(); }, [from, to]);

  // Fix 3: background refresh every 30s so order counts / revenue figures
  // don't require a manual reload to reflect changes made elsewhere.
  useEffect(() => {
    const intervalId = setInterval(() => load({ silent: true }), 30_000);
    return () => clearInterval(intervalId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [from, to]);

  const fmt = (n) => displayPrice(n, currency, rates);

  const revenueChartData = useMemo(
    () => (data?.revenueByDay || []).map((d) => ({ date: d._id?.slice(5), revenue: d.revenue, orders: d.orders })),
    [data]
  );

  const statusPieData = useMemo(() => {
    if (!data?.ordersByStatus) return [];
    return Object.entries(data.ordersByStatus).map(([name, value]) => ({ name, value }));
  }, [data]);

  const topProductsChartData = useMemo(
    () => (data?.topProducts || []).slice(0, 8).map((p) => ({ name: p.name?.length > 16 ? p.name.slice(0, 16) + "…" : p.name, revenue: p.totalRevenue })),
    [data]
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><h1 className="section-heading text-2xl">Analytics Dashboard</h1><p className="text-sm text-theme-muted">Financial metrics for audit and fundraising — revenue is recognized on delivery</p></div>
        <div className="flex gap-2 items-center flex-wrap">
          <input type="date" value={from} onChange={e => setFrom(e.target.value)} className="input-field text-sm w-36"/>
          <span className="text-theme-muted text-sm">to</span>
          <input type="date" value={to}   onChange={e => setTo(e.target.value)}   className="input-field text-sm w-36"/>
          <button onClick={load} className="btn-primary px-4 py-2 text-sm">Refresh</button>
        </div>
      </div>

      {loading ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">{Array.from({length:8}).map((_,i) => <div key={i} className="skeleton h-28 rounded-2xl"/>)}</div>
      ) : data ? (
        <>
          {/* Revenue metrics */}
          <div>
            <h2 className="font-semibold mb-3 text-theme-muted text-xs uppercase tracking-widest">Revenue (Delivered Orders Only)</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <METRIC label="Gross Revenue"  value={fmt(data.revenue.gross)} change={data.revenue.change} />
              <METRIC label="Net Revenue"    value={fmt(data.revenue.net)} sub="After COGS, opex & delivery loss"/>
              <METRIC label="Total Discounts" value={fmt(data.totalDiscounts)} sub="Coupons & product discounts" color="text-orange-500"/>
              <METRIC label="COGS"           value={fmt(data.cogs)} sub="Cost of goods sold" color="text-theme-muted"/>
            </div>
          </div>

          {/* Profit metrics */}
          <div>
            <h2 className="font-semibold mb-3 text-theme-muted text-xs uppercase tracking-widest">Profit</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <METRIC label="Gross Profit"  value={fmt(data.profit.gross)} sub={`Gross Margin: ${data.profit.grossMargin}%`} color="text-green-600"/>
              <METRIC label="Net Profit"    value={fmt(data.profit.net)}   sub={`Net Margin: ${data.profit.netMargin}%`}   color={data.profit.net >= 0 ? "text-green-600" : "text-red-500"}/>
              <METRIC label="Operating Exp" value={fmt(data.operatingExp)} sub="Est. 12% of revenue" color="text-theme-muted"/>
              <METRIC label="AOV"           value={fmt(data.aov.current)} sub="Average Order Value (delivered)" change={data.aov.change}/>
            </div>
          </div>

          {/* Delivery & Returns */}
          <div>
            <h2 className="font-semibold mb-3 text-theme-muted text-xs uppercase tracking-widest">Delivery & Returns</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <METRIC label="Delivery Charges Collected" value={fmt(data.totalDeliveryCollected)} sub="From delivered orders" color="text-blue-500"/>
              <METRIC label="Delivery Loss (Returns)"    value={fmt(data.deliveryLoss)} sub="Shipping spent on returned orders" color="text-red-500"/>
              <METRIC label="Returned Orders"            value={data.returnedOrders.toLocaleString()} sub="In selected period" color="text-orange-500"/>
              <METRIC label="Orders Placed"              value={data.orders.totalPlaced.toLocaleString()} sub="All statuses, this period" />
            </div>
          </div>

          {/* Order & customer counts */}
          <div>
            <h2 className="font-semibold mb-3 text-theme-muted text-xs uppercase tracking-widest">Orders & Customers</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <METRIC label="Orders Delivered" value={data.orders.deliveredInRange.toLocaleString()} change={data.orders.change}/>
              <METRIC label="Total Products"   value={data.totalProducts.toLocaleString()} sub="Published products"/>
              <METRIC label="Total Customers"  value={data.totalUsers.toLocaleString()} sub="Registered users"/>
            </div>
          </div>

          {/* ── Charts ── */}
          <div className="grid lg:grid-cols-3 gap-4">
            {/* Revenue trend — area chart */}
            <div className="lg:col-span-2 bg-[var(--color-surface)] border border-theme rounded-2xl p-5">
              <h2 className="font-semibold mb-4">Revenue Trend (by Delivery Date)</h2>
              {revenueChartData.length === 0 ? (
                <p className="text-sm text-theme-muted text-center py-16">No delivered orders in this period yet.</p>
              ) : (
                <ResponsiveContainer width="100%" height={280}>
                  <AreaChart data={revenueChartData}>
                    <defs>
                      <linearGradient id="revGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="var(--color-primary)" stopOpacity={0.35}/>
                        <stop offset="95%" stopColor="var(--color-primary)" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                    <XAxis dataKey="date" tick={{ fontSize: 11 }} stroke="var(--color-muted)" />
                    <YAxis tick={{ fontSize: 11 }} stroke="var(--color-muted)" width={70} tickFormatter={(v) => fmt(v)} />
                    <Tooltip
                      contentStyle={{ background: "var(--color-surface)", border: "1px solid var(--color-border)", borderRadius: 8, fontSize: 12 }}
                      formatter={(value, name) => name === "revenue" ? [fmt(value), "Revenue"] : [value, "Orders"]}
                    />
                    <Area type="monotone" dataKey="revenue" stroke="var(--color-primary)" strokeWidth={2} fill="url(#revGradient)" />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </div>

            {/* Orders by status — pie chart */}
            <div className="bg-[var(--color-surface)] border border-theme rounded-2xl p-5">
              <h2 className="font-semibold mb-4">Orders by Status</h2>
              {statusPieData.length === 0 ? (
                <p className="text-sm text-theme-muted text-center py-16">No orders in this period.</p>
              ) : (
                <>
                  <ResponsiveContainer width="100%" height={200}>
                    <PieChart>
                      <Pie data={statusPieData} dataKey="value" nameKey="name" innerRadius={45} outerRadius={75} paddingAngle={2}>
                        {statusPieData.map((entry, i) => (
                          <Cell key={i} fill={STATUS_COLOR_HEX[entry.name] || "#94a3b8"} />
                        ))}
                      </Pie>
                      <Tooltip contentStyle={{ background: "var(--color-surface)", border: "1px solid var(--color-border)", borderRadius: 8, fontSize: 12 }} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="space-y-1 mt-2">
                    {statusPieData.map((s) => (
                      <div key={s.name} className="flex justify-between items-center text-xs">
                        <span className={`px-2 py-0.5 rounded-full font-semibold ${STATUS_COLOR[s.name] || "bg-gray-100 text-gray-700"}`}>{s.name}</span>
                        <span className="font-bold">{s.value}</span>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Top products — bar chart */}
          <div className="bg-[var(--color-surface)] border border-theme rounded-2xl p-5">
            <h2 className="font-semibold mb-4">Top 10 Products by Revenue (Delivered)</h2>
            {topProductsChartData.length === 0 ? (
              <p className="text-sm text-theme-muted text-center py-10">No delivered sales yet in this period.</p>
            ) : (
              <ResponsiveContainer width="100%" height={Math.max(240, topProductsChartData.length * 36)}>
                <BarChart data={topProductsChartData} layout="vertical" margin={{ left: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 11 }} stroke="var(--color-muted)" tickFormatter={(v) => fmt(v)} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} stroke="var(--color-muted)" width={120} />
                  <Tooltip
                    contentStyle={{ background: "var(--color-surface)", border: "1px solid var(--color-border)", borderRadius: 8, fontSize: 12 }}
                    formatter={(value) => [fmt(value), "Revenue"]}
                  />
                  <Bar dataKey="revenue" fill="var(--color-primary)" radius={[0, 6, 6, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>

          <p className="text-xs text-theme-muted text-center pb-4">
            Revenue and profit are recognized only on orders marked <strong>Delivered</strong>, attributed to the day delivery was confirmed —
            standard revenue-recognition practice. COGS uses cost-price snapshots stored on each order. Operating expenses are
            estimated at 12% of gross revenue. Delivery charges on orders later marked <strong>Return</strong> are booked as a pure loss.
            These figures are management accounts — for statutory/CA audit, reconcile with your accounting software.
          </p>
        </>
      ) : null}
    </div>
  );
}
