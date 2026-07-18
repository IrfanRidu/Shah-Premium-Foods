import OrderModel from "../models/order.model.js";
import ProductModel from "../models/product.model.js";
import UserModel from "../models/user.model.js";
import ActivityLogModel from "../models/activityLog.model.js";

const parseDate = (d) => (d ? new Date(d) : null);
const round2 = (n) => Math.round((n || 0) * 100) / 100;

// The date an order actually reached a given status — read from statusHistory
// (falls back to updatedAt for legacy orders saved before history was tracked).
const statusReachedAt = (order, status) => {
  const entries = order.statusHistory || [];
  for (let i = entries.length - 1; i >= 0; i--) {
    if (entries[i].status === status) return new Date(entries[i].changedAt);
  }
  return order.order_status === status ? new Date(order.updatedAt) : null;
};

// MAIN DASHBOARD METRICS
//
// Revenue/Profit are recognized only once an order is actually Delivered —
// standard revenue-recognition practice, and exactly what a CA auditing the
// books would expect (an unconfirmed/in-transit order isn't booked revenue).
// The date range filters by the DAY THE ORDER WAS DELIVERED, not the day it
// was placed. Orders that come back as a Return after being delivered have
// their delivery charge counted as a pure loss (the shipping cost was spent
// but the sale didn't stick), shown separately and folded into net profit.
export const getDashboardMetricsController = async (req, res) => {
  try {
    const { from, to } = req.query;
    const start = parseDate(from) || new Date(new Date().setDate(new Date().getDate() - 30));
    const end   = parseDate(to)   || new Date();
    end.setHours(23, 59, 59, 999);
    const prevStart = new Date(start.getTime() - (end.getTime() - start.getTime()));

    const [allDelivered, allReturned, allOrdersForCounts, totalProducts, totalUsers] = await Promise.all([
      OrderModel.find({ order_status: "Delivered" }),
      OrderModel.find({ order_status: "Return" }),
      OrderModel.find({ createdAt: { $gte: start, $lte: end } }).select("order_status createdAt"),
      ProductModel.countDocuments({ publish: true }),
      UserModel.countDocuments({ role: "USER" }),
    ]);

    const inRange   = (d) => d && d >= start && d <= end;
    const inPrevRange = (d) => d && d >= prevStart && d < start;

    const deliveredInRange = allDelivered.filter((o) => inRange(statusReachedAt(o, "Delivered")));
    const deliveredInPrev  = allDelivered.filter((o) => inPrevRange(statusReachedAt(o, "Delivered")));
    const returnedInRange  = allReturned.filter((o) => inRange(statusReachedAt(o, "Return")));

    // Real COGS: sum(costPrice * qty) per line item; fall back to 60% of price*qty when costPrice is unset (0)
    let grossRevenue = 0, totalCOGS = 0, totalDiscounts = 0, totalDeliveryCollected = 0;
    const productAgg = new Map(); // productId -> { name, image, totalQty, totalRevenue }
    const revenueByDayMap = new Map(); // YYYY-MM-DD -> { revenue, orders }

    for (const o of deliveredInRange) {
      const orderProductRevenue = (o.totalAmt || 0) - (o.deliveryCharge || 0);
      grossRevenue += orderProductRevenue;
      totalDiscounts += o.discountAmt || 0;
      totalDeliveryCollected += o.deliveryCharge || 0;

      const dayKey = statusReachedAt(o, "Delivered").toISOString().slice(0, 10);
      const dayBucket = revenueByDayMap.get(dayKey) || { _id: dayKey, revenue: 0, orders: 0 };
      // Fix 16 (complete): this used to add o.totalAmt (delivery charge and
      // all) to the chart, while the headline KPI above correctly excluded
      // it — the chart total and the summary card total would never match.
      dayBucket.revenue += orderProductRevenue;
      dayBucket.orders += 1;
      revenueByDayMap.set(dayKey, dayBucket);

      for (const item of o.productDetails) {
        const lineRevenue = (item.price || 0) * (item.quantity || 0);
        const lineCOGS = item.costPrice > 0 ? item.costPrice * item.quantity : lineRevenue * 0.6;
        totalCOGS += lineCOGS;

        const key = item.productId?.toString();
        if (key) {
          const p = productAgg.get(key) || { _id: key, name: item.name, image: item.image?.[0], totalQty: 0, totalRevenue: 0 };
          p.totalQty += item.quantity || 0;
          p.totalRevenue += lineRevenue;
          productAgg.set(key, p);
        }
      }
    }

    let prevRevenue = 0;
    // Fix 16 (complete): same delivery-charge exclusion applied to the
    // comparison baseline — otherwise "revenue growth %" would be comparing
    // a delivery-charge-free current figure against a delivery-charge-
    // inflated previous one, distorting every growth percentage shown.
    for (const o of deliveredInPrev) prevRevenue += (o.totalAmt || 0) - (o.deliveryCharge || 0);

    // Delivery charges wasted on orders that were delivered then returned — pure loss
    const deliveryLoss = returnedInRange.reduce((s, o) => s + (o.deliveryCharge || 0), 0);

    const totalOrdersDelivered = deliveredInRange.length;
    const prevOrdersDelivered  = deliveredInPrev.length;
    const aov     = totalOrdersDelivered > 0 ? grossRevenue / totalOrdersDelivered : 0;
    const prevAov = prevOrdersDelivered > 0 ? prevRevenue / prevOrdersDelivered : 0;

    const grossProfit  = grossRevenue - totalCOGS;
    // Operating expenses estimate (payment processing, overhead) — 12% of revenue
    const operatingExp = grossRevenue * 0.12;
    const netProfit     = grossProfit - operatingExp - deliveryLoss;
    const netRevenue    = grossRevenue - totalCOGS - operatingExp - deliveryLoss;
    const netMargin     = grossRevenue > 0 ? (netProfit / grossRevenue) * 100 : 0;
    const grossMargin   = grossRevenue > 0 ? (grossProfit / grossRevenue) * 100 : 0;

    const pctChange = (curr, prev) => prev === 0 ? (curr > 0 ? 100 : 0) : Math.round(((curr - prev) / prev) * 1000) / 10;

    const topProducts = [...productAgg.values()].sort((a, b) => b.totalRevenue - a.totalRevenue).slice(0, 10);
    const revenueByDay = [...revenueByDayMap.values()].sort((a, b) => a._id.localeCompare(b._id));

    // "Orders placed" — operational count of ALL orders created in range, any status
    // (kept separate from revenue/AOV, which are Delivered-only by design)
    const ordersByStatus = allOrdersForCounts.reduce((acc, o) => {
      acc[o.order_status] = (acc[o.order_status] || 0) + 1;
      return acc;
    }, {});
    const totalOrdersPlaced = allOrdersForCounts.length;

    return res.json({
      success: true, error: false,
      data: {
        period: { from: start, to: end },
        revenue:      { gross: round2(grossRevenue), net: round2(netRevenue), prev: round2(prevRevenue), change: pctChange(grossRevenue, prevRevenue) },
        profit:       { gross: round2(grossProfit), net: round2(netProfit), grossMargin: round2(grossMargin), netMargin: round2(netMargin) },
        orders:       { deliveredInRange: totalOrdersDelivered, prevDelivered: prevOrdersDelivered, change: pctChange(totalOrdersDelivered, prevOrdersDelivered), totalPlaced: totalOrdersPlaced },
        aov:          { current: round2(aov), prev: round2(prevAov), change: pctChange(aov, prevAov) },
        cogs:         round2(totalCOGS),
        operatingExp: round2(operatingExp),
        totalDiscounts: round2(totalDiscounts),
        totalDeliveryCollected: round2(totalDeliveryCollected),
        deliveryLoss: round2(deliveryLoss),
        returnedOrders: returnedInRange.length,
        totalProducts, totalUsers,
        topProducts,
        revenueByDay,
        ordersByStatus,
      },
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: true, message: err.message });
  }
};

