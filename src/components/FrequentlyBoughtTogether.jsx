"use client";
import { useEffect, useState } from "react";
import Axios from "@/lib/axios";
import api from "@/lib/api";
import ProductCard from "./ProductCard";
import HorizontalScroll from "./HorizontalScroll";

// Session 4 (Luxury PDP redesign). Consumes the real co-purchase
// aggregation built in this session's Phase 1
// (getFrequentlyBoughtTogetherController) — genuinely different data
// from ProductSuggestions' "You May Also Like" (category/attribute
// -based similarity), not a relabeled duplicate of it.
export default function FrequentlyBoughtTogether({ productId }) {
  const [products, setProducts] = useState([]);

  useEffect(() => {
    if (!productId) return;
    let cancelled = false;
    Axios({ ...api.getFrequentlyBoughtTogether, params: { productId, limit: 4 } })
      .then((r) => { if (!cancelled) setProducts(r.data?.data || []); })
      .catch(() => { if (!cancelled) setProducts([]); });
    return () => { cancelled = true; };
  }, [productId]);

  if (products.length === 0) return null;

  // Phase 12: same adaptive fix as CampaignSection.jsx / ProductSuggestions.jsx
  // / RecentlyViewed.jsx — this one is capped at limit:4 above, so it will
  // always take the grid branch in practice, but kept consistent with the
  // other three rather than a special case.
  return (
    <section>
      <h2 className="section-heading text-xl mb-4">Frequently Bought Together</h2>
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
