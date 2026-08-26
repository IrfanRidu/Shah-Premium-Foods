import OrderModel from "../models/order.model.js";
import ProductModel from "../models/product.model.js";
import UserModel from "../models/user.model.js";
import ActivityLogModel from "../models/activityLog.model.js";
import RoleModel from "../models/role.model.js";
import { EmployeeModel } from "../models/employee.model.js";
import SupportTicketModel from "../models/supportTicket.model.js";
import ProductRequestModel from "../models/productRequest.model.js";
import { AVAILABILITY_FILTER, HOT_DEAL_MIN_DISCOUNT } from "@/lib/recommendationConfig";

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
//
// Session 6 (user-reported: "the website loads too slow it must load
// faster"). Each of these 5 was its own separate HTTP round-trip from
// the homepage (5 requests just to paint 5 rows) — the actual query
// logic below is UNCHANGED (same filters, same sort, same fallback
// thresholds, same $nin exclusions), just extracted into a plain
// fetch*() helper so it can be called either (a) alone, from each
// endpoint below exactly as before — same URL, same response shape,
// nothing that already depends on these breaks — or (b) alongside the
// other 4, from the single new combined endpoint further down, cutting
// 5 round-trips to 1 without duplicating the query logic in two places
// that could drift out of sync.
// `.lean()` added to every ProductModel.find() call in here — verified
// safe first (see PROGRESS_TRACKER.md Session 6): already an established
// pattern elsewhere in this codebase, and product.model.js has no
// virtuals/toJSON transform .lean() would skip. Returns plain JS objects
// instead of full Mongoose Documents, which is meaningfully cheaper for
// a read-only list endpoint like these — doesn't change the DATA
// returned in any way that matters to a caller.
//
// Session 8, Phase 8: also now EXPORTED (were previously module-private,
// used only by this file's own 5 thin controller wrappers + the
// combined getHomepageRowsController below). homepageRecommendationService.js
// needs to call these same 5 functions directly to source the
// trending/bestSelling/clearance/newArrivals/allTimeFavourites sections
// of the new recommendation API, without a 3rd copy of this same query
// logic — reusing what's already correct here rather than duplicating it
// a second time (the combined controller below being the first reuse).
export async function fetchTrendingProducts(limit) {
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const viewed = await ActivityLogModel.aggregate([
    { $match: { actionType: { $in: ["view","add_to_cart"] }, createdAt: { $gte: since }, productId: { $ne: null } } },
    { $group: { _id: "$productId", score: { $sum: { $cond: [{ $eq: ["$actionType","add_to_cart"] }, 3, 1] } } } },
    { $sort: { score: -1 } }, { $limit: limit },
  ]);
  if (viewed.length < 5) {
    return ProductModel.find({ publish: true, stock: { $gt: 0 } }).sort({ createdAt: -1 }).limit(limit).lean();
  }
  const ids = viewed.map((v) => v._id);
  const products = await ProductModel.find({ _id: { $in: ids }, publish: true }).lean();
  return ids.map((id) => products.find((p) => p._id.toString() === id.toString())).filter(Boolean);
}

export async function fetchBestSellingProducts(limit, days) {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const best = await OrderModel.aggregate([
    { $match: { createdAt: { $gte: since }, order_status: { $nin: ["Cancelled", "Return"] } } },
    { $unwind: "$productDetails" },
    { $group: { _id: "$productDetails.productId", totalQty: { $sum: "$productDetails.quantity" }, totalRevenue: { $sum: { $multiply: ["$productDetails.price", "$productDetails.quantity"] } } } },
    { $sort: { totalQty: -1 } }, { $limit: limit },
  ]);
  const ids = best.map((b) => b._id);
  const products = await ProductModel.find({ _id: { $in: ids }, publish: true }).lean();
  const sorted = ids.map((id) => products.find((p) => p._id.toString() === id.toString())).filter(Boolean);
  if (sorted.length >= 4) return sorted;
  return ProductModel.find({ publish: true }).sort({ createdAt: -1 }).limit(limit).lean();
}

export async function fetchLowSellingProducts(limit) {
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const soldIds = (await OrderModel.aggregate([
    { $match: { createdAt: { $gte: since } } },
    { $unwind: "$productDetails" },
    { $group: { _id: "$productDetails.productId" } },
  ])).map((x) => x._id);
  const products = await ProductModel.find({ publish: true, stock: { $gt: 0 }, _id: { $nin: soldIds } }).sort({ createdAt: -1 }).limit(limit).lean();
  if (products.length >= 4) return products;

  const low = await OrderModel.aggregate([
    { $match: { createdAt: { $gte: since } } },
    { $unwind: "$productDetails" },
    { $group: { _id: "$productDetails.productId", totalQty: { $sum: "$productDetails.quantity" } } },
    { $sort: { totalQty: 1 } }, { $limit: limit },
  ]);
  const ids = low.map((b) => b._id);
  const prods = await ProductModel.find({ _id: { $in: ids }, publish: true }).lean();
  return prods.length ? prods : products;
}

