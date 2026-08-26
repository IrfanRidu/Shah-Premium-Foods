import { EXPLORATION_PERCENTAGE } from "@/lib/recommendationConfig";

// Session 8, Phase 7 (new feature spec, Sections 27 & 28 — the final
// "Apply exploration → Apply diversity → Apply controlled randomization
// → Return products" steps of the pipeline).
//
// Operates on the OUTPUT of scoringService.js's scoreRecommendationCandidates
// (already-scored, already-sorted-descending candidates) — a genuinely
// different concern from candidateService.js's pre-scoring filtering, so
// it's its own file rather than folded into either (Section 28's own
// words: "keep these responsibilities separated").
//
// EXPLORATION POOL DERIVATION — [ADDED] design choice, not spelled out by
// the spec as a formula: "the exploration pool should introduce products
// the user has not interacted with" is satisfied by reading
// `breakdown.userPreference === 0` directly off each scored candidate —
// scoringService.js already computed this (zero direct product-level
// affinity, from Phase 3's affinity engine), so there's no need for a
// second, separate "has this user seen this product" signal or parameter.
// Reusing what's already there instead of computing the same fact twice.

const SIMILARITY_THRESHOLD = 5; // score points (0-100 scale) — see shuffleSimilarScoreClusters below

/**
 * @param {Array<{product:Object, score:number, breakdown:Object}>} scoredCandidates
 *   Already sorted descending by score (scoringService.js's own contract).
 * @param {number} targetCount - how many final products to return.
 * @returns {Array<{product:Object, score:number, breakdown:Object}>}
 */
export function selectWithExplorationAndDiversity(scoredCandidates, targetCount) {
  if (!scoredCandidates || scoredCandidates.length === 0 || targetCount <= 0) return [];

  const explorationSlots = Math.round(targetCount * EXPLORATION_PERCENTAGE);
  const highConfidenceSlots = targetCount - explorationSlots;

  // High-confidence bucket: simply the top-scored candidates overall —
  // "high-confidence" doesn't require the user to have directly
  // interacted with the product (a great category-affinity match with
  // zero direct history can legitimately BE the single best candidate,
  // as scoringService.js's own verified test already proved), it just
  // means the SCORE earned that ranking.
  const highConfidence = scoredCandidates.slice(0, highConfidenceSlots);
  const usedIds = new Set(highConfidence.map((c) => c.product._id.toString()));

  // Exploration bucket: the best-scored candidates AMONG the ones the
  // user hasn't directly interacted with, that aren't already claimed by
  // the high-confidence bucket above. Picking the highest-scored
  // UNEXPLORED ones (not a random sample of them) is what keeps this
  // consistent with the spec's own hard constraint — "the randomization
  // must never make an irrelevant product rank above a highly relevant
  // product" — exploration widens WHICH products get a chance to be
  // seen, it doesn't mean picking a genuinely poor match just because
  // it's unfamiliar.
  const unexploredRemaining = scoredCandidates.filter(
    (c) => c.breakdown.userPreference === 0 && !usedIds.has(c.product._id.toString())
  );
  const exploration = unexploredRemaining.slice(0, explorationSlots);
  exploration.forEach((c) => usedIds.add(c.product._id.toString()));

  let combined = [...highConfidence, ...exploration];

  // If there simply weren't enough genuinely-unexplored candidates to
  // fill the exploration quota (a real, expected case for a brand-new
  // catalog or a very active user who's touched most of it), backfill
  // from whatever's left, still in score order — never pad with
  // something worse than what's already excluded, and never return
  // fewer than the pool actually supports.
  if (combined.length < targetCount) {
    const remaining = scoredCandidates.filter((c) => !usedIds.has(c.product._id.toString()));
    combined = combined.concat(remaining.slice(0, targetCount - combined.length));
  }

  return shuffleSimilarScoreClusters(combined).slice(0, targetCount);
}

// Section 27: "Add a small randomization factor to products with similar
// recommendation scores so the exact same order is not shown on every
// request. The randomization must never make an irrelevant product rank
// above a highly relevant product."
//
// Implemented as cluster-and-shuffle rather than any kind of global/
// weighted random shuffle: walk the already-sorted list, group adjacent
// items into clusters where every item stays within SIMILARITY_THRESHOLD
// points of the value that STARTED that cluster (not a "chain" comparing
// each item only to its immediate neighbor — a slowly-declining sequence
// of many small steps could otherwise grow a cluster's overall span far
// past the threshold even though each individual step looked small),
// then shuffle ONLY within each cluster. A product can NEVER move outside
// its own cluster, so a score-10 product can never end up ahead of a
// score-90 one no matter how the randomization inside each cluster lands
// — the hard constraint is a structural property of this approach, not
// something that has to be separately checked after the fact.
function shuffleSimilarScoreClusters(sortedItems) {
  if (sortedItems.length <= 1) return sortedItems;
  const result = [...sortedItems];
  let clusterStart = 0;
  for (let i = 1; i <= result.length; i++) {
    const clusterBroken = i === result.length || (result[clusterStart].score - result[i].score) > SIMILARITY_THRESHOLD;
    if (clusterBroken) {
      shuffleRange(result, clusterStart, i);
      clusterStart = i;
    }
  }
  return result;
}

// Fisher-Yates, restricted to [start, end).
function shuffleRange(arr, start, end) {
  for (let i = end - 1; i > start; i--) {
    const j = start + Math.floor(Math.random() * (i - start + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}
