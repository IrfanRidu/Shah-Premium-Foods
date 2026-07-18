"use client";
import { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Axios from "@/lib/axios";
import api from "@/lib/api";
import ProductCard from "@/components/ProductCard";
import { CardSkeletonList } from "@/components/Loading";
import NoData from "@/components/NoData";

function SearchResults() {
  const params = useSearchParams();
  const q = params.get("q") || "";
  const [products, setProducts] = useState([]);
  const [loading,  setLoading]  = useState(false);

  useEffect(() => {
    if (!q.trim()) return;
    (async () => {
      try {
        setLoading(true);
        const r = await Axios({ ...api.searchProduct, data: { search: q, page: 1, limit: 40 } });
        setProducts(r.data?.data || []);
      } catch {} finally { setLoading(false); }
    })();
  }, [q]);

  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="section-heading text-2xl mb-1">
        {q ? `Results for "${q}"` : "Search"}
      </h1>
      {!loading && products.length > 0 && (
        <p className="text-sm text-theme-muted mb-6">{products.length} products found</p>
      )}
      {!q && <NoData message="Start typing to search" />}
      {q && loading && <CardSkeletonList count={8} />}
      {q && !loading && products.length === 0 && (
        <NoData message={`No results for "${q}"`} description="Try different keywords" />
      )}
      {!loading && products.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
          {products.map((p) => <ProductCard key={p._id} product={p} />)}
        </div>
      )}
    </div>
  );
}

export default function SearchPage() {
  return <Suspense><SearchResults /></Suspense>;
}
