import mongoose from "mongoose";
import ActivityLogModel from "../models/activityLog.model.js";
import WishlistModel from "../models/wishlist.model.js";
import CartProductModel from "../models/cartProduct.model.js";
import OrderModel from "../models/order.model.js";

// Session 8, Phase 4 (new feature spec, Section 14 — PRODUCT POPULARITY).
// "Maintain or calculate product-level statistics such as: views, clicks,
// wishlistCount, cartCount, purchaseCount, recentSales, conversionRate...
// Popularity should prioritize recent activity. A product with high
// lifetime views but poor recent performance should not automatically
// remain permanently in the Trending section."
//
// Confirmed via Phase 1's analysis (this project has no stored counter
// fields on the product model at all) that this project's own established
// pattern is computing these on read via aggregation, not maintaining
// denormalized counters that can drift out of sync — analytics.
// controller.js (built in Sessions 6-7 of this project) already does
// exactly this for trending/best-selling. This continues that pattern
// rather than introducing a second one.
//
// TWO METRIC SHAPES, deliberately different, matching what each metric
// actually means:
// - views / clicks / purchaseCount / recentSales are EVENT-based and
//   windowed to `windowDays` — the spec's own "prioritize recent
//   activity" instruction is explicitly about not letting old activity
//   count forever, which only makes sense for a metric that accumulates
//   over time in the first place.
// - wishlistCount / cartCount are CURRENT-STATE snapshots (a real count
//   of WishlistModel/CartProductModel documents that exist RIGHT NOW),
//   not windowed. There is no principled "recent wishlist adds" number
//   to prioritize here the spec's instruction would apply to — someone
//   who wishlisted a product 4 months ago and never removed it still has
//   it wishlisted today, and that's exactly as real a demand signal now
//   as a wishlist add from this morning is. Re-deriving this from
//   wishlist_add/wishlist_remove EVENTS instead (summing adds minus
//   removes over a window) would be strictly worse — noisier, and wrong
//   the moment a user's add/remove happened outside whatever window was
//   chosen — when the actual current-membership tables already give the
//   exact right answer directly.
//
// purchaseCount/recentSales deliberately come from OrderModel (the same
// `$unwind`+`$group` shape analytics.controller.js's own
// fetchBestSellingProducts already uses, including its
// order_status:{$nin:["Cancelled","Return"]} exclusion) rather than this
// project's own newer ActivityLogModel "purchase" events (added in this
// same session's Phase 2) — those fire unconditionally the moment an
// order is placed/paid, with no way to later know if that order was
// subsequently cancelled or returned. OrderModel's current status is the
// authoritative, current-truth source for "did this actually end up sold"
// the way ActivityLogModel's fire-and-forget event log was never meant to
// be.
//
// purchaseCount = number of separate orders containing this product
// (within the window) — "how many distinct purchase decisions".
// recentSales = total UNITS sold (within the window) — "sales volume".
// These are genuinely different numbers (one order for 5 units is 1
// purchaseCount but 5 recentSales) — the spec lists them as two separate
// metrics, not one metric under two names.
//
// conversionRate = purchaseCount / views (within the window) — the
// standard "of everyone who viewed this, what fraction bought it" e
// -commerce funnel metric. Guarded against divide-by-zero (a product
// with 0 views and a low-but-nonzero purchaseCount can't happen in
// practice — you can't buy what you never viewed the page for through
// this site's own flow — but guarded anyway rather than trusting that
// invariant always holds).

const DEFAULT_WINDOW_DAYS = 30; // matches analytics.controller.js's own existing bestSelling default

/**
 * @param {string[]} productIds
 * @param {{windowDays?: number}} [options]
 * @returns {Promise<Map<string, {views:number, clicks:number, wishlistCount:number, cartCount:number, purchaseCount:number, recentSales:number, conversionRate:number}>>}
 *   Keyed by productId.toString(). A productId with genuinely zero
 *   activity anywhere still gets an entry (all-zero), not an absent key —
 *   callers (Phase 5's scoring engine) can rely on every requested id
 *   being present rather than needing their own "or default to zero"
 *   fallback at every call site.
 */
export async function getProductPopularityStats(productIds, { windowDays = DEFAULT_WINDOW_DAYS } = {}) {
  const stats = new Map();
  const ids = (productIds || []).filter(Boolean).map((id) => id.toString());
  if (ids.length === 0) return stats;

  for (const id of ids) {
    stats.set(id, { views: 0, clicks: 0, wishlistCount: 0, cartCount: 0, purchaseCount: 0, recentSales: 0, conversionRate: 0 });
  }

  const since = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000);

  const [viewCounts, clickCounts, wishlistCounts, cartCounts, orderAgg] = await Promise.all([
    ActivityLogModel.aggregate([
      { $match: { actionType: "view", productId: { $in: ids.map(toObjectIdIfValid) }, createdAt: { $gte: since } } },
      { $group: { _id: "$productId", count: { $sum: 1 } } },
    ]),
    ActivityLogModel.aggregate([
      { $match: { actionType: "product_click", productId: { $in: ids.map(toObjectIdIfValid) }, createdAt: { $gte: since } } },
      { $group: { _id: "$productId", count: { $sum: 1 } } },
    ]),
    WishlistModel.aggregate([
      { $match: { productId: { $in: ids.map(toObjectIdIfValid) } } },
      { $group: { _id: "$productId", count: { $sum: 1 } } },
    ]),
    CartProductModel.aggregate([
      { $match: { productId: { $in: ids.map(toObjectIdIfValid) } } },
      { $group: { _id: "$productId", count: { $sum: 1 } } },
    ]),
    OrderModel.aggregate([
      { $match: { createdAt: { $gte: since }, order_status: { $nin: ["Cancelled", "Return"] } } },
      { $unwind: "$productDetails" },
      { $match: { "productDetails.productId": { $in: ids.map(toObjectIdIfValid) } } },
      { $group: {
          _id: "$productDetails.productId",
          purchaseCount: { $sum: 1 },
          recentSales: { $sum: "$productDetails.quantity" },
        },
      },
    ]),
  ]);

  applyCounts(stats, viewCounts, "views");
  applyCounts(stats, clickCounts, "clicks");
  applyCounts(stats, wishlistCounts, "wishlistCount");
  applyCounts(stats, cartCounts, "cartCount");
  for (const row of orderAgg) {
    const key = row._id?.toString();
    const entry = stats.get(key);
    if (entry) {
      entry.purchaseCount = row.purchaseCount || 0;
      entry.recentSales = row.recentSales || 0;
    }
  }

  for (const entry of stats.values()) {
    entry.conversionRate = entry.views > 0 ? Math.round((entry.purchaseCount / entry.views) * 10000) / 10000 : 0;
  }

  return stats;
}

function applyCounts(stats, rows, field) {
  for (const row of rows) {
    const key = row._id?.toString();
    const entry = stats.get(key);
    if (entry) entry[field] = row.count || 0;
  }
}

// Mongoose aggregate() (unlike .find()) does NOT automatically cast plain
// string ids in a $match to ObjectId — passing raw strings here would
// silently match nothing rather than error, which is a well-known
// aggregation gotcha worth guarding explicitly instead of re-discovering
// it against a real database this sandbox doesn't have. Invalid-shaped
// ids are filtered rather than thrown on — a scoring pipeline for many
// candidate products shouldn't hard-fail entirely because one id in the
// batch was malformed.
function toObjectIdIfValid(id) {
  return mongoose.Types.ObjectId.isValid(id) ? new mongoose.Types.ObjectId(id) : null;
}
