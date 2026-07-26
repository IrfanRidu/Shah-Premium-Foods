import { createSelector } from "@reduxjs/toolkit";

// Section 9 (Performance) — "Optimize Redux" / memoization.
//
// Before: every ProductCard (and the product detail page) independently
// did `campaigns.find(c => c.products?.some(p => ... === product._id))` —
// an O(campaigns × their products) scan, repeated on EVERY render of
// EVERY card, including re-renders triggered by something else entirely
// (e.g. the cart updating, which re-renders a shared ancestor). On a
// homepage/category grid with dozens of cards, that's dozens of redundant
// full scans per render pass.
//
// createSelector (reselect, bundled with Redux Toolkit) memoizes on its
// inputs — the map below is only ever recomputed when the `campaigns`
// array reference actually changes (i.e. real Redux state updates), not on
// every component render. Building one Map up front is also an algorithmic
// improvement on its own: O(n) once instead of O(n) per card.
const selectCampaigns = (state) => state.campaign.campaigns;

export const selectCampaignByProductIdMap = createSelector(
  [selectCampaigns],
  (campaigns) => {
    const map = new Map();
    for (const c of campaigns) {
      for (const p of c.products || []) {
        const pid = (p.productId?._id || p.productId)?.toString();
        // First match wins — same behavior as the original `.find()`,
        // which stopped at the first campaign containing the product.
        if (pid && !map.has(pid)) {
          map.set(pid, { campaign: c, entry: p });
        }
      }
    }
    return map;
  }
);
