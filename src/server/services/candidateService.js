import ProductModel from "../models/product.model.js";
import { AVAILABILITY_FILTER } from "@/lib/recommendationConfig";

// Same escaped-regex approach product.controller.js's searchProductController
// already uses (its own "Fix 45" comment there explains why: `$text` proved
// unreliable when combined with other conditions, and only ever matched
// whole/stemmed words, never partial prefixes). Duplicated here as one pure,
// one-line utility rather than exporting product.controller.js's private
// version — that file is already-working, already-critical search code this
// session hasn't otherwise touched, and changing its export surface just to
// share a single trivial regex-escape function felt like a bigger, riskier
// edit than copying one safe line with a clear pointer back to its source.
const escapeRegex = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Session 8, Phase 6 (new feature spec, Sections 13 & 28 — the
// "Filter inactive/unavailable/out-of-stock → Generate candidate
// products" steps of the pipeline diagram in Section 28).
//
// One reusable, parameterized fetch rather than each future homepage
// section (Phase 9-10 — Recommended For You, Because You Viewed, etc.)
// re-implementing its own filter — Section 28's own words, "keep these
// responsibilities separated in the backend," is exactly the argument
// for centralizing this here: every section needs the SAME availability
// filter and the SAME exclusion-set mechanism, just with different
// category/limit/sort choices layered on top.
//
// The exclusion-set parameter is also this build's implementation of
// Section 26 (product diversity) at its most effective point: enforced
// at the SOURCE, so an already-used product is never even fetched or
// scored for a later section, rather than fetched, scored, and then
// discarded in a post-hoc dedup pass — cleaner than this project's own
// EARLIER (Sessions 6-7) homepage code, which fetches full candidate
// pools first and dedupes client-side afterward. Section 26's own named
// exception ("allow the same product in a highly relevant section such
// as Continue Shopping") is exactly why `excludeIds` is an optional
// parameter, not a hard-coded global rule this function enforces itself
// — the CALLER decides whether to pass the running exclusion set for a
// given section or not.

const DEFAULT_LIMIT = 200;

/**
 * @param {Object} [options]
 * @param {string[]} [options.categoryIds] - narrow to these categories.
 *   Omit for no category narrowing (e.g. a general "trending across
 *   everything" pool).
 * @param {string[]} [options.searchKeywords] - narrow to products whose
 *   name/alternativeSpellings match any of these terms (used for the
 *   "Based on Your Searches" section — Phase 10). Same escaped
 *   case-insensitive regex approach as the existing search endpoint, not
 *   `$text` — kept consistent with that already-established, already
 *   -fixed-once pattern rather than reintroducing the exact issue it was
 *   fixed for. Independent of `categoryIds` — a caller passing both gets
 *   products matching BOTH conditions (an AND across the two top-level
 *   match keys), which is correct MongoDB behavior, but no section this
 *   build adds actually needs that combination; each section uses one or
 *   the other.
 * @param {Iterable<string>} [options.excludeIds] - product ids to leave
 *   out entirely (Section 26 diversity — the running "already shown
 *   this request" set). Omit for sections exempt from that rule (see
 *   DIVERSITY_EXEMPT_SECTIONS in recommendationConfig.js).
 * @param {number} [options.limit]
 * @param {Object} [options.sort] - defaults to newest-first, a neutral
 *   choice that ensures a reasonable spread (including newer products)
 *   rather than always the same arbitrary insertion-order slice when a
 *   limit truncates a large matching set. The scoring engine (Phase 5)
 *   re-ranks whatever comes out of here anyway, so this ordering only
 *   matters for WHICH products make it into the pool under a limit, not
 *   for final display order.
 * @returns {Promise<Array<Object>>} lean product documents — category,
 *   createdAt, discount, and every other field the scoring engine
 *   (scoringService.js) and downstream display need are all real
 *   Product model fields, not a narrowed projection, since this pool
 *   feeds both scoring AND (eventually) direct rendering of whichever
 *   products are chosen.
 */
export async function getCandidateProducts({ categoryIds, searchKeywords, excludeIds, limit = DEFAULT_LIMIT, sort = { createdAt: -1 } } = {}) {
  const match = { ...AVAILABILITY_FILTER };
  if (categoryIds && categoryIds.length > 0) match.category = { $in: categoryIds };
  if (searchKeywords && searchKeywords.length > 0) {
    match.$or = searchKeywords.flatMap((kw) => {
      const safe = escapeRegex(kw);
      return [
        { name: { $regex: safe, $options: "i" } },
        { alternativeSpellings: { $elemMatch: { $regex: safe, $options: "i" } } },
      ];
    });
  }
  if (excludeIds) {
    const excludeArr = [...excludeIds];
    if (excludeArr.length > 0) match._id = { $nin: excludeArr };
  }

  return ProductModel.find(match).sort(sort).limit(limit).lean();
}
