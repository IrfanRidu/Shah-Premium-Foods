"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useSelector } from "react-redux";
import { FaTimes, FaClipboardList } from "react-icons/fa";
import { useCompare } from "@/hooks/useCompare";
import Axios from "@/lib/axios";
import api from "@/lib/api";
import { displayPrice, validURLConvert } from "@/lib/utils";
import SafeImage from "@/components/SafeImage";
import StarRating from "@/components/StarRating";
import AddToCartButton from "@/components/AddToCartButton";
import EmptyState from "@/components/EmptyState";

// Session 4 (Compare feature). Fully client-rendered by necessity — the
// list of WHICH products to compare lives in localStorage (see
// hooks/useCompare.js), which doesn't exist on the server, so there's
// nothing for a Server Component to fetch ahead of time here the way
// product/[product]/page.jsx does for a known product. Reuses
// getProductDetails (already-existing, single-product endpoint) up to
// 4 times in parallel rather than adding a new "fetch by id list"
// backend endpoint for a feature this ancillary — MAX_COMPARE is 4, so
// this never becomes a real scale concern.
export default function ComparePage() {
  const { list, remove, clear } = useCompare();
  const [products, setProducts] = useState(null); // null = loading
  const currency = useSelector((s) => s.currency.selected);
  const rates = useSelector((s) => s.currency.rates);

  useEffect(() => {
    if (list.length === 0) {
      setProducts([]);
      return;
    }
    let cancelled = false;
    setProducts(null);
    Promise.all(
      list.map((id) =>
        Axios({ ...api.getProductDetails, data: { productId: id } })
          .then((r) => (r.data?.success ? r.data.data : null))
          .catch(() => null)
      )
    ).then((results) => {
      if (!cancelled) setProducts(results.filter(Boolean));
    });
    return () => { cancelled = true; };
  }, [list]);

  if (products === null) {
    return (
      <div className="container mx-auto px-4 py-10">
        <div className="skeleton h-8 w-56 mb-6" />
        <div className="skeleton h-72 w-full rounded-2xl" />
      </div>
    );
  }

  if (products.length === 0) {
    return (
      <div className="container mx-auto px-4 py-16 sm:py-24">
        <EmptyState
          icon={FaClipboardList}
          title="Nothing to compare yet"
          description="Add a couple of products to your compare list from any product card — look for the compare icon — then come back here."
          actionLabel="Browse Products"
          actionHref="/"
        />
      </div>
    );
  }

  const rows = [
    { label: "Price", render: (p) => displayPrice(p.price, currency, rates) },
    {
      label: "Rating",
      render: (p) =>
        p.rating > 0 ? (
          <div className="flex items-center justify-center gap-1.5">
            <StarRating value={p.rating} size={13} />
            <span className="text-xs text-theme-muted">({p.numReviews})</span>
          </div>
        ) : (
          <span className="text-xs text-theme-muted">No reviews yet</span>
        ),
    },
    { label: "Category", render: (p) => p.category?.map((c) => c.name).filter(Boolean).join(", ") || "—" },
    { label: "Unit", render: (p) => p.unit || "—" },
    { label: "Stock", render: (p) => (p.stock > 0 ? `${p.stock} available` : "Out of stock") },
    { label: "SKU", render: (p) => p.sku || "—" },
  ];

  return (
    <div className="container mx-auto px-3 sm:px-4 py-6 sm:py-10">
      <div className="flex items-center justify-between mb-6">
        <h1 className="font-display text-2xl sm:text-3xl font-bold">Compare Products</h1>
        <button onClick={clear} className="text-sm font-medium text-theme-muted hover:text-red-500">
          Clear all
        </button>
      </div>

      {/* Wide comparison table — horizontal scroll on narrow screens is
          the standard, expected graceful-degradation pattern for a
          genuinely tabular, multi-column comparison; collapsing it into
          stacked cards would lose the actual point of a side-by-side
          comparison. */}
      <div className="overflow-x-auto -mx-3 px-3 sm:mx-0 sm:px-0 rounded-2xl border border-theme">
        <table className="w-full border-collapse min-w-[640px]">
          <thead>
            <tr className="bg-theme-surface">
              <th className="w-28 sm:w-36" />
              {products.map((p) => (
                <th key={p._id} className="w-44 sm:w-52 p-3 sm:p-4 align-top text-left font-normal">
                  <div className="relative w-full">
                    <button
                      onClick={() => remove(p._id)}
                      aria-label={`Remove ${p.name} from comparison`}
                      className="absolute -top-1 -right-1 h-6 w-6 rounded-full bg-black/60 text-white flex items-center justify-center z-10"
                    >
                      <FaTimes size={10} />
                    </button>
                    <Link href={`/product/${validURLConvert(p.name, p._id)}`} className="block">
                      <div className="relative aspect-square w-full rounded-xl overflow-hidden bg-[var(--color-surface)] mb-2">
                        {p.image?.[0] && (
                          <SafeImage src={p.image[0]} alt={p.name} fill sizes="200px" className="object-cover" />
                        )}
                      </div>
                      <p className="text-sm font-semibold line-clamp-2 hover:text-theme-primary transition-colors min-h-[2.5rem]">{p.name}</p>
                    </Link>
                    <div className="mt-2 w-full">
                      <AddToCartButton product={p} />
                    </div>
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.label} className="border-t border-theme">
                <td className="p-3 sm:p-4 text-sm font-medium text-theme-muted whitespace-nowrap">{row.label}</td>
                {products.map((p) => (
                  <td key={p._id} className="p-3 sm:p-4 text-sm text-center">
                    {row.render(p)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
