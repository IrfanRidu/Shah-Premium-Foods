"use client";
import { useEffect, useState } from "react";
import { useSelector } from "react-redux";
import Axios from "@/lib/axios";
import api from "@/lib/api";
import { axiosToastError, displayPrice } from "@/lib/utils";
import toast from "react-hot-toast";
import { MetricCard, DateRangePicker, LoadingBlock } from "./shared";
import { FaToggleOn } from "react-icons/fa";

// Flat registry of every metric across every tab. `path` walks the combined
// data bag built below. Grouped by `category` for display. This mirrors —
// rather than recomputes — the other tabs' numbers, so Business Analysis is
// guaranteed to always agree with them.
const REGISTRY = [
  // Financial — Revenue
  { id: "grossRevenue", label: "Gross Revenue", category: "Revenue", path: "financial.revenueMetrics.grossRevenue", format: "currency" },
  { id: "netRevenue", label: "Net Revenue", category: "Revenue", path: "financial.revenueMetrics.netRevenue", format: "currency" },
  { id: "taxCollected", label: "Tax Collected", category: "Revenue", path: "financial.revenueMetrics.taxCollected", format: "currency" },
  { id: "discountAmount", label: "Discount Amount", category: "Revenue", path: "financial.revenueMetrics.discountAmount", format: "currency" },
  { id: "returnValue", label: "Return Value", category: "Revenue", path: "financial.revenueMetrics.returnValue", format: "currency" },
  { id: "aov", label: "Average Order Value", category: "Revenue", path: "financial.revenueMetrics.aov", format: "currency" },
  { id: "revenuePerCustomer", label: "Revenue per Customer", category: "Revenue", path: "financial.revenueMetrics.revenuePerCustomer", format: "currency" },
  { id: "revenuePerProduct", label: "Revenue per Product", category: "Revenue", path: "financial.revenueMetrics.revenuePerProduct", format: "currency" },
  { id: "revenueGrowthMoM", label: "Revenue Growth (MoM)", category: "Revenue", path: "financial.revenueMetrics.revenueGrowthMoM" },
  { id: "revenueGrowthQoQ", label: "Revenue Growth (QoQ)", category: "Revenue", path: "financial.revenueMetrics.revenueGrowthQoQ" },
  { id: "revenueGrowthYoY", label: "Revenue Growth (YoY)", category: "Revenue", path: "financial.revenueMetrics.revenueGrowthYoY" },
  // Financial — Profitability
  { id: "grossProfit", label: "Gross Profit", category: "Profitability", path: "financial.profitabilityMetrics.grossProfit", format: "currency" },
  { id: "grossMargin", label: "Gross Margin", category: "Profitability", path: "financial.profitabilityMetrics.grossMargin", format: "percent" },
  { id: "operatingProfit", label: "Operating Profit", category: "Profitability", path: "financial.profitabilityMetrics.operatingProfit", format: "currency" },
  { id: "operatingMargin", label: "Operating Margin", category: "Profitability", path: "financial.profitabilityMetrics.operatingMargin", format: "percent" },
  { id: "ebitda", label: "EBITDA", category: "Profitability", path: "financial.profitabilityMetrics.ebitda", format: "currency" },
  { id: "netProfit", label: "Net Profit", category: "Profitability", path: "financial.profitabilityMetrics.netProfit", format: "currency" },
  { id: "netMargin", label: "Net Profit Margin", category: "Profitability", path: "financial.profitabilityMetrics.netMargin", format: "percent" },
  { id: "roi", label: "ROI", category: "Profitability", path: "financial.profitabilityMetrics.roi", format: "percent" },
  { id: "roe", label: "ROE", category: "Profitability", path: "financial.profitabilityMetrics.roe", format: "percent" },
  { id: "roa", label: "ROA", category: "Profitability", path: "financial.profitabilityMetrics.roa", format: "percent" },
  // Growth
  { id: "customerGrowthF", label: "Customer Growth", category: "Growth", path: "financial.growthMetrics.customerGrowth" },
  { id: "productGrowth", label: "Product Growth", category: "Growth", path: "financial.growthMetrics.productGrowth" },
  { id: "profitGrowth", label: "Profit Growth", category: "Growth", path: "financial.growthMetrics.profitGrowth" },
  // Inventory
  { id: "inventoryValue", label: "Inventory Value", category: "Inventory", path: "inv.inventoryMetrics.inventoryValue", format: "currency" },
  { id: "totalProducts", label: "Total Products", category: "Inventory", path: "inv.inventoryMetrics.totalProducts" },
  { id: "stockQuantity", label: "Stock Quantity", category: "Inventory", path: "inv.inventoryMetrics.stockQuantity" },
  { id: "lowStockCount", label: "Low Stock Products", category: "Inventory", path: "inv.inventoryMetrics.lowStockCount" },
  { id: "outOfStockCount", label: "Out of Stock Products", category: "Inventory", path: "inv.inventoryMetrics.outOfStockCount" },
  { id: "overstockCount", label: "Overstock Products", category: "Inventory", path: "inv.inventoryMetrics.overstockCount" },
  { id: "deadStockValue", label: "Dead Stock Value", category: "Inventory", path: "inv.inventoryMetrics.deadStockValue", format: "currency" },
  { id: "inventoryTurnover", label: "Inventory Turnover", category: "Inventory", path: "inv.inventoryMetrics.inventoryTurnover" },
  { id: "dio", label: "Days Inventory Outstanding", category: "Inventory", path: "inv.inventoryMetrics.dio" },
  { id: "sellThroughRate", label: "Sell-Through Rate", category: "Inventory", path: "inv.inventoryMetrics.sellThroughRate", format: "percent" },
  // Sales
  { id: "grossSales", label: "Gross Sales", category: "Sales", path: "inv.salesMetrics.grossSales", format: "currency" },
  { id: "netSales", label: "Net Sales", category: "Sales", path: "inv.salesMetrics.netSales", format: "currency" },
  { id: "totalOrdersSales", label: "Total Orders", category: "Sales", path: "inv.salesMetrics.totalOrders" },
  { id: "avgItemsPerOrderSales", label: "Average Items per Order", category: "Sales", path: "inv.salesMetrics.avgItemsPerOrder" },
  { id: "salesGrowth", label: "Sales Growth", category: "Sales", path: "inv.salesMetrics.salesGrowth" },
  // Orders
  { id: "ordersReceived", label: "Orders Received", category: "Orders", path: "cust.orderMetrics.ordersReceived" },
  { id: "ordersCompleted", label: "Orders Completed", category: "Orders", path: "cust.orderMetrics.ordersCompleted" },
  { id: "ordersCancelled", label: "Orders Cancelled", category: "Orders", path: "cust.orderMetrics.ordersCancelled" },
  { id: "ordersReturned", label: "Orders Returned", category: "Orders", path: "cust.orderMetrics.ordersReturned" },
  { id: "cancellationRate", label: "Cancellation Rate", category: "Orders", path: "cust.orderMetrics.cancellationRate", format: "percent" },
  { id: "returnRate", label: "Return Rate", category: "Orders", path: "cust.orderMetrics.returnRate", format: "percent" },
  { id: "fulfillmentRate", label: "Fulfillment Rate", category: "Orders", path: "cust.orderMetrics.fulfillmentRate", format: "percent" },
  // Customers
  { id: "totalCustomers", label: "Total Customers", category: "Customers", path: "cust.customerMetrics.totalCustomers" },
  { id: "newCustomers", label: "New Customers", category: "Customers", path: "cust.customerMetrics.newCustomers" },
  { id: "returningCustomers", label: "Returning Customers", category: "Customers", path: "cust.customerMetrics.returningCustomers" },
  { id: "activeCustomers", label: "Active Customers", category: "Customers", path: "cust.customerMetrics.activeCustomers" },
  { id: "repeatPurchaseRate", label: "Repeat Purchase Rate", category: "Customers", path: "cust.customerMetrics.repeatPurchaseRate", format: "percent" },
  { id: "retentionRate", label: "Customer Retention Rate", category: "Customers", path: "cust.customerMetrics.retentionRate", format: "percent" },
  { id: "churnRate", label: "Customer Churn Rate", category: "Customers", path: "cust.customerMetrics.churnRate", format: "percent" },
  { id: "clv", label: "Customer Lifetime Value", category: "Customers", path: "cust.customerMetrics.clv", format: "currency" },
  { id: "cac", label: "Customer Acquisition Cost", category: "Customers", path: "cust.customerMetrics.cac", format: "currency" },
  // Payments
  { id: "cashSales", label: "Cash Sales", category: "Payments", path: "cust.paymentMetrics.cashSales", format: "currency" },
  { id: "cardSales", label: "Card Sales", category: "Payments", path: "cust.paymentMetrics.cardSales", format: "currency" },
  { id: "codOrders", label: "COD Orders", category: "Payments", path: "cust.paymentMetrics.codOrders" },
  { id: "codSuccessRate", label: "COD Success Rate", category: "Payments", path: "cust.paymentMetrics.codSuccessRate", format: "percent" },
  { id: "refundAmount", label: "Refund Amount", category: "Payments", path: "cust.paymentMetrics.refundAmount", format: "currency" },
  { id: "refundRate", label: "Refund Rate", category: "Payments", path: "cust.paymentMetrics.refundRate", format: "percent" },
  // Marketing
  { id: "websiteVisitors", label: "Website Visitors", category: "Marketing", path: "mkt.marketingMetrics.websiteVisitors" },
  { id: "sessions", label: "Sessions", category: "Marketing", path: "mkt.marketingMetrics.sessions" },
  { id: "conversionRate", label: "Conversion Rate", category: "Marketing", path: "mkt.marketingMetrics.conversionRate", format: "percent" },
  { id: "bounceRate", label: "Bounce Rate", category: "Marketing", path: "mkt.marketingMetrics.bounceRate", format: "percent" },
  { id: "cartAbandonmentRate", label: "Cart Abandonment Rate", category: "Marketing", path: "mkt.marketingMetrics.cartAbandonmentRate", format: "percent" },
  { id: "roas", label: "Return on Ad Spend", category: "Marketing", path: "mkt.marketingMetrics.roas" },
  // Website Performance
  { id: "homepageViews", label: "Homepage Views", category: "Website Performance", path: "mkt.websitePerformance.homepageViews" },
  { id: "productViews", label: "Product Views", category: "Website Performance", path: "mkt.websitePerformance.productViews" },
  { id: "categoryViews", label: "Category Views", category: "Website Performance", path: "mkt.websitePerformance.categoryViews" },
  { id: "searchesPerformed", label: "Searches Performed", category: "Website Performance", path: "mkt.websitePerformance.searchesPerformed" },
  { id: "pagesPerSession", label: "Pages per Session", category: "Website Performance", path: "mkt.websitePerformance.pagesPerSession" },
  { id: "peakSalesHour", label: "Peak Sales Hour", category: "Website Performance", path: "mkt.websitePerformance.peakSalesHour" },
];

