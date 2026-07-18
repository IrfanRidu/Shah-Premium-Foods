"use client";
import { useEffect, useState } from "react";
import { useSelector } from "react-redux";
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip } from "recharts";
import Axios from "@/lib/axios";
import api from "@/lib/api";
import { axiosToastError, displayPrice } from "@/lib/utils";
import { MetricCard, TabSection, DateRangePicker, LoadingBlock } from "./shared";

export default function InventorySalesTab() {
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
        const r = await Axios({ ...api.getInventorySalesMetrics, params: { from, to } });
        if (r.data?.success) setData(r.data.data);
      } catch (err) { axiosToastError(err); } finally { setLoading(false); }
    })();
  }, [from, to]);

  if (loading || !data) return <LoadingBlock />;
  const { inventoryMetrics: inv, salesMetrics: sale } = data;
  const dp = (v) => displayPrice(v, currency, rates);

  return (
    <div>
      <div className="mb-6"><DateRangePicker from={from} to={to} setFrom={setFrom} setTo={setTo} /></div>

      <TabSection title="Inventory Metrics">
        <MetricCard label="Inventory Value" value={inv.inventoryValue} format="currency" currency={currency} rates={rates} displayPrice={displayPrice} />
        <MetricCard label="Total Products" value={inv.totalProducts} />
        <MetricCard label="Total Variants" value={inv.totalVariants} sub="No variant system in this catalog" />
        <MetricCard label="Stock Quantity" value={inv.stockQuantity} />
        <MetricCard label="Low Stock Products" value={inv.lowStockCount} color="text-amber-600" />
        <MetricCard label="Out of Stock Products" value={inv.outOfStockCount} color="text-red-500" />
        <MetricCard label="Overstock Products" value={inv.overstockCount} />
        <MetricCard label="Dead Stock Value" value={inv.deadStockValue} format="currency" currency={currency} rates={rates} displayPrice={displayPrice} sub="Marked damaged in this period" />
        <MetricCard label="Inventory Turnover" value={inv.inventoryTurnover} sub="COGS ÷ Avg. Inventory (approx.)" />
        <MetricCard label="Days Inventory Outstanding" value={inv.dio} sub="365 ÷ Turnover" />
        <MetricCard label="Sell-Through Rate" value={inv.sellThroughRate} format="percent" />
      </TabSection>

      <TabSection title="Sales Metrics">
        <MetricCard label="Gross Sales" value={sale.grossSales} format="currency" currency={currency} rates={rates} displayPrice={displayPrice} />
        <MetricCard label="Net Sales" value={sale.netSales} format="currency" currency={currency} rates={rates} displayPrice={displayPrice} />
        <MetricCard label="Total Orders" value={sale.totalOrders} />
        <MetricCard label="Average Order Value" value={sale.aov} format="currency" currency={currency} rates={rates} displayPrice={displayPrice} />
        <MetricCard label="Average Items per Order" value={sale.avgItemsPerOrder} />
        <MetricCard label="Revenue per Customer" value={sale.revenuePerCustomer} format="currency" currency={currency} rates={rates} displayPrice={displayPrice} />
        <MetricCard label="Sales Growth" value={sale.salesGrowth} />
      </TabSection>

      <div className="bg-[var(--color-surface)] border border-theme rounded-2xl p-5">
        <h2 className="font-display text-lg font-semibold mb-4">Daily Sales</h2>
        {sale.dailySalesSeries.length === 0 ? (
          <p className="text-sm text-theme-muted">No delivered sales in this period yet.</p>
        ) : (
          <ResponsiveContainer width="100%" height={240}>
            <AreaChart data={sale.dailySalesSeries}>
              <defs>
                <linearGradient id="salesFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="var(--color-primary)" stopOpacity={0.35} />
                  <stop offset="95%" stopColor="var(--color-primary)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
              <XAxis dataKey="date" fontSize={11} />
              <YAxis fontSize={11} />
              <Tooltip formatter={(v) => dp(v)} />
              <Area type="monotone" dataKey="sales" stroke="var(--color-primary)" fill="url(#salesFill)" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
