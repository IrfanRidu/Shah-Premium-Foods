"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import Axios from "@/lib/axios";
import api from "@/lib/api";
import ProductCard from "@/components/ProductCard";
import { CardSkeletonList } from "@/components/Loading";
import NoData from "@/components/NoData";
import { useTranslation } from "@/lib/i18n";

const PAGE_SIZE = 24;

export default function AllProductsPage() {
  const { t } = useTranslation();
  const [products, setProducts] = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [page,     setPage]     = useState(1);
  const [hasMore,  setHasMore]  = useState(false);

  const fetchPage = async (pageNum) => {
    const r = await Axios({ ...api.getProducts, data: { page: pageNum, limit: PAGE_SIZE } });
    const d = r.data?.data;
    return { items: d?.data || [], totalCount: d?.totalCount || 0 };
  };

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        const { items, totalCount } = await fetchPage(1);
        setProducts(items);
        setHasMore(items.length < totalCount);
      } catch {} finally { setLoading(false); }
    })();
  }, []);

  const loadMore = async () => {
    try {
      setLoadingMore(true);
      const nextPage = page + 1;
      const { items, totalCount } = await fetchPage(nextPage);
      setProducts((prev) => {
        const merged = [...prev, ...items];
        setHasMore(merged.length < totalCount);
        return merged;
      });
      setPage(nextPage);
    } catch {} finally { setLoadingMore(false); }
  };

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="text-xs text-theme-muted mb-6 flex items-center gap-1.5">
        <Link href="/" className="hover:text-theme-primary">{t("nav.home")}</Link>
        <span>/</span>
        <span className="text-theme">{t("nav.allProducts")}</span>
      </div>

      <h1 className="section-heading text-2xl md:text-3xl mb-6">{t("nav.allProducts")}</h1>

      {loading ? (
        <CardSkeletonList count={12} />
      ) : products.length === 0 ? (
        <NoData message="No products found" />
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
            {products.map((p) => <ProductCard key={p._id} product={p} />)}
          </div>
          {hasMore && (
            <div className="text-center mt-8">
              <button onClick={loadMore} disabled={loadingMore} className="btn-outline px-8 py-2.5 disabled:opacity-60">
                {loadingMore ? "Loading…" : "Load More"}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