export async function fetchNeverSoldProducts(limit) {
  const soldIds = (await OrderModel.aggregate([
    { $unwind: "$productDetails" },
    { $group: { _id: "$productDetails.productId" } },
  ])).map((x) => x._id);
  const products = await ProductModel.find({ publish: true, _id: { $nin: soldIds } }).sort({ createdAt: -1 }).limit(limit).lean();
  if (products.length >= 4) return products;
  return ProductModel.find({ publish: true }).sort({ createdAt: 1 }).limit(limit).lean();
}

export async function fetchAllTimeBestSellingProducts(limit) {
  const best = await OrderModel.aggregate([
    { $match: { order_status: { $nin: ["Cancelled", "Return"] } } },
    { $unwind: "$productDetails" },
    { $group: { _id: "$productDetails.productId", totalQty: { $sum: "$productDetails.quantity" } } },
    { $sort: { totalQty: -1 } }, { $limit: limit },
  ]);
  const ids = best.map((b) => b._id);
  const products = await ProductModel.find({ _id: { $in: ids }, publish: true }).lean();
  const sorted = ids.map((id) => products.find((p) => p._id.toString() === id.toString())).filter(Boolean);
  if (sorted.length >= 4) return sorted;
  return ProductModel.find({ publish: true }).sort({ createdAt: -1 }).limit(limit).lean();
}

export const getTrendingProductsController = async (req, res) => {
  try {
    const { limit = 20 } = req.query;
    const data = await fetchTrendingProducts(parseInt(limit));
    return res.json({ success: true, error: false, data });
  } catch (err) {
    return res.status(500).json({ success: false, error: true, message: err.message });
  }
};

// BEST SELLING — top movers by quantity sold in the last N days
export const getBestSellingProductsController = async (req, res) => {
  try {
    const { limit = 20, days = 30 } = req.query;
    const data = await fetchBestSellingProducts(parseInt(limit), parseInt(days));
    return res.json({ success: true, error: false, data });
  } catch (err) {
    return res.status(500).json({ success: false, error: true, message: err.message });
  }
};

// LOW SELLING — in stock, but no sales in the last 30 days (or fewest units sold)
export const getLowSellingProductsController = async (req, res) => {
  try {
    const { limit = 20 } = req.query;
    const data = await fetchLowSellingProducts(parseInt(limit));
    return res.json({ success: true, error: false, data });
  } catch (err) {
    return res.status(500).json({ success: false, error: true, message: err.message });
  }
};

// NEVER SOLD — published products with zero sales ever
export const getNeverSoldProductsController = async (req, res) => {
  try {
    const { limit = 20 } = req.query;
    const data = await fetchNeverSoldProducts(parseInt(limit));
    return res.json({ success: true, error: false, data });
  } catch (err) {
    return res.status(500).json({ success: false, error: true, message: err.message });
  }
};

// ALL TIME BEST SELLING
export const getAllTimeBestSellingController = async (req, res) => {
  try {
    const { limit = 20 } = req.query;
    const data = await fetchAllTimeBestSellingProducts(parseInt(limit));
    return res.json({ success: true, error: false, data });
  } catch (err) {
    return res.status(500).json({ success: false, error: true, message: err.message });
  }
};

// Session 6 — combined endpoint. Same 5 queries above, run concurrently
// via Promise.all instead of the homepage firing 5 separate HTTP
// requests for them. One network round-trip's worth of latency/header
// overhead instead of 5; nothing about what's queried or how it's
// filtered/sorted/limited changes — this is purely fewer trips to fetch
// the exact same data. See page.jsx for the frontend side of this.
export const getHomepageRowsController = async (req, res) => {
  try {
    const { limit = 20 } = req.query;
    const l = parseInt(limit);
    // Session 8, Phase 9-10: `hotDeals` added — spec Section 36
    // explicitly requires it as part of the fallback set this endpoint
    // now serves whenever the primary recommendation pipeline
    // (homepageRecommendationService.js) fails for any reason. Kept
    // deliberately trivial and independent of every Phase 3-8 file —
    // a plain, direct discount-threshold query with no dependency on
    // affinity/scoring/candidate-generation/etc — precisely because
    // this is THE fallback path: it needs to keep working even if
    // something elsewhere in this session's own new code doesn't.
    const [trending, bestSelling, lowSelling, neverSold, allTimeBest, hotDeals] = await Promise.all([
      fetchTrendingProducts(l),
      fetchBestSellingProducts(l, 30),
      fetchLowSellingProducts(l),
      fetchNeverSoldProducts(l),
      fetchAllTimeBestSellingProducts(l),
      ProductModel.find({ ...AVAILABILITY_FILTER, discount: { $gte: HOT_DEAL_MIN_DISCOUNT } })
        .sort({ discount: -1 }).limit(l).lean(),
    ]);
    return res.json({
      success: true,
      error: false,
      data: { trending, bestSelling, lowSelling, neverSold, allTimeBest, hotDeals },
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: true, message: err.message });
  }
};

