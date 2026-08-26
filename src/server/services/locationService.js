import mongoose from "mongoose";
import AddressModel from "../models/address.model.js";
import OrderModel from "../models/order.model.js";
import { resolveDeliveryCharge } from "../controllers/deliveryZone.controller.js";

// Session 8, Phase 5 (new feature spec, Section 12 — LOCATION-BASED
// RECOMMENDATION).
//
// SCOPE, reasoned from the REAL data model rather than the spec's full
// aspirational list (checked directly before designing anything —
// address.model.js has only a free-form `city` string, no structured
// region/geo field at all; deliveryZone.model.js is a simple city-name
// -list → {charge, estimatedDays} mapping for shipping cost, not a rich
// regional system). Of the spec's 7 location sub-items — "Product
// availability, Delivery availability, Delivery speed, Regional
// popularity, Nearby inventory, Regional demand, Location-specific
// promotions" — 4 have no real data to act on in this app: there is no
// per-region product-availability field (every published+in-stock
// product is available everywhere the store delivers), no multi
// -warehouse/"nearby inventory" concept (one online store), and no
// location-targeted campaign field. "Delivery speed" is the same for
// every product for a given user (a property of their zone, not a
// per-product distinction), so it can't function as a per-product
// RANKING signal the way the other 6 score factors do. This function
// implements the one sub-item that's both genuinely computable AND a
// genuine per-product signal: regional popularity/demand.
//
// DESIGN — reuses two pieces of ALREADY-EXISTING infrastructure rather
// than building a parallel system (the spec's own explicit instruction,
// Section 12: "use the existing address/location system... do not
// create a second one"):
// 1. `resolveDeliveryCharge` (deliveryZone.controller.js) — the exact
//    same city→zone resolution checkout already uses (case-insensitive
//    matchCities lookup, with its own established default-zone
//    fallback) — reused directly, not reimplemented.
// 2. `OrderModel.deliveryZoneId` — every order already records which
//    zone it was placed under (needed for the delivery charge that was
//    actually billed). This means "which products sell well in this
//    user's zone" is a direct aggregation over existing orders filtered
//    by that field — no separate step to cross-reference OTHER users'
//    addresses is needed at all, which would have been a meaningfully
//    more complex (and riskier to get right without a live database to
//    test against) design.

const DEFAULT_WINDOW_DAYS = 30;

/**
 * @param {string} userId
 * @param {string[]} candidateProductIds
 * @param {{windowDays?: number}} [options]
 * @returns {Promise<Map<string, number>>} productId → 0-100 regional
 *   -popularity score, normalized relative to the candidate set. Every
 *   requested id gets an entry. Falls back to a UNIFORM 0 for every
 *   candidate when no zone can be resolved (no userId, no saved address,
 *   or a guest who's never logged in) — a uniform value across every
 *   candidate has NO effect on their relative ranking, which is the
 *   correct, honest behaviour for "we have no location signal" rather
 *   than guessing. Matches spec Section 12's own explicit constraint,
 *   "location must NOT completely override user preference" — when
 *   location data doesn't exist, it now contributes nothing at all,
 *   rather than something invented.
 */
export async function getRegionalPopularity(userId, candidateProductIds, { windowDays = DEFAULT_WINDOW_DAYS } = {}) {
  const ids = (candidateProductIds || []).filter(Boolean).map((id) => id.toString());
  const neutral = new Map(ids.map((id) => [id, 0]));
  if (!userId || ids.length === 0) return neutral;

  // Most recently updated active address as this user's "current" one —
  // there's no explicit isDefault/isPrimary flag on address.model.js
  // (checked directly, not assumed), so this is the most reasonable
  // available proxy for "the address that best represents where they
  // are now."
  const address = await AddressModel.findOne({ userId, status: true }).sort({ updatedAt: -1 }).lean();
  if (!address?.city) return neutral;

  const { zoneId } = await resolveDeliveryCharge(address.city);
  if (!zoneId) return neutral;

  const since = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000);
  const objectIds = ids.map(toObjectIdIfValid).filter(Boolean);
  if (objectIds.length === 0) return neutral;

  const rows = await OrderModel.aggregate([
    { $match: { deliveryZoneId: zoneId, createdAt: { $gte: since }, order_status: { $nin: ["Cancelled", "Return"] } } },
    { $unwind: "$productDetails" },
    { $match: { "productDetails.productId": { $in: objectIds } } },
    { $group: { _id: "$productDetails.productId", qty: { $sum: "$productDetails.quantity" } } },
  ]);

  if (rows.length === 0) return neutral;

  const max = Math.max(...rows.map((r) => r.qty));
  const scored = new Map(neutral); // start from the same all-zero baseline for ids with no zone-local sales at all
  for (const row of rows) {
    const key = row._id?.toString();
    if (key && scored.has(key)) {
      scored.set(key, Math.round((row.qty / max) * 100 * 100) / 100);
    }
  }
  return scored;
}

// Same well-known aggregation gotcha guarded in productStatsService.js —
// Mongoose aggregate() does not auto-cast plain string ids to ObjectId
// the way .find() does.
function toObjectIdIfValid(id) {
  return mongoose.Types.ObjectId.isValid(id) ? new mongoose.Types.ObjectId(id) : null;
}
