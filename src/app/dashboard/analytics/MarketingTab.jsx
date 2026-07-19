"use client";
import { useEffect, useState } from "react";
import { useSelector } from "react-redux";
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip } from "recharts";
import Axios from "@/lib/axios";
import api from "@/lib/api";
import { axiosToastError, displayPrice } from "@/lib/utils";
import { MetricCard, TabSection, DateRangePicker, LoadingBlock } from "./shared";

export default function MarketingTab() {
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
  const [activity, setActivity] = useState(null);
  const [loading, setLoading] = useState(true);
  const [from, setFrom] = useState(() => { const d = new Date(); d.setDate(d.getDate() - 30); return d.toISOString().slice(0, 10); });
  const [to, setTo] = useState(new Date().toISOString().slice(0, 10));

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        const [mR, aR] = await Promise.all([
          Axios({ ...api.getMarketingMetrics, params: { from, to } }),
          Axios({ ...api.getActivitySummary, params: { from, to } }),
        ]);
        if (mR.data?.success) setData(mR.data.data);
        if (aR.data?.success) setActivity(aR.data.data);
      } catch (err) { axiosToastError(err); } finally { setLoading(false); }
    })();
  }, [from, to]);

  if (loading || !data) return <LoadingBlock />;
  const { marketingMetrics: m, websitePerformance: w } = data;

  return (
    <div>
      <div className="mb-6"><DateRangePicker from={from} to={to} setFrom={setFrom} setTo={setTo} /></div>

      <TabSection title="Marketing Metrics">
        <MetricCard label="Website Visitors" value={m.websiteVisitors} />
        <MetricCard label="Sessions" value={m.sessions} />
        <MetricCard label="Unique Visitors" value={m.uniqueVisitors} />
        <MetricCard label="Conversion Rate" value={m.conversionRate} format="percent" color="text-green-600" />
        <MetricCard label="Bounce Rate" value={m.bounceRate} format="percent" />
        <MetricCard label="Cart Abandonment Rate" value={m.cartAbandonmentRate} format="percent" sub="Logged-in sessions only" />
        <MetricCard label="Checkout Completion Rate" value={m.checkoutCompletionRate} format="percent" />
        <MetricCard label="Cost per Click" value={m.cpc} format="currency" currency={currency} rates={rates} displayPrice={displayPrice} />
        <MetricCard label="Cost per Acquisition" value={m.cpa} format="currency" currency={currency} rates={rates} displayPrice={displayPrice} />
        <MetricCard label="Return on Ad Spend" value={m.roas} />
        <MetricCard label="Email Open Rate" value={m.emailOpenRate} format="percent" />
        <MetricCard label="Email Click Rate" value={m.emailClickRate} format="percent" />
      </TabSection>

      <TabSection title="Website Performance">
        <MetricCard label="Homepage Views" value={w.homepageViews} />
        <MetricCard label="Product Views" value={w.productViews} />
        <MetricCard label="Category Views" value={w.categoryViews} />
        <MetricCard label="Searches Performed" value={w.searchesPerformed} />
        <MetricCard label="Avg Session Duration" value={w.avgSessionDurationSec} format="duration" />
        <MetricCard label="Pages per Session" value={w.pagesPerSession} />
        <MetricCard label="Exit Rate" value={w.exitRate} format="percent" />
        <MetricCard label="New Visitors" value={w.newVisitors} />
        <MetricCard label="Returning Visitors" value={w.returningVisitors} />
        <MetricCard label="Mobile vs Desktop" value={w.deviceBreakdown} />
        <MetricCard label="Peak Sales Hour" value={w.peakSalesHour ?? "—"} />
      </TabSection>

      {activity && (
        <>
          <div className="bg-[var(--color-surface)] border border-theme rounded-2xl p-5 mb-8">
            <h2 className="font-display text-lg font-semibold mb-4">Activity Over Time</h2>
            <p className="text-xs text-theme-muted mb-3">{activity.totalEvents.toLocaleString()} tracked events · {activity.totalSessions.toLocaleString()} sessions in this period</p>
            {activity.dailyActivity.length === 0 ? (
              <p className="text-sm text-theme-muted">No activity tracked in this period yet.</p>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={activity.dailyActivity}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                  <XAxis dataKey="_id" fontSize={11} />
                  <YAxis fontSize={11} />
                  <Tooltip />
                  <Line type="monotone" dataKey="count" name="Events" stroke="var(--color-primary)" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="sessionCount" name="Sessions" stroke="var(--color-secondary)" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>

          <div className="grid md:grid-cols-2 gap-5">
            <div className="bg-[var(--color-surface)] border border-theme rounded-2xl p-5">
              <h2 className="font-display text-lg font-semibold mb-4">Top Searches</h2>
              {activity.topSearches.length === 0 ? <p className="text-sm text-theme-muted">No searches yet.</p> : (
                <ul className="space-y-2">
                  {activity.topSearches.map((s) => (
                    <li key={s.query} className="flex items-center justify-between text-sm">
                      <span className="truncate">{s.query}</span>
                      <span className="text-theme-muted shrink-0 ml-2">{s.count}×</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="bg-[var(--color-surface)] border border-theme rounded-2xl p-5">
              <h2 className="font-display text-lg font-semibold mb-4">Most Viewed Products</h2>
              {activity.topViewedProducts.length === 0 ? <p className="text-sm text-theme-muted">No product views yet.</p> : (
                <ul className="space-y-2">
                  {activity.topViewedProducts.map((p) => (
                    <li key={p._id} className="flex items-center gap-2 text-sm">
                      {p.image && <img src={p.image} alt="" className="h-8 w-8 rounded-lg object-cover shrink-0" />}
                      <span className="truncate flex-1">{p.name || "Unknown product"}</span>
                      <span className="text-theme-muted shrink-0">{p.count}×</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
