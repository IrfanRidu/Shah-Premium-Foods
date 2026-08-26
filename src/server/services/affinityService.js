import ActivityLogModel from "../models/activityLog.model.js";
import ProductModel from "../models/product.model.js";
import {
  BEHAVIOUR_WEIGHTS,
  AFFINITY_EVENT_TYPES,
  AFFINITY_LOOKBACK_DAYS,
  timeDecayFactor,
} from "@/lib/recommendationConfig";

// Session 8, Phase 3 (new feature spec: "Dynamic Personalized Homepage
// Product Recommendation System", Sections 7 & 10 — user preference
// engine + category affinity).
//
// IMPLEMENTATION CHOICE, deliberate: this computes weighted+decayed
// affinity in plain JavaScript over a fetched event list, NOT as a
// MongoDB aggregation pipeline expressing the same decay math in
// `$dateDiff`/`$pow`/etc. This sandbox has no live database to actually
// run an aggregation pipeline against — a pipeline that's valid JSON but
// semantically wrong (an easy mistake translating exponential decay into
// aggregation operators) would pass every syntax check this project can
// run and only fail at real query time, which is exactly the class of
// bug this project's whole approach has been built around avoiding. A
// plain `.find().lean()` bounded by AFFINITY_LOOKBACK_DAYS, with the
// scoring math in ordinary JS I can trace by hand with full confidence,
// is the safer choice given that constraint — and for the actual data
// volume here (one person's activity within a ~6-month window, not
// company-wide analytics), it's a perfectly reasonable approach on its
// own merits too, not just a workaround. A future session with real
// database access could migrate this to a pipeline for marginally better
// DB-side performance at very large per-user event counts — a legitimate
// future optimization, not a correctness requirement right now.
//
// SCOPE NOTE: the spec's Section 7 list is "Categories, Subcategories,
// Products, Brands, Price ranges, Search keywords" — this computes the
// first, second, third, and sixth of those. Brand and price-range
// affinity are DEFERRED, not silently dropped: both would require
// resolving each event's productId to a product document (brand lives in
// Product.more_details, an unstructured field, not a direct ref the way
// categoryId/subCategoryId already are on every event; price range needs
// a bucketing scheme against Product.price) — real, addable work, but a
// join/lookup layer this function doesn't have yet, and not load-bearing
// for the core recommendation loop the way category/product affinity is
// (Section 10 calls category affinity out as its own numbered
// requirement; brand/price-range aren't mentioned again anywhere else in
// the spec). Deliberately NOT returned as empty placeholder keys either —
// that could read as "computed, happened to be empty" rather than "not
// computed yet," which would be misleading to whatever calls this next.

/**
 * @param {Object} params
 * @param {string} [params.userId] - authenticated user's _id. Preferred
 *   over sessionId when both are available (see reasoning below).
 * @param {string} [params.sessionId] - guest session id. Only used when
 *   userId isn't provided.
 * @param {number} [params.lookbackDays]
 * @returns {Promise<{categories:Object, subCategories:Object, products:Object, searchKeywords:Object, purchaseCategories:Object, purchaseProducts:Object, totalEvents:number}>}
 *   Each score map is { [id or normalized keyword]: number }, normalized
 *   0-100 relative to that person's OWN top entry in that dimension (so
 *   the top category is always 100, matching the shape of the spec's own
 *   worked example — "Spices=86, Groceries=63..." — a relative ranking
 *   within one person's data, not an absolute scale comparable across
 *   different people), sorted highest-first, and with any net-non
 *   -positive entry excluded entirely (see bottom of file for why a
 *   negative net score must not appear as a "top affinity").
 *   `purchaseCategories`/`purchaseProducts` (added for spec Section 11's
 *   separate "Purchase Affinity" score factor, distinct from the general
 *   blended `categories`/`products` above): the SAME computation, but
 *   restricted to only actionType==="purchase" events — isolates "has
 *   this person actually BOUGHT from this category/product before" from
 *   the general "has this person shown any interest at all" signal the
 *   main categories/products maps already blend every event type into.
 */
