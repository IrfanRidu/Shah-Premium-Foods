import ProductModel from "../models/product.model.js";
import CartProductModel from "../models/cartProduct.model.js";
import CampaignModel from "../models/campaign.model.js";
import { calculateUserAffinity } from "./affinityService.js";
import { getProductPopularityStats } from "./productStatsService.js";
import { getRegionalPopularity } from "./locationService.js";
import { getCandidateProducts } from "./candidateService.js";
import { scoreRecommendationCandidates } from "./scoringService.js";
import { selectWithExplorationAndDiversity } from "./explorationService.js";
import {
  fetchTrendingProducts,
  fetchBestSellingProducts,
  fetchLowSellingProducts,
  fetchNeverSoldProducts,
  fetchAllTimeBestSellingProducts,
} from "../controllers/analytics.controller.js";
import {
  AVAILABILITY_FILTER,
  DIVERSITY_EXEMPT_SECTIONS,
  HOT_DEAL_MIN_DISCOUNT,
  MIN_HOMEPAGE_ROW_SIZE,
  HOMEPAGE_BACKFILL_POOL_SIZE,
} from "@/lib/recommendationConfig";

// Session 8, Phase 8 (new feature spec, Section 29 — RECOMMENDATION API).
// This is the file where every previously-independent, independently
// -verified piece (Phases 2-7) gets called together for the first time.
// Nothing below re-derives logic that already exists elsewhere — every
// section either reuses an existing analytics function outright, or
// composes the Phase 3-7 pipeline pieces in the exact order Section 28's
// own diagram lays out.
//
// SECTION-BY-SECTION SOURCING — reasoned individually, not uniform:
// - trending/bestSelling/clearance/newArrivals/allTimeFavourites: the 5
//   sections that ALREADY existed (analytics.controller.js, Sessions
//   6-7) — reused directly via their exported fetch*() helpers, not
//   reimplemented. Each already has its own internal fallback logic for
//   thin data.
// - forYou: the full personalized pipeline over a GENERAL candidate
//   pool (no category narrowing) — the core "Recommended For You"
//   section the spec's Section 16 describes.
// - becauseYouViewed: same pipeline, but candidates narrowed to the
//   user's own top-affinity categories (from Phase 3's `categories`
//   map) — genuinely EMPTY (not a fallback-filled placeholder) for a
//   user with no browsing history yet, matching Section 30's "hide
//   sections with no products."
// - basedOnSearch: same pipeline, candidates narrowed via
//   candidateService's searchKeywords support, sourced from the user's
//   own top-affinity search terms (Phase 3's `searchKeywords` map).
//   Same "genuinely empty for no search history" reasoning.
// - hotDeals: [ADDED — ­not a spec-given formula] products with a
//   meaningful discount (>=15%), sorted by discount descending — a
//   direct, always-available product-level signal.
// - flashSale: [ADDED] products belonging to a CURRENTLY-ACTIVE,
//   time-boxed campaign — reuses the EXACT active-campaign filter
//   shape already established in campaign.controller.js's
//   getActiveCampaignsController (isActive + startTime/endTime window),
//   not a new invented time concept. Genuinely time-limited, unlike
//   hotDeals, which is why the two are sourced differently rather than
//   both just meaning "has a discount."
// - continueShopping: products currently in the user's cart. The one
//   section EXEMPT from the cross-section diversity/exclusion set
//   (spec Section 26's own named exception) — hiding a cart item just
//   because it also happened to appear in Trending would defeat the
//   entire point of "continue shopping."
//
// DIVERSITY (Section 26) is enforced by processing sections in the SAME
// order as the response shape itself (Section 29's own key order),
// maintaining one running exclusion Set threaded through every section
// in turn — a product claimed by an earlier section in this list can't
// appear in a later one (except continueShopping, per its exemption).

const SECTION_SIZE = 10;
const TOP_AFFINITY_ITEMS_FOR_CANDIDATES = 3; // how many of the user's top categories/keywords feed candidate narrowing

function applyDiversity(products, usedIds, sectionKey, limit = SECTION_SIZE) {
  const exempt = DIVERSITY_EXEMPT_SECTIONS.includes(sectionKey);
  const kept = [];
  for (const p of products) {
    const id = p._id.toString();
    if (!exempt && usedIds.has(id)) continue;
    kept.push(p);
    if (!exempt) usedIds.add(id);
    if (kept.length >= limit) break;
  }
  return kept;
}

