"use client";
import { useEffect, useState } from "react";
import Axios from "@/lib/axios";
import api from "@/lib/api";
import ProductCard from "./ProductCard";
import ProductGridOrScroll from "./ProductGridOrScroll";

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

  // Session 5: routed through the shared ProductGridOrScroll — this one is
  // capped at limit:4 above, so it will always take the grid branch in
  // practice, but kept consistent with the other rows rather than a
  // special case. See ProductGridOrScroll.jsx for why this replaces the
  // Phase 12 fixed-grid-cols-5 approach (residual gap on uneven counts).
  return (
    <section>
      <h2 className="section-heading text-xl mb-4">Frequently Bought Together</h2>
      <ProductGridOrScroll
        items={products}
        renderItem={(p) => <ProductCard product={p} />}
      />
    </section>
  );
}
