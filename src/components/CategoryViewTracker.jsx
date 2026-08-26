"use client";
import { useEffect } from "react";
import { useGlobalContext } from "@/providers/GlobalProvider";

// Session 8 (recommendation engine). category/[slug]/page.jsx and
// [category]/[subCategory]/page.jsx are Server Components with ISR
// (`export const revalidate = 300`) — logging a view directly in their
// own render function would only fire once per ISR regeneration (shared
// across every visitor for up to 5 minutes), not once per actual visit,
// which is the wrong signal entirely for behavior tracking. This tiny
// client component is the standard fix for exactly that mismatch:
// embedded in the otherwise-server-rendered page tree, it fires on every
// REAL client mount (once per actual page view) — the same underlying
// idea ProductPurchasePanel.jsx already uses for the PDP's own `view`
// event, just extracted into its own reusable, purely-side-effect
// component since a category listing page has no other client component
// an existing effect could naturally live inside.
//
// Serves both category_view (subCategoryId omitted) and subcategory_view
// (both present) from one component rather than two near-identical ones
// — which event fires is just which props were passed in.
export default function CategoryViewTracker({ categoryId, subCategoryId }) {
  const { logActivity } = useGlobalContext();

  useEffect(() => {
    if (!categoryId) return;
    logActivity?.(subCategoryId ? "subcategory_view" : "category_view", {
      categoryId,
      ...(subCategoryId ? { subCategoryId } : {}),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categoryId, subCategoryId]);

  return null;
}
