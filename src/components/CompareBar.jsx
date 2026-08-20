"use client";
import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { FaTimes } from "react-icons/fa";
import { useCompare } from "@/hooks/useCompare";
import Axios from "@/lib/axios";
import api from "@/lib/api";
import SafeImage from "./SafeImage";

// Session 4 (Compare feature). Mounted once, globally, in Providers.jsx —
// same convention as <DemoModeNotice /> and <Toaster /> there — since a
// compare selection can start from a ProductCard on ANY page (home,
// category, search, or the PDP's own Similar/Recently-Viewed/Frequently
// -Bought-Together rows), not just one route.
//
// Real layout conflict handled deliberately: on a product detail page,
// ProductPurchasePanel already renders its OWN fixed-bottom bar on
// mobile (Add to Cart / Buy Now / Wishlist). Both bars being
// `fixed bottom-0` at once would overlap. Rather than have either
// component reach into the other, this one detects the PDP route via
// the pathname it already needs no new dependency for and stacks itself
// above that bar's known height instead of colliding with it.
const PRODUCT_PAGE_BAR_HEIGHT = 68; // px — matches ProductPurchasePanel's mobile bar (py-2.5 + 44px buttons), plus a small margin

export default function CompareBar() {
  const router = useRouter();
  const pathname = usePathname();
  const { list, remove, clear } = useCompare();
  const [products, setProducts] = useState([]);

  const isProductPage = pathname?.startsWith("/product/");

  useEffect(() => {
    if (list.length === 0) { setProducts([]); return; }
    let cancelled = false;
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

  if (list.length === 0) return null;

  return (
    <div
      className="fixed inset-x-0 z-40 bg-[var(--color-header-bg)] border-t border-theme shadow-[0_-4px_16px_rgba(0,0,0,0.08)] animate-fade-in"
      style={{
        bottom: isProductPage ? `${PRODUCT_PAGE_BAR_HEIGHT}px` : 0,
        paddingBottom: isProductPage ? 0 : "env(safe-area-inset-bottom)",
      }}
    >
      <div className="container mx-auto px-3 sm:px-4 py-2.5 flex items-center gap-3">
        <div className="flex items-center gap-2 overflow-x-auto flex-1 min-w-0">
          {products.map((p) => (
            <div key={p._id} className="relative shrink-0 h-11 w-11 rounded-lg overflow-hidden border border-theme">
              {p.image?.[0] && <SafeImage src={p.image[0]} alt={p.name} fill sizes="44px" className="object-cover" />}
              <button
                onClick={() => remove(p._id)}
                aria-label={`Remove ${p.name} from compare`}
                className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-black/70 text-white flex items-center justify-center"
              >
                <FaTimes size={7} />
              </button>
            </div>
          ))}
          <span className="text-xs text-theme-muted shrink-0 whitespace-nowrap">{list.length}/4 selected</span>
        </div>
        <button onClick={clear} className="text-xs font-medium text-theme-muted hover:text-red-500 shrink-0">
          Clear
        </button>
        <button
          onClick={() => router.push("/compare")}
          disabled={list.length < 2}
          className="btn-primary text-xs px-4 py-2 shrink-0 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Compare{list.length >= 2 ? ` (${list.length})` : ""}
        </button>
      </div>
    </div>
  );
}
