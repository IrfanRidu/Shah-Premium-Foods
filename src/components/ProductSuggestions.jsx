"use client";
import { useEffect, useState } from "react";
import Axios from "@/lib/axios";
import api from "@/lib/api";
import ProductCard from "./ProductCard";
import ProductGridOrScroll from "./ProductGridOrScroll";

// Extracted unchanged from the old product/[product]/page.jsx. Stays
// client-fetched deliberately, not folded into the server-rendered part of
// the page: it's a "more like this" recommendation row below the fold,
// not needed for SEO/LCP, and fetching it server-side would add another
// DB round-trip to the initial page response for content that isn't
// critical to have on first paint.
export default function ProductSuggestions({ productId }) {
  const [suggestions, setSuggestions] = useState([]);

  useEffect(() => {
    if (!productId) return;
    Axios({ ...api.getSuggestions, params: { productId, limit: 12 } })
      .then((r) => setSuggestions(r.data?.data || []))
      .catch(() => {});
  }, [productId]);

  if (suggestions.length === 0) return null;

  // Session 5: routed through the shared ProductGridOrScroll — Phase 12's
  // own fixed grid-cols-5 attempt at this same fix still left empty cells
  // whenever the count didn't divide evenly into the active breakpoint
  // (e.g. 2 items in a 5-col row); the shared component's auto-fit grid
  // provably guarantees a full-looking row for any item count instead.
  return (
    <section>
      <h2 className="section-heading text-xl mb-4">You May Also Like</h2>
      <ProductGridOrScroll
        items={suggestions}
        renderItem={(p) => <ProductCard product={p} />}
      />
    </section>
  );
}
