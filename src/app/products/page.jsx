"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import Axios from "@/lib/axios";
import api from "@/lib/api";
import ProductCard from "@/components/ProductCard";
import SortDropdown from "@/components/SortDropdown";
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
  const [sortBy,   setSortBy]   = useState("newest");

  const fetchPage = async (pageNum, sort) => {
    const r = await Axios({ ...api.getProducts, data: { page: pageNum, limit: PAGE_SIZE, sortBy: sort } });
    const d = r.data?.data;
    return { items: d?.data || [], totalCount: d?.totalCount || 0 };
  };

  // Re-fetches from page 1 whenever sort changes, same as the initial
  // mount fetch — a sort change has to restart pagination, since "load
  // more" appending unsorted-relative-to-the-new-order items would
  // silently break the sort the user just picked.
  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        const { items, totalCount } = await fetchPage(1, sortBy);
        setProducts(items);
        setPage(1);
        setHasMore(items.length < totalCount);
      } catch {} finally { setLoading(false); }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sortBy]);

  const loadMore = async () => {
    try {
      setLoadingMore(true);
      const nextPage = page + 1;
      const { items, totalCount } = await fetchPage(nextPage, sortBy);
      setProducts((prev) => {
        const merged = [...prev, ...items];
        setHasMore(merged.length < totalCount);
        return merged;
      });
      setPage(nextPage);
    } catch {} finally { setLoadingMore(false); }
  };

  return (
    <div className="container mx-auto px-3 sm:px-4 py-4 lg:py-8">
      <div className="text-xs text-theme-muted mb-6 flex items-center gap-1.5">
        <Link href="/" className="hover:text-theme-primary">{t("nav.home")}</Link>
        <span>/</span>
        <span className="text-theme">{t("nav.allProducts")}</span>
      </div>

      {/* Section 11 (Category Pages) — "sticky filter button": this site
          has no price/category filter feature anywhere (only sort) — see
          STATUS.md Batch 22 for why a full filter system wasn't built
          from scratch here. Made the existing sort control sticky
          instead, so it's reachable without scrolling back up through a
          long product grid. top-[150px] is a deliberately generous
          estimate of the site header's tallest possible state (
          announcement bar + the dedicated mobile search row that only
          exists below md:) rather than a measured value — this sandbox
          can't render the real header to measure it precisely, so this
          is a specific, disclosed item worth confirming on a real device
          rather than a silent guess. */}
      <div className="sticky top-[150px] md:top-24 z-20 -mx-3 sm:-mx-4 px-3 sm:px-4 py-2.5 mb-4 sm:mb-6 bg-[var(--color-header-bg)]/95 backdrop-blur-sm border-b border-theme flex items-center justify-between gap-3">
        <h1 className="section-heading text-xl sm:text-2xl md:text-3xl truncate">{t("nav.allProducts")}</h1>
        <SortDropdown value={sortBy} onChange={setSortBy} />
      </div>

      {loading ? (
        <CardSkeletonList count={12} />
      ) : products.length === 0 ? (
        <NoData message="No products found" />
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 sm:gap-4">
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