// Shared by forYou/becauseYouViewed/basedOnSearch — fetch candidates,
// enrich with stats/location, score, then apply exploration+diversity.
// Pulled into one helper because all 3 personalized sections are
// genuinely the same 5-step pipeline with only the candidate-generation
// parameters differing.
async function runPersonalizedPipeline({ userId, sessionId, userAffinity, candidateOptions, usedProductIds, sectionKey }) {
  const candidates = await getCandidateProducts({ ...candidateOptions, excludeIds: usedProductIds, limit: 100 });
  if (candidates.length === 0) return [];

  const candidateIds = candidates.map((p) => p._id.toString());
  const [statsMap, locationMap] = await Promise.all([
    getProductPopularityStats(candidateIds),
    getRegionalPopularity(userId, candidateIds),
  ]);

  const scored = scoreRecommendationCandidates(candidates, {
    userAffinity, productStatsMap: statsMap, regionalPopularityMap: locationMap,
  });
  const selected = selectWithExplorationAndDiversity(scored, SECTION_SIZE);
  const products = selected.map((s) => s.product);

  selected.forEach((s) => usedProductIds.add(s.product._id.toString()));
  return products;
}

// ─── [ADDED] Minimum-row-size backfill ──────────────────────────────────
// See MIN_HOMEPAGE_ROW_SIZE's own comment in recommendationConfig.js for
// the full root-cause story. Short version: a section landing on a
// handful of real candidates (not zero, not a full SECTION_SIZE) is a
// page-composition side effect — an earlier section in the processing
// order already claimed the rest of an overlapping candidate pool — not
// a shortage of catalog inventory. So the fix hands that section a few
// MORE genuinely-unused products; it never relaxes the "no duplicate
// product anywhere on the page" rule that produced the collision in the
// first place (every product handed out here is drawn excluding
// `usedProductIds`, the exact same running exclusion set every section
// above already threads through).
//
// A section with ZERO real candidates is left exactly as it is — not
// backfilled. That's correct, existing, spec-aligned behaviour (a guest
// with no browsing history yet for a personalized section, or nothing
// currently qualifying for Hot Deals/Flash Sale), not the bug this fixes.
// Manufacturing 7 "Recommended For You" products for someone with zero
// signal would be misleading, not helpful — see config file comment.
// DIVERSITY_EXEMPT_SECTIONS (continueShopping) is skipped for the same
// "don't misrepresent what this section actually means" reason: it's the
// literal contents of the user's cart, not a recommendation.
//
// Returns whatever's left of the reserve pool afterward, so the caller
// can hand it to the frontend as `reservePool` — page.jsx runs this exact
// same top-up idea a second time client-side, because there is exactly
// one exclusion this function cannot see: which products are currently
// shown in a homepage campaign. That's decided per-request by the
// frontend (campaigns flagged `showOnHomepage`), not stored on the
// product document itself, so it can't be filtered out here.
async function backfillHomepageSections(sections, usedProductIds) {
  const reserve = await ProductModel.find({
    ...AVAILABILITY_FILTER,
    _id: { $nin: [...usedProductIds] },
  }).sort({ createdAt: -1 }).limit(HOMEPAGE_BACKFILL_POOL_SIZE).lean();

  let reserveIdx = 0;
  for (const key of Object.keys(sections)) {
    if (DIVERSITY_EXEMPT_SECTIONS.includes(key)) continue;
    const list = sections[key];
    if (list.length === 0 || list.length >= MIN_HOMEPAGE_ROW_SIZE) continue;
    while (list.length < MIN_HOMEPAGE_ROW_SIZE && reserveIdx < reserve.length) {
      const candidate = reserve[reserveIdx++];
      const id = candidate._id.toString();
      if (usedProductIds.has(id)) continue; // belt-and-suspenders — $nin above already excludes these
      list.push(candidate);
      usedProductIds.add(id);
    }
  }

  // Only hand back what's still genuinely unused, so the frontend's own
  // top-up pass never has to re-check something this pass already placed.
  return reserve.filter((p) => !usedProductIds.has(p._id.toString()));
}

/**
 * @param {Object} params
 * @param {string} [params.userId]
 * @param {string} [params.sessionId]
 * @returns {Promise<Object>} the 11-key response shape from spec Section 29,
 *   plus a 12th `reservePool` key ([ADDED], see backfillHomepageSections)
 *   the frontend uses for its own follow-up top-up pass.
 */
