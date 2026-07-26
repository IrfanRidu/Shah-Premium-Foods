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

  return (
    <section>
      <h2 className="section-heading text-xl mb-4">You May Also Like</h2>
      <HorizontalScroll>
        {suggestions.map((p) => (
          <div key={p._id} className="shrink-0 w-44 sm:w-52">
            <ProductCard product={p} />
          </div>
        ))}
      </HorizontalScroll>
    </section>
  );
}
