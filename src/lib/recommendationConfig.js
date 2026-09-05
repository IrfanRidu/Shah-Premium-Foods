// Centralized recommendation-engine configuration.
//
// Session 8, Phase 3 (new feature spec: "Dynamic Personalized Homepage
// Product Recommendation System", Section 40: "Create a centralized
// configuration for recommendation weights... Do not hard-code these
// values in multiple files."). EVERY weight/threshold the recommendation
// engine uses, across every phase of this build, lives here. Nowhere else
// in the codebase should a raw number stand in for one of these — import
// from here instead, so a future tuning pass changes one file, not a
// scattered search-and-replace across the app.

// ─── Section 13: Product availability filter ───────────────────────────
// [SPEC] "Exclude: inactive, hidden, out-of-stock, unavailable, deleted
// products... use the existing product status and inventory fields, do
// not invent new stock logic." Checked product.model.js directly: there
// is ONLY `publish` (boolean) and `stock` (number) — no separate
// isDeleted/isHidden/isActive flag to also account for. This is the
// SAME filter shape already used consistently everywhere in this
// project since Session 6 (analytics.controller.js's fetch* helpers) —
// exported here as one shared constant so every future candidate query
// imports it instead of retyping `{publish:true, stock:{$gt:0}}` a 6th,
// 7th, 8th time. "Products unavailable in the user's location" (also in
// the spec's exclusion list) is NOT included — same conclusion reached
// independently while building locationService.js: there is no
// per-region product-availability field anywhere in this app's data
// model, so that specific exclusion has nothing to act on here.
export const AVAILABILITY_FILTER = { publish: true, stock: { $gt: 0 } };

// [ADDED] — not spec-given. Shared between homepageRecommendationService.js
// (the primary path) and the fallback query added to
// getHomepageRowsController (analytics.controller.js) — spec Section 36
// explicitly lists "Hot Deals" as part of the required fallback set when
// the main recommendation pipeline fails, so both paths need to agree on
// what a "hot deal" actually is. One shared constant instead of two
// independently-chosen numbers that could quietly drift apart and show
// a visibly different set of products depending on which path happened
// to serve a given request.
export const HOT_DEAL_MIN_DISCOUNT = 15;


// ─── Section 26: Product diversity ──────────────────────────────────────
// [SPEC] "Allow the same product to appear in a highly relevant section
// such as Continue Shopping if necessary" — the one named, explicit
// exception to the otherwise-strict cross-section exclusion rule.
export const DIVERSITY_EXEMPT_SECTIONS = ["continueShopping"];

// ─── [ADDED] Minimum homepage row size ─────────────────────────────────
// Not spec-given — a direct, explicit product requirement from real-world
// use of the build: "every product row must have at least 7 products to
// display." Root cause of the earlier bug this fixes: several of the
// "always-on" catalog rows (Trending / Best Selling / Clearance / New
// Arrivals / All-Time Favourites) each have their OWN internal fallback
// for when real order/activity history is thin (see analytics.controller.js
// fetch*Products helpers), and more than one of those fallbacks collapses
// to the SAME underlying query shape ("newest N published, in-stock
// products") whenever that happens. Combined with the strict, sequential,
// page-wide "no duplicate product anywhere on the homepage" rule (the
// diversity/dedup logic in homepageRecommendationService.js and its
// frontend mirror in page.jsx — itself a deliberate, previously-requested
// fix, not something to relax), whichever row is processed first claims
// the entire overlapping pool and starves every later row drawing from
// that same near-identical set. That's what a 1-2-product row actually is:
// not a lack of catalog inventory, but several rows independently reaching
// for the same thin slice of it.
//
// The fix is a backfill/top-up pass, applied AFTER a section's own natural
// (post-dedup) candidates are decided, never instead of them: any section
// that has SOME real candidates (>0) but fewer than this minimum is padded
// up to it using HOMEPAGE_BACKFILL_POOL_SIZE below, drawn from products not
// already used anywhere else on the page — so the "no duplicates" rule
// stays fully intact. A section with ZERO real candidates (e.g. a guest
// with no browsing history yet for a personalized section, or no product
// currently qualifies for Hot Deals/Flash Sale) is left untouched and
// stays hidden — that is correct, existing, spec-aligned behaviour, not
// the bug being fixed here; manufacturing 7 "Recommended For You" items
// for someone with zero signal would be actively misleading rather than
// helpful. DIVERSITY_EXEMPT_SECTIONS (continueShopping) is also excluded
// from backfill for the same reason: that row is literally the contents
// of the user's own cart, not a recommendation, so padding it with
// unrelated products would misrepresent what's actually in it.
//
// 7 was the number given, not derived from a layout constraint — kept as
// its own named constant rather than a bare literal so the reasoning above
// travels with it and a future change is a one-line edit.
export const MIN_HOMEPAGE_ROW_SIZE = 7;

