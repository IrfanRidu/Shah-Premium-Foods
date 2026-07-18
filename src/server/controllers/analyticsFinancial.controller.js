import OrderModel from "../models/order.model.js";
import UserModel from "../models/user.model.js";
import AnalyticsSettingsModel from "../models/analyticsSettings.model.js";
import { round2, pctChange, dependentMetric, sumMonthlyExpenses } from "../utils/analyticsHelpers.js";

const statusReachedAt = (order, status) => {
  const entries = order.statusHistory || [];
  for (let i = entries.length - 1; i >= 0; i--) {
    if (entries[i].status === status) return new Date(entries[i].changedAt);
  }
  return order.order_status === status ? new Date(order.updatedAt) : null;
};

// Sum product-only revenue (excludes delivery charge — Fix 16) for a list of orders
const productRevenueOf = (orders) => orders.reduce((s, o) => s + ((o.totalAmt || 0) - (o.deliveryCharge || 0)), 0);

const monthKey   = (d) => d.toISOString().slice(0, 7);           // "2026-07"
const dayKey     = (d) => d.toISOString().slice(0, 10);          // "2026-07-01"
const quarterOf  = (d) => Math.floor(d.getUTCMonth() / 3) + 1;
const quarterKey = (d) => `${d.getUTCFullYear()}-Q${quarterOf(d)}`;
const yearKey    = (d) => `${d.getUTCFullYear()}`;