export async function calculateUserAffinity({ userId, sessionId, lookbackDays = AFFINITY_LOOKBACK_DAYS } = {}) {
  const empty = {
    categories: {}, subCategories: {}, products: {}, searchKeywords: {},
    purchaseCategories: {}, purchaseProducts: {}, totalEvents: 0,
  };
  if (!userId && !sessionId) return empty;

  const since = new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000);
  const match = { actionType: { $in: AFFINITY_EVENT_TYPES }, createdAt: { $gte: since } };
  // Prefer userId when known (a logged-in user's full behaviour history,
  // already merged across every past guest session via completeLogin —
  // see user.controller.js). Fall back to sessionId only when there's no
  // userId at all (a guest who hasn't logged in yet). Deliberately never
  // matching BOTH at once: once logged in, that same session's rows
  // already have userId set (by the merge), so matching on sessionId too
  // would just re-select the identical rows a second time under a
  // different filter, not add any new data — not a correctness bug if it
  // did happen, just pointless.
  if (userId) match.userId = userId;
  else match.sessionId = sessionId;

  const events = await ActivityLogModel.find(match)
    .select("actionType productId categoryId subCategoryId searchQuery createdAt")
    .lean();

  if (events.length === 0) return empty;

  // Purchase events (added in this session's Phase 2, order.controller.js
  // `logPurchaseActivity`) do NOT carry categoryId directly — traced this
  // deliberately rather than assumed it: `buildOrderItems` only selects
  // name/image/price/discount/costPrice from the product, category was
  // never part of that shape. Every OTHER event type here (view, click,
  // add_to_cart, etc.) DOES get categoryId set directly by its own
  // logActivity call site, since each of those already has the full
  // product object in hand at the moment it fires. Rather than re-touch
  // order.controller.js's already-verified transaction-adjacent code
  // again just to thread one more field through it, this resolves
  // purchase events' category HERE instead, with one small lookup
  // query — lower risk (contained entirely in this file) and the actual
  // right layer for it anyway (an affinity CALCULATION concern, not an
  // order-placement concern).
  const purchaseProductIdsNeedingCategory = [
    ...new Set(
      events
        .filter((ev) => ev.actionType === "purchase" && !ev.categoryId && ev.productId)
        .map((ev) => ev.productId.toString())
    ),
  ];
  const resolvedCategoryByProductId = new Map();
  if (purchaseProductIdsNeedingCategory.length > 0) {
    const productsWithCategory = await ProductModel.find({ _id: { $in: purchaseProductIdsNeedingCategory } })
      .select("category")
      .lean();
    for (const p of productsWithCategory) {
      const catId = p.category?.[0]?._id || p.category?.[0];
      if (catId) resolvedCategoryByProductId.set(p._id.toString(), catId.toString());
    }
  }

  const now = Date.now();
  const DAY_MS = 24 * 60 * 60 * 1000;
  const categories = new Map();
  const subCategories = new Map();
  const products = new Map();
  const searchKeywords = new Map();
  // Session 8, Phase 5 addition (purely additive — the loop below still
  // computes categories/subCategories/products/searchKeywords exactly as
  // Phase 3 already verified; these two are NEW parallel accumulators
  // bumped only on a purchase event, reusing the same bump()/
  // normalizeAffinityMap() helpers Phase 3 already proved correct).
  const purchaseCategories = new Map();
  const purchaseProducts = new Map();

  const bump = (map, key, amount) => {
    if (!key) return;
    const k = key.toString();
    map.set(k, (map.get(k) || 0) + amount);
  };

  for (const ev of events) {
    const weight = BEHAVIOUR_WEIGHTS[ev.actionType];
    if (weight === undefined) continue; // defensive — shouldn't happen given the $in filter above
    const ageDays = (now - new Date(ev.createdAt).getTime()) / DAY_MS;
    const score = weight * timeDecayFactor(ageDays);

    bump(categories, ev.categoryId, score);
    bump(subCategories, ev.subCategoryId, score);
    bump(products, ev.productId, score);
    if (ev.actionType === "purchase") {
      const purchaseCategoryId = ev.categoryId || resolvedCategoryByProductId.get(ev.productId?.toString());
      bump(purchaseCategories, purchaseCategoryId, score);
      bump(purchaseProducts, ev.productId, score);
    }
    if (ev.actionType === "search" && ev.searchQuery) {
      const normalized = ev.searchQuery.trim().toLowerCase();
      if (normalized) bump(searchKeywords, normalized, score);
    }
  }

  return {
    categories: normalizeAffinityMap(categories),
    subCategories: normalizeAffinityMap(subCategories),
    products: normalizeAffinityMap(products),
    searchKeywords: normalizeAffinityMap(searchKeywords),
    purchaseCategories: normalizeAffinityMap(purchaseCategories),
    purchaseProducts: normalizeAffinityMap(purchaseProducts),
    totalEvents: events.length,
  };
}

// A net-zero-or-negative entry (e.g. someone added a product to their
// cart once, then removed it twice — remove_from_cart's -4 outweighing
// add_to_cart's +8 after 2 removes) must not appear as a "top affinity"
// at all, even at a score of 0 — it represents net REJECTION, not neutral
// -to-mild interest, and returning it (even ranked last) would mislabel
// it as a preference. Filtered out entirely rather than clamped to 0 and
// kept, which would silently misrepresent what it means for a future
// caller (Phase 5's scoring engine) that just reads "is this id present
// and how big is its number" without re-deriving this same distinction.
function normalizeAffinityMap(map) {
  const positive = [...map.entries()].filter(([, v]) => v > 0);
  if (positive.length === 0) return {};
  const max = Math.max(...positive.map(([, v]) => v));
  const scaled = positive.map(([k, v]) => [k, Math.round((v / max) * 100 * 100) / 100]);
  scaled.sort((a, b) => b[1] - a[1]);
  return Object.fromEntries(scaled);
}