// PRODUCT PERFORMANCE ENDPOINTS (for homepage quadrant sections)
export const getTrendingProductsController = async (req, res) => {
  try {
    const { limit = 20 } = req.query;
    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const viewed = await ActivityLogModel.aggregate([
      { $match: { actionType: { $in: ["view","add_to_cart"] }, createdAt: { $gte: since }, productId: { $ne: null } } },
      { $group: { _id: "$productId", score: { $sum: { $cond: [{ $eq: ["$actionType","add_to_cart"] }, 3, 1] } } } },
      { $sort: { score: -1 } }, { $limit: parseInt(limit) },
    ]);
    if (viewed.length < 5) {
      const products = await ProductModel.find({ publish: true, stock: { $gt: 0 } }).sort({ createdAt: -1 }).limit(parseInt(limit));
      return res.json({ success: true, error: false, data: products });
    }
    const ids = viewed.map((v) => v._id);
    const products = await ProductModel.find({ _id: { $in: ids }, publish: true });
    const sorted = ids.map((id) => products.find((p) => p._id.toString() === id.toString())).filter(Boolean);
    return res.json({ success: true, error: false, data: sorted });
  } catch (err) {
    return res.status(500).json({ success: false, error: true, message: err.message });
  }
};

// BEST SELLING — top movers by quantity sold in the last N days
export const getBestSellingProductsController = async (req, res) => {
  try {
    const { limit = 20, days = 30 } = req.query;
    const since = new Date(Date.now() - parseInt(days) * 24 * 60 * 60 * 1000);
    const best = await OrderModel.aggregate([
      { $match: { createdAt: { $gte: since }, order_status: { $nin: ["Cancelled", "Return"] } } },
      { $unwind: "$productDetails" },
      { $group: { _id: "$productDetails.productId", totalQty: { $sum: "$productDetails.quantity" }, totalRevenue: { $sum: { $multiply: ["$productDetails.price", "$productDetails.quantity"] } } } },
      { $sort: { totalQty: -1 } }, { $limit: parseInt(limit) },
    ]);
    const ids = best.map((b) => b._id);
    const products = await ProductModel.find({ _id: { $in: ids }, publish: true });
    const sorted = ids.map((id) => products.find((p) => p._id.toString() === id.toString())).filter(Boolean);
    if (sorted.length >= 4) return res.json({ success: true, error: false, data: sorted });
    const fallback = await ProductModel.find({ publish: true }).sort({ createdAt: -1 }).limit(parseInt(limit));
    return res.json({ success: true, error: false, data: fallback });
  } catch (err) {
    return res.status(500).json({ success: false, error: true, message: err.message });
  }
};