// DASHBOARD OVERVIEW — powers the new /dashboard homepage ("after entering
// the Super Admin dashboard the homepage will display a brief overview of
// all sections"). Deliberately NOT gated behind checkPermission("analytics",
// "view") like the rest of this file — every admin-tier role (including a
// narrowly-scoped Employee who has no analytics access at all) lands on
// this same /dashboard homepage, so it needs to be reachable by anyone
// with dashboard access at all, then decide FOR ITSELF which of the 6
// section cards that specific caller is allowed to see, mirroring the same
// permission rules the sidebar itself uses (see dashboard/layout.jsx's
// canSee()) so nobody ever sees a stat card for a section they couldn't
// actually click into. Intentionally cheap (countDocuments-style, not the
// heavier revenue/profit aggregation getDashboardMetricsController above
// does) — this loads on every single dashboard visit, not just the
// Analytics tab.
export const getOverviewStatsController = async (req, res) => {
  try {
    const requester = await UserModel.findById(req.userId).select("role").lean();
    const role = requester?.role;
    if (!role || role === "USER") {
      return res.status(403).json({ success: false, error: true, message: "Dashboard overview is only available to staff accounts." });
    }

    const FULL_ACCESS_ROLES = new Set(["SUPERADMIN", "DEMO_ADMIN"]);
    let perms = {};
    if (!FULL_ACCESS_ROLES.has(role)) {
      const roleDoc = await RoleModel.findOne({ name: role }).lean();
      perms = roleDoc?.permissions || {};
    }
    const canView = (module) => {
      if (FULL_ACCESS_ROLES.has(role)) return true;
      if (role === "ADMIN" && !perms[module]) return true; // legacy admin fallback — matches permission.js/layout.jsx exactly
      return !!perms[module]?.view;
    };

    const sections = {};
    const jobs = [];

    if (canView("products")) {
      jobs.push((async () => {
        const [productCount, lowStockCount, pendingRequests] = await Promise.all([
          ProductModel.countDocuments({}),
          ProductModel.countDocuments({ $expr: { $lte: ["$stock", 10] } }), // same threshold as inventory.controller.js's own quick filter
          ProductRequestModel.countDocuments({ status: "Pending" }),
        ]);
        sections.products = { productCount, lowStockCount, pendingRequests };
      })());
    }

    if (canView("analytics")) {
      jobs.push((async () => {
        const since = new Date(); since.setHours(0, 0, 0, 0);
        const [ordersToday, deliveredTotal] = await Promise.all([
          OrderModel.countDocuments({ createdAt: { $gte: since } }),
          OrderModel.countDocuments({ order_status: "Delivered" }),
        ]);
        sections.analytics = { ordersToday, deliveredTotal };
      })());
    }

    if (canView("orders") || canView("customerCare") || canView("customers")) {
      jobs.push((async () => {
        const [pendingOrders, openTickets, customerCount] = await Promise.all([
          canView("orders") ? OrderModel.countDocuments({ order_status: { $in: ["Pending", "Confirmed", "On-Hold"] } }) : null,
          canView("customerCare") ? SupportTicketModel.countDocuments({ status: { $ne: "Closed" } }) : null,
          canView("customers") ? UserModel.countDocuments({ role: "USER" }) : null,
        ]);
        sections.customerCare = { pendingOrders, openTickets, customerCount };
      })());
    }

    if (canView("settings")) {
      jobs.push((async () => {
        sections.websiteMaintenance = { ok: true };
      })());
    }

    if (canView("hrPayroll")) {
      jobs.push((async () => {
        const employeeCount = await EmployeeModel.countDocuments({ status: "Active" });
        sections.hrPayroll = { employeeCount };
      })());
    }

    if (FULL_ACCESS_ROLES.has(role)) {
      jobs.push((async () => {
        const [roleCount, staffCount] = await Promise.all([
          RoleModel.countDocuments({}),
          UserModel.countDocuments({ role: { $nin: ["USER"] } }),
        ]);
        sections.security = { roleCount, staffCount };
      })());
    }

    await Promise.all(jobs);

    return res.json({ success: true, error: false, data: { role, sections } });
  } catch (err) {
    return res.status(500).json({ success: false, error: true, message: err.message });
  }
};
