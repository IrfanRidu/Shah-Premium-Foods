import OrderModel from "../models/order.model.js";
import AnalyticsSettingsModel from "../models/analyticsSettings.model.js";
import { round2, sumMonthlyExpenses } from "../utils/analyticsHelpers.js";

const statusReachedAt = (order, status) => {
  const entries = order.statusHistory || [];
  for (let i = entries.length - 1; i >= 0; i--) {
    if (entries[i].status === status) return new Date(entries[i].changedAt);
  }
  return order.order_status === status ? new Date(order.updatedAt) : null;
};

// Fix 39: Expense Analysis tab — every expense category from Fix 34's
// Settings tab, broken down with its share of the total and (where revenue
// for the same window is available) its share of revenue, prorated to the
// selected date range the same way the Financial tab does it.
export const getExpenseAnalysisController = async (req, res) => {
  try {
    const { from, to } = req.query;
    const start = from ? new Date(from) : new Date(new Date().setDate(new Date().getDate() - 30));
    const end   = to   ? new Date(to)   : new Date();
    end.setHours(23, 59, 59, 999);
    const rangeDays = Math.max(1, Math.round((end - start) / 86400000));

    const [settings, allDelivered] = await Promise.all([
      AnalyticsSettingsModel.findOne({ key: "main" }),
      OrderModel.find({ order_status: "Delivered" }),
    ]);

    const expenseSum = sumMonthlyExpenses(settings?.monthlyExpenses);
    const proration = rangeDays / 30;

    // Prorate every individual category (not just the total) so the
    // breakdown chart's slices actually sum to the prorated total.
    const categories = Object.entries(expenseSum.breakdown).map(([key, entry]) => ({
      key,
      label: entry.label,
      monthlyValue: entry.value,
      proratedValue: entry.value === null ? null : round2(entry.value * proration),
      shareOfTotal: entry.value !== null && expenseSum.total > 0 ? round2((entry.value / expenseSum.total) * 100) : null,
    }));

    const proratedTotal = expenseSum.allSet ? round2(expenseSum.total * proration) : null;

    // Revenue in the same window, product-only (Fix 16) — to express expenses as a % of revenue
    const withDate = allDelivered.map((o) => ({ o, d: statusReachedAt(o, "Delivered") })).filter((x) => x.d);
    const inRange = withDate.filter((x) => x.d >= start && x.d <= end).map((x) => x.o);
    const revenueInRange = inRange.reduce((s, o) => s + ((o.totalAmt || 0) - (o.deliveryCharge || 0)), 0);
    const expenseToRevenueRatio = (proratedTotal !== null && revenueInRange > 0)
      ? round2((proratedTotal / revenueInRange) * 100)
      : null;

    // Simple month-by-month trend for the last 6 calendar months, using the
    // CURRENT settings figures (this system doesn't keep historical
    // snapshots of past months' entered expense values, so the trend shows
    // "if today's fixed monthly costs applied" rather than true historical
    // actuals — labelled clearly on the frontend).
    const trend = [];
    const now = new Date();
    for (let i = 5; i >= 0; i--) {
      const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
      trend.push({
        month: `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`,
        total: expenseSum.allSet ? round2(expenseSum.total) : null,
      });
    }

    return res.json({
      success: true, error: false,
      data: {
        period: { from: start, to: end, rangeDays },
        categories,
        monthlyTotal: expenseSum.allSet ? round2(expenseSum.total) : null,
        proratedTotal,
        missing: expenseSum.missing,
        allSet: expenseSum.allSet,
        expenseToRevenueRatio,
        revenueInRange: round2(revenueInRange),
        trend,
        trendNote: "Trend reflects current entered monthly figures applied retroactively — this system doesn't store historical snapshots of past monthly expense entries.",
      },
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: true, message: err.message });
  }
};
