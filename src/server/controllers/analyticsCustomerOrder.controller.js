import OrderModel from "../models/order.model.js";
import UserModel from "../models/user.model.js";
import AnalyticsSettingsModel from "../models/analyticsSettings.model.js";
import { round2, pctChange, dependentMetric } from "../utils/analyticsHelpers.js";

export const getCustomerOrderMetricsController = async (req, res) => {
  try {
    const { from, to } = req.query;
    const start = from ? new Date(from) : new Date(new Date().setDate(new Date().getDate() - 30));
    const end   = to   ? new Date(to)   : new Date();
    end.setHours(23, 59, 59, 999);
    const prevStart = new Date(start.getTime() - (end.getTime() - start.getTime()));

    const [ordersInRange, allOrders, allCustomers, settings] = await Promise.all([
      OrderModel.find({ createdAt: { $gte: start, $lte: end } }),
      OrderModel.find({}).select("userId totalAmt order_status createdAt payment_status"),
      UserModel.find({ role: "USER" }).select("createdAt"),
      AnalyticsSettingsModel.findOne({ key: "main" }),
    ]);

    // ── Order Metrics ────────────────────────────────────────────
    const totalOrdersReceived = ordersInRange.length;
    const countBy = (status) => ordersInRange.filter((o) => o.order_status === status).length;
    const ordersCompleted  = countBy("Delivered");
    const ordersCancelled  = countBy("Cancelled");
    const ordersReturned   = countBy("Return");
    const ordersPending    = countBy("Pending");
    const ordersProcessing = countBy("Processing");
    const ordersRefunded   = countBy("Refunded");

    const safeRate = (num, den) => den > 0 ? round2((num / den) * 100) : 0;
    const cancellationRate = safeRate(ordersCancelled, totalOrdersReceived);
    const returnRate       = safeRate(ordersReturned, totalOrdersReceived);
    const fulfillmentRate  = safeRate(ordersCompleted, totalOrdersReceived);

    // ── Customer Metrics ─────────────────────────────────────────
    const totalCustomers = allCustomers.length;
    const newCustomersInRange = allCustomers.filter((u) => u.createdAt >= start && u.createdAt <= end).length;
    const prevNewCustomers    = allCustomers.filter((u) => u.createdAt >= prevStart && u.createdAt < start).length;
    const customerGrowth = pctChange(newCustomersInRange, prevNewCustomers);

    // Purchases per customer (all-time, for "returning" + CLV frequency)
    const purchaseCountByCustomer = new Map();
    for (const o of allOrders) {
      if (!o.userId) continue;
      const key = o.userId.toString();
      purchaseCountByCustomer.set(key, (purchaseCountByCustomer.get(key) || 0) + 1);
    }
    const returningCustomers = [...purchaseCountByCustomer.values()].filter((c) => c > 1).length;
    const repeatPurchaseRate = safeRate(returningCustomers, totalCustomers);

    // Active / inactive — bought at least once DURING the selected period
    const activeCustomerIds = new Set(ordersInRange.map((o) => o.userId?.toString()).filter(Boolean));
    const activeCustomers   = activeCustomerIds.size;
    const inactiveCustomers = Math.max(0, totalCustomers - activeCustomers);

    // Retention / churn — cohort-style: customers active before period start vs still active during it
    const customersBeforeStart = new Set(allOrders.filter((o) => o.createdAt < start && o.userId).map((o) => o.userId.toString()));
    const startingCustomers = customersBeforeStart.size;
    const customersStillActive = [...customersBeforeStart].filter((id) => activeCustomerIds.has(id)).length;
    const lostCustomers = startingCustomers - customersStillActive;
    const endingCustomers = new Set([...customersBeforeStart, ...activeCustomerIds]).size;

    const retentionRate = startingCustomers > 0
      ? round2(((endingCustomers - newCustomersInRange) / startingCustomers) * 100)
      : null;
    const churnRate = startingCustomers > 0 ? round2((lostCustomers / startingCustomers) * 100) : null;

    // CLV = AOV × Purchase Frequency × Customer Lifespan
    const deliveredOrders = allOrders.filter((o) => o.order_status === "Delivered");
    const totalRevenueAllTime = deliveredOrders.reduce((s, o) => s + (o.totalAmt || 0), 0);
    const overallAOV = deliveredOrders.length > 0 ? totalRevenueAllTime / deliveredOrders.length : 0;
    const purchaseFrequency = totalCustomers > 0 ? deliveredOrders.length / totalCustomers : 0;
    // Customer Lifespan (in "periods", using this window's churn rate as a monthly-ish proxy) = 1 / churn rate
    const clvResult = dependentMetric(
      { "Churn Rate (needs order history before this period)": churnRate !== null && churnRate > 0 ? 1 : null },
      () => {
        const lifespanPeriods = 1 / (churnRate / 100);
        return round2(overallAOV * purchaseFrequency * lifespanPeriods);
      }
    );

    // CAC = Marketing Spend ÷ New Customers — needs the Marketing Cost dependency (Fix 34)
    const marketingSpend = settings?.monthlyExpenses?.marketingCost;
    const cacResult = dependentMetric(
      { "Marketing Cost (Analytics Settings)": marketingSpend },
      () => newCustomersInRange > 0 ? round2(marketingSpend / newCustomersInRange) : 0
    );

    const totalItemsInRange = ordersInRange.reduce((s, o) => s + (o.productDetails?.reduce((s2, i) => s2 + (i.quantity || 0), 0) || 0), 0);
    const avgItemsPerOrder = totalOrdersReceived > 0 ? round2(totalItemsInRange / totalOrdersReceived) : 0;
    const revenuePerCustomer = activeCustomers > 0
      ? round2(ordersInRange.reduce((s, o) => s + (o.totalAmt || 0), 0) / activeCustomers)
      : 0;

    // ── Payment Metrics ───────────────────────────────────────────
    // Note: this system integrates Stripe (card) + Cash on Delivery only. Mobile banking
    // (bKash/Nagad/Rocket) and bank transfer gateways are not integrated, so those two
    // buckets are honestly reported as "not tracked" rather than fabricated.
    const codOrders  = ordersInRange.filter((o) => o.payment_status?.toUpperCase().includes("CASH ON DELIVERY") || o.payment_status?.toUpperCase().includes("COD"));
    const cardOrders = ordersInRange.filter((o) => o.payment_status === "paid" || o.payment_status === "PAID");
    const cashSalesAmt = codOrders.reduce((s, o) => s + (o.totalAmt || 0), 0);
    const cardSalesAmt = cardOrders.reduce((s, o) => s + (o.totalAmt || 0), 0);
    const codDelivered = codOrders.filter((o) => o.order_status === "Delivered").length;
    const codSuccessRate = codOrders.length > 0 ? safeRate(codDelivered, codOrders.length) : 0;

    const refundedOrders = ordersInRange.filter((o) => o.order_status === "Refunded");
    const refundAmount = refundedOrders.reduce((s, o) => s + (o.totalAmt || 0), 0);
    const refundRate = safeRate(refundedOrders.length, totalOrdersReceived);

    return res.json({
      success: true, error: false,
      data: {
        period: { from: start, to: end },
        orderMetrics: {
          ordersReceived: totalOrdersReceived, ordersCompleted, ordersCancelled, ordersReturned,
          pendingOrders: ordersPending, processingOrders: ordersProcessing, deliveredOrders: ordersCompleted,
          cancellationRate, returnRate, fulfillmentRate,
        },
        customerMetrics: {
          totalCustomers, newCustomers: newCustomersInRange, returningCustomers,
          customerGrowth, activeCustomers, inactiveCustomers,
          repeatPurchaseRate,
          retentionRate: retentionRate === null ? { value: null, missing: ["Order history before this period"] } : retentionRate,
          churnRate: churnRate === null ? { value: null, missing: ["Order history before this period"] } : churnRate,
          clv: clvResult,
          cac: cacResult,
          avgItemsPerOrder, revenuePerCustomer,
        },
        paymentMetrics: {
          cashSales: round2(cashSalesAmt),
          cardSales: round2(cardSalesAmt),
          mobileBankingSales: { value: null, missing: ["No mobile banking gateway integrated"] },
          bankTransferSales:  { value: null, missing: ["No bank transfer gateway integrated"] },
          codOrders: codOrders.length,
          codSuccessRate,
          failedPaymentRate: { value: null, missing: ["Failed payment attempts are not logged (only completed checkouts create orders)"] },
          paymentGatewaySuccessRate: { value: null, missing: ["Failed payment attempts are not logged (only completed checkouts create orders)"] },
          refundAmount: round2(refundAmount),
          refundRate,
        },
      },
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: true, message: err.message });
  }
};