// How many extra candidate products to draw, in one query, as the shared
// backfill reserve every under-filled section pulls from. Sized with
// headroom rather than tightly: worst case is every "always-on" section
// (5 catalog rows + Hot Deals + Flash Sale = 7 of the 11) needing a full
// top-up to MIN_HOMEPAGE_ROW_SIZE at once, i.e. up to 7*7=49 products, plus
// this same pool is also hand-off to the frontend as a second-line reserve
// (page.jsx tops up further if a homepage campaign removes a product from
// an already-backfilled row — the backend has no visibility into which
// campaigns are currently shown on the homepage, only the frontend does).
// 120 comfortably covers both uses against this project's seeded catalog
// (100 products) without needing to be re-tuned if the catalog grows a
// little; it is NOT assumed to exceed the full catalog size, since the
// query it drives is itself bounded by however many matching products
// actually exist.
export const HOMEPAGE_BACKFILL_POOL_SIZE = 120;

// ─── Section 8: Behaviour weights ──────────────────────────────────────
// Values marked [SPEC] are the exact numbers given in the command prompt
// (Section 8) — not rounded, not adjusted. Values marked [ADDED] are for
// event types Phase 2 (this project's own activity-tracking build) added
// that the spec's Section 8 list didn't itself cover. Each [ADDED] value
// is reasoned by the SAME signal-strength logic the spec's own numbers
// already follow (a bigger commitment = a bigger number) — flagged
// explicitly, deliberately not left ambiguous, so nobody mistakes an
// invented number for one the spec actually specified.
export const BEHAVIOUR_WEIGHTS = {
  view: 1,                // [SPEC] Product View = +1
  product_click: 2,       // [SPEC] Product Click = +2
  category_view: 2,       // [SPEC] Category View = +2
  subcategory_view: 2,    // [ADDED] a subcategory view is a more specific
                           // instance of the same "browsing a category"
                           // signal the spec already weights at +2 — no
                           // principled reason to weight it differently.
  search: 3,               // [SPEC] Search = +3
  wishlist_add: 5,         // [SPEC] Wishlist = +5
  product_share: 6,        // [ADDED] sharing implies enough enthusiasm to
                           // tell someone else — reasoned as a stronger
                           // endorsement than wishlisting, placed between
                           // wishlist (+5) and add-to-cart (+8).
  add_to_cart: 8,           // [SPEC] Add to Cart = +8
  purchase: 15,             // [SPEC] Purchase = +15

  // Negative-signal events — the spec's own Section 8 list only covers
  // positive-commitment events. These two [ADDED] entries represent a
  // user RECONSIDERING/UNDOING an earlier action, so they pull affinity
  // down instead of up, rather than being ignored (silently not counting
  // a reversal at all would let a wishlist-then-immediately-remove still
  // read as +5 of positive interest, which is wrong).
  wishlist_remove: -2,     // [ADDED] mild negative — undoing a lower-
                           // commitment action.
  remove_from_cart: -4,    // [ADDED] stronger negative — undoing a
                           // higher-commitment one.

  // page_visit deliberately has NO entry here — it's a generic "some
  // page loaded" signal with no product/category attached most of the
  // time, and isn't a preference signal the way every other tracked
  // event type is. Code computing affinity should simply not encounter
  // page_visit rows in the first place (see AFFINITY_EVENT_TYPES below),
  // not silently fall back to some default weight for it.
};

// The actionType values BEHAVIOUR_WEIGHTS actually assigns a real number
// to — i.e. the event types the affinity engine should aggregate over.
// Exported as its own list (rather than every caller re-deriving this via
// Object.keys each time, or worse, hand-typing a separate list that could
// drift out of sync with BEHAVIOUR_WEIGHTS above) so "which events count
// toward affinity" has exactly one source of truth.
export const AFFINITY_EVENT_TYPES = Object.keys(BEHAVIOUR_WEIGHTS);

// ─── Section 9: Time decay ──────────────────────────────────────────────
// Spec: "Today=100%, 7d=80%, 30d=50%, 90d=20%, 180+d=5%... use a
// maintainable mathematical implementation rather than manually assigning
// a percentage to every event." Modeled as exponential decay with a
// half-life, floored so behaviour never counts for literally zero no
// matter how old — a lookup table keyed by exact day counts would be
// neither "maintainable" nor able to handle every possible age, which is
// exactly what that instruction is steering away from.
//
// HALF_LIFE_DAYS=35 was chosen by checking the fit against ALL 5 of the
// spec's own reference points rather than picking an arbitrary round
// number — no single half-life value passes through all 5 exactly, since
// they don't all lie on one true exponential curve (fitting any 2 of them
// precisely pulls the other 3 further off); 35 keeps every point
// reasonably close rather than making one exact at the cost of the rest.
// Actual fit against the spec's own targets:
//   day   0: 100% (target 100)      day  90:  17% (target 20)
//   day   7:  87% (target  80)      day 180:   5% (target  5, via floor)
//   day  30:  55% (target  50)
// "Approximately" — the spec's own word — not a forced perfect fit.
export const DECAY_HALF_LIFE_DAYS = 35;
export const DECAY_FLOOR = 0.05; // 180+ days ≈ 5%, and never decays past this