export const getFinancialMetricsController = async (req, res) => {
  try {
    const { from, to } = req.query;
    const start = from ? new Date(from) : new Date(new Date().setDate(new Date().getDate() - 30));
    const end   = to   ? new Date(to)   : new Date();
    end.setHours(23, 59, 59, 999);
    const rangeDays = Math.max(1, Math.round((end - start) / 86400000));

    const settings = await AnalyticsSettingsModel.findOne({ key: "main" }) || {};

    // ── Pull ALL delivered + returned orders once; we bucket by calendar period in JS ──
    const [allDelivered, allReturned] = await Promise.all([
      OrderModel.find({ order_status: "Delivered" }),
      OrderModel.find({ order_status: "Return" }),
    ]);

    const withDeliveredDate = allDelivered
      .map((o) => ({ o, d: statusReachedAt(o, "Delivered") }))
      .filter((x) => x.d);
    const withReturnedDate = allReturned
      .map((o) => ({ o, d: statusReachedAt(o, "Return") }))
      .filter((x) => x.d);

    const inRange = (d) => d >= start && d <= end;
    const rangeDelivered  = withDeliveredDate.filter((x) => inRange(x.d)).map((x) => x.o);
    const rangeReturned   = withReturnedDate.filter((x) => inRange(x.d)).map((x) => x.o);

    // ── Revenue metrics ──────────────────────────────────────────
    const grossRevenue    = productRevenueOf(rangeDelivered);
    const totalDiscounts  = rangeDelivered.reduce((s, o) => s + (o.discountAmt || 0), 0);
    const returnValue     = productRevenueOf(rangeReturned);
    const totalOrders     = rangeDelivered.length;
    const aov             = totalOrders > 0 ? grossRevenue / totalOrders : 0;

    // COGS (real cost price where set, else 60% fallback — matches main dashboard)
    let totalCOGS = 0;
    const productIdsSold = new Set();
    let totalUnitsSold = 0;
    for (const o of rangeDelivered) {
      for (const item of o.productDetails) {
        const lineRevenue = (item.price || 0) * (item.quantity || 0);
        totalCOGS += item.costPrice > 0 ? item.costPrice * item.quantity : lineRevenue * 0.6;
        if (item.productId) productIdsSold.add(item.productId.toString());
        totalUnitsSold += item.quantity || 0;
      }
    }

    const revenuePerProduct = productIdsSold.size > 0 ? grossRevenue / productIdsSold.size : 0;

    // Unique customers who bought in range → ARPC
    const customerIds = new Set(rangeDelivered.map((o) => o.userId?.toString()).filter(Boolean));
    const revenuePerCustomer = customerIds.size > 0 ? grossRevenue / customerIds.size : 0;

    // Tax collected — needs salesTaxRate dependency (Fix 34)
    const taxCollected = dependentMetric(
      { "Sales Tax Rate": settings.salesTaxRate },
      () => round2(grossRevenue * (settings.salesTaxRate / 100))
    );

    // ── Revenue per Day/Week/Month/Quarter/Year (bucketed over the selected range) ──
    const byDay = new Map(), byWeek = new Map(), byMonth = new Map(), byQuarter = new Map(), byYear = new Map();
    for (const o of rangeDelivered) {
      const d = statusReachedAt(o, "Delivered");
      const rev = (o.totalAmt || 0) - (o.deliveryCharge || 0);
      const dK = dayKey(d);
      byDay.set(dK, (byDay.get(dK) || 0) + rev);
      // ISO week key
      const weekDate = new Date(d);
      weekDate.setUTCDate(weekDate.getUTCDate() - ((weekDate.getUTCDay() + 6) % 7)); // Monday of that week
      const wK = dayKey(weekDate);
      byWeek.set(wK, (byWeek.get(wK) || 0) + rev);
      const mK = monthKey(d);
      byMonth.set(mK, (byMonth.get(mK) || 0) + rev);
      const qK = quarterKey(d);
      byQuarter.set(qK, (byQuarter.get(qK) || 0) + rev);
      const yK = yearKey(d);
      byYear.set(yK, (byYear.get(yK) || 0) + rev);
    }
    const toSorted = (m) => [...m.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([period, revenue]) => ({ period, revenue: round2(revenue) }));

    // ── Growth: MoM / QoQ / YoY — always computed relative to "now", independent of the from/to filter ──
    const now = new Date();
    const thisMonthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const lastMonthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
    const lastMonthEnd   = new Date(thisMonthStart.getTime() - 1);

    const thisQStart = new Date(Date.UTC(now.getUTCFullYear(), Math.floor(now.getUTCMonth() / 3) * 3, 1));
    const lastQStart  = new Date(Date.UTC(thisQStart.getUTCFullYear(), thisQStart.getUTCMonth() - 3, 1));
    const lastQEnd     = new Date(thisQStart.getTime() - 1);

    const thisYearStart = new Date(Date.UTC(now.getUTCFullYear(), 0, 1));
    const lastYearStart = new Date(Date.UTC(now.getUTCFullYear() - 1, 0, 1));
    const lastYearEnd   = new Date(thisYearStart.getTime() - 1);

    const sumRevInWindow = (a, b) => productRevenueOf(withDeliveredDate.filter((x) => x.d >= a && x.d <= b).map((x) => x.o));

    const curMonthRev = sumRevInWindow(thisMonthStart, now);
    const prevMonthRev = sumRevInWindow(lastMonthStart, lastMonthEnd);
    const curQRev = sumRevInWindow(thisQStart, now);
    const prevQRev = sumRevInWindow(lastQStart, lastQEnd);
    const curYearRev = sumRevInWindow(thisYearStart, now);
    const prevYearRev = sumRevInWindow(lastYearStart, lastYearEnd);

    const revenueGrowthMoM = pctChange(curMonthRev, prevMonthRev);
    const revenueGrowthQoQ = pctChange(curQRev, prevQRev);
    const revenueGrowthYoY = pctChange(curYearRev, prevYearRev);

    // ── Top 10 products by revenue in range ──
    const productAgg = new Map();
    for (const o of rangeDelivered) {
      for (const item of o.productDetails) {
        const key = item.productId?.toString();
        if (!key) continue;
        const entry = productAgg.get(key) || { name: item.name, image: item.image?.[0], totalQty: 0, totalRevenue: 0 };
        entry.totalQty += item.quantity || 0;
        entry.totalRevenue += (item.price || 0) * (item.quantity || 0);
        productAgg.set(key, entry);
      }
    }
    const top10Products = [...productAgg.values()].sort((a, b) => b.totalRevenue - a.totalRevenue).slice(0, 10)
      .map((p) => ({ ...p, totalRevenue: round2(p.totalRevenue) }));

    // ── Profitability ──────────────────────────────────────────
    const expenseSum = sumMonthlyExpenses(settings.monthlyExpenses);
    // Prorate the admin's MONTHLY expense figures to the selected date range length
    const proratedExpenses = expenseSum.allSet ? round2(expenseSum.total * (rangeDays / 30)) : null;

    const grossProfit  = round2(grossRevenue - totalCOGS);
    const grossMargin  = grossRevenue > 0 ? round2((grossProfit / grossRevenue) * 100) : 0;

    const operatingProfitResult = dependentMetric(
      expenseSum.allSet ? {} : expenseSum.missing.reduce((acc, m) => ({ ...acc, [m]: null }), {}),
      () => round2(grossProfit - proratedExpenses)
    );
    const operatingMarginResult = dependentMetric(
      expenseSum.allSet ? {} : expenseSum.missing.reduce((acc, m) => ({ ...acc, [m]: null }), {}),
      () => grossRevenue > 0 ? round2((operatingProfitResult.value / grossRevenue) * 100) : 0
    );

    const netProfitResult = dependentMetric(
      expenseSum.allSet ? {} : expenseSum.missing.reduce((acc, m) => ({ ...acc, [m]: null }), {}),
      () => round2(grossRevenue - totalCOGS - proratedExpenses)
    );
    const netMarginResult = dependentMetric(
      expenseSum.allSet ? {} : expenseSum.missing.reduce((acc, m) => ({ ...acc, [m]: null }), {}),
      () => grossRevenue > 0 ? round2((netProfitResult.value / grossRevenue) * 100) : 0
    );

    // EBITDA (add-back method): Net Profit + Interest Expense + Tax + D&A (if entered)
    const interestExp = settings.monthlyExpenses?.interestExpense;
    const taxExp       = settings.monthlyExpenses?.tax;
    const ebitdaResult = dependentMetric(
      { "Net Profit (needs all expense fields)": netProfitResult.ok ? 1 : null, "Interest Expense": interestExp, "Tax": taxExp },
      () => {
        const proratedInterest = interestExp * (rangeDays / 30);
        const proratedTax = taxExp * (rangeDays / 30);
        const da = settings.depreciationAmortization ? settings.depreciationAmortization * (rangeDays / 30) : 0;
        return round2(netProfitResult.value + proratedInterest + proratedTax + da);
      }
    );

    const roiResult = dependentMetric(
      { "Investment": settings.investment, "Net Profit (needs all expense fields)": netProfitResult.ok ? 1 : null },
      () => settings.investment > 0 ? round2((netProfitResult.value / settings.investment) * 100) : 0
    );
    const roeResult = dependentMetric(
      { "Equity": settings.equity, "Net Profit (needs all expense fields)": netProfitResult.ok ? 1 : null },
      () => settings.equity > 0 ? round2((netProfitResult.value / settings.equity) * 100) : 0
    );
    const roaResult = dependentMetric(
      { "Assets": settings.assets, "Net Profit (needs all expense fields)": netProfitResult.ok ? 1 : null },
      () => settings.assets > 0 ? round2((netProfitResult.value / settings.assets) * 100) : 0
    );

    // ── Growth metrics beyond revenue: customers, products, profit ──
    const customersInWindow = async (a, b) => {
      const ids = new Set(withDeliveredDate.filter((x) => x.d >= a && x.d <= b).map((x) => x.o.userId?.toString()).filter(Boolean));
      return ids.size;
    };
    const curMonthCustomers  = await customersInWindow(thisMonthStart, now);
    const prevMonthCustomers = await customersInWindow(lastMonthStart, lastMonthEnd);
    const customerGrowth = pctChange(curMonthCustomers, prevMonthCustomers);

    const unitsInWindow = (a, b) => withDeliveredDate.filter((x) => x.d >= a && x.d <= b)
      .reduce((s, x) => s + x.o.productDetails.reduce((s2, i) => s2 + (i.quantity || 0), 0), 0);
    const curMonthUnits  = unitsInWindow(thisMonthStart, now);
    const prevMonthUnits = unitsInWindow(lastMonthStart, lastMonthEnd);
    const productGrowth = pctChange(curMonthUnits, prevMonthUnits);

    const profitInWindow = (a, b) => {
      const orders = withDeliveredDate.filter((x) => x.d >= a && x.d <= b).map((x) => x.o);
      const rev = productRevenueOf(orders);
      let cogs = 0;
      for (const o of orders) for (const item of o.productDetails) {
        const lr = (item.price || 0) * (item.quantity || 0);
        cogs += item.costPrice > 0 ? item.costPrice * item.quantity : lr * 0.6;
      }
      return rev - cogs; // gross profit proxy (opex prorating omitted for month-window comparison simplicity)
    };
    const curMonthProfit  = profitInWindow(thisMonthStart, now);
    const prevMonthProfit = profitInWindow(lastMonthStart, lastMonthEnd);
    const profitGrowth = pctChange(curMonthProfit, prevMonthProfit);

    return res.json({
      success: true, error: false,
      data: {
        period: { from: start, to: end, rangeDays },
        revenueMetrics: {
          grossRevenue: round2(grossRevenue),
          netRevenue: netProfitResult.ok ? round2(grossRevenue - totalCOGS - proratedExpenses) : { value: null, missing: expenseSum.missing },
          taxCollected,
          discountAmount: round2(totalDiscounts),
          returnValue: round2(returnValue),
          aov: round2(aov),
          revenuePerCustomer: round2(revenuePerCustomer),
          revenuePerProduct: round2(revenuePerProduct),
          revenueGrowthMoM, revenueGrowthQoQ, revenueGrowthYoY,
          top10Products,
        },
        revenueSeries: {
          byDay: toSorted(byDay), byWeek: toSorted(byWeek), byMonth: toSorted(byMonth),
          byQuarter: toSorted(byQuarter), byYear: toSorted(byYear),
        },
        profitabilityMetrics: {
          grossProfit, grossMargin,
          operatingProfit: operatingProfitResult,
          operatingMargin: operatingMarginResult,
          ebitda: ebitdaResult,
          netProfit: netProfitResult,
          netMargin: netMarginResult,
          roi: roiResult, roe: roeResult, roa: roaResult,
        },
        growthMetrics: {
          revenueGrowthMoM, revenueGrowthYoY, customerGrowth, productGrowth, profitGrowth,
        },
        expenseBreakdown: expenseSum,
        dependenciesMissing: [...new Set([...expenseSum.missing, ...(taxCollected.missing || [])])],
      },
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: true, message: err.message });
  }
};
