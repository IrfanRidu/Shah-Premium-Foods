"use client";
import { useEffect, useState } from "react";
import { useSelector } from "react-redux";
import Axios from "@/lib/axios";
import api from "@/lib/api";
import ProductCard from "./ProductCard";
import ProductGridOrScroll from "./ProductGridOrScroll";

// Session 4 (Luxury PDP redesign). `getRecentlyViewedController` and
// `api.getRecentlyViewed` already existed, fully built, unused by any
// storefront UI — this is a wire-up, not new backend work. Personalized
// (requires being logged in, same as the underlying activity-log data
// it's built on) — logged-out visitors simply see nothing here, same
// silent-degrade approach ProductSuggestions.jsx already uses for its
// own empty state, not an error condition. The endpoint doesn't exclude
// the product whose own page this renders on (it has no such param) —
// filtered out client-side below, since showing "recently viewed: the
// exact page you're already on" would be a confusing, pointless entry.
export default function RecentlyViewed({ excludeProductId }) {
  const userId = useSelector((s) => s.user._id);
  const [products, setProducts] = useState([]);

  useEffect(() => {
    if (!userId) { setProducts([]); return; }
    let cancelled = false;
    Axios({ ...api.getRecentlyViewed, params: { limit: 12 } })
      .then((r) => {
        if (cancelled) return;
        const list = (r.data?.data || []).filter((p) => p._id !== excludeProductId);
        setProducts(list);
      })
      .catch(() => { if (!cancelled) setProducts([]); });
    return () => { cancelled = true; };
  }, [userId, excludeProductId]);

  if (products.length === 0) return null;

  // Session 5: routed through the shared ProductGridOrScroll — see that
  // file, and ProductSuggestions.jsx's matching comment, for why the
  // Phase 12 fixed-grid-cols-5 attempt at this still had a residual gap.
  return (
    <section>
      <h2 className="section-heading text-xl mb-4">Recently Viewed</h2>
      <ProductGridOrScroll
        items={products}
        renderItem={(p) => <ProductCard product={p} />}
      />
    </section>
  );
}
