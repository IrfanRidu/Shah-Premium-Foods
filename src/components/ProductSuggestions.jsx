"use client";
import { useEffect, useState } from "react";
import Axios from "@/lib/axios";
import api from "@/lib/api";
import ProductCard from "./ProductCard";
import HorizontalScroll from "./HorizontalScroll";

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

  // Phase 12: same adaptive fix as CampaignSection.jsx — few items fill a
  // proper responsive grid row instead of leaving a large empty gap in a
  // fixed-width scroll row; more items use the scroll pattern, where
  // that's the correct, expected way to browse further rather than a
  // symptom of unfilled space.
  return (
    <section>
      <h2 className="section-heading text-xl mb-4">You May Also Like</h2>
      {suggestions.length <= 5 ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 sm:gap-4">
          {suggestions.map((p) => (
            <ProductCard key={p._id} product={p} />
          ))}
        </div>
      ) : (
        <HorizontalScroll>
          {suggestions.map((p) => (
            <div key={p._id} className="shrink-0 w-44 sm:w-52">
              <ProductCard product={p} />
            </div>
          ))}
        </HorizontalScroll>
      )}
    </section>
  );
}