export async function getHomepageRecommendations({ userId, sessionId } = {}) {
  const usedProductIds = new Set();
  const sections = {};

  // Independent prerequisites, fetched together — none of these depend
  // on each other or on the running exclusion set.
  const [userAffinity, trendingRaw, bestSellingRaw, clearanceRaw, newArrivalsRaw, allTimeRaw, cartItems, activeCampaigns] = await Promise.all([
    calculateUserAffinity({ userId, sessionId }),
    fetchTrendingProducts(20),
    fetchBestSellingProducts(20, 30),
    fetchLowSellingProducts(20),
    fetchNeverSoldProducts(20),
    fetchAllTimeBestSellingProducts(20),
    userId ? CartProductModel.find({ userId }).populate("productId").sort({ updatedAt: -1 }).lean() : Promise.resolve([]),
    CampaignModel.find({ isActive: true, startTime: { $lte: new Date() }, endTime: { $gte: new Date() } })
      .populate({ path: "products.productId", select: "_id" })
      .lean(),
  ]);

  // Processed in the EXACT order of the response shape below, so the
  // running exclusion set's priority matches that order (Section 26).

  sections.trending = applyDiversity(trendingRaw, usedProductIds, "trending");

  sections.forYou = await runPersonalizedPipeline({
    userId, sessionId, userAffinity,
    candidateOptions: {},
    usedProductIds, sectionKey: "forYou",
  });

  // NOT `Object.keys(userAffinity.categories)` here — JS objects always
  // iterate integer-like string keys in ascending numeric order FIRST,
  // regardless of insertion order or value, before any other keys.
  // Category ids (Mongo ObjectIds, 24 hex chars, always contain at least
  // one a-f letter) never trigger this, but this same pattern is reused
  // for search keywords just below, where a purely numeric search term
  // ("5", "100") absolutely could occur — and would then jump to the
  // front regardless of its actual affinity score. Sorting
  // `Object.entries()` explicitly by value sidesteps the whole class of
  // bug rather than relying on any object key-ordering assumption.
  const topCategories = Object.entries(userAffinity.categories)
    .sort((a, b) => b[1] - a[1])
    .slice(0, TOP_AFFINITY_ITEMS_FOR_CANDIDATES)
    .map(([id]) => id);
  sections.becauseYouViewed = topCategories.length === 0 ? [] : await runPersonalizedPipeline({
    userId, sessionId, userAffinity,
    candidateOptions: { categoryIds: topCategories },
    usedProductIds, sectionKey: "becauseYouViewed",
  });

  const hotDealsRaw = await ProductModel.find({ ...AVAILABILITY_FILTER, discount: { $gte: HOT_DEAL_MIN_DISCOUNT } })
    .sort({ discount: -1 }).limit(20).lean();
  sections.hotDeals = applyDiversity(hotDealsRaw, usedProductIds, "hotDeals");

  sections.bestSelling = applyDiversity(bestSellingRaw, usedProductIds, "bestSelling");

  // Same reasoning as topCategories above — this is exactly where the
  // numeric-key ordering quirk would actually bite, since search terms
  // are free-text and a purely numeric one is a real possibility.
  const topSearchKeywords = Object.entries(userAffinity.searchKeywords)
    .sort((a, b) => b[1] - a[1])
    .slice(0, TOP_AFFINITY_ITEMS_FOR_CANDIDATES)
    .map(([kw]) => kw);
  sections.basedOnSearch = topSearchKeywords.length === 0 ? [] : await runPersonalizedPipeline({
    userId, sessionId, userAffinity,
    candidateOptions: { searchKeywords: topSearchKeywords },
    usedProductIds, sectionKey: "basedOnSearch",
  });

  sections.clearance = applyDiversity(clearanceRaw, usedProductIds, "clearance");
  sections.newArrivals = applyDiversity(newArrivalsRaw, usedProductIds, "newArrivals");

  const flashSaleProductIds = [
    ...new Set(
      activeCampaigns.flatMap((c) => c.products.map((p) => (p.productId?._id || p.productId)?.toString()).filter(Boolean))
    ),
  ];
  const flashSaleRaw = flashSaleProductIds.length === 0 ? [] : await ProductModel.find({
    ...AVAILABILITY_FILTER, _id: { $in: flashSaleProductIds },
  }).limit(20).lean();
  sections.flashSale = applyDiversity(flashSaleRaw, usedProductIds, "flashSale");

  sections.allTimeFavourites = applyDiversity(allTimeRaw, usedProductIds, "allTimeFavourites");

  // Exempt from diversity (Section 26's own named exception) — see
  // applyDiversity, which checks DIVERSITY_EXEMPT_SECTIONS itself.
  const cartProducts = cartItems.map((item) => item.productId).filter(Boolean);
  sections.continueShopping = applyDiversity(cartProducts, usedProductIds, "continueShopping", SECTION_SIZE);

  // [ADDED] Every section decided above; now top up anything that's
  // non-empty but thin (see backfillHomepageSections' own comment).
  const reservePool = await backfillHomepageSections(sections, usedProductIds);

  return { ...sections, reservePool };
}
