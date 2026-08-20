"use client";
import { useEffect, useState } from "react";
import { useSelector } from "react-redux";
import Axios from "@/lib/axios";
import api from "@/lib/api";
import ProductCard from "./ProductCard";
import HorizontalScroll from "./HorizontalScroll";

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

  // Phase 12: same adaptive fix as CampaignSection.jsx / ProductSuggestions.jsx.
  return (
    <section>
      <h2 className="section-heading text-xl mb-4">Recently Viewed</h2>
      {products.length <= 5 ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 sm:gap-4">
          {products.map((p) => (
            <ProductCard key={p._id} product={p} />
          ))}
        </div>
      ) : (
        <HorizontalScroll>
          {products.map((p) => (
            <div key={p._id} className="shrink-0 w-44 sm:w-52">
              <ProductCard product={p} />
            </div>
          ))}
        </HorizontalScroll>
      )}
    </section>
  );
}