// LOW SELLING — in stock, but no sales in the last 30 days (or fewest units sold)
export const getLowSellingProductsController = async (req, res) => {
  try {
    const { limit = 20 } = req.query;
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const soldIds = (await OrderModel.aggregate([
      { $match: { createdAt: { $gte: since } } },
      { $unwind: "$productDetails" },
      { $group: { _id: "$productDetails.productId" } },
    ])).map((x) => x._id);
    const products = await ProductModel.find({ publish: true, stock: { $gt: 0 }, _id: { $nin: soldIds } }).sort({ createdAt: -1 }).limit(parseInt(limit));
    if (products.length >= 4) return res.json({ success: true, error: false, data: products });

    const low = await OrderModel.aggregate([
      { $match: { createdAt: { $gte: since } } },
      { $unwind: "$productDetails" },
      { $group: { _id: "$productDetails.productId", totalQty: { $sum: "$productDetails.quantity" } } },
      { $sort: { totalQty: 1 } }, { $limit: parseInt(limit) },
    ]);
    const ids = low.map((b) => b._id);
    const prods = await ProductModel.find({ _id: { $in: ids }, publish: true });
    return res.json({ success: true, error: false, data: prods.length ? prods : products });
  } catch (err) {
    return res.status(500).json({ success: false, error: true, message: err.message });
  }
};

// NEVER SOLD — published products with zero sales ever
export const getNeverSoldProductsController = async (req, res) => {
  try {
    const { limit = 20 } = req.query;
    const soldIds = (await OrderModel.aggregate([
      { $unwind: "$productDetails" },
      { $group: { _id: "$productDetails.productId" } },
    ])).map((x) => x._id);
    const products = await ProductModel.find({ publish: true, _id: { $nin: soldIds } }).sort({ createdAt: -1 }).limit(parseInt(limit));
    if (products.length >= 4) return res.json({ success: true, error: false, data: products });
    const fallback = await ProductModel.find({ publish: true }).sort({ createdAt: 1 }).limit(parseInt(limit));
    return res.json({ success: true, error: false, data: fallback });
  } catch (err) {
    return res.status(500).json({ success: false, error: true, message: err.message });
  }
};

// ALL TIME BEST SELLING
export const getAllTimeBestSellingController = async (req, res) => {
  try {
    const { limit = 20 } = req.query;
    const best = await OrderModel.aggregate([
      { $match: { order_status: { $nin: ["Cancelled", "Return"] } } },
      { $unwind: "$productDetails" },
      { $group: { _id: "$productDetails.productId", totalQty: { $sum: "$productDetails.quantity" } } },
      { $sort: { totalQty: -1 } }, { $limit: parseInt(limit) },
    ]);
    const ids = best.map((b) => b._id);
    const products = await ProductModel.find({ _id: { $in: ids }, publish: true });
    const sorted = ids.map((id) => products.find((p) => p._id.toString() === id.toString())).filter(Boolean);
    if (sorted.length >= 4) return res.json({ success: true, error: false, data: sorted });
    const fallback = await ProductModel.find({ publish: true }).sort({ createdAt: -1 }).limit(parseInt(limit));
    return res.json({ success: true, error: false, data: fallback });
  } catch (err) {
    return res.status(500).json({ success: false, error: true, message: err.message });
  }
};
