import {
  SCORE_WEIGHTS,
  POPULARITY_COMPOSITE_WEIGHTS,
  FRESHNESS_HALF_LIFE_DAYS,
  FRESHNESS_FLOOR,
  timeDecayFactor,
} from "@/lib/recommendationConfig";

// Session 8, Phase 5 (new feature spec, Section 11 — the actual
// "normalize each factor, then combine via the given weights" engine
// every earlier phase has been building toward).
//
// Scores a BATCH of candidate products together, not one at a time —
// several factors (popularity, freshness) are only meaningful relative
// to the OTHER products actually being ranked right now ("popular"
// is inherently a comparison), so the normalization baseline has to be
// computed once across the whole candidate set, not re-derived
// separately per product. Section 11's own instruction — "normalize
// individual scores before combining them so one metric does not
// incorrectly dominate" — is the reason every factor below is scaled to
// a common 0-100 range before SCORE_WEIGHTS is ever applied.
//
// This function does NOT fetch anything itself (no DB calls) — it's
// pure scoring math over data the caller already gathered (Phase 3's
// affinityService, Phase 4's productStatsService, Phase 5's own
// locationService). Keeping it pure makes it possible to verify with
// plain function calls and real assertions (done below, and the same
// technique used for every other piece of novel logic this session) —
// no mocking a database is even needed for THIS file, only for the
// services that feed it.
//
// FACTOR DEFINITIONS — two of the seven needed a judgment call the spec
// doesn't spell out a formula for; both reasoned and documented here
// rather than left ambiguous:
// - userPreference vs categoryAffinity: the spec lists both as separate
//   factors (35% and 20%) — if they both just meant "category affinity,"
//   that would double-count one signal under two names. Here,
//   userPreference is the PRODUCT's own direct affinity score (has this
//   exact user shown interest in this exact product), categoryAffinity
//   is the product's CATEGORY's affinity score (broader — lets a product
//   the user has never seen before still rank well if it's in a category
//   they clearly like, which is the actual point of a recommendation
//   engine surfacing something new).
// - purchaseAffinity: combines direct product-purchase affinity with a
//   damped (×0.6) category-purchase affinity via Math.max — a product
//   this user has directly bought before scores highest, but a NEW
//   product in a category they've bought from before still gets partial
//   credit rather than zero. [ADDED] reasoning, not a spec-given formula.

/**
 * @param {Array<Object>} products - candidate products, each needing at
 *   least: _id, category (array of ref/populated category), createdAt,
 *   discount.
 * @param {Object} context
 * @param {Object} context.userAffinity - Phase 3's calculateUserAffinity() result.
 * @param {Map<string,Object>} context.productStatsMap - Phase 4's getProductPopularityStats() result.
 * @param {Map<string,number>} [context.regionalPopularityMap] - Phase 5's getRegionalPopularity() result. Optional — treated as all-zero (no location signal) when omitted, same as that service's own no-data fallback.
 * @param {Set<string>} [context.campaignProductIds] - product ids currently in an active campaign, for a promotion-score boost. Optional.
 * @returns {Array<{product: Object, score: number, breakdown: Object}>} sorted highest-score first.
 */
export function scoreRecommendationCandidates(products, context) {
  const { userAffinity, productStatsMap, regionalPopularityMap, campaignProductIds } = context || {};
  if (!products || products.length === 0) return [];

  const affinity = userAffinity || { categories: {}, products: {}, purchaseCategories: {}, purchaseProducts: {} };
  const statsMap = productStatsMap || new Map();
  const locationMap = regionalPopularityMap || new Map();
  const campaignSet = campaignProductIds || new Set();

  // ── Pass 1: raw, not-yet-normalized values every factor needs ──
  const raw = products.map((p) => {
    const id = p._id.toString();
    const categoryId = (p.category?.[0]?._id || p.category?.[0])?.toString();
    const stats = statsMap.get(id) || { views: 0, clicks: 0, wishlistCount: 0, cartCount: 0, purchaseCount: 0, recentSales: 0 };

    const rawPopularity = Object.entries(POPULARITY_COMPOSITE_WEIGHTS)
      .reduce((sum, [key, weight]) => sum + (stats[key] || 0) * weight, 0);

    const ageDays = p.createdAt ? (Date.now() - new Date(p.createdAt).getTime()) / (24 * 60 * 60 * 1000) : Infinity;
    const freshness = timeDecayFactor(ageDays, FRESHNESS_HALF_LIFE_DAYS, FRESHNESS_FLOOR) * 100;

    return { product: p, id, categoryId, rawPopularity, freshness };
  });

  // ── Normalization baseline (Section 11: normalize before combining) ──
  // Popularity is normalized relative to THIS candidate batch's own max
  // — "popular" only means something as a comparison among the products
  // actually being ranked together right now. Freshness is already a
  // 0-100 decay value per product (not batch-relative — a product's age
  // is an absolute fact, not a comparison to its neighbors), so it
  // doesn't need this step.
  const maxRawPopularity = Math.max(1, ...raw.map((r) => r.rawPopularity)); // floor of 1 avoids a division by zero when every candidate has zero recorded activity

  // ── Pass 2: normalize each factor to 0-100, combine via SCORE_WEIGHTS ──
  const scored = raw.map((r) => {
    const userPreference = affinity.products?.[r.id] || 0;
    const categoryAffinity = r.categoryId ? (affinity.categories?.[r.categoryId] || 0) : 0;
    const directPurchase = affinity.purchaseProducts?.[r.id] || 0;
    const categoryPurchase = r.categoryId ? (affinity.purchaseCategories?.[r.categoryId] || 0) : 0;
    const purchaseAffinity = Math.max(directPurchase, categoryPurchase * 0.6);
    const locationRelevance = locationMap.get(r.id) || 0;
    const popularity = (r.rawPopularity / maxRawPopularity) * 100;
    const freshness = r.freshness;
    const discount = r.product.discount || 0;
    const promotion = Math.min(100, discount * 2 + (campaignSet.has(r.id) ? 20 : 0));

    const breakdown = { userPreference, categoryAffinity, purchaseAffinity, locationRelevance, popularity, freshness, promotion };
    const score = Object.entries(SCORE_WEIGHTS)
      .reduce((sum, [factor, weight]) => sum + (breakdown[factor] || 0) * weight, 0);

    return { product: r.product, score: Math.round(score * 100) / 100, breakdown };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored;
}
