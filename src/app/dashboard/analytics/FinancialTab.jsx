"use client";
import { useEffect, useState } from "react";
import { useSelector } from "react-redux";
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, BarChart, Bar,
} from "recharts";
import Axios from "@/lib/axios";
import api from "@/lib/api";
import { axiosToastError, displayPrice } from "@/lib/utils";
import { MetricCard, TabSection, DateRangePicker, LoadingBlock, MissingBanner } from "./shared";

export default function FinancialTab() {
  const currency = useSelector((s) => s.currency.baseCurrency); // item 7: admin reporting always shows the official base currency, not any personal storefront override
  const rates    = useSelector((s) => s.currency.rates);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [from, setFrom] = useState(() => { const d = new Date(); d.setDate(d.getDate() - 30); return d.toISOString().slice(0, 10); });
  const [to, setTo] = useState(new Date().toISOString().slice(0, 10));
  const [seriesGranularity, setSeriesGranularity] = useState("byDay");

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        const r = await Axios({ ...api.getFinancialMetrics, params: { from, to } });
        if (r.data?.success) setData(r.data.data);
      } catch (err) { axiosToastError(err); } finally { setLoading(false); }
    })();
  }, [from, to]);

  if (loading || !data) return <LoadingBlock />;
  const { revenueMetrics: r, revenueSeries, profitabilityMetrics: p, growthMetrics: g, dependenciesMissing } = data;
  const dp = (v) => displayPrice(v, currency, rates);

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <DateRangePicker from={from} to={to} setFrom={setFrom} setTo={setTo} />
      </div>
      <MissingBanner missing={dependenciesMissing} />

      <TabSection title="Revenue Metrics">
        <MetricCard label="Gross Revenue" value={r.grossRevenue} format="currency" currency={currency} rates={rates} displayPrice={displayPrice} />
        <MetricCard label="Net Revenue" value={r.netRevenue} format="currency" currency={currency} rates={rates} displayPrice={displayPrice} />
        <MetricCard label="Tax Collected" value={r.taxCollected} format="currency" currency={currency} rates={rates} displayPrice={displayPrice} />
        <MetricCard label="Discount Amount" value={r.discountAmount} format="currency" currency={currency} rates={rates} displayPrice={displayPrice} />
        <MetricCard label="Return Value" value={r.returnValue} format="currency" currency={currency} rates={rates} displayPrice={displayPrice} />
        <MetricCard label="Average Order Value" value={r.aov} format="currency" currency={currency} rates={rates} displayPrice={displayPrice} />
        <MetricCard label="Revenue per Customer" value={r.revenuePerCustomer} format="currency" currency={currency} rates={rates} displayPrice={displayPrice} />
        <MetricCard label="Revenue per Product" value={r.revenuePerProduct} format="currency" currency={currency} rates={rates} displayPrice={displayPrice} />
        <MetricCard label="Revenue Growth (MoM)" value={r.revenueGrowthMoM} />
        <MetricCard label="Revenue Growth (QoQ)" value={r.revenueGrowthQoQ} />
        <MetricCard label="Revenue Growth (YoY)" value={r.revenueGrowthYoY} />
      </TabSection>

      <div className="bg-[var(--color-surface)] border border-theme rounded-2xl p-5 mb-8">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-display text-lg font-semibold">Revenue Over Time</h2>
          <select value={seriesGranularity} onChange={(e) => setSeriesGranularity(e.target.value)} className="input-field py-1 text-xs w-auto">
            <option value="byDay">Daily</option>
            <option value="byWeek">Weekly</option>
            <option value="byMonth">Monthly</option>
            <option value="byQuarter">Quarterly</option>
            <option value="byYear">Yearly</option>
          </select>
        </div>
        <ResponsiveContainer width="100%" height={260}>
          <LineChart data={revenueSeries[seriesGranularity]}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
            <XAxis dataKey="period" fontSize={11} />
            <YAxis fontSize={11} />
            <Tooltip formatter={(v) => dp(v)} />
            <Line type="monotone" dataKey="revenue" stroke="var(--color-primary)" strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <TabSection title="Profitability Metrics">
        <MetricCard label="Gross Profit" value={p.grossProfit} format="currency" currency={currency} rates={rates} displayPrice={displayPrice} />
        <MetricCard label="Gross Margin" value={p.grossMargin} format="percent" />
        <MetricCard label="Operating Profit" value={p.operatingProfit} format="currency" currency={currency} rates={rates} displayPrice={displayPrice} />
        <MetricCard label="Operating Margin" value={p.operatingMargin} format="percent" />
        <MetricCard label="EBITDA" value={p.ebitda} format="currency" currency={currency} rates={rates} displayPrice={displayPrice} />
        <MetricCard label="Net Profit" value={p.netProfit} format="currency" currency={currency} rates={rates} displayPrice={displayPrice} />
        <MetricCard label="Net Profit Margin" value={p.netMargin} format="percent" />
        <MetricCard label="ROI" value={p.roi} format="percent" />
        <MetricCard label="ROE" value={p.roe} format="percent" />
        <MetricCard label="ROA" value={p.roa} format="percent" />
      </TabSection>

      <TabSection title="Growth Metrics" subtitle='Shows "New" when growing from zero (mathematically undefined % otherwise)'>
        <MetricCard label="Revenue Growth (MoM)" value={g.revenueGrowthMoM} />
        <MetricCard label="Revenue Growth (YoY)" value={g.revenueGrowthYoY} />
        <MetricCard label="Customer Growth" value={g.customerGrowth} />
        <MetricCard label="Product Growth" value={g.productGrowth} />
        <MetricCard label="Profit Growth" value={g.profitGrowth} />
      </TabSection>

      <div className="bg-[var(--color-surface)] border border-theme rounded-2xl p-5">
        <h2 className="font-display text-lg font-semibold mb-4">Top 10 Products by Revenue</h2>
        {r.top10Products.length === 0 ? (
          <p className="text-sm text-theme-muted">No sales in this period yet.</p>
        ) : (
          <ResponsiveContainer width="100%" height={Math.max(200, r.top10Products.length * 34)}>
            <BarChart data={r.top10Products} layout="vertical" margin={{ left: 40 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
              <XAxis type="number" fontSize={11} />
              <YAxis type="category" dataKey="name" fontSize={11} width={140} tick={{ width: 130 }} />
              <Tooltip formatter={(v) => dp(v)} />
              <Bar dataKey="totalRevenue" fill="var(--color-primary)" radius={[0, 6, 6, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