/**
 * @param {number} ageDays
 * @param {number} [halfLifeDays] - defaults to the behavioural-decay
 *   half-life above. Overridable so other decay needs (e.g. product
 *   freshness, added in Phase 5 — a different phenomenon on a different
 *   natural timescale, see FRESHNESS_HALF_LIFE_DAYS below) can reuse
 *   this SAME formula instead of a second copy of it, without changing
 *   this function's behavior for its original caller: affinityService.js
 *   calls this with exactly one argument today, so this parameter
 *   defaulting to DECAY_HALF_LIFE_DAYS keeps that call's result
 *   byte-for-byte identical to before this signature was extended.
 * @param {number} [floor] - defaults to the behavioural-decay floor
 *   above, overridable for the same reason.
 */
export function timeDecayFactor(ageDays, halfLifeDays = DECAY_HALF_LIFE_DAYS, floor = DECAY_FLOOR) {
  if (!ageDays || ageDays <= 0) return 1;
  return Math.max(floor, Math.pow(0.5, ageDays / halfLifeDays));
}

// How far back the affinity engine bothers querying activity history.
// Not numbered in the spec directly — reasoned from DECAY_FLOOR above:
// anything older than this contributes the SAME fixed floor weight
// regardless of whether it's 200 days old or 2000, so there's no accuracy
// lost by not querying further back, only wasted query cost against
// activity that can no longer move the result either way.
export const AFFINITY_LOOKBACK_DAYS = 180;

// ─── Freshness (feeds Section 11's "Freshness" score factor) ───────────
// Deliberately its own half-life, NOT a reuse of DECAY_HALF_LIFE_DAYS
// above — that constant was fit specifically to Section 9's BEHAVIOURAL
// -decay reference points ("how stale is a user's browsing signal"), a
// different phenomenon on a different natural timescale than "how
// recently was this product listing created." 14 days: a product reads
// as meaningfully "new" for about two weeks, which is a reasonable,
// ordinary window for a grocery/general-goods catalog (not, say,
// electronics, where "new" might reasonably mean months) — a genuine
// judgment call, not a spec-given number, since the spec's Section 11
// says a "Freshness" factor should exist but doesn't give it a formula
// or timescale the way Section 9 did for behavioural decay.
export const FRESHNESS_HALF_LIFE_DAYS = 14;
// Unlike DECAY_FLOOR above (behavioural signals are kept at a 5% floor
// forever, per the spec's own Section 9 instruction), freshness has NO
// floor — an old product genuinely isn't "fresh" at all, so its
// freshness score should be allowed to decay all the way toward 0,
// not get artificially propped up the way old BEHAVIOUR is deliberately
// propped up.
export const FRESHNESS_FLOOR = 0;

// ─── Popularity composite (feeds Section 11's "Popularity" score factor) ─
// [ADDED] — not spec-given. Phase 4's productStatsService.js returns 6
// raw counts (views/clicks/wishlistCount/cartCount/purchaseCount/
// recentSales); this blends them into ONE composite before normalizing,
// weighted so purchase-related metrics count for meaningfully more than
// a mere view — the same signal-strength reasoning BEHAVIOUR_WEIGHTS
// above already applies at the individual-user level, applied here at
// the aggregate product-popularity level instead.
export const POPULARITY_COMPOSITE_WEIGHTS = {
  views: 1,
  clicks: 2,
  wishlistCount: 3,
  cartCount: 4,
  purchaseCount: 8,
  recentSales: 2, // counted separately from purchaseCount (units vs. distinct orders), lower per-unit weight since one large order shouldn't dominate as much as several separate purchase decisions do
};

// ─── Section 11: Recommendation score factors ──────────────────────────
// [SPEC] exact values. Sanity-checked, not just copied: 35+20+15+10+8+5+7
// = 100, confirming these really are meant to sum to a whole score.
// Consumed by the scoring engine — Phase 5, not built yet as of this
// commit. Defined here now, from the start, so Phase 5 pulls from this
// one file rather than inventing its own copy of the same 7 numbers.
export const SCORE_WEIGHTS = {
  userPreference: 0.35,
  categoryAffinity: 0.20,
  purchaseAffinity: 0.15,
  locationRelevance: 0.10,
  popularity: 0.08,
  freshness: 0.05,
  promotion: 0.07,
};

// ─── Section 40: Controlled exploration ─────────────────────────────────
// [SPEC] "Exploration = 20%, Personalized/high-confidence = 80%".
// Consumed by Phase 7 (diversity + controlled exploration) — defined here
// now for the same "one file, from the start" reason as SCORE_WEIGHTS.
export const EXPLORATION_PERCENTAGE = 0.20;
