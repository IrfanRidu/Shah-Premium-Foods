"use client";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useSelector } from "react-redux";
import { FaTimes } from "react-icons/fa";
import ProductGallery from "./ProductGallery";
import AddToCartButton from "./AddToCartButton";
import WishlistButton from "./WishlistButton";
import StarRating from "./StarRating";
import { displayPrice, priceWithDiscount, validURLConvert } from "@/lib/utils";
import { selectCampaignByProductIdMap } from "@/store/campaignSelectors";

// Session 4 (Luxury redesign) — Quick View modal, opened from
// ProductCard without leaving the current grid/listing page. Follows
// the exact `.modal-overlay` / `.modal-box` pattern InvoiceModal.jsx
// already established (overlay-click + explicit close button), plus an
// Escape-key handler (a real accessibility gap in that existing
// pattern — added here rather than left unaddressed, since the brief
// explicitly calls for keyboard navigation throughout).
//
// Phase 8 (user-reported, real bug): rendered via createPortal into
// document.body rather than in place. `.product-card`'s own CSS (see
// globals.css) sets `backdrop-filter` unconditionally and `transform`
// on hover — per spec, EITHER property makes that element the
// containing block for any `position: fixed` descendant instead of the
// viewport. Since this modal was being mounted as a DOM child of the
// card that opened it, `.modal-overlay`'s `position: fixed; inset: 0`
// was being constrained to the CARD's own small bounding box instead of
// covering the screen — exactly what the reported screenshot showed
// (modal content squeezed into card width). This is the standard React
// fix for exactly this class of problem: portal the modal to
// document.body so its position is never affected by ANY ancestor's
// CSS, regardless of what that ancestor does. `mounted` guards the
// portal itself — `document` doesn't exist during server rendering, so
// the portal only renders after this component has actually mounted in
// the browser.
//
// Reuses ProductGallery as-is — genuinely safe, nothing in it assumes
// it's the only instance mounted on the page. Deliberately does NOT
// reuse the full ProductPurchasePanel: tracing through what that
// component actually renders (not just assuming it's safe because it
// "does the purchase panel job") showed it renders its OWN viewport
// -level `fixed bottom-0` mobile action bar — correct for a real page,
// but it would break out of this modal and stick to the actual screen
// bottom on mobile, behind/underneath the modal itself. This builds a
// compact, modal-scoped purchase row instead, from the same lower
// -level pieces (AddToCartButton, WishlistButton, the same price/
// discount helpers) ProductPurchasePanel itself is built from.
export default function QuickView({ product, onClose }) {
  const currency = useSelector((s) => s.currency.selected);
  const rates = useSelector((s) => s.currency.rates);
  const campaignMap = useSelector(selectCampaignByProductIdMap);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (!product || !mounted) return null;

  const match = campaignMap.get(product._id?.toString());
  const activeCampaign = match?.campaign;
  const campaignDiscount = match?.entry?.specialDiscount || 0;
  const activeDiscount = campaignDiscount || product.discount || 0;
  const discounted = priceWithDiscount(product.price, activeDiscount);

  return createPortal(
    <div
      className="modal-overlay"
      onClick={(e) => {
        // Session 4 note: unlike InvoiceModal.jsx (this app's other user of
        // .modal-overlay), this component can be mounted INSIDE another
        // element that has its own onClick (ProductCard's whole-card
        // "navigate to product" handler) — without stopPropagation here, a
        // backdrop click to close this modal would also bubble up and
        // trigger that ancestor's click handler. Stopping it explicitly
        // makes this safe to embed anywhere, not just contexts that
        // happen not to have a clickable ancestor.
        e.stopPropagation();
        onClose();
      }}
    >
      <div className="modal-box max-w-3xl lg:max-w-4xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <span className="text-xs font-semibold uppercase tracking-wide text-theme-muted">Quick View</span>
          <button
            onClick={onClose}
            aria-label="Close"
            className="h-9 w-9 flex items-center justify-center rounded-lg active:bg-[var(--color-border)] transition-colors"
          >
            <FaTimes size={16} />
          </button>
        </div>

        <div className="grid sm:grid-cols-2 gap-5 lg:gap-8">
          <ProductGallery images={product.image || []} productId={product._id} productName={product.name} />

          <div className="space-y-3 min-w-0">
            <h2 className="font-display text-lg sm:text-xl font-bold leading-snug">{product.name}</h2>

            {typeof product.rating === "number" && product.rating > 0 && (
              <div className="flex items-center gap-1.5">
                <StarRating value={product.rating} size={13} />
                <span className="text-xs text-theme-muted">({product.numReviews})</span>
              </div>
            )}

            {product.unit && <p className="text-sm text-theme-muted">Unit: {product.unit}</p>}

            <div className="flex items-baseline gap-2 flex-wrap pt-1">
              <span className={`text-2xl font-bold ${activeCampaign ? "text-red-500" : "text-theme-primary"}`}>
                {displayPrice(discounted, currency, rates)}
              </span>
              {activeDiscount > 0 && (
                <span className="text-sm text-theme-muted line-through">{displayPrice(product.price, currency, rates)}</span>
              )}
            </div>

            {product.description && <p className="text-sm text-theme-muted line-clamp-3">{product.description}</p>}

            <div className="flex gap-2.5 pt-2">
              <div className="flex-1 min-w-0">
                <AddToCartButton product={product} />
              </div>
              <WishlistButton productId={product._id} variant="inline" size={16} className="border border-theme shrink-0" />
            </div>

            <Link
              href={`/product/${validURLConvert(product.name, product._id)}`}
              onClick={onClose}
              className="inline-block text-sm font-semibold text-theme-primary hover:underline pt-1"
            >
              View full details →
            </Link>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