function getPath(obj, path) {
  return path.split(".").reduce((acc, k) => (acc == null ? acc : acc[k]), obj);
}

export default function BusinessTab() {
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
  const [enabled, setEnabled] = useState({});
  const [combined, setCombined] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [from, setFrom] = useState(() => { const d = new Date(); d.setDate(d.getDate() - 30); return d.toISOString().slice(0, 10); });
  const [to, setTo] = useState(new Date().toISOString().slice(0, 10));

  const load = async () => {
    try {
      setLoading(true);
      const params = { from, to };
      const [settingsR, finR, invR, custR, mktR] = await Promise.all([
        Axios({ ...api.getAnalyticsSettings }),
        Axios({ ...api.getFinancialMetrics, params }),
        Axios({ ...api.getInventorySalesMetrics, params }),
        Axios({ ...api.getCustomerOrderMetrics, params }),
        Axios({ ...api.getMarketingMetrics, params }),
      ]);
      const enabledMap = settingsR.data?.data?.enabledMetrics || {};
      // Default every metric to visible unless explicitly turned off
      const merged = {};
      REGISTRY.forEach((m) => { merged[m.id] = enabledMap[m.id] !== false; });
      setEnabled(merged);
      setCombined({
        financial: finR.data?.data, inv: invR.data?.data, cust: custR.data?.data, mkt: mktR.data?.data,
      });
    } catch (err) { axiosToastError(err); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, [from, to]);

  const toggle = (id) => setEnabled((e) => ({ ...e, [id]: !e[id] }));

  const saveToggles = async () => {
    try {
      setSaving(true);
      const r = await Axios({ ...api.updateAnalyticsSettings, data: { enabledMetrics: enabled } });
      if (r.data?.success) toast.success("Visible metrics saved");
    } catch (err) { axiosToastError(err); }
    finally { setSaving(false); }
  };

  if (loading || !combined) return <LoadingBlock />;

  const visible = REGISTRY.filter((m) => enabled[m.id]);
  const byCategory = {};
  visible.forEach((m) => { (byCategory[m.category] = byCategory[m.category] || []).push(m); });

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <DateRangePicker from={from} to={to} setFrom={setFrom} setTo={setTo} />
        <button onClick={saveToggles} disabled={saving} className="btn-primary px-4 py-2 text-sm disabled:opacity-60">
          {saving ? "Saving…" : "Save Visible Metrics"}
        </button>
      </div>

      {/* Toggle panel */}
      <div className="bg-[var(--color-surface)] border border-theme rounded-2xl p-5 mb-8">
        <div className="flex items-center gap-2 mb-4">
          <FaToggleOn className="text-theme-primary" />
          <h2 className="font-display text-lg font-semibold">Choose which metrics to show below</h2>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-1 max-h-64 overflow-y-auto pr-2">
          {REGISTRY.map((m) => (
            <label key={m.id} className="flex items-center gap-2 py-1 text-sm cursor-pointer">
              <input type="checkbox" checked={!!enabled[m.id]} onChange={() => toggle(m.id)} className="accent-[var(--color-primary)]" />
              <span className="truncate">{m.label}</span>
            </label>
          ))}
        </div>
      </div>

      {visible.length === 0 ? (
        <p className="text-sm text-theme-muted text-center py-16">No metrics turned on — check some boxes above.</p>
      ) : (
        Object.entries(byCategory).map(([category, metrics]) => (
          <div key={category} className="mb-8">
            <h3 className="font-display text-base font-semibold mb-3">{category}</h3>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
              {metrics.map((m) => (
                <MetricCard key={m.id} label={m.label} value={getPath(combined, m.path)}
                  format={m.format} currency={currency} rates={rates} displayPrice={displayPrice} />
              ))}
            </div>
          </div>
        ))
      )}
    </div>
  );
}
