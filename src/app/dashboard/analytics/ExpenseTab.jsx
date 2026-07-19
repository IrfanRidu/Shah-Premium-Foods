"use client";
import { useEffect, useState } from "react";
import { useSelector } from "react-redux";
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip, Legend, LineChart, Line, XAxis, YAxis, CartesianGrid } from "recharts";
import Axios from "@/lib/axios";
import api from "@/lib/api";
import { axiosToastError, displayPrice } from "@/lib/utils";
import { MetricCard, DateRangePicker, LoadingBlock } from "./shared";

const COLORS = ["#4A7860", "#C08040", "#3b82f6", "#a855f7", "#ef4444", "#eab308", "#22c55e", "#6366f1", "#f97316", "#14b8a6", "#ec4899", "#84cc16", "#0ea5e9", "#f43f5e"];

export default function ExpenseTab() {
  // Fix (explicit request): all analytics tabs now follow `selected`
  // instead of `baseCurrency`, so every metric on this page reacts to BOTH
  // triggers -- the site base currency changing in Site Settings, AND
  // picking a different currency from the navbar switcher (by an admin or
  // any user) -- same as the Settings tab already does (see that file's
  // own comment for the original single-tab version of this fix).
  // `selected` already is exactly that union: it tracks baseCurrency
  // automatically until a personal navbar override is set (see
  // currencySlice.js).
  const currency = useSelector((s) => s.currency.selected);
  const rates    = useSelector((s) => s.currency.rates);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [from, setFrom] = useState(() => { const d = new Date(); d.setDate(d.getDate() - 30); return d.toISOString().slice(0, 10); });
  const [to, setTo] = useState(new Date().toISOString().slice(0, 10));

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        const r = await Axios({ ...api.getExpenseAnalysis, params: { from, to } });
        if (r.data?.success) setData(r.data.data);
      } catch (err) { axiosToastError(err); } finally { setLoading(false); }
    })();
  }, [from, to]);

  if (loading || !data) return <LoadingBlock />;
  const dp = (v) => displayPrice(v, currency, rates);
  const pieData = data.categories.filter((c) => c.proratedValue !== null && c.proratedValue > 0)
    .map((c) => ({ name: c.label, value: c.proratedValue }));

  return (
    <div>
      <div className="mb-6"><DateRangePicker from={from} to={to} setFrom={setFrom} setTo={setTo} /></div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
        <MetricCard label="Total (prorated to range)" value={data.proratedTotal} format="currency" currency={currency} rates={rates} displayPrice={displayPrice} />
        <MetricCard label="Monthly Total" value={data.monthlyTotal} format="currency" currency={currency} rates={rates} displayPrice={displayPrice} />
        <MetricCard label="Expense-to-Revenue Ratio" value={data.expenseToRevenueRatio} format="percent" />
        <MetricCard label="Revenue in Range" value={data.revenueInRange} format="currency" currency={currency} rates={rates} displayPrice={displayPrice} />
      </div>

      {!data.allSet && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 mb-6 text-xs text-amber-700">
          Missing from Settings: <strong>{data.missing.join(", ")}</strong> — the total above only reflects categories that are set.
        </div>
      )}

      <div className="grid md:grid-cols-2 gap-5 mb-8">
        <div className="bg-[var(--color-surface)] border border-theme rounded-2xl p-5">
          <h2 className="font-display text-lg font-semibold mb-4">Breakdown by Category</h2>
          {pieData.length === 0 ? (
            <p className="text-sm text-theme-muted">Enter expense figures in the Settings tab to see this chart.</p>
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie data={pieData} dataKey="value" nameKey="name" outerRadius={90} label={(e) => `${e.name}`}>
                  {pieData.map((entry, i) => <Cell key={entry.name} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip formatter={(v) => dp(v)} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="bg-[var(--color-surface)] border border-theme rounded-2xl p-5">
          <h2 className="font-display text-lg font-semibold mb-1">6-Month Trend</h2>
          <p className="text-xs text-theme-muted mb-4">{data.trendNote}</p>
          {data.allSet ? (
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={data.trend}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                <XAxis dataKey="month" fontSize={11} />
                <YAxis fontSize={11} />
                <Tooltip formatter={(v) => dp(v)} />
                <Line type="monotone" dataKey="total" stroke="var(--color-secondary)" strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-sm text-theme-muted py-10 text-center">Complete all expense fields in Settings to see this trend.</p>
          )}
        </div>
      </div>

      <div className="bg-[var(--color-surface)] border border-theme rounded-2xl p-5">
        <h2 className="font-display text-lg font-semibold mb-4">All Categories</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-theme-muted border-b border-theme">
                <th className="py-2 pr-3 font-medium">Category</th>
                <th className="py-2 pr-3 font-medium">Monthly</th>
                <th className="py-2 pr-3 font-medium">Prorated to Range</th>
                <th className="py-2 pr-3 font-medium">% of Total</th>
              </tr>
            </thead>
            <tbody>
              {data.categories.map((c) => (
                <tr key={c.key} className="border-b border-theme last:border-0">
                  <td className="py-2 pr-3">{c.label}</td>
                  <td className="py-2 pr-3">{c.monthlyValue === null ? <span className="text-amber-600">Not set</span> : dp(c.monthlyValue)}</td>
                  <td className="py-2 pr-3">{c.proratedValue === null ? "—" : dp(c.proratedValue)}</td>
                  <td className="py-2 pr-3">{c.shareOfTotal === null ? "—" : `${c.shareOfTotal}%`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
